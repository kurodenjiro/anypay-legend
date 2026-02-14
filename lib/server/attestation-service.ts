import { createHash, createPrivateKey, createPublicKey, sign } from "crypto";

const ATTESTATION_VERSION = "anypay/tlsn-attestation/v1";
const DEFAULT_TTL_MS = 10 * 60 * 1000;
const DEV_SEED_FALLBACK = "anypay-attestation-backend-dev-key";
const ED25519_PKCS8_PREFIX = Buffer.from("302e020100300506032b657004220420", "hex");

type VerifierHandlerResult = {
    type?: unknown;
    part?: unknown;
    value?: unknown;
};

type VerifierSessionPayload = {
    id?: unknown;
    [key: string]: unknown;
};

type VerifierTranscriptPayload = {
    sent?: unknown;
    recv?: unknown;
    sent_length?: unknown;
    recv_length?: unknown;
};

export type VerifierWebhookPayload = {
    server_name?: unknown;
    results?: unknown;
    session?: unknown;
    transcript?: unknown;
};

type AttestationChecks = {
    recv_body_revealed: boolean;
    memo_match?: boolean | null;
    amount_match?: boolean | null;
    currency_match?: boolean | null;
    platform_match?: boolean | null;
    tagname_match?: boolean | null;
    policy_passed: boolean;
};

type AttestationSignature = {
    algorithm: string;
    public_key_hex: string;
    signature_hex: string;
};

export type AttestationRecord = {
    attestation_id: string;
    version: string;
    session_id: string;
    intent_id?: string | null;
    server_name: string;
    expected_memo?: string | null;
    expected_amount?: string | null;
    expected_currency?: string | null;
    expected_platform?: string | null;
    expected_tagname?: string | null;
    transcript_digest_sha256: string;
    issued_at_ms: number;
    expires_at_ms: number;
    checks: AttestationChecks;
    signature: AttestationSignature;
};

type AttestationStore = {
    bySession: Map<string, AttestationRecord>;
    byIntent: Map<string, AttestationRecord>;
};

type SigningMaterial = {
    privateKey: ReturnType<typeof createPrivateKey>;
    publicKeyHex: string;
};

declare global {
    // eslint-disable-next-line no-var
    var __anypayAttestationStore: AttestationStore | undefined;
    // eslint-disable-next-line no-var
    var __anypayAttestationSigning: SigningMaterial | undefined;
}

function getStore(): AttestationStore {
    if (!globalThis.__anypayAttestationStore) {
        globalThis.__anypayAttestationStore = {
            bySession: new Map<string, AttestationRecord>(),
            byIntent: new Map<string, AttestationRecord>(),
        };
    }
    return globalThis.__anypayAttestationStore;
}

function getTtlMs(): number {
    const raw = String(process.env.ATTESTATION_TTL_MS || "").trim();
    if (!raw) return DEFAULT_TTL_MS;
    const parsed = Number(raw);
    return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : DEFAULT_TTL_MS;
}

function normalizeHexSeed(raw: string): Buffer {
    if (!/^[0-9a-f]{64}$/i.test(raw)) {
        throw new Error("ATTESTATION_SIGNING_SECRET_HEX must be 32 bytes (64 hex chars)");
    }
    return Buffer.from(raw, "hex");
}

function deriveSeed(): Buffer {
    const fromEnv = String(process.env.ATTESTATION_SIGNING_SECRET_HEX || "").trim();
    if (fromEnv) {
        return normalizeHexSeed(fromEnv.toLowerCase());
    }

    return createHash("sha256")
        .update(Buffer.from(DEV_SEED_FALLBACK, "utf8"))
        .digest()
        .subarray(0, 32);
}

function getSigningMaterial(): SigningMaterial {
    if (globalThis.__anypayAttestationSigning) {
        return globalThis.__anypayAttestationSigning;
    }

    const seed = deriveSeed();
    const privateKeyDer = Buffer.concat([ED25519_PKCS8_PREFIX, seed]);
    const privateKey = createPrivateKey({
        key: privateKeyDer,
        format: "der",
        type: "pkcs8",
    });
    const publicKeyDer = createPublicKey(privateKey).export({
        format: "der",
        type: "spki",
    }) as Buffer;
    const publicKeyHex = publicKeyDer.subarray(publicKeyDer.length - 32).toString("hex");

    const material: SigningMaterial = {
        privateKey,
        publicKeyHex,
    };
    globalThis.__anypayAttestationSigning = material;
    return material;
}

function sanitize(value: string): string {
    return String(value || "").replace(/\n/g, " ").trim();
}

