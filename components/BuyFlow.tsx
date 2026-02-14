"use client";

import Link from "next/link";
import { useState, useCallback, useEffect, useMemo } from "react";
import { useSearchParams } from "next/navigation";
import { formatUnits, parseUnits } from "viem";
import BuyWidget from "./BuyWidget";
import TLSNNotarization from "./TLSNNotarization";
import { nearService } from "@/lib/services/near";
import { parsePaymentMethod } from "@/lib/services/payment-method";
import { useNear } from "@/hooks/useNear";

type TradeState = "SIGNAL" | "NOTARIZE" | "SUCCESS";
type BuyIntentHistoryItem = {
    accountId: string;
    intentId: string;
    txHash?: string;
    proofTxHash?: string;
    depositId?: number;
    assetId?: string;
    chain?: string;
    amount?: string;
    fiatAmount?: string;
    paymentMethod?: string;
    createdAtMs: number;
    deadlineAtMs: number;
    status?: string;
    sellerPlatform?: string;
    sellerTagname?: string;
    transferMemo?: string;
};

const INTENT_EXPIRATION_MS = 86_400_000; // 24h
const BUY_HISTORY_STORAGE_KEY = "anypay:buy-intent-history:v1";
const BIGINT_ZERO = BigInt(0);
const NANO_TO_MS_DIVISOR = BigInt(1_000_000);

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

function shortHash(value: string | null | undefined): string {
    const normalized = String(value || "").trim();
    if (!normalized) return "N/A";
    if (normalized.length <= 16) return normalized;
    return `${normalized.slice(0, 8)}...${normalized.slice(-8)}`;
}

function formatTimestamp(valueMs: number): string {
    if (!Number.isFinite(valueMs) || valueMs <= 0) return "N/A";
    return new Date(valueMs).toLocaleString();
}

