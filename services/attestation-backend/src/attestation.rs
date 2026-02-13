use std::collections::HashMap;
use std::env;
use std::sync::Arc;

use anyhow::{anyhow, Context, Result};
use chrono::Utc;
use ed25519_dalek::{Signer, SigningKey};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use tokio::sync::RwLock;
use tracing::warn;

const ATTESTATION_VERSION: &str = "anypay/tlsn-attestation/v1";
const DEFAULT_TTL_MS: u64 = 10 * 60 * 1000;
const DEV_SEED_FALLBACK: &str = "anypay-attestation-backend-dev-key";

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AttestationSignature {
    pub algorithm: String,
    pub public_key_hex: String,
    pub signature_hex: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AttestationChecks {
    pub recv_body_revealed: bool,
    pub memo_match: Option<bool>,
    pub amount_match: Option<bool>,
    pub currency_match: Option<bool>,
    pub platform_match: Option<bool>,
    pub tagname_match: Option<bool>,
    pub policy_passed: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AttestationRecord {
    pub attestation_id: String,
    pub version: String,
    pub session_id: String,
    pub intent_id: Option<String>,
    pub server_name: String,
    pub expected_memo: Option<String>,
    pub expected_amount: Option<String>,
    pub expected_currency: Option<String>,
    pub expected_platform: Option<String>,
    pub expected_tagname: Option<String>,
    pub transcript_digest_sha256: String,
    pub issued_at_ms: u64,
    pub expires_at_ms: u64,
    pub checks: AttestationChecks,
    pub signature: AttestationSignature,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PublicKeyView {
    pub algorithm: String,
    pub public_key_hex: String,
}

#[derive(Debug, Deserialize)]
pub struct VerifierWebhookPayload {
    pub server_name: String,
    #[serde(default)]
    pub results: Vec<VerifierHandlerResult>,
    pub session: VerifierSessionInfo,
    pub transcript: VerifierTranscript,
}

#[derive(Debug, Deserialize)]
pub struct VerifierSessionInfo {
    pub id: String,
    #[serde(flatten)]
    pub data: HashMap<String, String>,
}

#[derive(Debug, Deserialize)]
pub struct VerifierTranscript {
    pub sent: String,
    pub recv: String,
    pub sent_length: usize,
    pub recv_length: usize,
}

#[derive(Debug, Deserialize)]
pub struct VerifierHandlerResult {
    #[serde(rename = "type")]
    pub handler_type: String,
    pub part: String,
    pub value: String,
}

#[derive(Default)]
struct AttestationStore {
    by_session: HashMap<String, AttestationRecord>,
    by_intent: HashMap<String, AttestationRecord>,
}

pub struct AttestationService {
    signing_key: SigningKey,
    public_key_hex: String,
    webhook_secret: Option<String>,
    ttl_ms: u64,
    store: Arc<RwLock<AttestationStore>>,
}

impl AttestationService {
    pub fn from_env() -> Result<Self> {
        let signing_key = load_signing_key_from_env()?;
        let public_key_hex = hex::encode(signing_key.verifying_key().as_bytes());
        let webhook_secret = env::var("ATTESTATION_WEBHOOK_SECRET")
            .ok()
            .map(|value| value.trim().to_string())
            .filter(|value| !value.is_empty());
        let ttl_ms = env::var("ATTESTATION_TTL_MS")
            .ok()
            .and_then(|value| value.parse::<u64>().ok())
            .filter(|value| *value > 0)
            .unwrap_or(DEFAULT_TTL_MS);

        Ok(Self {
            signing_key,
            public_key_hex,
            webhook_secret,
            ttl_ms,
            store: Arc::new(RwLock::new(AttestationStore::default())),
        })
    }

    pub fn public_key_view(&self) -> PublicKeyView {
        PublicKeyView {
            algorithm: "ed25519".to_string(),
            public_key_hex: self.public_key_hex.clone(),
        }
    }

    pub fn validate_webhook_secret(&self, provided: Option<&str>) -> bool {
        match &self.webhook_secret {
            None => true,
            Some(expected) => provided.map(str::trim) == Some(expected.as_str()),
        }
    }

    pub async fn get_by_session(&self, session_id: &str) -> Option<AttestationRecord> {
        let store = self.store.read().await;
        store.by_session.get(session_id).cloned()
    }

    pub async fn get_by_intent(&self, intent_id: &str) -> Option<AttestationRecord> {
        let store = self.store.read().await;
        store.by_intent.get(intent_id).cloned()
    }

    pub async fn create_from_webhook(
        &self,
        payload: VerifierWebhookPayload,
    ) -> Result<AttestationRecord> {
        let session_id = payload.session.id.trim().to_string();
        if session_id.is_empty() {
            return Err(anyhow!("session.id is required"));
        }

        if let Some(existing) = self.get_by_session(&session_id).await {
            return Ok(existing);
        }

        let intent_id = session_field(
            &payload.session.data,
            &["intentId", "intent_id", "intent_hash"],
        );
        let expected_memo = session_field(&payload.session.data, &["expectedMemo", "memo"]);
        let expected_amount = session_field(&payload.session.data, &["expectedAmount", "amount"]);
        let expected_currency =
            session_field(&payload.session.data, &["expectedCurrency", "currency"]);
        let expected_platform =
            session_field(&payload.session.data, &["expectedPlatform", "platform"]);
        let expected_tagname =
            session_field(&payload.session.data, &["expectedTagname", "tagname"]);

        let recv_body_revealed = payload.results.iter().any(|entry| {
            entry.handler_type.eq_ignore_ascii_case("RECV")
                && entry.part.eq_ignore_ascii_case("BODY")
                && !entry.value.trim().is_empty()
        });

        let transcript_digest_sha256 = digest_transcript(&payload.transcript);
        let transcript_text = build_search_text(&payload);

        let memo_match = expected_memo
            .as_ref()
            .map(|value| contains_exact(&transcript_text, value));
        let amount_match = expected_amount
            .as_ref()
            .map(|value| contains_exact(&transcript_text, value));
        let currency_match = expected_currency
            .as_ref()
            .map(|value| contains_insensitive(&transcript_text, value));
        let platform_match = expected_platform
            .as_ref()
            .map(|value| contains_insensitive(&transcript_text, value));
        let tagname_match = expected_tagname
            .as_ref()
            .map(|value| contains_exact(&transcript_text, value));

        let policy_passed = recv_body_revealed
            && required_match(memo_match)
            && required_match(amount_match)
            && required_match(currency_match)
            && required_match(platform_match)
            && required_match(tagname_match);

        let checks = AttestationChecks {
            recv_body_revealed,
            memo_match,
            amount_match,
            currency_match,
            platform_match,
            tagname_match,
            policy_passed,
        };

        let issued_at_ms = Utc::now().timestamp_millis().max(0) as u64;
        let expires_at_ms = issued_at_ms.saturating_add(self.ttl_ms);
        let attestation_id = format!("attestation:{}", session_id);

        let canonical_message = canonical_message(&CanonicalMessage {
            session_id: &session_id,
            intent_id: intent_id.as_deref(),
            server_name: &payload.server_name,
            expected_memo: expected_memo.as_deref(),
            expected_amount: expected_amount.as_deref(),
            expected_currency: expected_currency.as_deref(),
            expected_platform: expected_platform.as_deref(),
            expected_tagname: expected_tagname.as_deref(),
            transcript_digest_sha256: &transcript_digest_sha256,
            issued_at_ms,
            expires_at_ms,
            policy_passed,
        });

        let signature = self.signing_key.sign(canonical_message.as_bytes());
        let record = AttestationRecord {
            attestation_id,
            version: ATTESTATION_VERSION.to_string(),
            session_id: session_id.clone(),
            intent_id: intent_id.clone(),
            server_name: payload.server_name,
            expected_memo,
            expected_amount,
            expected_currency,
            expected_platform,
            expected_tagname,
            transcript_digest_sha256,
            issued_at_ms,
            expires_at_ms,
            checks,
            signature: AttestationSignature {
                algorithm: "ed25519".to_string(),
                public_key_hex: self.public_key_hex.clone(),
                signature_hex: hex::encode(signature.to_bytes()),
            },
        };

        let mut store = self.store.write().await;
        store
            .by_session
            .insert(record.session_id.clone(), record.clone());
        if let Some(intent) = &record.intent_id {
            store.by_intent.insert(intent.clone(), record.clone());
        }

        Ok(record)
    }
}

fn load_signing_key_from_env() -> Result<SigningKey> {
    if let Ok(raw_secret) = env::var("ATTESTATION_SIGNING_SECRET_HEX") {
        let secret_hex = raw_secret.trim();
        if !secret_hex.is_empty() {
            let bytes = hex::decode(secret_hex)
                .with_context(|| "ATTESTATION_SIGNING_SECRET_HEX is not valid hex")?;
            if bytes.len() != 32 {
                return Err(anyhow!(
                    "ATTESTATION_SIGNING_SECRET_HEX must be 32 bytes (64 hex chars)"
                ));
            }
            let mut key_bytes = [0u8; 32];
            key_bytes.copy_from_slice(&bytes);
            return Ok(SigningKey::from_bytes(&key_bytes));
        }
    }

    warn!("ATTESTATION_SIGNING_SECRET_HEX is missing; using deterministic development key");
    let mut hasher = Sha256::new();
    hasher.update(DEV_SEED_FALLBACK.as_bytes());
    let digest = hasher.finalize();
    let mut key_bytes = [0u8; 32];
    key_bytes.copy_from_slice(&digest[..32]);
    Ok(SigningKey::from_bytes(&key_bytes))
}

fn session_field(data: &HashMap<String, String>, keys: &[&str]) -> Option<String> {
    keys.iter()
        .find_map(|key| data.get(*key))
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty())
}

fn contains_exact(haystack: &str, needle: &str) -> bool {
    haystack.contains(needle)
}

fn contains_insensitive(haystack: &str, needle: &str) -> bool {
    haystack
        .to_ascii_lowercase()
        .contains(&needle.to_ascii_lowercase())
}

fn required_match(check: Option<bool>) -> bool {
    check.unwrap_or(true)
}

fn digest_transcript(transcript: &VerifierTranscript) -> String {
    let mut hasher = Sha256::new();
    hasher.update(transcript.sent.as_bytes());
    hasher.update([0u8]);
    hasher.update(transcript.recv.as_bytes());
    hasher.update([0u8]);
    hasher.update(transcript.sent_length.to_string().as_bytes());
    hasher.update([0u8]);
    hasher.update(transcript.recv_length.to_string().as_bytes());
    hex::encode(hasher.finalize())
}

fn build_search_text(payload: &VerifierWebhookPayload) -> String {
    let mut combined = String::new();
    combined.push_str(&payload.transcript.sent);
    combined.push('\n');
    combined.push_str(&payload.transcript.recv);
    combined.push('\n');
    for result in &payload.results {
        combined.push_str(&result.value);
        combined.push('\n');
    }
    combined
}

struct CanonicalMessage<'a> {
    session_id: &'a str,
    intent_id: Option<&'a str>,
    server_name: &'a str,
    expected_memo: Option<&'a str>,
    expected_amount: Option<&'a str>,
    expected_currency: Option<&'a str>,
    expected_platform: Option<&'a str>,
    expected_tagname: Option<&'a str>,
    transcript_digest_sha256: &'a str,
    issued_at_ms: u64,
    expires_at_ms: u64,
    policy_passed: bool,
}

fn canonical_message(message: &CanonicalMessage<'_>) -> String {
    format!(
        "version={}\nsession_id={}\nintent_id={}\nserver_name={}\nexpected_memo={}\nexpected_amount={}\nexpected_currency={}\nexpected_platform={}\nexpected_tagname={}\ntranscript_digest_sha256={}\nissued_at_ms={}\nexpires_at_ms={}\npolicy_passed={}\n",
        ATTESTATION_VERSION,
        sanitize(message.session_id),
        sanitize(message.intent_id.unwrap_or("")),
        sanitize(message.server_name),
        sanitize(message.expected_memo.unwrap_or("")),
        sanitize(message.expected_amount.unwrap_or("")),
        sanitize(message.expected_currency.unwrap_or("")),
        sanitize(message.expected_platform.unwrap_or("")),
        sanitize(message.expected_tagname.unwrap_or("")),
        sanitize(message.transcript_digest_sha256),
        message.issued_at_ms,
        message.expires_at_ms,
        message.policy_passed,
    )
}

fn sanitize(value: &str) -> String {
    value.replace('\n', " ").trim().to_string()
}
