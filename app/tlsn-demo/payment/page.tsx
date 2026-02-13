"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
    getTlsnDemoProofStorageKey,
    normalizeMemo,
    TLSN_DEMO_PROOF_MESSAGE_TYPE,
    type TlsnDemoProofPayload,
} from "@/lib/services/tlsn-demo";

type DemoStep = "LOGIN" | "TRANSFER";

function toPlatformTitle(value: string): string {
    const normalized = String(value || "").trim().toLowerCase();
    if (!normalized) return "Wise";
    return normalized.charAt(0).toUpperCase() + normalized.slice(1);
}

function resolvePlatformTone(value: string): string {
    const normalized = String(value || "").trim().toLowerCase();
    if (normalized.includes("venmo")) return "from-sky-500/20 to-blue-500/10 border-sky-400/30";
    return "from-emerald-500/20 to-lime-500/10 border-emerald-400/30";
}

function buildProofId(intentId: string): string {
    const suffix = Math.random().toString(36).slice(2, 8);
    return `proof-${String(intentId || "intent").replace(/[^a-zA-Z0-9:-]/g, "")}-${Date.now()}-${suffix}`;
}

export default function TLSNDemoPaymentPage() {
    const searchParams = useSearchParams();
    const intentId = String(searchParams.get("intentId") || "").trim();
    const platform = String(searchParams.get("platform") || "wise").trim().toLowerCase();
    const tagname = String(searchParams.get("tagname") || "").trim();
    const memo = String(searchParams.get("memo") || "").trim();
    const amount = String(searchParams.get("amount") || "").trim();
    const currency = String(searchParams.get("currency") || "USD").trim().toUpperCase();
    const seller = String(searchParams.get("seller") || "").trim();

    const [step, setStep] = useState<DemoStep>("LOGIN");
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [loginError, setLoginError] = useState("");
    const [transferredMemo, setTransferredMemo] = useState("");
    const [memoMatchChecked, setMemoMatchChecked] = useState(false);
    const [memoMatches, setMemoMatches] = useState(false);
    const [proofMessage, setProofMessage] = useState("");
    const [proofPayload, setProofPayload] = useState<TlsnDemoProofPayload | null>(null);

    const platformTitle = useMemo(() => toPlatformTitle(platform), [platform]);
    const tone = useMemo(() => resolvePlatformTone(platform), [platform]);
    const normalizedExpectedMemo = useMemo(() => normalizeMemo(memo), [memo]);

    const canVerifyMemo = transferredMemo.trim().length > 0 && normalizedExpectedMemo.length > 0;

    const handleLogin = () => {
        if (!email.trim() || !password.trim()) {
            setLoginError("Enter email and password (demo only).");
            return;
        }
        setLoginError("");
        setStep("TRANSFER");
    };

    const handleVerifyMemo = () => {
        if (!canVerifyMemo) {
            setMemoMatchChecked(true);
            setMemoMatches(false);
            return;
        }

        const matches = normalizeMemo(transferredMemo) === normalizedExpectedMemo;
        setMemoMatchChecked(true);
        setMemoMatches(matches);
        if (!matches) {
            setProofMessage("Memo does not match. Proof generation remains locked.");
            setProofPayload(null);
        } else {
            setProofMessage("Memo verified. You can now generate TLSN proof.");
        }
    };

    const handleGenerateProof = () => {
        if (!memoMatches || !intentId) return;

        const payload: TlsnDemoProofPayload = {
            proofId: buildProofId(intentId),
            intentId,
            platform,
            tagname,
            memo: normalizedExpectedMemo,
            transferredMemo: normalizeMemo(transferredMemo),
            amount,
            currency,
            pluginSource: "/plugins/twitter.js",
            generatedAt: Date.now(),
            memoMatched: true,
        };

        try {
            const storageKey = getTlsnDemoProofStorageKey(intentId);
            window.localStorage.setItem(storageKey, JSON.stringify(payload));
        } catch {
            // ignore local storage failures
        }

        if (window.opener && window.location.origin) {
            window.opener.postMessage(
                {
                    type: TLSN_DEMO_PROOF_MESSAGE_TYPE,
                    payload,
                },
                window.location.origin,
            );
        }

        setProofPayload(payload);
        setProofMessage("Proof generated and sent back to Anypay. You can return to the trade tab.");
    };

    return (
        <div className="w-full max-w-3xl mx-auto py-8 space-y-6">
            <div className={`glass-panel p-6 border bg-gradient-to-br ${tone}`}>
                <div className="flex items-center justify-between gap-4">
                    <div>
                        <p className="text-xs uppercase tracking-[0.2em] text-gray-300">TLSN Demo</p>
                        <h1 className="text-2xl font-bold text-white mt-1">
                            {platformTitle} Transfer Verification
                        </h1>
                        <p className="text-sm text-gray-200 mt-2">
                            Demo-only flow to verify transfer memo before generating proof.
                        </p>
                    </div>
                    <Link href="/buy" className="px-3 py-2 rounded-lg bg-white/10 hover:bg-white/20 text-sm text-white">
                        Back To Buy
                    </Link>
                </div>
            </div>

            {step === "LOGIN" && (
                <div className="glass-panel p-6 space-y-4">
                    <h2 className="text-lg font-semibold text-white">Demo Login ({platformTitle})</h2>
                    <p className="text-xs text-gray-400">
                        This login is mock-only and does not submit real data.
                    </p>
                    <input
                        type="email"
                        value={email}
                        onChange={(event) => setEmail(event.target.value)}
                        placeholder={`${platformTitle.toLowerCase()}-user@example.com`}
                        className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-white outline-none focus:border-cyan-400/60"
                    />
                    <input
                        type="password"
                        value={password}
                        onChange={(event) => setPassword(event.target.value)}
                        placeholder="••••••••"
                        className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-white outline-none focus:border-cyan-400/60"
                    />
                    {loginError && <p className="text-xs text-amber-300">{loginError}</p>}
                    <button
                        type="button"
                        onClick={handleLogin}
                        className="w-full btn-primary py-3 text-sm rounded-xl"
                    >
                        Continue To Transfer Details
                    </button>
                </div>
            )}

            {step === "TRANSFER" && (
                <div className="glass-panel p-6 space-y-5">
                    <h2 className="text-lg font-semibold text-white">Transferred Transaction Details</h2>
                    <div className="bg-white/5 border border-white/10 rounded-xl p-4 space-y-2 text-sm">
                        <div className="flex justify-between">
                            <span className="text-gray-400">Intent ID</span>
                            <span className="text-emerald-300 font-mono text-xs">{intentId || "N/A"}</span>
                        </div>
                        <div className="flex justify-between">
                            <span className="text-gray-400">Platform</span>
                            <span className="text-white">{platformTitle}</span>
                        </div>
                        <div className="flex justify-between">
                            <span className="text-gray-400">Tagname</span>
                            <span className="text-white font-mono">{tagname || "N/A"}</span>
                        </div>
                        <div className="flex justify-between">
                            <span className="text-gray-400">Seller</span>
                            <span className="text-white font-mono text-xs">{seller || "N/A"}</span>
                        </div>
                        <div className="flex justify-between">
                            <span className="text-gray-400">Transferred Amount</span>
                            <span className="text-white font-mono">{amount || "N/A"} {currency}</span>
                        </div>
                        <div className="flex justify-between">
                            <span className="text-gray-400">Expected Memo</span>
                            <span className="text-amber-300 font-mono text-xs break-all text-right max-w-[68%]">
                                {normalizedExpectedMemo || "N/A"}
                            </span>
                        </div>
                    </div>

                    <div className="space-y-2">
                        <label className="text-xs text-gray-400 uppercase tracking-[0.15em]">
                            Enter Memo Used In Transfer
                        </label>
                        <input
                            type="text"
                            value={transferredMemo}
                            onChange={(event) => setTransferredMemo(event.target.value)}
                            placeholder="Paste transferred memo here"
                            className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-white outline-none focus:border-amber-400/60"
                        />
                        <button
                            type="button"
                            onClick={handleVerifyMemo}
                            className="px-3 py-2 rounded-lg border border-white/15 bg-white/5 hover:bg-white/10 text-xs text-white"
                        >
                            Verify Memo Match
                        </button>
                    </div>

                    {memoMatchChecked && !memoMatches && (
                        <p className="text-sm text-rose-300">
                            Memo mismatch detected. Use the exact generated memo from your intent.
                        </p>
                    )}
                    {memoMatches && (
                        <p className="text-sm text-emerald-300">
                            Memo matches expected value. Proof generation is unlocked.
                        </p>
                    )}

                    <div className="bg-blue-500/10 border border-blue-500/20 rounded-xl p-3 text-xs text-blue-100 space-y-1">
                        <p>
                            Plugin Source: <a href="/plugins/twitter.js" target="_blank" rel="noreferrer" className="underline">/plugins/twitter.js</a>
                        </p>
                        <p>
                            The button below simulates TLSN proof generation from the plugin flow.
                        </p>
                    </div>

                    {memoMatches && (
                        <button
                            type="button"
                            onClick={handleGenerateProof}
                            className="w-full btn-primary py-3 text-sm rounded-xl"
                        >
                            Generate Proof (TLSN Plugin Demo)
                        </button>
                    )}

                    {proofMessage && <p className="text-sm text-cyan-200">{proofMessage}</p>}
                    {proofPayload && (
                        <div className="bg-white/5 border border-white/10 rounded-xl p-3 text-xs text-gray-200 space-y-1">
                            <p>Proof ID: <span className="font-mono">{proofPayload.proofId}</span></p>
                            <p>Generated At: <span className="font-mono">{new Date(proofPayload.generatedAt).toLocaleString()}</span></p>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
