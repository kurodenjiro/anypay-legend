import { formatUnits, parseUnits } from "viem";

interface IntentsTokenLimits {
    minAmount?: string | number;
    minAmountIn?: string | number;
    minDepositAmount?: string | number;
}

interface IntentsQuoteResponse {
    correlationId?: string;
    quote?: {
        amountIn?: string;
        amountInFormatted?: string;
        amountOut?: string;
        amountOutFormatted?: string;
        deadline?: string;
        depositAddress?: string;
        depositMemo?: string | null;
    };
}

interface IntentsToken {
    assetId: string;
    symbol?: string;
    price?: string;
    decimals?: number;
    minAmount?: string | number;
    minAmountIn?: string | number;
    minDepositAmount?: string | number;
    minimumAmount?: string | number;
    limits?: IntentsTokenLimits;
}

export type OneClickQuoteStatus =
    | "PENDING_DEPOSIT"
    | "PROCESSING"
    | "SUCCESS"
    | "FAILED"
    | "REFUNDED"
    | "INCOMPLETE_DEPOSIT"
    | string;

export interface OneClickStatusResponse {
    correlationId?: string;
    status: OneClickQuoteStatus;
    updatedAt?: string;
    quoteResponse?: {
        quote?: {
            amountIn?: string;
            amountInFormatted?: string;
        };
    };
    swapDetails?: {
        amountIn?: string;
        amountInFormatted?: string;
        depositedAmount?: string;
        depositedAmountFormatted?: string;
        refundReason?: string;
        originChainTxHashes?: Array<{ hash?: string }>;
    };
}

export interface DepositQuotePreview {
    correlationId: string;
    assetId: string;
    decimals: number;
    amountAtomic: string;
    quoteAmountIn: string;
    quoteAmountInFormatted?: string;
    deadline?: string;
}

const INTENTS_TOKENS_URL = "https://1click.chaindefuser.com/v0/tokens";
const INTENTS_QUOTE_URL = "https://1click.chaindefuser.com/v0/quote";
const INTENTS_STATUS_URL = "https://1click.chaindefuser.com/v0/status";
const TOKEN_CACHE_TTL_MS = 60_000;
const QUOTE_MIN_CACHE_TTL_MS = 5 * 60_000;
export const DEFAULT_INTENTS_MIN_DEPOSIT_AMOUNT =
    process.env.NEXT_PUBLIC_MIN_DEPOSIT_INTENT_AMOUNT || "0.01";
const QUOTE_PROBE_RECIPIENT =
    process.env.NEXT_PUBLIC_INTENTS_QUOTE_PROBE_RECIPIENT || "agenttest1.testnet";

let cachedTokens: IntentsToken[] | null = null;
let cachedAt = 0;
let inflightPromise: Promise<IntentsToken[]> | null = null;
const cachedQuoteMinimumByAssetId = new Map<string, { amount: string; cachedAt: number }>();

function inferAtomicDecimalsFromAssetId(assetId: string): number | null {
    const normalized = String(assetId || "").toLowerCase();
    if (normalized.includes("btc")) return 8;
    if (normalized.includes("zec")) return 8;
    if (normalized.includes("eth")) return 18;
    return null;
}

function inferAtomicDecimalsFromSymbol(symbol?: string): number | null {
    const normalized = String(symbol || "").trim().toUpperCase();
    if (normalized === "BTC" || normalized === "ZEC") return 8;
    if (normalized === "ETH") return 18;
    return null;
}

function normalizeAmountInput(value: string): string {
    return String(value ?? "").trim().replace(",", ".");
}

function toAtomicAmount(value: string, decimals: number): string {
    const normalized = normalizeAmountInput(value);
    if (!normalized) {
        throw new Error("Amount is required");
    }

    if (/e/i.test(normalized)) {
        throw new Error("Amount must be a plain decimal number");
    }

    try {
        const atomic = parseUnits(normalized, decimals).toString();
        if (!/^\d+$/.test(atomic)) {
            throw new Error("invalid atomic amount");
        }
        return atomic;
    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        throw new Error(`Invalid amount: ${message}`);
    }
}

