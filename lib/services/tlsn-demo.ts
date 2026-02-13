export const TLSN_DEMO_PROOF_MESSAGE_TYPE = "ANYPAY_TLSN_DEMO_PROOF_READY";
export const TLSN_DEMO_PROOF_STORAGE_PREFIX = "anypay:tlsn:demo:proof:";

export type TlsnAttestationChecks = {
    recv_body_revealed: boolean;
    memo_match?: boolean | null;
    amount_match?: boolean | null;
    currency_match?: boolean | null;
    platform_match?: boolean | null;
    tagname_match?: boolean | null;
    policy_passed: boolean;
};

export type TlsnAttestationSignature = {
    algorithm: string;
    public_key_hex: string;
    signature_hex: string;
};

export type TlsnAttestationRecord = {
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
    checks: TlsnAttestationChecks;
    signature: TlsnAttestationSignature;
};

export type TlsnDemoProofPayload = {
    proofId: string;
    intentId: string;
    platform: string;
    tagname: string;
    memo: string;
    transferredMemo: string;
    amount: string;
    currency: string;
    pluginSource: string;
    generatedAt: number;
    memoMatched: boolean;
    verifierUrl?: string;
    proxyUrl?: string;
    verifierResult?: unknown;
    attestation?: TlsnAttestationRecord;
    attestationId?: string;
};

export function normalizeMemo(value: string): string {
    return String(value || "").trim().replace(/\s+/g, " ");
}

export function getTlsnDemoProofStorageKey(intentId: string): string {
    return `${TLSN_DEMO_PROOF_STORAGE_PREFIX}${String(intentId || "").trim()}`;
}
