"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { formatUnits } from "viem";
import { useNear } from "@/hooks/useNear";
import {
    nearService,
    type DepositFundingMetaV2,
    type DepositRecord,
    type IntentRecord,
} from "@/lib/services/near";

type DepositHistoryItem = {
    deposit: DepositRecord;
    funding: DepositFundingMetaV2 | null;
    intentsCount: number;
};

function toNumber(value: unknown): number {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
}

function normalizeTimestampMs(value: unknown): number {
    const ts = toNumber(value);
    if (ts <= 0) return 0;
    // Contract V1 uses nanoseconds, V2 funding uses milliseconds.
    return ts > 10_000_000_000_000 ? Math.floor(ts / 1_000_000) : ts;
}

function formatDateTime(value: unknown): string {
    const timestampMs = normalizeTimestampMs(value);
    if (timestampMs <= 0) return "N/A";
    return new Date(timestampMs).toLocaleString();
}

function trimTrailingZeros(value: string): string {
    return value.replace(/\.?(0+)$/, "");
}

function formatYoctoAmount(raw: unknown): string {
    try {
        const yocto = BigInt(String(raw ?? "0"));
        const normalized = trimTrailingZeros(formatUnits(yocto, 24));
        return normalized || "0";
    } catch {
        return String(raw ?? "0");
    }
}

function shorten(value: string | null | undefined, start = 8, end = 6): string {
    if (!value) return "N/A";
    if (value.length <= start + end + 3) return value;
    return `${value.slice(0, start)}...${value.slice(-end)}`;
}

function statusTone(status: string): string {
    switch (status) {
        case "Funded":
        case "Fulfilled":
        case "Released":
            return "text-emerald-300 border-emerald-500/30 bg-emerald-500/10";
        case "AwaitingFunding":
        case "Signaled":
            return "text-amber-300 border-amber-500/30 bg-amber-500/10";
        case "TopUpExpired":
        case "Failed":
        case "Cancelled":
            return "text-rose-300 border-rose-500/30 bg-rose-500/10";
        default:
            return "text-slate-300 border-white/20 bg-white/5";
    }
}