async function fetchTokens(): Promise<IntentsToken[]> {
    const now = Date.now();
    if (cachedTokens && now - cachedAt < TOKEN_CACHE_TTL_MS) {
        return cachedTokens;
    }

    if (inflightPromise) {
        return inflightPromise;
    }

    inflightPromise = fetch(INTENTS_TOKENS_URL, { cache: "no-store" })
        .then(async (response) => {
            if (!response.ok) {
                const body = await response.text();
                throw new Error(`Failed to fetch Intents tokens (${response.status}): ${body}`);
            }

            const tokens = (await response.json()) as IntentsToken[];
            cachedTokens = Array.isArray(tokens) ? tokens : [];
            cachedAt = Date.now();
            return cachedTokens;
        })
        .finally(() => {
            inflightPromise = null;
        });

    return inflightPromise;
}

function toPositiveNumber(value: unknown): number | null {
    const numeric = Number(value);
    if (!Number.isFinite(numeric) || numeric <= 0) return null;
    return numeric;
}

function trimTrailingZeros(value: string): string {
    return value.replace(/\.?(0+)$/, "");
}

function normalizeDecimalString(value: string): string | null {
    const trimmed = value.trim();
    if (!trimmed) return null;
    if (!/^\d+(\.\d+)?$/.test(trimmed)) return null;
    const numeric = Number(trimmed);
    if (!Number.isFinite(numeric) || numeric <= 0) return null;
    return trimTrailingZeros(trimmed);
}

function normalizeTokenMinimum(
    raw: unknown,
    decimals?: number,
): string | null {
    if (raw === null || raw === undefined) return null;
    const value = String(raw).trim();
    if (!value) return null;

    // Decimal values are assumed to already be display units (e.g. "0.01").
    if (value.includes(".")) {
        return normalizeDecimalString(value);
    }

    // Integer values are usually smallest units from APIs; convert when decimals are available.
    if (/^\d+$/.test(value)) {
        try {
            const amount = BigInt(value);
            if (amount <= 0n) return null;
            if (typeof decimals === "number" && Number.isFinite(decimals) && decimals >= 0) {
                const formatted = trimTrailingZeros(formatUnits(amount, decimals));
                return formatted && formatted !== "0" ? formatted : null;
            }
            return amount.toString();
        } catch {
            return null;
        }
    }

    return null;
}

function resolveTokenMinimumDisplayAmount(token: IntentsToken): string | null {
    const normalizedDecimals =
        inferAtomicDecimalsFromAssetId(token.assetId) ?? token.decimals;
    const candidates: Array<unknown> = [
        token.minDepositAmount,
        token.minimumAmount,
        token.minAmount,
        token.minAmountIn,
        token.limits?.minDepositAmount,
        token.limits?.minAmount,
        token.limits?.minAmountIn,
    ];

    for (const candidate of candidates) {
        const normalized = normalizeTokenMinimum(candidate, normalizedDecimals);
        if (normalized) return normalized;
    }

    return null;
}

function findToken(tokens: IntentsToken[], assetId: string, symbol?: string): IntentsToken | null {
    const byAssetId = tokens.find((token) => token.assetId === assetId);
    if (byAssetId) return byAssetId;

    if (!symbol) return null;
    const upperSymbol = symbol.trim().toUpperCase();
    if (!upperSymbol) return null;

    return (
        tokens.find((token) => String(token.symbol || "").trim().toUpperCase() === upperSymbol)
        || null
    );
}

