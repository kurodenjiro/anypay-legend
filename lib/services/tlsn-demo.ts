export const TLSN_DEMO_PROOF_MESSAGE_TYPE = "ANYPAY_TLSN_DEMO_PROOF_READY";
export const TLSN_DEMO_PROOF_STORAGE_PREFIX = "anypay:tlsn:demo:proof:";

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
};

export function normalizeMemo(value: string): string {
    return String(value || "").trim().replace(/\s+/g, " ");
}

export function getTlsnDemoProofStorageKey(intentId: string): string {
    return `${TLSN_DEMO_PROOF_STORAGE_PREFIX}${String(intentId || "").trim()}`;
}