function formatDeadline(deadlineMs?: number): string {
    if (!deadlineMs || deadlineMs <= 0) return "N/A";
    const remaining = deadlineMs - Date.now();
    if (remaining <= 0) return "Expired";
    const totalSeconds = Math.floor(remaining / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

export default function Dashboard() {
    const { accountId, isConnected, isLoading, connect } = useNear();

    const [deposits, setDeposits] = useState<DepositHistoryItem[]>([]);
    const [intents, setIntents] = useState<IntentRecord[]>([]);
    const [historyError, setHistoryError] = useState("");
    const [isHistoryLoading, setIsHistoryLoading] = useState(false);
    const [lastUpdatedAt, setLastUpdatedAt] = useState<number | null>(null);

    const refreshHistory = useCallback(async () => {
        if (!accountId || !isConnected) {
            setDeposits([]);
            setIntents([]);
            setHistoryError("");
            setLastUpdatedAt(null);
            return;
        }

        setIsHistoryLoading(true);
        setHistoryError("");

        try {
            const [accountDeposits, accountIntents] = await Promise.all([
                nearService.getAccountDeposits(accountId),
                nearService.getAccountIntents(accountId),
            ]);

            const depositItems = await Promise.all(
                accountDeposits.map(async (deposit) => {
                    const [funding, depositIntents] = await Promise.all([
                        nearService
                            .getDepositFundingV2(deposit.deposit_id)
                            .catch(() => null as DepositFundingMetaV2 | null),
                        nearService.getDepositIntents(deposit.deposit_id).catch(() => [] as IntentRecord[]),
                    ]);

                    return {
                        deposit,
                        funding,
                        intentsCount: depositIntents.length,
                    };
                }),
            );

            const sortedDeposits = depositItems
                .sort((a, b) => b.deposit.deposit_id - a.deposit.deposit_id);

            const sortedIntents = [...accountIntents].sort(
                (a, b) => normalizeTimestampMs(b.timestamp) - normalizeTimestampMs(a.timestamp),
            );

            setDeposits(sortedDeposits);
            setIntents(sortedIntents);
            setLastUpdatedAt(Date.now());
        } catch (error: unknown) {
            const message =
                error instanceof Error ? error.message : "Failed to load deposit/intent history";
            setHistoryError(message);
        } finally {
            setIsHistoryLoading(false);
        }
    }, [accountId, isConnected]);

    useEffect(() => {
        void refreshHistory();
    }, [refreshHistory]);

    useEffect(() => {
        if (!accountId || !isConnected) return;
        const interval = setInterval(() => {
            void refreshHistory();
        }, 20_000);
        return () => clearInterval(interval);
    }, [accountId, isConnected, refreshHistory]);

    const fundedDepositsCount = useMemo(
        () => deposits.filter((item) => item.funding?.status === "Funded").length,
        [deposits],
    );

    return (
        <div className="container mx-auto px-6 py-24 min-h-screen">
            <div className="max-w-6xl mx-auto space-y-8">
                <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
                    <div>
                        <h1 className="text-3xl font-bold text-white tracking-tight">Deposit & Intent History</h1>
                        <p className="text-gray-400 mt-2">Review your seller deposit intents and buyer intents in one place.</p>
                    </div>

                    <div className="flex items-center gap-2">
                        {!isConnected ? (
                            <button
                                type="button"
                                onClick={connect}
                                disabled={isLoading}
                                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-60 disabled:cursor-not-allowed text-white rounded-lg transition-colors"
                            >
                                {isLoading ? "Connecting..." : "Connect Wallet"}
                            </button>
                        ) : (
                            <button
                                type="button"
                                onClick={() => void refreshHistory()}
                                disabled={isHistoryLoading}
                                className="px-4 py-2 bg-white/10 hover:bg-white/20 disabled:opacity-60 disabled:cursor-not-allowed text-white rounded-lg transition-colors"
                            >
                                {isHistoryLoading ? "Refreshing..." : "Refresh"}
                            </button>
                        )}
                    </div>
                </div>

                <section className="glass-panel p-5">
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                        <div className="bg-white/5 border border-white/10 rounded-xl p-4">
                            <p className="text-xs text-gray-400 uppercase tracking-wide">Account</p>
                            <p className="mt-2 font-mono text-sm text-white break-all">{accountId || "Not connected"}</p>
                        </div>
                        <div className="bg-white/5 border border-white/10 rounded-xl p-4">
                            <p className="text-xs text-gray-400 uppercase tracking-wide">Deposits</p>
                            <p className="mt-2 text-2xl font-semibold text-white">{deposits.length}</p>
                        </div>
                        <div className="bg-white/5 border border-white/10 rounded-xl p-4">
                            <p className="text-xs text-gray-400 uppercase tracking-wide">Funded Listings</p>
                            <p className="mt-2 text-2xl font-semibold text-emerald-300">{fundedDepositsCount}</p>
                        </div>
                        <div className="bg-white/5 border border-white/10 rounded-xl p-4">
                            <p className="text-xs text-gray-400 uppercase tracking-wide">Buyer Intents</p>
                            <p className="mt-2 text-2xl font-semibold text-blue-300">{intents.length}</p>
                        </div>
                    </div>
                    {lastUpdatedAt && (
                        <p className="text-xs text-gray-500 mt-3">Last updated: {new Date(lastUpdatedAt).toLocaleTimeString()}</p>
                    )}
                </section>

                {historyError && (
                    <section className="glass-panel p-4 border border-red-500/30 bg-red-500/10 text-red-100 text-sm">
                        {historyError}
                    </section>
                )}

                <section className="glass-panel p-6 space-y-4">
                    <div className="flex items-center justify-between">
                        <h2 className="text-xl font-bold text-white">Seller Deposit History</h2>
                        <Link href="/sell" className="text-sm text-blue-300 hover:text-blue-200">Create deposit</Link>
                    </div>

                    {!isConnected ? (
                        <p className="text-sm text-gray-400">Connect wallet to view your deposit history.</p>
                    ) : deposits.length === 0 ? (
                        <p className="text-sm text-gray-400">No deposits found for this account.</p>
                    ) : (
                        <div className="space-y-3">
                            {deposits.map((item) => {
                                const deposit = item.deposit;
                                const funding = item.funding;
                                const status = funding?.status || "Legacy";
                                return (
                                    <article key={deposit.deposit_id} className="bg-white/5 border border-white/10 rounded-xl p-4 space-y-3">
                                        <div className="flex flex-wrap items-start justify-between gap-3">
                                            <div>
                                                <p className="text-white font-semibold">Deposit #{deposit.deposit_id}</p>
                                                <p className="text-xs text-gray-400 mt-1">{funding?.asset_id || deposit.token}</p>
                                            </div>
                                            <span className={`px-2.5 py-1 rounded-full border text-xs font-medium ${statusTone(status)}`}>
                                                {status}
                                            </span>
                                        </div>

                                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-sm">
                                            <div>
                                                <p className="text-gray-400">Total</p>
                                                <p className="font-mono text-white">{formatYoctoAmount(deposit.total_deposit)}</p>
                                            </div>
                                            <div>
                                                <p className="text-gray-400">Remaining</p>
                                                <p className="font-mono text-white">{formatYoctoAmount(deposit.remaining_deposits)}</p>
                                            </div>
                                            <div>
                                                <p className="text-gray-400">Funding deadline</p>
                                                <p className="font-mono text-white">{formatDeadline(funding?.topup_deadline_at_ms)}</p>
                                            </div>
                                            <div>
                                                <p className="text-gray-400">Intents on this deposit</p>
                                                <p className="font-mono text-white">{item.intentsCount}</p>
                                            </div>
                                        </div>

                                        {funding?.status === "AwaitingFunding" && (
                                            <div className="flex justify-end">
                                                <Link
                                                    href={`/sell?depositId=${deposit.deposit_id}`}
                                                    className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs"
                                                >
                                                    Continue Deposit
                                                </Link>
                                            </div>
                                        )}

                                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs text-gray-300">
                                            <p>Quote ID: <span className="font-mono text-gray-200">{shorten(funding?.quote_id)}</span></p>
                                            <p>Address: <span className="font-mono text-gray-200">{shorten(funding?.deposit_address)}</span></p>
                                            <p>Updated: <span className="font-mono text-gray-200">{formatDateTime(funding?.updated_at_ms || deposit.timestamp)}</span></p>
                                            <p>Created: <span className="font-mono text-gray-200">{formatDateTime(deposit.timestamp)}</span></p>
                                        </div>
                                    </article>
                                );
                            })}
                        </div>
                    )}
                </section>

                <section className="glass-panel p-6 space-y-4">
                    <div className="flex items-center justify-between">
                        <h2 className="text-xl font-bold text-white">Buyer Intent History</h2>
                        <Link href="/buy" className="text-sm text-blue-300 hover:text-blue-200">Create intent</Link>
                    </div>

                    {!isConnected ? (
                        <p className="text-sm text-gray-400">Connect wallet to view your intent history.</p>
                    ) : intents.length === 0 ? (
                        <p className="text-sm text-gray-400">No intents found for this account.</p>
                    ) : (
                        <div className="space-y-3">
                            {intents.map((intent) => (
                                <article key={intent.intent_hash} className="bg-white/5 border border-white/10 rounded-xl p-4 space-y-3">
                                    <div className="flex flex-wrap items-start justify-between gap-3">
                                        <div>
                                            <p className="text-white font-semibold">{intent.intent_hash}</p>
                                            <p className="text-xs text-gray-400 mt-1">Deposit #{intent.deposit_id}</p>
                                        </div>
                                        <span className={`px-2.5 py-1 rounded-full border text-xs font-medium ${statusTone(intent.status)}`}>
                                            {intent.status}
                                        </span>
                                    </div>

                                    <div className="grid grid-cols-2 md:grid-cols-5 gap-3 text-sm">
                                        <div>
                                            <p className="text-gray-400">Amount</p>
                                            <p className="font-mono text-white">{formatYoctoAmount(intent.amount)}</p>
                                        </div>
                                        <div>
                                            <p className="text-gray-400">Payment</p>
                                            <p className="font-mono text-white">{intent.payment_method || "N/A"}</p>
                                        </div>
                                        <div>
                                            <p className="text-gray-400">Currency</p>
                                            <p className="font-mono text-white">{intent.currency_code || "N/A"}</p>
                                        </div>
                                        <div>
                                            <p className="text-gray-400">Chain</p>
                                            <p className="font-mono text-white">{intent.chain || "N/A"}</p>
                                        </div>
                                        <div>
                                            <p className="text-gray-400">Created</p>
                                            <p className="font-mono text-white">{formatDateTime(intent.timestamp)}</p>
                                        </div>
                                    </div>

                                    <p className="text-xs text-gray-300 break-all">
                                        Recipient: <span className="font-mono text-gray-200">{intent.recipient || "N/A"}</span>
                                    </p>
                                </article>
                            ))}
                        </div>
                    )}
                </section>
            </div>
        </div>
    );
}
