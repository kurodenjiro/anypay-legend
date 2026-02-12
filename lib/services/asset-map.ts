export type SupportedTradeAssetSymbol = "BTC" | "ETH" | "ZEC";

const DEFAULT_ASSET_ID_BY_SYMBOL: Record<SupportedTradeAssetSymbol, string> = {
    BTC: process.env.NEXT_PUBLIC_INTENTS_ASSET_ID_BTC || "nep141:btc.omft.near",
    ETH: process.env.NEXT_PUBLIC_INTENTS_ASSET_ID_ETH || "nep141:eth.omft.near",
    ZEC: process.env.NEXT_PUBLIC_INTENTS_ASSET_ID_ZEC || "nep141:zec.omft.near",
};

export function resolveIntentsAssetId(symbol: string): string {
    const normalized = symbol.trim().toUpperCase() as SupportedTradeAssetSymbol;
    return DEFAULT_ASSET_ID_BY_SYMBOL[normalized] || symbol;
}

export function getRefundAddressHint(symbol: string): string {
    const normalized = symbol.trim().toUpperCase();
    if (normalized === "BTC") return "Bitcoin address (testnet: tb1... or mainnet: bc1...)";
    if (normalized === "ETH") return "Ethereum EVM address (0x...)";
    if (normalized === "ZEC") return "Zcash address (t1/t3/zs...)";
    return "Refund address for selected asset";
}

export function isValidRefundAddress(symbol: string, address: string): boolean {
    const value = address.trim();
    if (!value) return false;

    const normalized = symbol.trim().toUpperCase();

    if (normalized === "BTC") {
        return /^(bc1|tb1|[13mn2])[a-zA-Z0-9]{20,}$/i.test(value);
    }

    if (normalized === "ETH") {
        return /^0x[a-fA-F0-9]{40}$/.test(value);
    }

    if (normalized === "ZEC") {
        return /^(t1|t3|zs)[a-zA-Z0-9]{20,}$/.test(value);
    }

    return value.length >= 10;
}
