interface IntentsToken {
    assetId: string;
    symbol?: string;
    price?: string;
}

const INTENTS_TOKENS_URL = "https://1click.chaindefuser.com/v0/tokens";
const TOKEN_CACHE_TTL_MS = 60_000;

let cachedTokens: IntentsToken[] | null = null;
let cachedAt = 0;
let inflightPromise: Promise<IntentsToken[]> | null = null;

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

export async function getUsdPriceByAssetId(assetId: string, symbol?: string): Promise<number | null> {
    const tokens = await fetchTokens();

    const byAssetId = tokens.find((token) => token.assetId === assetId);
    const exactPrice = toPositiveNumber(byAssetId?.price);
    if (exactPrice !== null) return exactPrice;

    if (!symbol) return null;
    const upperSymbol = symbol.trim().toUpperCase();
    if (!upperSymbol) return null;

    const bySymbol = tokens.find((token) => String(token.symbol || "").trim().toUpperCase() === upperSymbol);
    return toPositiveNumber(bySymbol?.price);
}