function canonicalMessage(input: {
    sessionId: string;
    intentId?: string | null;
    serverName: string;
    expectedMemo?: string | null;
    expectedAmount?: string | null;
    expectedCurrency?: string | null;
    expectedPlatform?: string | null;
    expectedTagname?: string | null;
    transcriptDigestSha256: string;
    issuedAtMs: number;
    expiresAtMs: number;
    policyPassed: boolean;
}): string {
    return (
        `version=${ATTESTATION_VERSION}\n` +
        `session_id=${sanitize(input.sessionId)}\n` +
        `intent_id=${sanitize(input.intentId || "")}\n` +
        `server_name=${sanitize(input.serverName)}\n` +
        `expected_memo=${sanitize(input.expectedMemo || "")}\n` +
        `expected_amount=${sanitize(input.expectedAmount || "")}\n` +
        `expected_currency=${sanitize(input.expectedCurrency || "")}\n` +
        `expected_platform=${sanitize(input.expectedPlatform || "")}\n` +
        `expected_tagname=${sanitize(input.expectedTagname || "")}\n` +
        `transcript_digest_sha256=${sanitize(input.transcriptDigestSha256)}\n` +
        `issued_at_ms=${input.issuedAtMs}\n` +
        `expires_at_ms=${input.expiresAtMs}\n` +
        `policy_passed=${input.policyPassed}\n`
    );
}

function digestTranscript(transcript: {
    sent: string;
    recv: string;
    sentLength: number;
    recvLength: number;
}): string {
    const hasher = createHash("sha256");
    hasher.update(Buffer.from(transcript.sent, "utf8"));
    hasher.update(Buffer.from([0]));
    hasher.update(Buffer.from(transcript.recv, "utf8"));
    hasher.update(Buffer.from([0]));
    hasher.update(Buffer.from(String(transcript.sentLength), "utf8"));
    hasher.update(Buffer.from([0]));
    hasher.update(Buffer.from(String(transcript.recvLength), "utf8"));
    return hasher.digest("hex");
}

function toSessionData(session: VerifierSessionPayload): { id: string; data: Record<string, string> } {
    const sessionId = String(session.id || "").trim();
    const data: Record<string, string> = {};

    for (const [key, value] of Object.entries(session)) {
        if (key === "id") continue;
        if (value === undefined || value === null) continue;
        const normalized = String(value).trim();
        if (!normalized) continue;
        data[key] = normalized;
    }

    return { id: sessionId, data };
}

function pickSessionField(data: Record<string, string>, keys: string[]): string | null {
    for (const key of keys) {
        const value = String(data[key] || "").trim();
        if (value) return value;
    }
    return null;
}

function containsInsensitive(haystack: string, needle: string): boolean {
    return haystack.toLowerCase().includes(needle.toLowerCase());
}

function requiredMatch(value: boolean | null | undefined): boolean {
    return value ?? true;
}

function normalizeResults(raw: unknown): VerifierHandlerResult[] {
    if (!Array.isArray(raw)) return [];
    const rows: VerifierHandlerResult[] = [];
    for (const item of raw) {
        if (!item || typeof item !== "object") continue;
        rows.push(item as VerifierHandlerResult);
    }
    return rows;
}

function normalizeTranscript(raw: unknown): {
    sent: string;
    recv: string;
    sentLength: number;
    recvLength: number;
} {
    const input = (raw && typeof raw === "object" ? raw : {}) as VerifierTranscriptPayload;
    const sent = String(input.sent || "");
    const recv = String(input.recv || "");
    const sentLengthRaw = Number(input.sent_length);
    const recvLengthRaw = Number(input.recv_length);
    return {
        sent,
        recv,
        sentLength: Number.isFinite(sentLengthRaw) && sentLengthRaw >= 0 ? Math.floor(sentLengthRaw) : sent.length,
        recvLength: Number.isFinite(recvLengthRaw) && recvLengthRaw >= 0 ? Math.floor(recvLengthRaw) : recv.length,
    };
}

export function validateWebhookSecret(headers: Headers): boolean {
    const expected = String(process.env.ATTESTATION_WEBHOOK_SECRET || "").trim();
    if (!expected) return true;
    const provided = String(headers.get("x-attestation-webhook-secret") || "").trim();
    return provided === expected;
}

export function getAttestationPublicKeyView(): {
    algorithm: string;
    public_key_hex: string;
} {
    const signing = getSigningMaterial();
    return {
        algorithm: "ed25519",
        public_key_hex: signing.publicKeyHex,
    };
}

export function getAttestationBySession(sessionId: string): AttestationRecord | null {
    const normalized = String(sessionId || "").trim();
    if (!normalized) return null;
    const store = getStore();
    return store.bySession.get(normalized) || null;
}

