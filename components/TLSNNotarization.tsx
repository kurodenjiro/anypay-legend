"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
    getTlsnDemoProofStorageKey,
    normalizeMemo,
    TLSN_DEMO_PROOF_MESSAGE_TYPE,
    type TlsnDemoProofPayload,
} from "@/lib/services/tlsn-demo";

interface TLSNNotarizationProps {
    mode: string;
    amount: string;
    currency: string;
    intentId: string;
    platform: string;
    tagname: string;
    memo: string;
    fiatAmount: string;
    fiatCurrency: string;
    sellerAccountId?: string;
    onProof: (proof: TlsnDemoProofPayload) => Promise<void> | void;
}

export default function TLSNNotarization({
    mode,
    amount,
    currency,
    intentId,
    platform,
    tagname,
    memo,
    fiatAmount,
    fiatCurrency,
    sellerAccountId,
    onProof,
}: TLSNNotarizationProps) {
    const [statusMessage, setStatusMessage] = useState("");
    const [proofError, setProofError] = useState("");
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [receivedProof, setReceivedProof] = useState<TlsnDemoProofPayload | null>(null);
    const processedProofIdsRef = useRef<Set<string>>(new Set());
    const popupRef = useRef<Window | null>(null);

    const normalizedMemo = useMemo(() => normalizeMemo(memo), [memo]);
    const normalizedPlatform = useMemo(
        () => String(platform || "wise").trim().toLowerCase() || "wise",
        [platform],
    );

    const demoUrl = useMemo(() => {
        const params = new URLSearchParams({
            intentId: String(intentId || ""),
            platform: normalizedPlatform,
            tagname: String(tagname || ""),
            memo: normalizedMemo,
            amount: String(fiatAmount || amount || ""),
            currency: String(fiatCurrency || "USD"),
            seller: String(sellerAccountId || ""),
        });
        return `/tlsn-demo/payment?${params.toString()}`;
    }, [
        amount,
        fiatAmount,
        fiatCurrency,
        intentId,
        normalizedMemo,
        normalizedPlatform,
        sellerAccountId,
        tagname,
    ]);

    const submitProof = useCallback(async (proof: TlsnDemoProofPayload) => {
        if (!proof?.proofId) {
            setProofError("Received proof payload is missing proofId.");
            return;
        }
        if (processedProofIdsRef.current.has(proof.proofId)) {
            return;
        }
        if (String(proof.intentId || "").trim() !== String(intentId || "").trim()) {
            setProofError("Received proof intent does not match active intent.");
            return;
        }
        if (!proof.memoMatched) {
            setProofError("TLSN demo proof is invalid because memo did not match.");
            return;
        }
        if (normalizeMemo(proof.memo) !== normalizedMemo) {
            setProofError("Proof memo mismatch. Generate proof again with exact memo.");
            return;
        }

        processedProofIdsRef.current.add(proof.proofId);
        setReceivedProof(proof);
        setProofError("");
        setStatusMessage("Proof received from TLSN demo. Submitting on-chain...");
        setIsSubmitting(true);

        try {
            await onProof(proof);
            setStatusMessage("Proof submitted on-chain. BTC release flow is now processing.");
        } catch (error: unknown) {
            processedProofIdsRef.current.delete(proof.proofId);
            setProofError(
                error instanceof Error ? error.message : "Failed to submit proof on-chain.",
            );
            setStatusMessage("");
        } finally {
            setIsSubmitting(false);
        }
    }, [intentId, normalizedMemo, onProof]);

    const openDemoWindow = useCallback(() => {
        setProofError("");
        setStatusMessage("Waiting for proof from TLSN demo page...");
        popupRef.current = window.open(
            demoUrl,
            "tlsn-demo-proof",
            "popup=yes,width=980,height=800",
        );
        if (!popupRef.current) {
            setProofError("Popup blocked. Please allow popups and try again.");
        }
    }, [demoUrl]);

    const loadProofFromStorage = useCallback(async () => {
        if (!intentId) {
            setProofError("Missing intent hash.");
            return;
        }

        try {
            const key = getTlsnDemoProofStorageKey(intentId);
            const raw = window.localStorage.getItem(key);
            if (!raw) {
                setProofError("No locally stored proof found for this intent yet.");
                return;
            }

            const parsed = JSON.parse(raw) as TlsnDemoProofPayload;
            await submitProof(parsed);
        } catch (error: unknown) {
            setProofError(error instanceof Error ? error.message : "Failed to load local proof.");
        }
    }, [intentId, submitProof]);

    useEffect(() => {
        const listener = (event: MessageEvent) => {
            if (event.origin !== window.location.origin) return;
            if (!event.data || typeof event.data !== "object") return;
            if ((event.data as { type?: string }).type !== TLSN_DEMO_PROOF_MESSAGE_TYPE) return;

            const payload = (event.data as { payload?: unknown }).payload as TlsnDemoProofPayload | undefined;
            if (!payload) return;
            void submitProof(payload);
        };

        window.addEventListener("message", listener);
        return () => window.removeEventListener("message", listener);
    }, [submitProof]);

    return (
        <div className="glass-panel p-8 space-y-6">
            <div className="text-center">
                <h2 className="text-2xl font-bold text-white mb-2">
                    Generate Proof of Payment
                </h2>
                <p className="text-gray-400 text-sm">
                    Use TLSNotary to prove your {mode} transaction
                </p>
            </div>

            <div className="bg-white/5 border border-white/10 rounded-xl p-4 space-y-2">
                <div className="flex justify-between">
                    <span className="text-gray-400">Intent:</span>
                    <span className="text-emerald-300 font-mono text-xs">{intentId || "N/A"}</span>
                </div>
                <div className="flex justify-between">
                    <span className="text-gray-400">Mode:</span>
                    <span className="text-white font-mono">{mode}</span>
                </div>
                <div className="flex justify-between">
                    <span className="text-gray-400">Amount:</span>
                    <span className="text-white font-mono">{amount}</span>
                </div>
                <div className="flex justify-between">
                    <span className="text-gray-400">Currency:</span>
                    <span className="text-white font-mono">{currency}</span>
                </div>
                <div className="flex justify-between">
                    <span className="text-gray-400">Platform:</span>
                    <span className="text-white font-mono">{normalizedPlatform}</span>
                </div>
                <div className="flex justify-between">
                    <span className="text-gray-400">Tagname:</span>
                    <span className="text-white font-mono">{tagname || "N/A"}</span>
                </div>
                <div className="flex justify-between">
                    <span className="text-gray-400">Memo:</span>
                    <span className="text-amber-300 font-mono text-xs break-all text-right max-w-[68%]">
                        {normalizedMemo || "N/A"}
                    </span>
                </div>
            </div>

            <div className="bg-blue-500/10 border border-blue-500/20 rounded-xl p-4">
                <p className="text-sm text-blue-200/80 leading-relaxed">
                    Open the TLSN demo payment page, verify the transferred memo, then generate
                    proof using plugin source <a className="underline" href="/plugins/twitter.js" target="_blank" rel="noreferrer">/plugins/twitter.js</a>.
                </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <button
                    type="button"
                    onClick={openDemoWindow}
                    disabled={isSubmitting}
                    className="w-full btn-primary py-4 text-base rounded-xl disabled:opacity-60"
                >
                    Open TLSN Demo Page
                </button>
                <button
                    type="button"
                    onClick={() => void loadProofFromStorage()}
                    disabled={isSubmitting}
                    className="w-full py-4 text-base rounded-xl border border-white/15 bg-white/5 hover:bg-white/10 disabled:opacity-60 text-white"
                >
                    Import Local Proof
                </button>
            </div>

            {statusMessage && (
                <p className="text-sm text-emerald-300">{statusMessage}</p>
            )}
            {proofError && (
                <p className="text-sm text-rose-300">{proofError}</p>
            )}
            {receivedProof && (
                <div className="bg-white/5 border border-white/10 rounded-xl p-3 text-xs text-gray-200 space-y-1">
                    <p>Proof ID: <span className="font-mono">{receivedProof.proofId}</span></p>
                    <p>Generated: <span className="font-mono">{new Date(receivedProof.generatedAt).toLocaleString()}</span></p>
                </div>
            )}
        </div>
    );
}
