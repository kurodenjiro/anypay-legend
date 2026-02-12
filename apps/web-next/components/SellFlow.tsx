"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { formatUnits } from "viem";
import SellWidget from "./SellWidget";
import { nearService, type DepositFundingMetaV2 } from "@/lib/services/near";
import { useNear } from "@/hooks/useNear";

type TradeState = "DEPOSIT" | "FUNDING" | "SUCCESS";

function trimTrailingZeros(value: string): string {
    return value.replace(/\.?(0+)$/, "");
}

function toMinIntentAmount(amount: string): string {
    const numericAmount = Number(amount);
    if (!Number.isFinite(numericAmount) || numericAmount <= 0) {
        return "0.000001";
    }

    const minAmount = Math.min(Math.max(numericAmount * 0.1, 0.000001), numericAmount);
    const precision = minAmount < 1 ? 12 : 6;
    return trimTrailingZeros(minAmount.toFixed(precision));
}

function decodeSuccessValue(result: any): unknown {
    const status =
        result?.status
        ?? result?.transaction_outcome?.outcome?.status
        ?? result?.final_execution_status;
    const encoded = status?.SuccessValue ?? status?.successValue;

    if (!encoded || typeof encoded !== "string") return null;

    const raw = atob(encoded);
    if (!raw) return null;

    try {
        return JSON.parse(raw);
    } catch {
        return raw;
    }
}

function getTxHash(result: any): string {
    return (
        result?.transaction?.hash
        || result?.transaction_outcome?.id
        || "unknown"
    );
}

function formatAmount(amount: string | number | bigint | undefined): string {
    if (amount === undefined || amount === null) return "0";

    try {
        const value = typeof amount === "string" ? BigInt(amount) : BigInt(amount);
        return trimTrailingZeros(formatUnits(value, 24));
    } catch {
        return String(amount);
    }
}

function resolveTerminalMessage(fundingMeta: DepositFundingMetaV2 | null): string {
    if (!fundingMeta) return "";

    if (fundingMeta.status === "TopUpExpired") {
        return "Top-up window expired. Please create a new deposit intent.";
    }

    if (fundingMeta.status === "Failed") {
        return fundingMeta.failure_reason || "Funding failed. Please create a new deposit intent.";
    }

    if (fundingMeta.status === "Cancelled") {
        return "Deposit intent was cancelled.";
    }

    return "";
}