function getCachedQuoteMinimum(assetId: string): string | null {
    const entry = cachedQuoteMinimumByAssetId.get(assetId);
    if (!entry) return null;

    if (Date.now() - entry.cachedAt > QUOTE_MIN_CACHE_TTL_MS) {
        cachedQuoteMinimumByAssetId.delete(assetId);
        return null;
    }

    return entry.amount;
}

function setCachedQuoteMinimum(assetId: string, amount: string): void {
    cachedQuoteMinimumByAssetId.set(assetId, { amount, cachedAt: Date.now() });
}

function parseMinimumFromQuoteError(payloadText: string, decimals?: number): string | null {
    let messageText = payloadText;
    try {
        const parsed = JSON.parse(payloadText) as { message?: string };
        if (typeof parsed.message === "string" && parsed.message.trim()) {
            messageText = parsed.message;
        }
    } catch {
        // Keep raw payload text if not JSON.
    }

    const match = messageText.match(/try at least\s+([0-9]+)/i);
    if (!match?.[1]) return null;
    return normalizeTokenMinimum(match[1], decimals);
}

async function probeMinimumFromQuote(
    token: IntentsToken,
): Promise<string | null> {
    const cachedMinimum = getCachedQuoteMinimum(token.assetId);
    if (cachedMinimum) return cachedMinimum;

    // For minimum probing, use INTENTS refund mode by default so all chains
    // (BTC/ETH/ZEC) can be queried uniformly without chain-specific addresses.
    const probeRefund = QUOTE_PROBE_RECIPIENT;
    if (!probeRefund) return null;

    const body = {
        dry: true,
        swapType: "EXACT_INPUT",
        originAsset: token.assetId,
        destinationAsset: token.assetId,
        amount: "1",
        recipient: QUOTE_PROBE_RECIPIENT,
        refundTo: probeRefund,
        deadline: new Date(Date.now() + 10 * 60_000).toISOString(),
        depositType: "ORIGIN_CHAIN",
        recipientType: "INTENTS",
        refundType: "INTENTS",
        slippageTolerance: 100,
    };

    try {
        const response = await fetch(INTENTS_QUOTE_URL, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
            cache: "no-store",
        });

        if (response.ok) {
            const result = (await response.json()) as {
                quote?: {
                    minAmountIn?: string | number;
                    amountIn?: string | number;
                };
            };

            const fromQuote = normalizeTokenMinimum(
                result.quote?.minAmountIn ?? result.quote?.amountIn,
                token.decimals,
            );
            if (fromQuote) {
                setCachedQuoteMinimum(token.assetId, fromQuote);
                return fromQuote;
            }
            return null;
        }

        const errorPayload = await response.text();
        const parsedMinimum = parseMinimumFromQuoteError(
            errorPayload,
            inferAtomicDecimalsFromAssetId(token.assetId) ?? token.decimals,
        );
        if (parsedMinimum) {
            setCachedQuoteMinimum(token.assetId, parsedMinimum);
            return parsedMinimum;
        }
        return null;
    } catch {
        return null;
    }
}

export async function getUsdPriceByAssetId(assetId: string, symbol?: string): Promise<number | null> {
    const tokens = await fetchTokens();
    const token = findToken(tokens, assetId, symbol);
    if (!token) return null;

    const exactPrice = toPositiveNumber(token.price);
    if (exactPrice !== null) return exactPrice;

    return null;
}

export async function getMinDepositAmountByAssetId(
    assetId: string,
    symbol?: string,
): Promise<string> {
    try {
        const tokens = await fetchTokens();
        const token = findToken(tokens, assetId, symbol);
        if (!token) return DEFAULT_INTENTS_MIN_DEPOSIT_AMOUNT;

        const minimum = resolveTokenMinimumDisplayAmount(token);
        if (minimum) return minimum;

        const quoteMinimum = await probeMinimumFromQuote(token);
        return quoteMinimum || DEFAULT_INTENTS_MIN_DEPOSIT_AMOUNT;
    } catch {
        return DEFAULT_INTENTS_MIN_DEPOSIT_AMOUNT;
    }
}