function formatDeadlineCountdown(deadlineMs: number, nowMs: number): string {
    if (!Number.isFinite(deadlineMs) || deadlineMs <= 0) return "Unknown";
    const remaining = Math.max(deadlineMs - nowMs, 0);
    if (remaining <= 0) return "Expired";

    const totalSeconds = Math.floor(remaining / 1000);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function isVerifiedIntentStatus(status: string | undefined): boolean {
    const normalized = String(status || "").trim().toLowerCase();
    return normalized === "fulfilled" || normalized === "released";
}

function formatIntentStatusLabel(status: string | undefined): string {
    if (isVerifiedIntentStatus(status)) return "Verified";
    const normalized = String(status || "").trim();
    return normalized || "Signaled";
}

function toIntentTimestampMs(value: unknown): number | null {
    if (value === undefined || value === null) return null;

    const normalized = String(value).trim();
    if (!normalized) return null;

    try {
        const raw = BigInt(normalized);
        if (raw <= BIGINT_ZERO) return null;
        // Contract stores intent timestamp in nanoseconds.
        return Number(raw / NANO_TO_MS_DIVISOR);
    } catch {
        const numeric = Number(normalized);
        if (!Number.isFinite(numeric) || numeric <= 0) return null;
        // Fallback: handle ms values from older serializers.
        return numeric > 10_000_000_000 ? Math.floor(numeric) : null;
    }
}

function txExplorerUrl(txHash: string): string {
    return `https://testnet.nearblocks.io/txns/${encodeURIComponent(txHash)}`;
}

function buildHistoryDetailHref(item: BuyIntentHistoryItem): string {
    const intentId = encodeURIComponent(String(item.intentId || "").trim());
    const params = new URLSearchParams();

    const append = (key: string, value: unknown) => {
        const normalized = String(value ?? "").trim();
        if (!normalized) return;
        params.set(key, normalized);
    };

    append("txHash", item.txHash);
    append("proofTxHash", item.proofTxHash);
    append("depositId", item.depositId);
    append("assetId", item.assetId);
    append("chain", item.chain);
    append("amount", item.amount);
    append("fiatAmount", item.fiatAmount);
    append("paymentMethod", item.paymentMethod);
    append("status", item.status);
    append("sellerPlatform", item.sellerPlatform);
    append("sellerTagname", item.sellerTagname);
    append("transferMemo", item.transferMemo);
    append("createdAtMs", item.createdAtMs);
    append("deadlineAtMs", item.deadlineAtMs);

    const query = params.toString();
    return query
        ? `/buy/intents/${intentId}?${query}`
        : `/buy/intents/${intentId}`;
}

function toOptionalNumber(value: string): number | null {
    const normalized = String(value || "").trim();
    if (!normalized) return null;
    const parsed = Number(normalized);
    return Number.isFinite(parsed) ? parsed : null;
}

async function copyText(value: string): Promise<void> {
    if (!value) return;
    try {
        await navigator.clipboard.writeText(value);
    } catch {
        // ignore clipboard errors
    }
}

function loadStoredBuyHistory(): BuyIntentHistoryItem[] {
    if (typeof window === "undefined") return [];
    try {
        const raw = window.localStorage.getItem(BUY_HISTORY_STORAGE_KEY);
        if (!raw) return [];
        const parsed = JSON.parse(raw);
        if (!Array.isArray(parsed)) return [];

        const rows: BuyIntentHistoryItem[] = [];
        for (const row of parsed) {
            if (!row || typeof row !== "object") continue;
            const candidate = row as Partial<BuyIntentHistoryItem>;
            const accountId = String(candidate.accountId || "").trim();
            const intentId = String(candidate.intentId || "").trim();
            const createdAtMs = Number(candidate.createdAtMs || 0);
            const deadlineAtMs = Number(candidate.deadlineAtMs || 0);
            if (!accountId || !intentId || !Number.isFinite(createdAtMs) || createdAtMs <= 0) {
                continue;
            }

            rows.push({
                accountId,
                intentId,
                txHash: candidate.txHash ? String(candidate.txHash) : undefined,
                proofTxHash: candidate.proofTxHash ? String(candidate.proofTxHash) : undefined,
                depositId: Number.isFinite(Number(candidate.depositId))
                    ? Number(candidate.depositId)
                    : undefined,
                assetId: candidate.assetId ? String(candidate.assetId) : undefined,
                chain: candidate.chain ? String(candidate.chain) : undefined,
                amount: candidate.amount ? String(candidate.amount) : undefined,
                fiatAmount: candidate.fiatAmount ? String(candidate.fiatAmount) : undefined,
                paymentMethod: candidate.paymentMethod ? String(candidate.paymentMethod) : undefined,
                createdAtMs,
                deadlineAtMs: Number.isFinite(deadlineAtMs) && deadlineAtMs > 0
                    ? deadlineAtMs
                    : createdAtMs + INTENT_EXPIRATION_MS,
                status: candidate.status ? String(candidate.status) : undefined,
                sellerPlatform: candidate.sellerPlatform ? String(candidate.sellerPlatform) : undefined,
                sellerTagname: candidate.sellerTagname ? String(candidate.sellerTagname) : undefined,
                transferMemo: candidate.transferMemo ? String(candidate.transferMemo) : undefined,
            });
        }

        return rows;
    } catch {
        return [];
    }
}

function writeStoredBuyHistory(rows: BuyIntentHistoryItem[]): void {
    if (typeof window === "undefined") return;
    try {
        window.localStorage.setItem(BUY_HISTORY_STORAGE_KEY, JSON.stringify(rows.slice(0, 150)));
    } catch {
        // ignore storage failures (private mode, quota, etc.)
    }
}

function sortHistory(rows: BuyIntentHistoryItem[]): BuyIntentHistoryItem[] {
    return [...rows].sort((a, b) => b.createdAtMs - a.createdAtMs);
}

function upsertHistoryItem(
    rows: BuyIntentHistoryItem[],
    item: BuyIntentHistoryItem,
): BuyIntentHistoryItem[] {
    const index = rows.findIndex((row) => row.accountId === item.accountId && row.intentId === item.intentId);
    if (index < 0) return sortHistory([item, ...rows]);

    const next = [...rows];
    next[index] = {
        ...next[index],
        ...item,
        txHash: item.txHash || next[index].txHash,
        proofTxHash: item.proofTxHash || next[index].proofTxHash,
        status: item.status || next[index].status,
    };
    return sortHistory(next);
}

function persistHistoryForAccount(accountId: string, accountRows: BuyIntentHistoryItem[]): void {
    const stored = loadStoredBuyHistory();
    const others = stored.filter((row) => row.accountId !== accountId);
    writeStoredBuyHistory([...others, ...sortHistory(accountRows)]);
}

function isLiquidityRaceError(error: unknown): boolean {
    const message = (error as Error)?.message?.toLowerCase?.() || String(error ?? "").toLowerCase();
    return (
        message.includes("insufficient liquidity")
        || message.includes("listing is not funded")
        || message.includes("deposit not found")
        || message.includes("amount above maximum")
        || message.includes("amount below minimum")
    );
}

function getListingPaymentMethodRaw(listing: unknown): string {
    const candidate = listing as { payment_methods?: unknown[] } | null;
    const raw = candidate?.payment_methods?.[0];
    if (typeof raw !== "string") return "";
    return raw.trim();
}

function getAssetDecimals(symbol: string): number {
    const normalized = String(symbol || "").trim().toUpperCase();
    if (normalized === "BTC" || normalized === "ZEC") return 8;
    if (normalized === "ETH") return 18;
    return 24;
}

function toAtomicAmount(value: unknown, decimals: number): bigint | null {
    const normalized = String(value ?? "").trim();
    if (!normalized) return null;
    try {
        return parseUnits(normalized, decimals);
    } catch {
        return null;
    }
}

function toBigIntString(value: unknown): bigint | null {
    const normalized = String(value ?? "").trim();
    if (!normalized || !/^\d+$/.test(normalized)) return null;
    try {
        return BigInt(normalized);
    } catch {
        return null;
    }
}

function formatAtomicAmount(value: bigint, decimals: number): string {
    const normalized = formatUnits(value, decimals);
    return normalized.includes(".") ? normalized.replace(/\.?0+$/, "") : normalized;
}

type ListingAmountShape = {
    min_intent_amount?: unknown;
    max_intent_amount?: unknown;
    remaining_deposits?: unknown;
    deposit_id?: unknown;
};

function canListingSatisfyAmount(listing: unknown, amountAtomic: bigint): boolean {
    const candidate = listing as ListingAmountShape | null;
    if (!candidate) return false;

    const min = toBigIntString(candidate.min_intent_amount);
    const max = toBigIntString(candidate.max_intent_amount);
    const remaining = toBigIntString(candidate.remaining_deposits);
    if (min === null || max === null || remaining === null) return false;

    return amountAtomic >= min && amountAtomic <= max && amountAtomic <= remaining;
}

function buildNoMatchingLiquidityMessage(
    listings: unknown[],
    amountAtomic: bigint,
    symbol: string,
    decimals: number,
): string {
    if (!Array.isArray(listings) || listings.length === 0) {
        return "No funded listings are currently available. Refresh and try again.";
    }

    let minRequired: bigint | null = null;
    let maxAllowed: bigint | null = null;

    for (const listing of listings) {
        const candidate = listing as ListingAmountShape;
        const min = toBigIntString(candidate.min_intent_amount);
        const max = toBigIntString(candidate.max_intent_amount);
        const remaining = toBigIntString(candidate.remaining_deposits);
        if (min === null || max === null || remaining === null) continue;

        const upperBound = remaining < max ? remaining : max;
        if (upperBound <= BIGINT_ZERO) continue;

        if (minRequired === null || min < minRequired) {
            minRequired = min;
        }
        if (maxAllowed === null || upperBound > maxAllowed) {
            maxAllowed = upperBound;
        }
    }

    if (minRequired !== null && amountAtomic < minRequired) {
        return `Amount below minimum. Current minimum is ${formatAtomicAmount(minRequired, decimals)} ${symbol}.`;
    }

    if (maxAllowed !== null && amountAtomic > maxAllowed) {
        return `Amount exceeds available liquidity. Current maximum is ${formatAtomicAmount(maxAllowed, decimals)} ${symbol}.`;
    }

    return "No funded liquidity matches your amount right now.";
}

interface BuyFlowProps {
    initialIntentId?: string;
}

export default function BuyFlow({ initialIntentId = "" }: BuyFlowProps) {
    const searchParams = useSearchParams();
    const searchParamsKey = searchParams.toString();
    const [currentState, setCurrentState] = useState<TradeState>("SIGNAL");
    const [tradeData, setTradeData] = useState<any>(null);
    const [error, setError] = useState("");
    const [clockMs, setClockMs] = useState(() => Date.now());
    const [historyItems, setHistoryItems] = useState<BuyIntentHistoryItem[]>([]);
    const [isHistoryLoading, setIsHistoryLoading] = useState(false);
    const [historyError, setHistoryError] = useState("");
    const [isIntentDetailLoading, setIsIntentDetailLoading] = useState(false);
    const [walletBalanceNear, setWalletBalanceNear] = useState<string | null>(null);
    const [isBalanceLoading, setIsBalanceLoading] = useState(false);
    const { isConnected, connect, accountId, isLoading } = useNear();

    const detailIntentId = useMemo(() => {
        const fromProp = String(initialIntentId || "").trim();
        if (fromProp) return fromProp;
        const params = new URLSearchParams(searchParamsKey);
        return String(params.get("intentId") || "").trim();
    }, [initialIntentId, searchParamsKey]);

    const detailQuery = useMemo(() => {
        const params = new URLSearchParams(searchParamsKey);
        return {
            txHash: String(params.get("txHash") || "").trim(),
            proofTxHash: String(params.get("proofTxHash") || "").trim(),
            depositId: toOptionalNumber(String(params.get("depositId") || "")),
            chain: String(params.get("chain") || "").trim(),
            amount: String(params.get("amount") || "").trim(),
            fiatAmount: String(params.get("fiatAmount") || "").trim(),
            paymentMethod: String(params.get("paymentMethod") || "").trim(),
            status: String(params.get("status") || "").trim(),
            sellerPlatform: String(params.get("sellerPlatform") || "").trim(),
            sellerTagname: String(params.get("sellerTagname") || "").trim(),
            transferMemo: String(params.get("transferMemo") || "").trim(),
            createdAtMs: toOptionalNumber(String(params.get("createdAtMs") || "")),
            deadlineAtMs: toOptionalNumber(String(params.get("deadlineAtMs") || "")),
        };
    }, [searchParamsKey]);

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
        } catch (balanceError) {
            console.error("BuyFlow: failed to load NEAR balance", balanceError);
            setWalletBalanceNear(null);
        } finally {
            setIsBalanceLoading(false);
        }
    }, [isConnected, accountId]);

    useEffect(() => {
        void loadWalletBalance();
    }, [loadWalletBalance]);

    useEffect(() => {
        const timer = setInterval(() => setClockMs(Date.now()), 1000);
        return () => clearInterval(timer);
    }, []);

    const refreshHistory = useCallback(async () => {
        if (!isConnected || !accountId) {
            setHistoryItems([]);
            setHistoryError("");
            setIsHistoryLoading(false);
            return;
        }

        setIsHistoryLoading(true);
        try {
            const stored = loadStoredBuyHistory();
            const storedForAccount = stored.filter((row) => row.accountId === accountId);
            const storedByIntent = new Map(storedForAccount.map((row) => [row.intentId, row]));

            const onChainIntents = await nearService.getAccountIntents(accountId);
            const merged: BuyIntentHistoryItem[] = onChainIntents.map((intent) => {
                const intentId = String(intent.intent_hash || "").trim();
                const storedRow = storedByIntent.get(intentId);
                const createdAtMs =
                    toIntentTimestampMs((intent as { timestamp?: unknown }).timestamp)
                    || storedRow?.createdAtMs
                    || Date.now();
                const deadlineAtMs = createdAtMs + INTENT_EXPIRATION_MS;

                return {
                    accountId,
                    intentId,
                    txHash: storedRow?.txHash,
                    proofTxHash: storedRow?.proofTxHash,
                    depositId: Number(intent.deposit_id),
                    assetId: storedRow?.assetId,
                    chain: intent.chain || storedRow?.chain,
                    amount: String(intent.amount || storedRow?.amount || ""),
                    fiatAmount: storedRow?.fiatAmount,
                    paymentMethod: parsePaymentMethod(intent.payment_method || storedRow?.paymentMethod).method
                        || storedRow?.paymentMethod
                        || "",
                    createdAtMs,
                    deadlineAtMs,
                    status: intent.status || storedRow?.status,
                    sellerPlatform: storedRow?.sellerPlatform,
                    sellerTagname: storedRow?.sellerTagname,
                    transferMemo: storedRow?.transferMemo,
                };
            });

            for (const row of storedForAccount) {
                if (!merged.some((candidate) => candidate.intentId === row.intentId)) {
                    merged.push(row);
                }
            }

            const sorted = sortHistory(merged);
            setHistoryItems(sorted);
            persistHistoryForAccount(accountId, sorted);
            setHistoryError("");
        } catch (historyLoadError: unknown) {
            console.error("BuyFlow: failed to load account intent history", historyLoadError);
            const stored = loadStoredBuyHistory().filter((row) => row.accountId === accountId);
            setHistoryItems(sortHistory(stored));
            setHistoryError(
                historyLoadError instanceof Error
                    ? historyLoadError.message
                    : "Failed to load buy intent history",
            );
        } finally {
            setIsHistoryLoading(false);
        }
    }, [accountId, isConnected]);

    useEffect(() => {
        void refreshHistory();
    }, [refreshHistory]);

    const loadIntentDetailView = useCallback(async () => {
        if (!detailIntentId) return;

        setIsIntentDetailLoading(true);
        setError("");

        try {
            const historyCandidates = loadStoredBuyHistory()
                .filter((row) => row.intentId === detailIntentId)
                .filter((row) => (accountId ? row.accountId === accountId : true))
                .sort((a, b) => b.createdAtMs - a.createdAtMs);
            const historyRow = historyCandidates[0] || null;

            const [intent, transfer] = await Promise.all([
                nearService.getIntent(detailIntentId).catch(() => null),
                nearService.getIntentTransferDetails(detailIntentId).catch(() => null),
            ]);

            if (!intent && !historyRow) {
                throw new Error("Intent detail not found.");
            }

            const resolvedDepositId = Number(
                intent?.deposit_id
                || detailQuery.depositId
                || historyRow?.depositId
                || 0,
            );

            const deposit = Number.isInteger(resolvedDepositId) && resolvedDepositId > 0
                ? await nearService.getDeposit(resolvedDepositId).catch(() => null)
                : null;

            const paymentMethodRaw = String(
                intent?.payment_method
                || deposit?.payment_methods?.[0]
                || detailQuery.paymentMethod
                || historyRow?.paymentMethod
                || "",
            ).trim();
            const parsedPayment = parsePaymentMethod(paymentMethodRaw);

            const createdAtMs =
                toIntentTimestampMs((intent as { timestamp?: unknown } | null)?.timestamp)
                || detailQuery.createdAtMs
                || historyRow?.createdAtMs
                || Date.now();
            const deadlineAtMs =
                detailQuery.deadlineAtMs
                || historyRow?.deadlineAtMs
                || createdAtMs + INTENT_EXPIRATION_MS;

            const sellerPlatform = String(
                transfer?.platform
                || parsedPayment.method
                || detailQuery.sellerPlatform
                || historyRow?.sellerPlatform
                || "",
            ).trim().toLowerCase();
            const sellerTagname = String(
                transfer?.tagname
                || parsedPayment.accountTag
                || detailQuery.sellerTagname
                || historyRow?.sellerTagname
                || "",
            ).trim();
            const transferMemo = String(
                transfer?.memo
                || detailQuery.transferMemo
                || historyRow?.transferMemo
                || detailIntentId,
            ).trim();
            const txHash = String(
                detailQuery.txHash
                || historyRow?.txHash
                || "",
            ).trim();
            const proofTxHash = String(
                detailQuery.proofTxHash
                || historyRow?.proofTxHash
                || "",
            ).trim();
            const fiatAmount = String(
                detailQuery.fiatAmount
                || historyRow?.fiatAmount
                || "",
            ).trim();
            const amount = String(
                intent?.amount
                || detailQuery.amount
                || historyRow?.amount
                || "",
            ).trim();
            const chain = String(
                intent?.chain
                || detailQuery.chain
                || historyRow?.chain
                || "",
            ).trim();
            const fiatCode = String(intent?.currency_code || "USD").trim().toUpperCase();
            const intentStatus = String(
                intent?.status
                || detailQuery.status
                || historyRow?.status
                || "Signaled",
            ).trim();

            const selectedListing = {
                depositor: String(deposit?.depositor || ""),
                payment_methods: Array.isArray(deposit?.payment_methods)
                    ? deposit.payment_methods
                    : (paymentMethodRaw ? [paymentMethodRaw] : []),
            };

            setTradeData((prev: any) => ({
                ...(prev || {}),
                mode: "buy",
                intentId: detailIntentId,
                depositId: Number.isInteger(resolvedDepositId) && resolvedDepositId > 0
                    ? resolvedDepositId
                    : undefined,
                amount,
                fiatAmount,
                payingUsing: {
                    currency: { code: fiatCode },
                },
                chain,
                recipient: String(intent?.recipient || "").trim(),
                timestamp: createdAtMs,
                deadlineAtMs,
                intentStatus,
                paymentMethod: sellerPlatform || parsedPayment.method || detailQuery.paymentMethod || historyRow?.paymentMethod || "",
                paymentMethodRaw,
                sellerPlatform,
                sellerTagname,
                sellerAccountTag: sellerTagname,
                transferMemo,
                txHash,
                proofTxHash,
                selectedListing,
            }));
            setCurrentState(isVerifiedIntentStatus(intentStatus) ? "SUCCESS" : "NOTARIZE");

            if (accountId) {
                const hydratedHistory: BuyIntentHistoryItem = {
                    accountId,
                    intentId: detailIntentId,
                    txHash: txHash || undefined,
                    proofTxHash: proofTxHash || undefined,
                    depositId: Number.isInteger(resolvedDepositId) && resolvedDepositId > 0
                        ? resolvedDepositId
                        : historyRow?.depositId,
                    assetId: historyRow?.assetId,
                    chain,
                    amount,
                    fiatAmount,
                    paymentMethod: parsedPayment.method || historyRow?.paymentMethod,
                    createdAtMs,
                    deadlineAtMs,
                    status: intentStatus,
                    sellerPlatform: sellerPlatform || historyRow?.sellerPlatform,
                    sellerTagname: sellerTagname || historyRow?.sellerTagname,
                    transferMemo,
                };

                setHistoryItems((prev) => {
                    const next = upsertHistoryItem(prev, hydratedHistory);
                    persistHistoryForAccount(accountId, next);
                    return next;
                });
            }
        } catch (detailError: unknown) {
            setError(
                `Failed to load buy intent detail: ${
                    detailError instanceof Error ? detailError.message : String(detailError || "unknown error")
                }`,
            );
        } finally {
            setIsIntentDetailLoading(false);
        }
    }, [detailIntentId, accountId, detailQuery]);

    useEffect(() => {
        if (!detailIntentId) return;
        if (
            String(tradeData?.intentId || "").trim() === detailIntentId
            && (currentState === "NOTARIZE" || currentState === "SUCCESS")
        ) {
            return;
        }
        void loadIntentDetailView();
    }, [currentState, detailIntentId, loadIntentDetailView, tradeData?.intentId]);

    const handleSignal = useCallback(async (data: any) => {
        setError("");

        try {
            if (!isConnected || !accountId) {
                throw new Error("Connect your NEAR wallet first");
            }

            let depositId = Number(data.depositId);
            if (!Number.isInteger(depositId) || depositId <= 0) {
                throw new Error("Invalid deposit ID");
            }

            const symbol = String(data?.buyingAsset?.token?.sym || data?.chain || "").trim().toUpperCase();
            const assetDecimals = getAssetDecimals(symbol);
            const amountAtomic = toAtomicAmount(data?.amount, assetDecimals);
            if (amountAtomic === null || amountAtomic <= BIGINT_ZERO) {
                throw new Error("Invalid buy amount");
            }

            const attemptedIds = new Set<number>();
            let selectedListing = data.selectedListing || null;
            let paymentMethodRaw = getListingPaymentMethodRaw(selectedListing)
                || String(data.listingPaymentMethodRaw || data.payingUsing?.platform?.name || "").trim();
            let paymentMethod = parsePaymentMethod(paymentMethodRaw).method
                || String(data.payingUsing?.platform?.name || "").trim().toLowerCase()
                || "wise";
            let result: any = null;

            if (selectedListing && !canListingSatisfyAmount(selectedListing, amountAtomic) && data.assetId) {
                attemptedIds.add(depositId);
                const listings = await nearService.getOpenDepositsByAssetV2(data.assetId, 0, 20);
                const preMatchedListing = listings.find((listing) => {
                    const id = Number((listing as ListingAmountShape).deposit_id);
                    if (!Number.isInteger(id) || id <= 0 || attemptedIds.has(id)) return false;
                    return canListingSatisfyAmount(listing, amountAtomic);
                });

                if (!preMatchedListing) {
                    throw new Error(
                        buildNoMatchingLiquidityMessage(listings, amountAtomic, symbol || "ASSET", assetDecimals),
                    );
                }

                depositId = Number(preMatchedListing.deposit_id);
                selectedListing = preMatchedListing;
                paymentMethodRaw = getListingPaymentMethodRaw(preMatchedListing) || paymentMethodRaw;
                paymentMethod = parsePaymentMethod(paymentMethodRaw).method || paymentMethod;
                setError("Selected listing changed. Re-matching with a compatible funded listing...");
            }

            for (let attempt = 1; attempt <= 3; attempt++) {
                try {
                    const paymentMethodForSignal = paymentMethodRaw || paymentMethod;
                    console.log("Signaling intent...", { ...data, depositId, paymentMethod: paymentMethodForSignal, attempt });
                    result = await nearService.signalIntent(
                        depositId,
                        data.amount,
                        paymentMethodForSignal,
                        String(data.payingUsing.currency.code).toUpperCase(),
                        data.recipient,
                        data.buyingAsset.token.sym
                    );
                    break;
                } catch (signalError) {
                    if (!isLiquidityRaceError(signalError) || !data.assetId || attempt === 3) {
                        throw signalError;
                    }

                    attemptedIds.add(depositId);
                    const listings = await nearService.getOpenDepositsByAssetV2(data.assetId, 0, 20);
                    const nextListing = listings.find((listing) => {
                        const id = Number(listing.deposit_id);
                        if (!Number.isInteger(id) || id <= 0 || attemptedIds.has(id)) return false;
                        return canListingSatisfyAmount(listing, amountAtomic);
                    });

                    if (!nextListing) {
                        throw new Error(
                            buildNoMatchingLiquidityMessage(
                                listings,
                                amountAtomic,
                                symbol || String(data.buyingAsset?.token?.sym || "ASSET"),
                                assetDecimals,
                            ),
                        );
                    }

                    depositId = Number(nextListing.deposit_id);
                    selectedListing = nextListing;
                    paymentMethodRaw = getListingPaymentMethodRaw(nextListing) || paymentMethodRaw;
                    paymentMethod = parsePaymentMethod(paymentMethodRaw).method || paymentMethod;
                    setError("Selected listing was taken. Re-matching with the next funded listing...");
                }
            }

            if (!result) {
                throw new Error("Could not signal intent against current listings");
            }

            console.log("signalIntent returned:", result);

            const resolvedIntentHash = decodeSuccessValue(result);
            const intentId = typeof resolvedIntentHash === "string" && resolvedIntentHash.length > 0
                ? resolvedIntentHash
                : `pending-${Date.now()}`;
            const intentRecord = typeof resolvedIntentHash === "string"
                ? await nearService.getIntent(resolvedIntentHash).catch(() => null)
                : null;
            const createdAtMs =
                toIntentTimestampMs((intentRecord as { timestamp?: unknown } | null)?.timestamp)
                || Date.now();
            const deadlineAtMs = createdAtMs + INTENT_EXPIRATION_MS;
            const txHash = getTxHash(result);
            const selectedListingPaymentRaw = getListingPaymentMethodRaw(selectedListing) || paymentMethodRaw || paymentMethod;
            const selectedListingPayment = parsePaymentMethod(selectedListingPaymentRaw);
            const transferDetails = typeof resolvedIntentHash === "string"
                ? await nearService.getIntentTransferDetails(resolvedIntentHash).catch(() => null)
                : null;
            const sellerPlatform = String(
                transferDetails?.platform
                || selectedListingPayment.method
                || paymentMethod
                || "",
            ).trim().toLowerCase();
            const sellerAccountTag = String(
                transferDetails?.tagname
                || selectedListingPayment.accountTag
                || (selectedListing ? "" : data.sellerAccountTag)
                || "",
            ).trim();
            const transferMemo = String(
                transferDetails?.memo
                || (typeof resolvedIntentHash === "string" ? resolvedIntentHash : "")
                || "",
            ).trim();
            const historyItem: BuyIntentHistoryItem = {
                accountId,
                intentId,
                txHash: txHash === "unknown" ? undefined : txHash,
                depositId,
                assetId: String(data.assetId || ""),
                chain: String(data.buyingAsset?.token?.sym || data.chain || ""),
                amount: String(data.amount || ""),
                fiatAmount: String(data.fiatAmount || ""),
                paymentMethod: selectedListingPayment.method || paymentMethod,
                createdAtMs,
                deadlineAtMs,
                status: String((intentRecord as { status?: unknown } | null)?.status || "Signaled"),
                sellerPlatform,
                sellerTagname: sellerAccountTag,
                transferMemo,
            };
            setHistoryItems((prev) => {
                const next = upsertHistoryItem(prev, historyItem);
                persistHistoryForAccount(accountId, next);
                return next;
            });

            setTradeData({
                ...data,
                paymentMethod: sellerPlatform || selectedListingPayment.method || paymentMethod,
                paymentMethodRaw: selectedListingPaymentRaw,
                sellerPlatform,
                sellerTagname: sellerAccountTag,
                sellerAccountTag,
                transferMemo,
                timestamp: createdAtMs,
                mode: "buy",
                intentId,
                depositId,
                selectedListing,
                txHash,
                deadlineAtMs,
                intentStatus: historyItem.status,
            });

            setError("");
            setCurrentState("NOTARIZE");
            await loadWalletBalance();
            void refreshHistory();
            console.log("State changed to NOTARIZE");
        } catch (e: any) {
            console.error("Signal failed:", e);
            setError("Signal failed: " + e.message);
        }
    }, [isConnected, accountId, loadWalletBalance, refreshHistory]);

    const handleProofGenerated = useCallback(async (proof: any) => {
        const activeIntentId = String(tradeData?.intentId || "").trim();
        if (!activeIntentId) {
            setError("Proof received, but intent ID is missing.");
            return;
        }

        const attestation = proof?.attestation;
        if (!attestation || typeof attestation !== "object") {
            setError("Proof submission failed: signed attestation is missing.");
            return;
        }
        if (!attestation?.checks?.policy_passed) {
            setError("Proof submission failed: attestation policy did not pass.");
            return;
        }

        setError("");
        setTradeData((prev: any) => ({ ...prev, proof, proofSubmitStatus: "SUBMITTING" }));

        try {
            const fulfillResult = await nearService.fulfillIntentWithAttestation(
                activeIntentId,
                attestation,
            );
            const proofTxHash = getTxHash(fulfillResult);
            const latestIntent = await nearService.getIntent(activeIntentId).catch(() => null);
            const normalizedProofTxHash = proofTxHash === "unknown" ? undefined : proofTxHash;

            setTradeData((prev: any) => ({
                ...prev,
                proof,
                proofTxHash: normalizedProofTxHash,
                proofSubmitStatus: "SUBMITTED",
                intentStatus: latestIntent?.status || prev?.intentStatus || "Fulfilled",
            }));
            if (accountId) {
                const createdAtMs = Number(tradeData?.timestamp || Date.now());
                const deadlineAtMs =
                    Number(tradeData?.deadlineAtMs || 0) > 0
                        ? Number(tradeData.deadlineAtMs)
                        : createdAtMs + INTENT_EXPIRATION_MS;
                const historyUpdate: BuyIntentHistoryItem = {
                    accountId,
                    intentId: activeIntentId,
                    txHash: String(tradeData?.txHash || "").trim() || undefined,
                    proofTxHash: normalizedProofTxHash,
                    depositId: Number.isInteger(Number(tradeData?.depositId))
                        ? Number(tradeData.depositId)
                        : undefined,
                    assetId: String(tradeData?.assetId || "").trim() || undefined,
                    chain: String(tradeData?.chain || "").trim() || undefined,
                    amount: String(tradeData?.amount || "").trim() || undefined,
                    fiatAmount: String(tradeData?.fiatAmount || "").trim() || undefined,
                    paymentMethod: String(tradeData?.paymentMethod || "").trim() || undefined,
                    createdAtMs,
                    deadlineAtMs,
                    status: String(latestIntent?.status || tradeData?.intentStatus || "Fulfilled").trim(),
                    sellerPlatform: String(tradeData?.sellerPlatform || "").trim() || undefined,
                    sellerTagname: String(tradeData?.sellerTagname || "").trim() || undefined,
                    transferMemo: String(tradeData?.transferMemo || "").trim() || undefined,
                };
                setHistoryItems((prev) => {
                    const next = upsertHistoryItem(prev, historyUpdate);
                    persistHistoryForAccount(accountId, next);
                    return next;
                });
            }

            await loadWalletBalance();
            await refreshHistory();
            setCurrentState("SUCCESS");
        } catch (proofError: unknown) {
            console.error("Proof submission failed", proofError);
            setTradeData((prev: any) => ({ ...prev, proof, proofSubmitStatus: "FAILED" }));
            setError(
                `Proof submission failed: ${
                    proofError instanceof Error ? proofError.message : String(proofError || "unknown error")
                }`,
            );
        }
    }, [accountId, tradeData, loadWalletBalance, refreshHistory]);
    const activePaymentInfo = parsePaymentMethod(
        getListingPaymentMethodRaw(tradeData?.selectedListing)
        || String(tradeData?.paymentMethodRaw || tradeData?.listingPaymentMethodRaw || ""),
    );
    const activePaymentMethod = String(tradeData?.sellerPlatform || "").trim()
        || activePaymentInfo.method
        || String(tradeData?.payingUsing?.platform?.name || "").trim()
        || "N/A";
    const activeSellerTagname = String(
        tradeData?.sellerTagname
        || activePaymentInfo.accountTag
        || tradeData?.sellerAccountTag
        || "",
    ).trim();
    const activeTransferMemo = String(
        tradeData?.transferMemo
        || tradeData?.intentId
        || "",
    ).trim();

    return (
        <div className="w-full max-w-3xl mx-auto space-y-8 relative">
            <div className="min-h-[500px] relative">
                {error && (
                    <div className="p-4 bg-red-500/20 border border-red-500/50 rounded-xl text-red-200 mb-4 animate-pulse">
                        ⚠️ {error}
                    </div>
                )}

                {currentState === "SIGNAL" && (
                    <div className="space-y-4">
                        {detailIntentId && (
                            <div className="glass-panel p-3">
                                <p className="text-xs text-blue-200">
                                    {isIntentDetailLoading
                                        ? `Loading buy intent ${shortHash(detailIntentId)}...`
                                        : `Loaded intent ${shortHash(detailIntentId)}.`}
                                </p>
                            </div>
                        )}

                        {isConnected && (
                            <div className="glass-panel p-4 space-y-3">
                                <div className="flex items-center justify-between">
                                    <p className="text-sm font-semibold text-white">Recent Buy Intents</p>
                                    <button
                                        type="button"
                                        onClick={() => void refreshHistory()}
                                        className="text-xs px-2.5 py-1 rounded-md border border-white/15 bg-white/5 hover:bg-white/10 text-gray-200"
                                    >
                                        {isHistoryLoading ? "Loading..." : "Refresh"}
                                    </button>
                                </div>

                                {historyItems.length === 0 && (
                                    <p className="text-xs text-gray-400">No recent buy intents yet.</p>
                                )}
                                {historyError && (
                                    <p className="text-xs text-amber-300">History sync issue: {historyError}</p>
                                )}

                                {historyItems.length > 0 && (
                                    <div className="space-y-2">
                                        {historyItems.slice(0, 12).map((item) => (
                                            <div
                                                key={`${item.accountId}:${item.intentId}`}
                                                className="bg-white/5 border border-white/10 rounded-lg px-3 py-2.5 flex items-center justify-between gap-3"
                                            >
                                                <div className="min-w-0">
                                                    <p className="text-sm text-white font-medium">
                                                        Intent {shortHash(item.intentId)} · {item.chain || "Asset"}
                                                    </p>
                                                    <p className="text-xs text-gray-400 truncate">
                                                        {formatIntentStatusLabel(item.status)} · Deadline: {formatDeadlineCountdown(item.deadlineAtMs, clockMs)}
                                                    </p>
                                                </div>
                                                <Link
                                                    href={buildHistoryDetailHref(item)}
                                                    className="px-3 py-1.5 rounded-md bg-emerald-600 hover:bg-emerald-700 text-white text-xs whitespace-nowrap"
                                                >
                                                    View Detail
                                                </Link>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        )}

                        <BuyWidget
                            onSignal={handleSignal}
                            isConnected={isConnected}
                            onConnect={connect}
                            accountId={accountId}
                            isConnecting={isLoading}
                            walletBalanceNear={walletBalanceNear}
                            isBalanceLoading={isBalanceLoading}
                            onRefreshBalance={loadWalletBalance}
                        />
                    </div>
                )}

                {currentState === "NOTARIZE" && (
                    <div className="animate-fade-in space-y-4">
                        <div className="glass-panel p-4 space-y-2">
                            <div className="flex justify-between text-sm">
                                <span className="text-gray-400">Intent Deadline</span>
                                <span className="text-amber-300 font-mono">
                                    {formatDeadlineCountdown(Number(tradeData?.deadlineAtMs || 0), clockMs)}
                                </span>
                            </div>
                            <div className="flex justify-between text-xs">
                                <span className="text-gray-500">Deadline At</span>
                                <span className="text-gray-300">{formatTimestamp(Number(tradeData?.deadlineAtMs || 0))}</span>
                            </div>
                        </div>

                        <div className="glass-panel p-4 space-y-2">
                            <p className="text-sm font-semibold text-white">Send Payment Details</p>
                            <div className="flex justify-between text-sm">
                                <span className="text-gray-400">Send Amount</span>
                                <span className="text-white font-mono">
                                    {tradeData?.fiatAmount || "N/A"} {tradeData?.payingUsing?.currency?.code || "USD"}
                                </span>
                            </div>
                            <div className="flex justify-between text-sm">
                                <span className="text-gray-400">Payment Method</span>
                                <span className="text-white">{activePaymentMethod}</span>
                            </div>
                            <div className="flex justify-between text-sm">
                                <span className="text-gray-400">Seller</span>
                                <span className="text-white font-mono">
                                    {tradeData?.selectedListing?.depositor || "N/A"}
                                </span>
                            </div>
                            <div className="flex justify-between text-sm">
                                <span className="text-gray-400">User Tagname</span>
                                <span className="text-white font-mono">
                                    {activeSellerTagname || "N/A"}
                                </span>
                            </div>
                            <div className="flex justify-between text-sm">
                                <span className="text-gray-400">Transfer Memo</span>
                                <span className="text-amber-300 font-mono break-all text-right max-w-[70%]">
                                    {activeTransferMemo || "N/A"}
                                </span>
                            </div>
                            {activeTransferMemo && (
                                <div className="pt-1">
                                    <button
                                        type="button"
                                        onClick={() => void copyText(activeTransferMemo)}
                                        className="px-3 py-1.5 rounded-md border border-white/15 bg-white/5 hover:bg-white/10 text-xs text-white"
                                    >
                                        Copy Memo
                                    </button>
                                </div>
                            )}
                            <div className="flex justify-between text-sm">
                                <span className="text-gray-400">Receive Address</span>
                                <span className="text-white font-mono break-all text-right max-w-[70%]">
                                    {tradeData?.recipient || "N/A"}
                                </span>
                            </div>
                            <p className="text-xs text-blue-200/80 pt-1">
                                Send the fiat payment with this memo, then generate proof to complete release.
                            </p>
                        </div>

                        <TLSNNotarization
                            mode={tradeData?.mode || "buy"}
                            amount={tradeData?.amount || "0"}
                            currency={tradeData?.chain || "BTC"}
                            intentId={String(tradeData?.intentId || "")}
                            platform={activePaymentMethod}
                            tagname={activeSellerTagname}
                            memo={activeTransferMemo}
                            fiatAmount={String(tradeData?.fiatAmount || "")}
                            fiatCurrency={String(tradeData?.payingUsing?.currency?.code || "USD")}
                            sellerAccountId={String(tradeData?.selectedListing?.depositor || "")}
                            onProof={handleProofGenerated}
                        />
                    </div>
                )}

                {currentState === "SUCCESS" && (
                    <div className="glass-panel p-8 text-center animate-fade-in space-y-6">
                        <div className="w-20 h-20 mx-auto bg-green-500/20 rounded-full flex items-center justify-center mb-4">
                            <svg
                                className="w-10 h-10 text-green-400"
                                fill="none"
                                stroke="currentColor"
                                viewBox="0 0 24 24"
                            >
                                <path
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    strokeWidth="2"
                                    d="M5 13l4 4L19 7"
                                />
                            </svg>
                        </div>

                        <h2 className="text-2xl font-bold text-white">Trade Complete!</h2>
                        <p className="text-gray-400">
                            Your proof has been submitted to the blockchain.
                        </p>

                        <div className="glass-panel p-4 text-left space-y-2">
                            <div className="flex justify-between">
                                <span className="text-gray-400">Intent Hash:</span>
                                <span className="text-emerald-300 font-mono text-xs">
                                    {tradeData?.intentId || "N/A"}
                                </span>
                            </div>
                            <div className="flex justify-between">
                                <span className="text-gray-400">Transaction:</span>
                                {tradeData?.txHash ? (
                                    <a
                                        href={txExplorerUrl(String(tradeData.txHash))}
                                        target="_blank"
                                        rel="noreferrer"
                                        className="text-blue-400 hover:text-blue-300 font-mono text-xs"
                                    >
                                        {shortHash(String(tradeData.txHash))}
                                    </a>
                                ) : (
                                    <span className="text-blue-400 font-mono text-xs">N/A</span>
                                )}
                            </div>
                            <div className="flex justify-between">
                                <span className="text-gray-400">Amount:</span>
                                <span className="text-white font-mono">
                                    {tradeData?.amount || "N/A"}
                                </span>
                            </div>
                            <div className="flex justify-between">
                                <span className="text-gray-400">Asset:</span>
                                <span className="text-white font-mono">
                                    {tradeData?.chain || "N/A"}
                                </span>
                            </div>
                            <div className="flex justify-between">
                                <span className="text-gray-400">Intent Deadline:</span>
                                <span className="text-amber-300 font-mono text-xs">
                                    {formatTimestamp(Number(tradeData?.deadlineAtMs || 0))}
                                </span>
                            </div>
                            <div className="flex justify-between">
                                <span className="text-gray-400">Transfer Memo:</span>
                                <span className="text-amber-300 font-mono text-xs break-all text-right max-w-[70%]">
                                    {activeTransferMemo || "N/A"}
                                </span>
                            </div>
                            <div className="flex justify-between">
                                <span className="text-gray-400">Proof Submit TX:</span>
                                {tradeData?.proofTxHash ? (
                                    <a
                                        href={txExplorerUrl(String(tradeData.proofTxHash))}
                                        target="_blank"
                                        rel="noreferrer"
                                        className="text-cyan-300 hover:text-cyan-200 font-mono text-xs"
                                    >
                                        {shortHash(String(tradeData.proofTxHash))}
                                    </a>
                                ) : (
                                    <span className="text-cyan-300 font-mono text-xs">N/A</span>
                                )}
                            </div>
                        </div>

                        <button
                            onClick={() => setCurrentState("SIGNAL")}
                            className="px-8 py-3 bg-white/10 hover:bg-white/20 text-white rounded-xl transition-all"
                        >
                            Start New Trade
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
}