export default function SellFlow() {
    const [currentState, setCurrentState] = useState<TradeState>("DEPOSIT");
    const [tradeData, setTradeData] = useState<any>(null);
    const [walletBalanceNear, setWalletBalanceNear] = useState<string | null>(null);
    const [isBalanceLoading, setIsBalanceLoading] = useState(false);
    const [fundingMeta, setFundingMeta] = useState<DepositFundingMetaV2 | null>(null);
    const [fundingError, setFundingError] = useState<string>("");
    const [isQrUnavailable, setIsQrUnavailable] = useState(false);
    const [clockMs, setClockMs] = useState(() => Date.now());

    const { isConnected, connect, accountId, isLoading } = useNear();

    const isV2FlowEnabled = nearService.isV2FlowEnabled();

    const loadWalletBalance = useCallback(async () => {
        if (!isConnected || !accountId) {
            setWalletBalanceNear(null);
            setIsBalanceLoading(false);
            return;
        }

        setIsBalanceLoading(true);
        try {
            const { near } = await nearService.getNativeBalance(accountId);
            setWalletBalanceNear(near);
        } catch (error) {
            console.error("Failed to load NEAR balance:", error);
            setWalletBalanceNear(null);
        } finally {
            setIsBalanceLoading(false);
        }
    }, [isConnected, accountId]);

    const resolveDepositId = useCallback(async (result: any, fallbackAccountId: string) => {
        let depositId = Number(decodeSuccessValue(result));

        if (!Number.isFinite(depositId)) {
            const accountDeposits = await nearService.getAccountDeposits(fallbackAccountId);
            const latest = accountDeposits.reduce((max, deposit) => {
                const value = Number(deposit?.deposit_id ?? 0);
                return Number.isFinite(value) ? Math.max(max, value) : max;
            }, 0);
            depositId = latest;
        }

        if (!Number.isFinite(depositId) || depositId <= 0) {
            throw new Error("Deposit created but deposit_id could not be resolved");
        }

        return depositId;
    }, []);

    const refreshFundingMeta = useCallback(async () => {
        const depositId = Number(tradeData?.depositId);
        if (!Number.isInteger(depositId) || depositId <= 0) return;

        try {
            const meta = await nearService.getDepositFundingV2(depositId);
            if (!meta) return;

            setFundingMeta(meta);
            setFundingError("");

            if (meta.status === "Funded") {
                setTradeData((prev: any) => ({ ...prev, fundingMeta: meta }));
                setCurrentState("SUCCESS");
                await loadWalletBalance();
            }
        } catch (error: any) {
            console.error("SellFlow: failed to refresh funding metadata", error);
            setFundingError(error?.message || "Failed to load funding status");
        }
    }, [tradeData?.depositId, loadWalletBalance]);

    useEffect(() => {
        void loadWalletBalance();
    }, [loadWalletBalance]);

    useEffect(() => {
        const timer = setInterval(() => setClockMs(Date.now()), 1000);
        return () => clearInterval(timer);
    }, []);

    useEffect(() => {
        if (!isV2FlowEnabled) return;
        if (currentState !== "FUNDING") return;
        if (!tradeData?.depositId) return;

        void refreshFundingMeta();
        const interval = setInterval(() => {
            void refreshFundingMeta();
        }, 5_000);

        return () => clearInterval(interval);
    }, [currentState, tradeData?.depositId, refreshFundingMeta, isV2FlowEnabled]);

    useEffect(() => {
        setIsQrUnavailable(false);
    }, [fundingMeta?.deposit_address, fundingMeta?.deposit_memo]);

    const handleDeposit = async (data: any) => {
        try {
            if (!accountId) {
                throw new Error("Wallet not connected");
            }

            const minIntentAmount = toMinIntentAmount(data.amount);
            const paymentMethod = String(data.acceptingPayment.platform.name).trim().toLowerCase();

            if (isV2FlowEnabled) {
                if (!data.assetId) throw new Error("Missing canonical assetId");
                if (!data.refundTo) throw new Error("Missing refund address");

                const result = await nearService.registerDepositIntentV2(
                    data.assetId,
                    data.amount,
                    minIntentAmount,
                    data.amount,
                    [paymentMethod],
                    data.refundTo,
                );

                const depositId = await resolveDepositId(result, accountId);
                setFundingMeta(null);
                setTradeData({
                    ...data,
                    timestamp: Date.now(),
                    paymentMethod,
                    depositId,
                    txHash: getTxHash(result),
                });
                setCurrentState("FUNDING");
                await loadWalletBalance();
                return;
            }

            const result = await nearService.createDeposit(
                data.asset,
                data.amount,
                minIntentAmount,
                data.amount,
                [paymentMethod],
            );

            const depositId = await resolveDepositId(result, accountId);
            setTradeData({
                ...data,
                timestamp: Date.now(),
                paymentMethod,
                depositId,
                txHash: getTxHash(result),
            });
            setCurrentState("SUCCESS");
            await loadWalletBalance();
        } catch (e) {
            console.error("Deposit failed:", e);
            throw e instanceof Error ? e : new Error(String(e ?? "Deposit failed"));
        }
    };

    const hasFundingDeadline = useMemo(
        () => Number(fundingMeta?.topup_deadline_at_ms || 0) > 0,
        [fundingMeta?.topup_deadline_at_ms],
    );

    const fundingCountdownMs = useMemo(() => {
        if (!hasFundingDeadline) return 0;
        const deadlineMs = Number(fundingMeta?.topup_deadline_at_ms || 0);
        return Math.max(deadlineMs - clockMs, 0);
    }, [hasFundingDeadline, fundingMeta?.topup_deadline_at_ms, clockMs]);

    const fundingCountdownLabel = useMemo(() => {
        if (!hasFundingDeadline) return "Awaiting quote";
        const seconds = Math.floor(fundingCountdownMs / 1000);
        const mins = Math.floor(seconds / 60);
        const secs = seconds % 60;
        return `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
    }, [hasFundingDeadline, fundingCountdownMs]);

    const terminalFundingMessage = resolveTerminalMessage(fundingMeta);
    const qrPayload = useMemo(() => {
        if (!fundingMeta?.deposit_address) return "";
        return `${fundingMeta.deposit_address}${fundingMeta.deposit_memo ? `|memo:${fundingMeta.deposit_memo}` : ""}`;
    }, [fundingMeta?.deposit_address, fundingMeta?.deposit_memo]);

    const copyText = async (value: string) => {
        try {
            await navigator.clipboard.writeText(value);
        } catch (error) {
            console.error("Failed to copy text", error);
        }
    };

    const resetToDeposit = () => {
        setFundingMeta(null);
        setFundingError("");
        setTradeData(null);
        setCurrentState("DEPOSIT");
        setIsQrUnavailable(false);
    };

    return (
        <div className="w-full max-w-3xl mx-auto space-y-8 relative">
            <div className="min-h-[500px] relative">
                {currentState === "DEPOSIT" && (
                    <SellWidget
                        onDeposit={handleDeposit}
                        isConnected={isConnected}
                        onConnect={connect}
                        isConnecting={isLoading}
                        isV2FlowEnabled={isV2FlowEnabled}
                        accountId={accountId}
                        walletBalanceNear={walletBalanceNear}
                        isBalanceLoading={isBalanceLoading}
                        onRefreshBalance={loadWalletBalance}
                    />
                )}

                {currentState === "FUNDING" && (
                    <div className="glass-panel p-8 space-y-6 animate-fade-in">
                        <div className="flex items-center justify-between gap-4">
                            <div>
                                <h3 className="text-2xl font-bold text-white">Fund Your Deposit Intent</h3>
                                <p className="text-gray-400 text-sm mt-1">
                                    Send {tradeData?.asset} to the address below. Liquidity opens only after Near Intents confirms funding.
                                </p>
                            </div>
                                <div className="text-right">
                                    <p className="text-xs text-gray-500 uppercase tracking-wide">Top-up timer</p>
                                    <p className="font-mono text-xl text-amber-300">{fundingCountdownLabel}</p>
                                </div>
                            </div>

                        <div className="bg-white/5 rounded-xl p-4 border border-white/10 space-y-2">
                            <div className="flex justify-between text-sm">
                                <span className="text-gray-400">Deposit ID</span>
                                <span className="text-emerald-300 font-mono">{tradeData?.depositId}</span>
                            </div>
                            <div className="flex justify-between text-sm">
                                <span className="text-gray-400">Asset ID</span>
                                <span className="text-white font-mono text-xs">{tradeData?.assetId}</span>
                            </div>
                            <div className="flex justify-between text-sm">
                                <span className="text-gray-400">Expected Amount</span>
                                <span className="text-white font-mono">
                                    {tradeData?.amount} {tradeData?.asset}
                                </span>
                            </div>
                            <div className="flex justify-between text-sm">
                                <span className="text-gray-400">Status</span>
                                <span className="text-blue-300 font-mono">{fundingMeta?.status || "AwaitingFunding"}</span>
                            </div>
                            <div className="flex justify-between text-sm">
                                <span className="text-gray-400">Quote Generation</span>
                                <span className="text-white font-mono">{fundingMeta?.quote_generation || 0}</span>
                            </div>
                        </div>

                        {!!fundingMeta?.deposit_address && (
                            <div className="grid grid-cols-1 md:grid-cols-[1fr_180px] gap-4">
                                <div className="bg-black/30 border border-white/10 rounded-xl p-4 space-y-3">
                                    <p className="text-xs text-gray-400 uppercase tracking-wide">Deposit Address</p>
                                    <p className="text-emerald-300 font-mono text-sm break-all">{fundingMeta.deposit_address}</p>
                                    <div className="flex gap-2 flex-wrap">
                                        <button
                                            type="button"
                                            onClick={() => void copyText(fundingMeta.deposit_address || "")}
                                            className="px-3 py-1.5 rounded-lg border border-white/15 bg-white/5 hover:bg-white/10 text-xs text-white"
                                        >
                                            Copy Address
                                        </button>
                                        {fundingMeta.deposit_memo && (
                                            <button
                                                type="button"
                                                onClick={() => void copyText(fundingMeta.deposit_memo || "")}
                                                className="px-3 py-1.5 rounded-lg border border-white/15 bg-white/5 hover:bg-white/10 text-xs text-white"
                                            >
                                                Copy Memo
                                            </button>
                                        )}
                                    </div>

                                    {!!fundingMeta.deposit_memo && (
                                        <div className="pt-2">
                                            <p className="text-xs text-gray-400 uppercase tracking-wide">Memo / Tag</p>
                                            <p className="text-orange-300 font-mono text-sm break-all">{fundingMeta.deposit_memo}</p>
                                        </div>
                                    )}
                                </div>

                                <div className="bg-black/30 border border-white/10 rounded-xl p-4 flex items-center justify-center">
                                    {isQrUnavailable ? (
                                        <div className="text-center space-y-2">
                                            <p className="text-xs text-gray-300">QR unavailable. Use copy buttons above.</p>
                                            <button
                                                type="button"
                                                onClick={() => void copyText(qrPayload)}
                                                className="px-3 py-1.5 rounded-lg border border-white/15 bg-white/5 hover:bg-white/10 text-xs text-white"
                                            >
                                                Copy QR Payload
                                            </button>
                                        </div>
                                    ) : (
                                        <img
                                            src={`https://api.qrserver.com/v1/create-qr-code/?size=160x160&data=${encodeURIComponent(qrPayload)}`}
                                            alt="Funding QR"
                                            className="w-40 h-40 rounded-lg"
                                            onError={() => setIsQrUnavailable(true)}
                                        />
                                    )}
                                </div>
                            </div>
                        )}

                        {!fundingMeta?.deposit_address && (
                            <div className="bg-blue-500/10 border border-blue-500/30 rounded-xl p-4 text-sm text-blue-100">
                                Waiting for relayer to create funding quote address...
                            </div>
                        )}

                        {(terminalFundingMessage || fundingError) && (
                            <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-4 text-sm text-red-100">
                                {terminalFundingMessage || fundingError}
                            </div>
                        )}

                        <div className="flex flex-wrap gap-2">
                            <button
                                type="button"
                                onClick={() => void refreshFundingMeta()}
                                className="px-4 py-2 bg-white/10 hover:bg-white/20 text-white rounded-xl transition-all"
                            >
                                Refresh Status
                            </button>
                            {(fundingMeta?.status === "TopUpExpired" || fundingMeta?.status === "Failed" || fundingMeta?.status === "Cancelled") && (
                                <button
                                    type="button"
                                    onClick={resetToDeposit}
                                    className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl transition-all"
                                >
                                    Create New Deposit Intent
                                </button>
                            )}
                        </div>
                    </div>
                )}

                {currentState === "SUCCESS" && (
                    <div className="glass-panel p-8 text-center animate-fade-in space-y-6">
                        <div className="w-20 h-20 bg-green-500/20 rounded-full flex items-center justify-center mx-auto mb-6">
                            <svg
                                className="w-10 h-10 text-green-500"
                                fill="none"
                                viewBox="0 0 24 24"
                                stroke="currentColor"
                            >
                                <path
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    strokeWidth="2"
                                    d="M5 13l4 4L19 7"
                                />
                            </svg>
                        </div>

                        <h3 className="text-3xl font-bold text-white">Deposit Funded</h3>
                        <p className="text-gray-400 max-w-md mx-auto">
                            Near Intents confirmed your funding deposit. Buyers can now match this listing.
                        </p>

                        <div className="bg-white/5 rounded-xl p-4 border border-white/10 max-w-md mx-auto text-left space-y-2">
                            <div className="flex justify-between">
                                <span className="text-gray-400">Asset</span>
                                <span className="text-white font-mono">
                                    {tradeData?.asset}
                                </span>
                            </div>
                            <div className="flex justify-between">
                                <span className="text-gray-400">Funded Amount</span>
                                <span className="text-emerald-300 font-mono">
                                    {formatAmount(tradeData?.fundingMeta?.funded_amount)} {tradeData?.asset}
                                </span>
                            </div>
                            <div className="flex justify-between">
                                <span className="text-gray-400">Deposit ID</span>
                                <span className="text-emerald-300 font-mono">
                                    {tradeData?.depositId}
                                </span>
                            </div>
                            <div className="flex justify-between">
                                <span className="text-gray-400">Origin TX</span>
                                <span className="text-blue-300 font-mono text-xs truncate w-44 text-right">
                                    {tradeData?.fundingMeta?.origin_tx_hash || "N/A"}
                                </span>
                            </div>
                        </div>

                        <button
                            onClick={resetToDeposit}
                            className="px-8 py-3 bg-white/10 hover:bg-white/20 text-white rounded-xl transition-all"
                        >
                            Create Another Deposit
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
}