export async function getAssetDecimalsByAssetId(
    assetId: string,
    symbol?: string,
): Promise<number | null> {
    const inferred =
        inferAtomicDecimalsFromAssetId(assetId)
        ?? inferAtomicDecimalsFromSymbol(symbol);
    if (typeof inferred === "number") {
        return inferred;
    }

    try {
        const tokens = await fetchTokens();
        const token = findToken(tokens, assetId, symbol);
        const decimals = Number(token?.decimals);
        if (!Number.isFinite(decimals) || decimals < 0) return null;
        return Math.floor(decimals);
    } catch {
        return null;
    }
}

export async function getIntentsStatusByDeposit(
    depositAddress: string,
    depositMemo?: string,
): Promise<OneClickStatusResponse> {
    const normalizedAddress = depositAddress.trim();
    if (!normalizedAddress) {
        throw new Error("depositAddress is required");
    }

    const params = new URLSearchParams({ depositAddress: normalizedAddress });
    const normalizedMemo = depositMemo?.trim();
    if (normalizedMemo) {
        params.set("depositMemo", normalizedMemo);
    }

    const response = await fetch(`${INTENTS_STATUS_URL}?${params.toString()}`, {
        method: "GET",
        headers: {
            Accept: "application/json",
        },
        cache: "no-store",
    });

    if (!response.ok) {
        const body = await response.text();
        throw new Error(`Failed to fetch 1Click status (${response.status}): ${body}`);
    }

    return (await response.json()) as OneClickStatusResponse;
}

export async function getDepositQuotePreview(params: {
    assetId: string;
    amount: string;
    refundTo?: string;
    recipient?: string;
    symbol?: string;
}): Promise<DepositQuotePreview> {
    const assetId = String(params.assetId || "").trim();
    const recipient = String(params.recipient || QUOTE_PROBE_RECIPIENT).trim();
    const providedRefundTo = String(params.refundTo || "").trim();
    const refundTo = providedRefundTo || recipient;
    const refundType = providedRefundTo ? "ORIGIN_CHAIN" : "INTENTS";

    if (!assetId) {
        throw new Error("assetId is required");
    }
    if (!recipient) {
        throw new Error("recipient is required");
    }
    if (!refundTo) {
        throw new Error("refundTo is required");
    }

    const decimals =
        inferAtomicDecimalsFromSymbol(params.symbol)
        ?? (await getAssetDecimalsByAssetId(assetId, params.symbol))
        ?? 24;
    const amountAtomic = toAtomicAmount(params.amount, decimals);

    const body = {
        dry: true,
        swapType: "EXACT_INPUT",
        originAsset: assetId,
        destinationAsset: assetId,
        amount: amountAtomic,
        recipient,
        refundTo,
        deadline: new Date(Date.now() + 10 * 60_000).toISOString(),
        depositType: "ORIGIN_CHAIN",
        recipientType: "INTENTS",
        refundType,
        slippageTolerance: 100,
    };

    const response = await fetch(INTENTS_QUOTE_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        cache: "no-store",
    });

    if (!response.ok) {
        const bodyText = await response.text();
        throw new Error(`Failed to fetch quote preview (${response.status}): ${bodyText}`);
    }

    const result = (await response.json()) as IntentsQuoteResponse;
    const correlationId = String(result.correlationId || "").trim();
    const quoteAmountIn = String(result?.quote?.amountIn || "").trim();

    if (!correlationId) {
        throw new Error("Quote preview missing correlationId");
    }
    if (!/^\d+$/.test(quoteAmountIn)) {
        throw new Error("Quote preview missing amountIn");
    }

    return {
        correlationId,
        assetId,
        decimals,
        amountAtomic,
        quoteAmountIn,
        quoteAmountInFormatted: result.quote?.amountInFormatted,
        deadline: result.quote?.deadline,
    };
}
