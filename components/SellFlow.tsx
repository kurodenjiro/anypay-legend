"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { formatUnits } from "viem";
import SellWidget from "./SellWidget";
import { nearService, type DepositFundingMetaV2, type FundingStatusV2 } from "@/lib/services/near";
import { getIntentsStatusByDeposit, type OneClickStatusResponse } from "@/lib/services/intents-pricing";
import { encodePaymentMethodWithTag, parsePaymentMethod } from "@/lib/services/payment-method";
import { useNear } from "@/hooks/useNear";

type TradeState = "DEPOSIT" | "FUNDING" | "SUCCESS";
const STATUS_REFRESH_INTERVAL_MS = 5_000;

type ResumeFundingItem = {
    depositId: number;
    assetId: string;
    asset: string;
    status: FundingStatusV2;
    topupDeadlineAtMs: number;
};

type LiquidityItem = {
    depositId: number;
    assetId: string;
    asset: string;
    remainingRaw: string;
};

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

function formatAmount(
    amount: string | number | bigint | undefined,
    symbolOrAsset?: string | null,
): string {
    if (amount === undefined || amount === null) return "0";

    try {
        const value = typeof amount === "string" ? BigInt(amount) : BigInt(amount);
        const decimals = getAssetDecimals(symbolOrAsset);
        return trimTrailingZeros(formatUnits(value, decimals));
    } catch {
        return String(amount);
    }
}

function inferAssetSymbol(value: string | null | undefined): string {
    const normalized = String(value || "").toUpperCase();
    if (normalized.includes("BTC")) return "BTC";
    if (normalized.includes("ETH")) return "ETH";
    if (normalized.includes("ZEC")) return "ZEC";
    return normalized || "ASSET";
}

