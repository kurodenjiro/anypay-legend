"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
    getTlsnDemoProofStorageKey,
    normalizeMemo,
    TLSN_DEMO_PROOF_MESSAGE_TYPE,
    type TlsnAttestationRecord,
    type TlsnDemoProofPayload,
} from "@/lib/services/tlsn-demo";
import {
    getTlsnWisePluginStatus,
    getWisePluginSourceUrl,
    installTlsnWisePlugin,
} from "@/lib/services/tlsn-extension";

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

type TlsnPluginState =
    | "checking"
    | "ready"
    | "missing_extension"
    | "missing_plugin"
    | "installing"
    | "error";

type TlsnExecClient = {
    execCode?: (code: string) => Promise<unknown>;
};

function sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

const ATTESTATION_POLL_INTERVAL_MS = 1000;
const ATTESTATION_MAX_WAIT_MS = 120000;

function normalizeAttestationBase(value: string | undefined): string {
    const raw = String(value || "").trim();
    const fallback = "/api/attestation";
    if (!raw) return fallback;
    return raw.endsWith("/") ? raw.slice(0, -1) : raw;
}

const ATTESTATION_BACKEND_URL = normalizeAttestationBase(
    process.env.NEXT_PUBLIC_ATTESTATION_BACKEND_URL,
);

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
    const [pluginState, setPluginState] = useState<TlsnPluginState>("checking");
    const [pluginSourceUrl, setPluginSourceUrl] = useState("/plugins/wise.js");
    const processedProofIdsRef = useRef<Set<string>>(new Set());
    const autoInstallAttemptedRef = useRef(false);

    const normalizedMemo = useMemo(() => normalizeMemo(memo), [memo]);
    const normalizedPlatform = useMemo(
        () => String(platform || "wise").trim().toLowerCase() || "wise",
        [platform],
    );

    const appendCheckLog = useCallback((message: string) => {
        console.info(`[TLSN Plugin Check] ${message}`);
    }, []);

    const refreshPluginStatus = useCallback(async () => {
        const sourceUrl = getWisePluginSourceUrl();
        setPluginSourceUrl(sourceUrl);
        setPluginState("checking");
        appendCheckLog(`Checking TLSN extension and plugin (${sourceUrl})`);

        const status = await getTlsnWisePluginStatus(sourceUrl);

        if (!status.extensionInstalled) {
            setPluginState("missing_extension");
            appendCheckLog("TLSN extension was not detected.");
            return;
        }

        setPluginState(status.pluginInstalled ? "ready" : "missing_plugin");
        if (status.pluginInstalled) {
            appendCheckLog("TLSN extension detected and Wise plugin is installed.");
            return;
        }
        appendCheckLog("TLSN extension detected, but Wise plugin is missing.");
    }, [appendCheckLog]);

    useEffect(() => {
        void refreshPluginStatus();
    }, [refreshPluginStatus]);

    useEffect(() => {
        if (!proofError) return;
        console.error(`[TLSN Proof Error] ${proofError}`);
        appendCheckLog(`Proof error: ${proofError}`);
    }, [appendCheckLog, proofError]);

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
        if (!proof.attestation || typeof proof.attestation !== "object") {
            setProofError("Signed attestation is missing. Please run the plugin again.");
            return;
        }
        if (!proof.attestation.checks?.policy_passed) {
            setProofError("Attestation policy did not pass. Please retry verification.");
            return;
        }
        if (
            String(proof.attestation.intent_id || "").trim()
            !== String(intentId || "").trim()
        ) {
            setProofError("Attestation intent mismatch. Please regenerate proof.");
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

    const fetchAttestationForIntent = useCallback(async (activeIntentId: string) => {
        const normalizedIntent = String(activeIntentId || "").trim();
        if (!normalizedIntent) return null;

        const endpoint = `${ATTESTATION_BACKEND_URL}/attestations/intent/${encodeURIComponent(normalizedIntent)}`;
        const startedAt = Date.now();
        while (Date.now() - startedAt < ATTESTATION_MAX_WAIT_MS) {
            try {
                const response = await fetch(endpoint, { cache: "no-store" });
                if (response.status === 404) {
                    await sleep(ATTESTATION_POLL_INTERVAL_MS);
                    continue;
                }
                if (!response.ok) {
                    throw new Error(`Attestation backend returned ${response.status}`);
                }
                const payload = (await response.json()) as TlsnAttestationRecord;
                return payload;
            } catch (error: unknown) {
                appendCheckLog(
                    `Attestation fetch retry: ${
                        error instanceof Error ? error.message : "unknown error"
                    }`,
                );
                await sleep(ATTESTATION_POLL_INTERVAL_MS);
            }
        }

        appendCheckLog("Attestation not ready within 120s timeout.");
        return null;
    }, [appendCheckLog]);

    const openDemoWindow = useCallback(async () => {
        setProofError("");
        if (pluginState !== "ready") {
            if (pluginState === "missing_extension") {
                setProofError("TLSN extension is not installed. Install it first, then retry.");
                appendCheckLog("Blocked opening demo: extension missing.");
                return;
            }
            if (pluginState === "missing_plugin" || pluginState === "installing") {
                setProofError("Install the Wise TLSN plugin before opening the demo page.");
                appendCheckLog("Blocked opening demo: plugin missing/not ready.");
                return;
            }
        }

        setStatusMessage("Running Wise plugin...");
        appendCheckLog(`Executing plugin directly from ${pluginSourceUrl}.`);

        try {
            const tlsnWindow = window as Window & { tlsn?: TlsnExecClient };
            let attempts = 0;
            while (!tlsnWindow.tlsn?.execCode && attempts < 20) {
                attempts += 1;
                await sleep(150);
            }

            if (!tlsnWindow.tlsn?.execCode) {
                throw new Error("TLSN extension API not detected in this tab.");
            }

            const response = await fetch(pluginSourceUrl, { cache: "no-store" });
            if (!response.ok) {
                throw new Error(`Failed to fetch plugin source (${response.status}).`);
            }

            const pluginCode = await response.text();
            const verificationInput = JSON.stringify({
                intentId: String(intentId || "").trim(),
                memo: normalizedMemo,
                amount: String(fiatAmount || amount || "").trim(),
                currency: String(fiatCurrency || currency || "").trim(),
                platform: normalizedPlatform,
                tagname: String(tagname || "").trim(),
                seller: String(sellerAccountId || "").trim(),
            });
            const runtimeCode =
                `globalThis.VERIFICATION_INPUT = ${JSON.stringify(verificationInput)};\n` +
                pluginCode;

            const rawResult = String((await tlsnWindow.tlsn.execCode(runtimeCode)) || "");
            appendCheckLog("Plugin executed.");

            if (rawResult) {
                appendCheckLog(
                    `Plugin output: ${rawResult.length > 200 ? `${rawResult.slice(0, 200)}...` : rawResult}`,
                );
            }

            let parsedResult: Record<string, unknown> | null = null;
            try {
                parsedResult = JSON.parse(rawResult) as Record<string, unknown>;
            } catch {
                parsedResult = null;
            }

            if (parsedResult?.error) {
                throw new Error(String(parsedResult.error));
            }

            const verificationMeta =
                parsedResult && typeof parsedResult.verification === "object"
                    ? (parsedResult.verification as Record<string, unknown>)
                    : null;

            const verifierUrl =
                verificationMeta && typeof verificationMeta.verifierUrl === "string"
                    ? verificationMeta.verifierUrl
                    : undefined;
            const proxyUrl =
                verificationMeta && typeof verificationMeta.proxyUrl === "string"
                    ? verificationMeta.proxyUrl
                    : undefined;

            appendCheckLog("Waiting for backend attestation...");
            const attestation = await fetchAttestationForIntent(String(intentId || ""));
            if (attestation) {
                appendCheckLog(
                    `Attestation received (${attestation.attestation_id}) policy=${
                        attestation.checks?.policy_passed ? "passed" : "failed"
                    }`,
                );
            } else {
                setStatusMessage("Proof generated. Waiting for signed attestation from verifier backend...");
                setProofError(
                    "Attestation is not ready yet. Please wait a moment, then click Run Wise Plugin again.",
                );
                appendCheckLog("No backend attestation found yet; waiting for next retry.");
                return;
            }

            const generatedProof: TlsnDemoProofPayload = {
                proofId: `proof-${String(intentId || "intent").replace(/[^a-zA-Z0-9:-]/g, "")}-${Date.now()}`,
                intentId: String(intentId || ""),
                platform: normalizedPlatform,
                tagname: String(tagname || ""),
                memo: normalizedMemo,
                transferredMemo: normalizedMemo,
                amount: String(fiatAmount || amount || ""),
                currency: String(fiatCurrency || currency || "USD"),
                pluginSource: pluginSourceUrl,
                generatedAt: Date.now(),
                memoMatched: true,
                verifierUrl,
                proxyUrl,
                verifierResult: parsedResult || rawResult,
                attestation: attestation || undefined,
                attestationId: attestation?.attestation_id,
            };

            await submitProof(generatedProof);
        } catch (error: unknown) {
            const message =
                error instanceof Error ? error.message : "Failed to run Wise plugin.";
            setStatusMessage("");
            setProofError(message);
            appendCheckLog(`Plugin execution failed: ${message}`);
        }
    }, [
        amount,
        appendCheckLog,
        currency,
        fiatAmount,
        fiatCurrency,
        intentId,
        normalizedMemo,
        normalizedPlatform,
        pluginSourceUrl,
        pluginState,
        fetchAttestationForIntent,
        sellerAccountId,
        submitProof,
        tagname,
    ]);

    const installWisePlugin = useCallback(async () => {
        setProofError("");
        setPluginState("installing");
        appendCheckLog("Attempting Wise plugin installation via TLSN extension.");

        const sourceUrl = getWisePluginSourceUrl();
        setPluginSourceUrl(sourceUrl);

        const result = await installTlsnWisePlugin(sourceUrl);
        if (!result.ok) {
            setPluginState("error");
            const message = result.message || "Failed to install Wise TLSN plugin.";
            setProofError(message);
            appendCheckLog(`Plugin install failed: ${message}`);
            return;
        }

        appendCheckLog("Install call completed. Rechecking status.");
        await refreshPluginStatus();
    }, [appendCheckLog, refreshPluginStatus]);

    useEffect(() => {
        if (pluginState !== "missing_plugin") return;
        if (autoInstallAttemptedRef.current) return;

        autoInstallAttemptedRef.current = true;
        appendCheckLog("Auto-installing Wise plugin (one attempt).");
        void installWisePlugin();
    }, [appendCheckLog, installWisePlugin, pluginState]);

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

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <button
                    type="button"
                    onClick={() => void openDemoWindow()}
                    disabled={
                        isSubmitting
                        || pluginState === "checking"
                        || pluginState === "installing"
                    }
                    className="w-full btn-primary py-4 text-base rounded-xl disabled:opacity-60"
                >
                    Run Wise Plugin
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