export function getAttestationByIntent(intentId: string): AttestationRecord | null {
    const normalized = String(intentId || "").trim();
    if (!normalized) return null;
    const store = getStore();
    return store.byIntent.get(normalized) || null;
}

export function createAttestationFromWebhook(rawPayload: VerifierWebhookPayload): AttestationRecord {
    if (!rawPayload || typeof rawPayload !== "object") {
        throw new Error("invalid webhook payload");
    }

    const sessionInput = (rawPayload.session && typeof rawPayload.session === "object"
        ? rawPayload.session
        : {}) as VerifierSessionPayload;
    const { id: sessionId, data: sessionData } = toSessionData(sessionInput);
    if (!sessionId) {
        throw new Error("session.id is required");
    }

    const store = getStore();
    const existing = store.bySession.get(sessionId);
    if (existing) return existing;

    const serverName = String(rawPayload.server_name || "").trim();
    if (!serverName) {
        throw new Error("server_name is required");
    }

    const results = normalizeResults(rawPayload.results);
    const transcript = normalizeTranscript(rawPayload.transcript);

    const expectedMemo = pickSessionField(sessionData, ["expectedMemo", "memo"]);
    const expectedAmount = pickSessionField(sessionData, ["expectedAmount", "amount"]);
    const expectedCurrency = pickSessionField(sessionData, ["expectedCurrency", "currency"]);
    const expectedPlatform = pickSessionField(sessionData, ["expectedPlatform", "platform"]);
    const expectedTagname = pickSessionField(sessionData, ["expectedTagname", "tagname"]);
    const intentId = pickSessionField(sessionData, ["intentId", "intent_id", "intent_hash"]);

    const recvBodyRevealed = results.some((entry) => {
        const type = String(entry.type || "").trim().toUpperCase();
        const part = String(entry.part || "").trim().toUpperCase();
        const value = String(entry.value || "").trim();
        return type === "RECV" && part === "BODY" && value.length > 0;
    });

    const searchText =
        `${transcript.sent}\n${transcript.recv}\n${
            results.map((entry) => String(entry.value || "")).join("\n")
        }\n`;

    const memoMatch = expectedMemo ? searchText.includes(expectedMemo) : null;
    const amountMatch = expectedAmount ? searchText.includes(expectedAmount) : null;
    const currencyMatch = expectedCurrency ? containsInsensitive(searchText, expectedCurrency) : null;
    const platformMatch = expectedPlatform ? containsInsensitive(searchText, expectedPlatform) : null;
    const tagnameMatch = expectedTagname ? searchText.includes(expectedTagname) : null;

    const policyPassed =
        recvBodyRevealed
        && requiredMatch(memoMatch)
        && requiredMatch(amountMatch)
        && requiredMatch(currencyMatch)
        && requiredMatch(platformMatch)
        && requiredMatch(tagnameMatch);

    const transcriptDigestSha256 = digestTranscript(transcript);
    const issuedAtMs = Date.now();
    const expiresAtMs = issuedAtMs + getTtlMs();
    const canonical = canonicalMessage({
        sessionId,
        intentId,
        serverName,
        expectedMemo,
        expectedAmount,
        expectedCurrency,
        expectedPlatform,
        expectedTagname,
        transcriptDigestSha256,
        issuedAtMs,
        expiresAtMs,
        policyPassed,
    });

    const signing = getSigningMaterial();
    const signature = sign(null, Buffer.from(canonical, "utf8"), signing.privateKey);

    const record: AttestationRecord = {
        attestation_id: `attestation:${sessionId}`,
        version: ATTESTATION_VERSION,
        session_id: sessionId,
        intent_id: intentId || null,
        server_name: serverName,
        expected_memo: expectedMemo,
        expected_amount: expectedAmount,
        expected_currency: expectedCurrency,
        expected_platform: expectedPlatform,
        expected_tagname: expectedTagname,
        transcript_digest_sha256: transcriptDigestSha256,
        issued_at_ms: issuedAtMs,
        expires_at_ms: expiresAtMs,
        checks: {
            recv_body_revealed: recvBodyRevealed,
            memo_match: memoMatch,
            amount_match: amountMatch,
            currency_match: currencyMatch,
            platform_match: platformMatch,
            tagname_match: tagnameMatch,
            policy_passed: policyPassed,
        },
        signature: {
            algorithm: "ed25519",
            public_key_hex: signing.publicKeyHex,
            signature_hex: signature.toString("hex"),
        },
    };

    store.bySession.set(sessionId, record);
    if (intentId) {
        store.byIntent.set(intentId, record);
    }

    return record;
}