function formatDeadlineLabel(deadlineMs?: number): string {
    if (!deadlineMs || deadlineMs <= 0) return "Awaiting quote";
    const remaining = deadlineMs - Date.now();
    if (remaining <= 0) return "Expired";
    const totalSeconds = Math.floor(remaining / 1000);
    const mins = Math.floor(totalSeconds / 60);
    const secs = totalSeconds % 60;
    return `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
}

function formatStatusTimestamp(value?: string): string {
    if (!value) return "N/A";
    const parsed = Date.parse(value);
    if (!Number.isFinite(parsed)) return value;
    return new Date(parsed).toLocaleString();
}

function normalizeDisplayAmount(value?: string | null): string | null {
    const normalized = String(value ?? "").trim();
    if (!/^\d+(\.\d+)?$/.test(normalized)) return null;
    const trimmed = trimTrailingZeros(normalized);
    return trimmed.length > 0 ? trimmed : "0";
}

function getAssetDecimals(symbolOrAsset: string | null | undefined): number {
    const normalized = String(symbolOrAsset || "").toUpperCase();
    if (normalized.includes("BTC")) return 8;
    if (normalized.includes("ZEC")) return 8;
    if (normalized.includes("ETH")) return 18;
    return 24;
}

function parseRawAmount(value?: string | null): bigint | null {
    const normalized = String(value || "").trim();
    if (!/^\d+$/.test(normalized)) return null;
    try {
        const parsed = BigInt(normalized);
        return parsed >= BigInt(0) ? parsed : null;
    } catch {
        return null;
    }
}

function hasPositiveRawAmount(value?: string | null): boolean {
    const parsed = parseRawAmount(value);
    return parsed !== null && parsed > BigInt(0);
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
    const router = useRouter();
    const searchParams = useSearchParams();
    const [currentState, setCurrentState] = useState<TradeState>("DEPOSIT");
    const [tradeData, setTradeData] = useState<any>(null);
    const [walletBalanceNear, setWalletBalanceNear] = useState<string | null>(null);
    const [isBalanceLoading, setIsBalanceLoading] = useState(false);
    const [fundingMeta, setFundingMeta] = useState<DepositFundingMetaV2 | null>(null);
    const [fundingError, setFundingError] = useState<string>("");
    const [isQrUnavailable, setIsQrUnavailable] = useState(false);
    const [clockMs, setClockMs] = useState(() => Date.now());
    const [resumeItems, setResumeItems] = useState<ResumeFundingItem[]>([]);
    const [liquidityItems, setLiquidityItems] = useState<LiquidityItem[]>([]);
    const [isResumeItemsLoading, setIsResumeItemsLoading] = useState(false);
    const [withdrawingDepositId, setWithdrawingDepositId] = useState<number | null>(null);
    const [oneClickStatus, setOneClickStatus] = useState<OneClickStatusResponse | null>(null);
    const [oneClickStatusError, setOneClickStatusError] = useState("");
    const [isOneClickStatusLoading, setIsOneClickStatusLoading] = useState(false);
    const [ignoredResumeDepositId, setIgnoredResumeDepositId] = useState<number | null>(null);

    const { isConnected, connect, accountId, isLoading } = useNear();

    const isV2FlowEnabled = nearService.isV2FlowEnabled();
    const resumeDepositIdFromQuery = useMemo(() => {
        const value = searchParams.get("depositId");
        if (!value) return null;
        const parsed = Number(value);
        return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
    }, [searchParams]);

    const setResumeDepositIdInUrl = useCallback((depositId: number) => {
        const next = new URLSearchParams(searchParams.toString());
        next.set("depositId", String(depositId));
        router.replace(`/sell?${next.toString()}`);
    }, [router, searchParams]);

    const clearResumeDepositIdFromUrl = useCallback(() => {
        if (!searchParams.has("depositId")) return;
        const next = new URLSearchParams(searchParams.toString());
        next.delete("depositId");
        const query = next.toString();
        router.replace(query ? `/sell?${query}` : "/sell");
    }, [router, searchParams]);

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

    const resumeDepositIntent = useCallback(async (depositId: number) => {
        if (!accountId) {
            throw new Error("Wallet not connected");
        }

        const [deposit, meta] = await Promise.all([
            nearService.getDeposit(depositId),
            nearService.getDepositFundingV2(depositId),
        ]);

        if (!deposit) {
            throw new Error(`Deposit #${depositId} not found`);
        }

        if (deposit.depositor !== accountId && deposit.delegate !== accountId) {
            throw new Error(`Deposit #${depositId} is not managed by this wallet`);
        }

        if (!meta) {
            throw new Error(`Deposit #${depositId} is a legacy deposit and cannot be resumed here`);
        }

        const assetId = meta.asset_id || deposit.token;
        const asset = inferAssetSymbol(assetId);
        const amount = formatAmount(deposit.total_deposit, assetId);
        const resumePaymentInfo = parsePaymentMethod(deposit.payment_methods?.[0]);
        const baseTradeData = {
            depositId,
            assetId,
            asset,
            amount,
            paymentMethod: resumePaymentInfo.method || "wise",
            sellerAccountTag: resumePaymentInfo.accountTag || "",
            timestamp: Date.now(),
        };

        setFundingMeta(meta);
        setFundingError("");
        if (meta.status === "Funded") {
            setTradeData({ ...baseTradeData, fundingMeta: meta });
            setCurrentState("SUCCESS");
        } else {
            setTradeData(baseTradeData);
            setCurrentState("FUNDING");
        }
        setResumeDepositIdInUrl(depositId);
        await loadWalletBalance();
    }, [accountId, loadWalletBalance, setResumeDepositIdInUrl]);

    const loadResumeItems = useCallback(async () => {
        if (!isV2FlowEnabled || !accountId || !isConnected) {
            setResumeItems([]);
            setLiquidityItems([]);
            return;
        }

        setIsResumeItemsLoading(true);
        try {
            const deposits = await nearService.getAccountDeposits(accountId);
            const recent = [...deposits]
                .sort((a, b) => b.deposit_id - a.deposit_id)
                .slice(0, 25);

            const rows = await Promise.all(
                recent.map(async (deposit) => {
                    const meta = await nearService.getDepositFundingV2(deposit.deposit_id);
                    if (!meta) return null;
                    return {
                        deposit,
                        meta,
                    };
                }),
            );
            const resumableRows: ResumeFundingItem[] = [];
            const activeLiquidityRows: LiquidityItem[] = [];
            for (const row of rows) {
                if (!row) continue;

                const assetId = row.meta.asset_id || row.deposit.token;
                const asset = inferAssetSymbol(assetId);

                if (row.meta.status === "AwaitingFunding") {
                    resumableRows.push({
                        depositId: row.deposit.deposit_id,
                        assetId,
                        asset,
                        status: row.meta.status,
                        topupDeadlineAtMs: Number(row.meta.topup_deadline_at_ms || 0),
                    });
                }

                if (row.meta.status === "Funded" && hasPositiveRawAmount(row.deposit.remaining_deposits)) {
                    activeLiquidityRows.push({
                        depositId: row.deposit.deposit_id,
                        assetId,
                        asset,
                        remainingRaw: String(row.deposit.remaining_deposits || "0"),
                    });
                }
            }
            setResumeItems(resumableRows);
            setLiquidityItems(activeLiquidityRows);
        } catch (error) {
            console.error("SellFlow: failed to load resumable deposit intents", error);
            setResumeItems([]);
            setLiquidityItems([]);
        } finally {
            setIsResumeItemsLoading(false);
        }
    }, [accountId, isConnected, isV2FlowEnabled]);

    const refreshOneClickStatus = useCallback(async (
        metaOverride?: DepositFundingMetaV2 | null,
    ) => {
        const activeMeta = metaOverride ?? fundingMeta;
        const depositAddress = String(activeMeta?.deposit_address || "").trim();
        if (!depositAddress) {
            setOneClickStatus(null);
            setOneClickStatusError("");
            return;
        }

        try {
            setIsOneClickStatusLoading(true);
            const status = await getIntentsStatusByDeposit(
                depositAddress,
                activeMeta?.deposit_memo || undefined,
            );
            setOneClickStatus(status);
            setOneClickStatusError("");
        } catch (error: unknown) {
            console.error("SellFlow: failed to fetch 1Click status", error);
            setOneClickStatusError(
                error instanceof Error ? error.message : "Failed to fetch 1Click status",
            );
        } finally {
            setIsOneClickStatusLoading(false);
        }
    }, [fundingMeta]);

    const refreshFundingMeta = useCallback(async () => {
        const depositId = Number(tradeData?.depositId);
        if (!Number.isInteger(depositId) || depositId <= 0) return;

        try {
            const meta = await nearService.getDepositFundingV2(depositId);
            if (!meta) return;

            setFundingMeta(meta);
            setFundingError("");
            await refreshOneClickStatus(meta);

            if (meta.status === "Funded") {
                setTradeData((prev: any) => ({ ...prev, fundingMeta: meta }));
                setCurrentState("SUCCESS");
                await loadWalletBalance();
            }
        } catch (error: any) {
            console.error("SellFlow: failed to refresh funding metadata", error);
            setFundingError(error?.message || "Failed to load funding status");
        }
    }, [tradeData?.depositId, loadWalletBalance, refreshOneClickStatus]);

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

        const interval = setInterval(() => {
            void refreshFundingMeta();
        }, STATUS_REFRESH_INTERVAL_MS);

        return () => clearInterval(interval);
    }, [currentState, tradeData?.depositId, refreshFundingMeta, isV2FlowEnabled]);

    useEffect(() => {
        if (currentState === "FUNDING") return;
        setOneClickStatus(null);
        setOneClickStatusError("");
        setIsOneClickStatusLoading(false);
    }, [currentState]);

    useEffect(() => {
        setIsQrUnavailable(false);
    }, [fundingMeta?.deposit_address, fundingMeta?.deposit_memo]);

    useEffect(() => {
        if (currentState !== "DEPOSIT") return;
        void loadResumeItems();
    }, [currentState, loadResumeItems]);

    useEffect(() => {
        if (resumeDepositIdFromQuery === null) {
            if (ignoredResumeDepositId !== null) {
                setIgnoredResumeDepositId(null);
            }
            return;
        }

        if (
            ignoredResumeDepositId !== null
            && resumeDepositIdFromQuery !== ignoredResumeDepositId
        ) {
            setIgnoredResumeDepositId(null);
        }
    }, [resumeDepositIdFromQuery, ignoredResumeDepositId]);

    useEffect(() => {
        if (!isV2FlowEnabled) return;
        if (!resumeDepositIdFromQuery) return;
        if (!accountId || !isConnected) return;
        if (currentState !== "DEPOSIT") return;
        if (ignoredResumeDepositId === resumeDepositIdFromQuery) return;

        void resumeDepositIntent(resumeDepositIdFromQuery).catch((error: unknown) => {
            const message = error instanceof Error ? error.message : "Failed to resume deposit intent";
            setFundingError(message);
        });
    }, [
        accountId,
        currentState,
        isConnected,
        ignoredResumeDepositId,
        isV2FlowEnabled,
        resumeDepositIdFromQuery,
        resumeDepositIntent,
    ]);

    const handleDeposit = async (data: any) => {
        try {
            setFundingError("");
            if (!accountId) {
                throw new Error("Wallet not connected");
            }

            const minIntentAmount = toMinIntentAmount(data.amount);
            const paymentMethod = String(data.acceptingPayment.platform.name).trim().toLowerCase();
            const sellerAccountTag = String(data.acceptingPayment?.accountTag || "").trim();
            const paymentMethodRaw = encodePaymentMethodWithTag(paymentMethod, sellerAccountTag) || paymentMethod;

            if (isV2FlowEnabled) {
                if (!data.assetId) throw new Error("Missing canonical assetId");
                if (!data.refundTo) throw new Error("Missing refund address");

                const result = await nearService.registerDepositIntentV2(
                    data.assetId,
                    data.amount,
                    minIntentAmount,
                    data.amount,
                    [paymentMethodRaw],
                    data.refundTo,
                );

                const depositId = await resolveDepositId(result, accountId);
                setFundingMeta(null);
                setTradeData({
                    ...data,
                    timestamp: Date.now(),
                    paymentMethod,
                    paymentMethodRaw,
                    sellerAccountTag,
                    depositId,
                    txHash: getTxHash(result),
                });
                setCurrentState("FUNDING");
                setResumeDepositIdInUrl(depositId);
                await loadWalletBalance();
                return;
            }

            const result = await nearService.createDeposit(
                data.asset,
                data.amount,
                minIntentAmount,
                data.amount,
                [paymentMethodRaw],
            );

            const depositId = await resolveDepositId(result, accountId);
            setTradeData({
                ...data,
                timestamp: Date.now(),
                paymentMethod,
                paymentMethodRaw,
                sellerAccountTag,
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
    const depositedAmountRaw = useMemo(
        () => oneClickStatus?.swapDetails?.depositedAmount
            || oneClickStatus?.swapDetails?.amountIn
            || "",
        [oneClickStatus],
    );
    const fundingAssetSymbol = useMemo(
        () => String(tradeData?.asset || inferAssetSymbol(tradeData?.assetId)),
        [tradeData?.asset, tradeData?.assetId],
    );
    const fundingAssetDecimals = useMemo(
        () => getAssetDecimals(fundingAssetSymbol),
        [fundingAssetSymbol],
    );
    const depositedFromRawFormatted = useMemo(() => {
        const parsed = parseRawAmount(depositedAmountRaw);
        if (parsed === null) return null;
        return trimTrailingZeros(formatUnits(parsed, fundingAssetDecimals));
    }, [depositedAmountRaw, fundingAssetDecimals]);
    const depositedAmountFormatted = useMemo(
        () => (
            depositedFromRawFormatted
            || normalizeDisplayAmount(oneClickStatus?.swapDetails?.depositedAmountFormatted)
            || normalizeDisplayAmount(oneClickStatus?.swapDetails?.amountInFormatted)
            || "0"
        ),
        [depositedFromRawFormatted, oneClickStatus],
    );
    const oneClickAmountDisplay = useMemo(
        () => normalizeDisplayAmount(depositedAmountFormatted) || "N/A",
        [depositedAmountFormatted],
    );
    const hasDepositedAmount = useMemo(() => {
        const parsedRaw = parseRawAmount(depositedAmountRaw);
        if (parsedRaw !== null) return parsedRaw > BigInt(0);
        const normalized = normalizeDisplayAmount(depositedAmountFormatted);
        return Boolean(normalized && normalized !== "0");
    }, [depositedAmountRaw, depositedAmountFormatted]);
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

    const handleWithdrawLiquidity = useCallback(async (depositId: number) => {
        if (!Number.isInteger(depositId) || depositId <= 0) return;
        if (withdrawingDepositId !== null) return;

        setWithdrawingDepositId(depositId);
        setFundingError("");

        try {
            await nearService.withdrawDeposit(depositId);
            await loadWalletBalance();
            await loadResumeItems();

            if (Number(tradeData?.depositId) === depositId) {
                setFundingMeta(null);
                setTradeData(null);
                setCurrentState("DEPOSIT");
                setIsQrUnavailable(false);
                clearResumeDepositIdFromUrl();
            }
        } catch (error: unknown) {
            const message = error instanceof Error
                ? error.message
                : "Failed to withdraw liquidity";
            setFundingError(message);
        } finally {
            setWithdrawingDepositId(null);
        }
    }, [
        withdrawingDepositId,
        loadWalletBalance,
        loadResumeItems,
        tradeData?.depositId,
        clearResumeDepositIdFromUrl,
    ]);

    const resetToDeposit = () => {
        const activeDepositId = Number(tradeData?.depositId || resumeDepositIdFromQuery || 0);
        if (Number.isInteger(activeDepositId) && activeDepositId > 0) {
            setIgnoredResumeDepositId(activeDepositId);
        }
        setFundingMeta(null);
        setFundingError("");
        setTradeData(null);
        setCurrentState("DEPOSIT");
        setIsQrUnavailable(false);
        clearResumeDepositIdFromUrl();
    };

    return (
        <div className="w-full max-w-3xl mx-auto space-y-8 relative">
            <div className="min-h-[500px] relative">
                {currentState === "DEPOSIT" && (
                    <div className="space-y-4">
                        {isV2FlowEnabled && isConnected && (
                            <div className="glass-panel p-4 space-y-3">
                                <div className="flex items-center justify-between">
                                    <p className="text-sm font-semibold text-white">Pending Deposit Intents</p>
                                    <button
                                        type="button"
                                        onClick={() => void loadResumeItems()}
                                        className="text-xs px-2.5 py-1 rounded-md border border-white/15 bg-white/5 hover:bg-white/10 text-gray-200"
                                    >
                                        {isResumeItemsLoading ? "Loading..." : "Refresh"}
                                    </button>
                                </div>

                                {resumeItems.length === 0 ? (
                                    <p className="text-xs text-gray-400">
                                        No pending funding intents found.
                                    </p>
                                ) : (
                                    <div className="space-y-2">
                                        {resumeItems.map((item) => (
                                            <div
                                                key={item.depositId}
                                                className="bg-white/5 border border-white/10 rounded-lg px-3 py-2.5 flex items-center justify-between gap-3"
                                            >
                                                <div className="min-w-0">
                                                    <p className="text-sm text-white font-medium">
                                                        Deposit #{item.depositId} · {item.asset}
                                                    </p>
                                                    <p className="text-xs text-gray-400 truncate">
                                                        {item.assetId} · Timer: {formatDeadlineLabel(item.topupDeadlineAtMs)}
                                                    </p>
                                                </div>
                                                <button
                                                    type="button"
                                                    onClick={() => {
                                                        void resumeDepositIntent(item.depositId).catch((error: unknown) => {
                                                            const message = error instanceof Error
                                                                ? error.message
                                                                : "Failed to resume deposit intent";
                                                            setFundingError(message);
                                                        });
                                                    }}
                                                    className="px-3 py-1.5 rounded-md bg-emerald-600 hover:bg-emerald-700 text-white text-xs whitespace-nowrap"
                                                >
                                                    Continue Deposit
                                                </button>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        )}

                        {isV2FlowEnabled && isConnected && (
                            <div className="glass-panel p-4 space-y-3">
                                <div className="flex items-center justify-between">
                                    <p className="text-sm font-semibold text-white">Active Liquidity</p>
                                    <button
                                        type="button"
                                        onClick={() => void loadResumeItems()}
                                        className="text-xs px-2.5 py-1 rounded-md border border-white/15 bg-white/5 hover:bg-white/10 text-gray-200"
                                    >
                                        {isResumeItemsLoading ? "Loading..." : "Refresh"}
                                    </button>
                                </div>

                                {liquidityItems.length === 0 ? (
                                    <p className="text-xs text-gray-400">
                                        No funded liquidity available to withdraw.
                                    </p>
                                ) : (
                                    <div className="space-y-2">
                                        {liquidityItems.map((item) => (
                                            <div
                                                key={`liq:${item.depositId}`}
                                                className="bg-white/5 border border-white/10 rounded-lg px-3 py-2.5 flex items-center justify-between gap-3"
                                            >
                                                <div className="min-w-0">
                                                    <p className="text-sm text-white font-medium">
                                                        Deposit #{item.depositId} · {item.asset}
                                                    </p>
                                                    <p className="text-xs text-gray-400 truncate">
                                                        Remaining: {formatAmount(item.remainingRaw, item.assetId)} {item.asset}
                                                    </p>
                                                </div>
                                                <button
                                                    type="button"
                                                    onClick={() => {
                                                        void handleWithdrawLiquidity(item.depositId);
                                                    }}
                                                    disabled={withdrawingDepositId !== null}
                                                    className="px-3 py-1.5 rounded-md bg-rose-600 hover:bg-rose-700 disabled:opacity-60 text-white text-xs whitespace-nowrap"
                                                >
                                                    {withdrawingDepositId === item.depositId ? "Withdrawing..." : "Withdraw"}
                                                </button>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        )}

                        {fundingError && (
                            <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-3 text-sm text-red-100">
                                {fundingError}
                            </div>
                        )}

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
                    </div>
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
                                <span className="text-gray-400">1Click Status</span>
                                <span className="text-purple-300 font-mono">
                                    {oneClickStatus?.status
                                        || (fundingMeta?.deposit_address
                                            ? (isOneClickStatusLoading ? "Checking..." : "Unknown")
                                            : "Awaiting quote")}
                                </span>
                            </div>
                            <div className="flex justify-between text-xs">
                                <span className="text-gray-500">1Click Updated</span>
                                <span className="text-gray-300 font-mono">
                                    {formatStatusTimestamp(oneClickStatus?.updatedAt)}
                                </span>
                            </div>
                            {hasDepositedAmount && (
                                <div className="flex justify-between text-xs">
                                    <span className="text-gray-500">Deposited Amount</span>
                                    <span className="text-gray-300 font-mono break-all text-right max-w-[70%]">
                                        {oneClickAmountDisplay} {fundingAssetSymbol}
                                    </span>
                                </div>
                            )}
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
                        {oneClickStatusError && (
                            <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-4 text-sm text-amber-100">
                                1Click check failed: {oneClickStatusError}
                            </div>
                        )}

                        <div className="flex flex-wrap gap-2">
                            <button
                                type="button"
                                onClick={() => void refreshFundingMeta()}
                                className="px-4 py-2 bg-white/10 hover:bg-white/20 text-white rounded-xl transition-all"
                            >
                                {isOneClickStatusLoading ? "Refreshing..." : "Refresh Status"}
                            </button>
                            <span className="self-center text-xs text-gray-400">
                                Auto-refresh every 5s
                            </span>
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
                                    {formatAmount(
                                        tradeData?.fundingMeta?.funded_amount,
                                        tradeData?.assetId || tradeData?.asset,
                                    )} {tradeData?.asset}
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

                        {fundingError && (
                            <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-3 text-sm text-red-100 max-w-md mx-auto">
                                {fundingError}
                            </div>
                        )}

                        <div className="flex flex-wrap items-center justify-center gap-3">
                            <button
                                type="button"
                                onClick={() => {
                                    const depositId = Number(tradeData?.depositId || 0);
                                    if (!Number.isInteger(depositId) || depositId <= 0) return;
                                    void handleWithdrawLiquidity(depositId);
                                }}
                                disabled={!Number.isInteger(Number(tradeData?.depositId || 0)) || withdrawingDepositId !== null}
                                className="px-6 py-3 bg-rose-600 hover:bg-rose-700 disabled:opacity-60 text-white rounded-xl transition-all"
                            >
                                {withdrawingDepositId === Number(tradeData?.depositId || 0) ? "Withdrawing..." : "Withdraw Liquidity"}
                            </button>
                            <button
                                type="button"
                                onClick={resetToDeposit}
                                className="px-8 py-3 bg-white/10 hover:bg-white/20 text-white rounded-xl transition-all"
                            >
                                Create New Deposit Intent
                            </button>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
