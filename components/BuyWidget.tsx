"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { formatUnits } from "viem";
import { nearService, type DepositSummaryV2 } from "@/lib/services/near";
import {
    resolveIntentsAssetId,
    getRefundAddressHint,
    isValidRefundAddress,
} from "@/lib/services/asset-map";
import { getUsdPriceByAssetId } from "@/lib/services/intents-pricing";
import { parsePaymentMethod } from "@/lib/services/payment-method";

interface BuyWidgetProps {
    onSignal: (data: any) => Promise<void>;
    isConnected: boolean;
    onConnect: () => Promise<void>;
    accountId: string | null;
    isConnecting: boolean;
    walletBalanceNear: string | null;
    isBalanceLoading: boolean;
    onRefreshBalance: () => Promise<void>;
}

function shortAccountId(accountId: string | null): string {
    if (!accountId) return "Unknown";
    if (accountId.length <= 16) return accountId;
    return `${accountId.slice(0, 8)}...${accountId.slice(-6)}`;
}

function formatBalance(nearAmount: string | null): string {
    if (!nearAmount) return "Unavailable";

    const value = Number(nearAmount);
    if (!Number.isFinite(value)) return `${nearAmount} NEAR`;
    if (value >= 1) return `${value.toFixed(2)} NEAR`;
    return `${value.toFixed(4)} NEAR`;
}

function formatAmount(amount: string): string {
    try {
        const parsed = BigInt(amount || "0");
        const decimal = Number(formatUnits(parsed, 24));
        if (!Number.isFinite(decimal)) return amount;
        if (decimal >= 1) return decimal.toFixed(4);
        return decimal.toFixed(6);
    } catch {
        return amount;
    }
}

function getListingPaymentInfo(listing: DepositSummaryV2 | null): {
    raw: string;
    method: string;
    accountTag: string;
} {
    const parsed = parsePaymentMethod(listing?.payment_methods?.[0]);
    return {
        raw: parsed.raw,
        method: parsed.method || "wise",
        accountTag: parsed.accountTag,
    };
}

function formatUsdValue(value: number): string {
    return new Intl.NumberFormat("en-US", {
        style: "currency",
        currency: "USD",
        maximumFractionDigits: 2,
    }).format(value);
}

function formatCryptoEstimate(value: number): string {
    if (!Number.isFinite(value) || value <= 0) return "0";
    if (value >= 1) return value.toFixed(6);
    return value.toFixed(8);
}

function trimTrailingZeros(value: string): string {
    return value.replace(/\.?(0+)$/, "");
}

function toSignalAmount(value: number, symbol: string): string {
    if (!Number.isFinite(value) || value <= 0) return "";
    const normalizedSymbol = String(symbol || "").toUpperCase();
    const precision = normalizedSymbol === "BTC" || normalizedSymbol === "ZEC"
        ? 8
        : normalizedSymbol === "ETH"
            ? 12
            : 8;
    return trimTrailingZeros(value.toFixed(precision));
}

export default function BuyWidget({
    onSignal,
    isConnected,
    onConnect,
    accountId,
    isConnecting,
    walletBalanceNear,
    isBalanceLoading,
    onRefreshBalance,
}: BuyWidgetProps) {
    const [amount, setAmount] = useState("");
    const [selectedToken, setSelectedToken] = useState({
        sym: "BTC",
        name: "Bitcoin",
        icon: "₿",
        network: "Bitcoin",
    });
    const [selectedCurrency] = useState({ code: "USD", flag: "🇺🇸" });
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [step, setStep] = useState<"list" | "form" | "review">("list");
    const [listings, setListings] = useState<DepositSummaryV2[]>([]);
    const [selectedListingId, setSelectedListingId] = useState<number | null>(null);
    const [isListingsLoading, setIsListingsLoading] = useState(false);
    const [listingsError, setListingsError] = useState("");
    const [assetUsdPrice, setAssetUsdPrice] = useState<number | null>(null);
    const [recipientAddress, setRecipientAddress] = useState("");

    const assets = [
        { sym: "BTC", name: "Bitcoin", icon: "₿", network: "Bitcoin" },
        { sym: "ETH", name: "Ethereum", icon: "Ξ", network: "Ethereum" },
        { sym: "ZEC", name: "Zcash", icon: "🛡️", network: "Zcash" },
    ];

    const selectedAssetId = useMemo(
        () => resolveIntentsAssetId(selectedToken.sym),
        [selectedToken.sym],
    );

    const selectedListing = useMemo(() => {
        if (!selectedListingId) return null;
        return listings.find((item) => Number(item.deposit_id) === selectedListingId) || null;
    }, [selectedListingId, listings]);

    const selectedListingPaymentInfo = useMemo(
        () => getListingPaymentInfo(selectedListing),
        [selectedListing],
    );
    const selectedPaymentMethod = selectedListingPaymentInfo.method;
    const selectedPaymentMethodRaw = selectedListingPaymentInfo.raw || selectedPaymentMethod;
    const selectedSellerAccountTag = selectedListingPaymentInfo.accountTag;
    const numericFiatAmount = Number(amount);
    const estimatedCryptoAmount = useMemo(() => {
        if (!Number.isFinite(numericFiatAmount) || numericFiatAmount <= 0 || !assetUsdPrice) {
            return null;
        }
        return numericFiatAmount / assetUsdPrice;
    }, [numericFiatAmount, assetUsdPrice]);
    const signalAmount = useMemo(
        () => toSignalAmount(estimatedCryptoAmount ?? 0, selectedToken.sym),
        [estimatedCryptoAmount, selectedToken.sym],
    );
    const hasValidRecipientAddress = useMemo(
        () => isValidRefundAddress(selectedToken.sym, recipientAddress),
        [selectedToken.sym, recipientAddress],
    );

    const loadListings = useCallback(async () => {
        setIsListingsLoading(true);
        setListingsError("");

        try {
            const next = await nearService.getOpenDepositsByAssetV2(selectedAssetId, 0, 20);
            const normalized = Array.isArray(next) ? next : [];
            setListings(normalized);

            if (normalized.length === 0) {
                setSelectedListingId(null);
                return;
            }

            setSelectedListingId((prev) => {
                if (prev && normalized.some((item) => Number(item.deposit_id) === prev)) {
                    return prev;
                }
                return Number(normalized[0].deposit_id);
            });
        } catch (error: any) {
            console.error("BuyWidget: failed to load funded listings", error);
            setListingsError(error?.message || "Failed to load listings");
            setListings([]);
            setSelectedListingId(null);
        } finally {
            setIsListingsLoading(false);
        }
    }, [selectedAssetId]);

    useEffect(() => {
        if (step === "list") return;
        void loadListings();

        const interval = setInterval(() => {
            void loadListings();
        }, 10_000);

        return () => clearInterval(interval);
    }, [step, loadListings]);

    useEffect(() => {
        let active = true;

        const loadPrice = async () => {
            try {
                const price = await getUsdPriceByAssetId(selectedAssetId, selectedToken.sym);
                if (active) setAssetUsdPrice(price);
            } catch (error) {
                console.error("BuyWidget: failed to load token price", error);
                if (active) setAssetUsdPrice(null);
            }
        };

        void loadPrice();
        return () => {
            active = false;
        };
    }, [selectedAssetId, selectedToken.sym]);

    const handleAssetSelect = (asset: typeof assets[0]) => {
        setSelectedToken(asset);
        setListings([]);
        setSelectedListingId(null);
        setListingsError("");
        setStep("form");
    };

    const handleReview = () => {
        if (!amount || !selectedListingId || !signalAmount || !hasValidRecipientAddress) return;
        setStep("review");
    };

    const handleConfirm = async () => {
        if (!isConnected) {
            await onConnect();
            return;
        }

        if (!selectedListingId || !selectedListing) return;

        setIsSubmitting(true);
        try {
            await onSignal({
                amount: signalAmount,
                fiatAmount: amount,
                mode: "buy",
                depositId: selectedListingId,
                candidateDepositIds: listings.map((item) => Number(item.deposit_id)),
                assetId: selectedAssetId,
                payingUsing: {
                    platform: { name: selectedPaymentMethod, logo: "$" },
                    currency: selectedCurrency,
                },
                buyingAsset: { token: selectedToken },
                recipient: recipientAddress.trim(),
                listingPaymentMethodRaw: selectedPaymentMethodRaw,
                sellerAccountTag: selectedSellerAccountTag,
                selectedListing,
            });
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <div className="swap-widget w-full max-w-[500px] mx-auto p-0 overflow-hidden relative group">
            <div className="absolute -top-20 -right-20 w-64 h-64 bg-blue-500/10 rounded-full blur-3xl pointer-events-none group-hover:bg-blue-500/20 transition-all duration-700" />

            <div className="p-6 pb-2 relative z-10 text-center">
                <h2 className="text-xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-blue-400 to-cyan-400 mb-1">
                    Buy Crypto
                </h2>
                <p className="text-xs text-gray-500">Select funded liquidity, then signal intent.</p>
            </div>

            <div className="px-6 pb-8 space-y-5 relative z-10 pt-4">
                {step === "list" && (
                    <div className="space-y-3">
                        <div className="flex items-center justify-between px-2 pb-2 border-b border-white/5">
                            <span className="text-xs font-medium text-gray-500 uppercase tracking-wider">
                                Select Asset to Buy
                            </span>
                        </div>

                        {assets.map((asset) => (
                            <button
                                key={asset.sym}
                                onClick={() => handleAssetSelect(asset)}
                                className="w-full flex items-center justify-between bg-[#050505]/50 p-4 rounded-xl border border-white/5 hover:bg-white/5 transition-all group text-left"
                            >
                                <div className="flex items-center gap-3">
                                    <div className="w-10 h-10 rounded-full bg-white/10 flex items-center justify-center text-xl">
                                        {asset.icon}
                                    </div>
                                    <div>
                                        <h4 className="text-white font-bold">{asset.sym}</h4>
                                        <p className="text-xs text-gray-500">{asset.network}</p>
                                    </div>
                                </div>
                                <div className="w-8 h-8 rounded-full bg-white/5 flex items-center justify-center text-gray-400 group-hover:bg-white/10 group-hover:text-white transition-colors">
                                    →
                                </div>
                            </button>
                        ))}
                    </div>
                )}

                {step === "form" && (
                    <>
                        <button
                            onClick={() => setStep("list")}
                            className="flex items-center gap-1 text-xs text-gray-500 hover:text-white mb-2 transition-colors"
                        >
                            ← Back to Assets
                        </button>

                        <div className="w-full bg-[#050505]/50 border border-white/5 rounded-2xl p-4 space-y-4">
                            <div className="flex justify-between items-center">
                                <label className="text-xs font-medium text-gray-400">
                                    You Pay (Fiat)
                                </label>
                            </div>

                            <div className="flex items-center justify-between">
                                <input
                                    type="number"
                                    value={amount}
                                    onChange={(e) => setAmount(e.target.value)}
                                    placeholder="0.00"
                                    className="bg-transparent text-3xl font-medium text-white placeholder-gray-700 outline-none w-full"
                                />
                                <span className="text-white font-bold text-lg">{selectedCurrency.code}</span>
                            </div>
                        </div>

                        <div className="w-full bg-[#050505]/50 border border-white/5 rounded-2xl p-4 space-y-3">
                            <div className="flex items-center justify-between">
                                <label className="text-xs font-medium text-gray-400">
                                    Funded Listings ({selectedToken.sym})
                                </label>
                                <button
                                    type="button"
                                    onClick={() => void loadListings()}
                                    className="text-xs px-2 py-1 rounded border border-white/20 bg-white/5 hover:bg-white/10 text-white"
                                >
                                    Refresh
                                </button>
                            </div>

                            <p className="text-xs text-gray-500 font-mono break-all">Asset ID: {selectedAssetId}</p>

                            {isListingsLoading && (
                                <div className="text-xs text-blue-200 bg-blue-500/10 border border-blue-500/20 rounded-xl p-3">
                                    Loading funded liquidity...
                                </div>
                            )}

                            {!isListingsLoading && listings.length === 0 && (
                                <div className="text-xs text-amber-200 bg-amber-500/10 border border-amber-500/20 rounded-xl p-3">
                                    No funded liquidity yet. Keep this page open or refresh shortly.
                                </div>
                            )}

                            {!!listingsError && (
                                <div className="text-xs text-red-200 bg-red-500/10 border border-red-500/20 rounded-xl p-3">
                                    {listingsError}
                                </div>
                            )}

                            <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
                                {listings.map((listing) => {
                                    const listingId = Number(listing.deposit_id);
                                    const isSelected = selectedListingId === listingId;
                                    const paymentInfo = getListingPaymentInfo(listing);

                                    return (
                                        <button
                                            key={listingId}
                                            type="button"
                                            onClick={() => setSelectedListingId(listingId)}
                                            className={`w-full text-left rounded-xl border p-3 transition-colors ${
                                                isSelected
                                                    ? "border-cyan-400/60 bg-cyan-500/10"
                                                    : "border-white/10 bg-white/5 hover:bg-white/10"
                                            }`}
                                        >
                                            <div className="flex items-center justify-between text-xs text-gray-300">
                                                <span>Deposit #{listingId}</span>
                                                <span>{paymentInfo.method}</span>
                                            </div>
                                            <div className="mt-1 flex items-center justify-between text-sm">
                                                <span className="text-gray-400">Available</span>
                                                <span className="text-white font-mono">
                                                    {formatAmount(String(listing.remaining_deposits))} {selectedToken.sym}
                                                </span>
                                            </div>
                                            <div className="mt-1 flex items-center justify-between text-xs">
                                                <span className="text-gray-500">Seller</span>
                                                <span className="text-gray-300 font-mono">{shortAccountId(listing.depositor)}</span>
                                            </div>
                                            {paymentInfo.accountTag && (
                                                <div className="mt-1 flex items-center justify-between text-xs">
                                                    <span className="text-gray-500">User Tagname</span>
                                                    <span className="text-gray-200 font-mono">{paymentInfo.accountTag}</span>
                                                </div>
                                            )}
                                        </button>
                                    );
                                })}
                            </div>
                        </div>

                        <div className="relative">
                            <div className="absolute left-1/2 -top-3 -translate-x-1/2 w-8 h-8 bg-[#111] rounded-full border border-white/10 flex items-center justify-center text-gray-500 z-10">
                                ↓
                            </div>

                            <div className="bg-[#050505]/50 border border-white/5 rounded-2xl p-4 pt-6 space-y-4">
                                <div className="flex justify-between items-center">
                                    <label className="text-xs font-medium text-gray-400">
                                        You Receive
                                    </label>
                                    <div className="flex items-center gap-2 px-2 py-1 rounded-full bg-white/5 border border-white/5 text-xs text-gray-300">
                                        {selectedToken.network} Network
                                    </div>
                                </div>

                                <div className="flex items-center justify-between">
                                    <div className="text-2xl font-bold text-gray-500">
                                        {estimatedCryptoAmount === null
                                            ? `≈ -- ${selectedToken.sym}`
                                            : `≈ ${formatCryptoEstimate(estimatedCryptoAmount)} ${selectedToken.sym}`}
                                    </div>
                                    <div className="flex items-center gap-2 bg-white/10 px-3 py-1.5 rounded-xl border border-white/10">
                                        <span className="text-xl">{selectedToken.icon}</span>
                                        <span className="font-bold text-white">{selectedToken.sym}</span>
                                    </div>
                                </div>
                                <p className="text-xs text-gray-500">
                                    {assetUsdPrice
                                        ? `1 ${selectedToken.sym} ≈ ${formatUsdValue(assetUsdPrice)}`
                                        : "Price unavailable"}
                                </p>
                            </div>
                        </div>

                        <div className="w-full bg-[#050505]/50 border border-white/5 rounded-2xl p-4 space-y-2">
                            <label className="text-xs font-medium text-gray-400">
                                Receive Address ({selectedToken.sym})
                            </label>
                            <input
                                type="text"
                                value={recipientAddress}
                                onChange={(e) => setRecipientAddress(e.target.value)}
                                placeholder={getRefundAddressHint(selectedToken.sym)}
                                className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-white outline-none focus:border-cyan-400/60"
                            />
                            <p className="text-xs text-gray-500">
                                This is where your {selectedToken.sym} will be released after payment proof.
                            </p>
                            {recipientAddress.trim().length > 0 && !hasValidRecipientAddress && (
                                <p className="text-xs text-amber-300">
                                    Enter a valid {selectedToken.sym} address.
                                </p>
                            )}
                        </div>

                        <button
                            onClick={handleReview}
                            disabled={!amount || !selectedListingId || !signalAmount || !hasValidRecipientAddress}
                            className="w-full btn-primary py-4 text-base rounded-xl mt-4 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            Review Order
                        </button>
                    </>
                )}

                {step === "review" && (
                    <>
                        <button
                            onClick={() => setStep("form")}
                            className="flex items-center gap-1 text-xs text-gray-500 hover:text-white mb-2 transition-colors"
                        >
                            ← Edit Order
                        </button>

                        <div className="bg-white/5 border border-white/10 rounded-2xl p-6 space-y-6">
                            <h3 className="text-lg font-bold text-white text-center">
                                Confirm Buy Order
                            </h3>

                            <div className="space-y-4">
                                <div className="flex justify-between items-center">
                                    <span className="text-gray-400">Listing</span>
                                    <span className="text-emerald-300 font-mono">
                                        #{selectedListingId || "N/A"}
                                    </span>
                                </div>
                                <div className="flex justify-between items-center">
                                    <span className="text-gray-400">Paying</span>
                                    <span className="text-white font-bold text-lg">
                                        {amount} {selectedCurrency.code}
                                    </span>
                                </div>
                                <div className="flex justify-between items-center">
                                    <span className="text-gray-400">Receiving</span>
                                    <span className="text-white font-bold text-lg">
                                        {estimatedCryptoAmount === null
                                            ? `≈ -- ${selectedToken.sym}`
                                            : `≈ ${formatCryptoEstimate(estimatedCryptoAmount)} ${selectedToken.sym}`}
                                    </span>
                                </div>
                                <div className="w-full h-px bg-white/10" />
                                <div className="flex justify-between items-center text-sm">
                                    <span className="text-gray-400">Payment Method</span>
                                    <span className="text-white">{selectedPaymentMethod}</span>
                                </div>
                                <div className="flex justify-between items-center text-sm">
                                    <span className="text-gray-400">Send Fiat To (Seller)</span>
                                    <span className="text-white font-mono text-xs">
                                        {selectedListing ? shortAccountId(selectedListing.depositor) : "N/A"}
                                    </span>
                                </div>
                                <div className="flex justify-between items-center text-sm">
                                    <span className="text-gray-400">User Tagname</span>
                                    <span className="text-white font-mono text-xs">
                                        {selectedSellerAccountTag || "N/A"}
                                    </span>
                                </div>
                                <div className="flex justify-between items-center text-sm">
                                    <span className="text-gray-400">Transfer Memo</span>
                                    <span className="text-amber-300 font-mono text-xs">
                                        Generated after signal
                                    </span>
                                </div>
                                <div className="flex justify-between items-center text-sm">
                                    <span className="text-gray-400">Network</span>
                                    <span className="text-blue-400">{selectedToken.network}</span>
                                </div>
                                <div className="flex justify-between items-center text-sm">
                                    <span className="text-gray-400">Receive Address</span>
                                    <span className="text-white font-mono text-xs truncate w-56 text-right">
                                        {recipientAddress || "Not set"}
                                    </span>
                                </div>
                                <div className="flex justify-between items-center text-sm">
                                    <span className="text-gray-400">Asset ID</span>
                                    <span className="text-white font-mono text-xs">{selectedAssetId}</span>
                                </div>
                            </div>

                            <div className="bg-blue-500/10 border border-blue-500/20 rounded-xl p-3 flex gap-3">
                                <span className="text-xl">ℹ️</span>
                                <p className="text-xs text-blue-200/80 leading-relaxed">
                                    After signaling, send {amount || "--"} {selectedCurrency.code} via {selectedPaymentMethod}
                                    to the seller, then submit proof to finalize release to your {selectedToken.sym} address.
                                </p>
                            </div>

                            {isConnected && (
                                <div className="bg-blue-500/10 border border-blue-500/20 rounded-xl p-3 space-y-2">
                                    <div className="flex items-center justify-between text-xs">
                                        <span className="text-blue-200/80">Wallet</span>
                                        <span className="font-mono text-blue-100">{shortAccountId(accountId)}</span>
                                    </div>
                                    <div className="flex items-center justify-between text-xs">
                                        <span className="text-blue-200/80">NEAR Balance</span>
                                        <span className="text-blue-100">
                                            {isBalanceLoading ? "Loading..." : formatBalance(walletBalanceNear)}
                                        </span>
                                    </div>
                                    <div className="flex items-center gap-2 pt-1">
                                        <button
                                            type="button"
                                            onClick={() => void onRefreshBalance()}
                                            className="px-3 py-1.5 rounded-lg border border-white/15 bg-white/5 hover:bg-white/10 text-xs text-white transition-colors"
                                        >
                                            Refresh
                                        </button>
                                        <a
                                            href="https://faucet.testnet.near.org/"
                                            target="_blank"
                                            rel="noreferrer"
                                            className="px-3 py-1.5 rounded-lg border border-emerald-400/30 bg-emerald-500/10 hover:bg-emerald-500/20 text-xs text-emerald-200 transition-colors"
                                        >
                                            Fund Wallet
                                        </a>
                                    </div>
                                </div>
                            )}
                        </div>

                        <button
                            onClick={handleConfirm}
                            disabled={isSubmitting || isConnecting || !selectedListingId}
                            className={`w-full py-4 text-base rounded-xl relative overflow-hidden ${isConnected ? "btn-primary" : "bg-blue-600 hover:bg-blue-700 text-white"
                                }`}
                        >
                            {isSubmitting ? (
                                <span className="flex items-center justify-center gap-2">
                                    <svg
                                        className="animate-spin h-5 w-5 text-white"
                                        viewBox="0 0 24 24"
                                    >
                                        <circle
                                            className="opacity-25"
                                            cx="12"
                                            cy="12"
                                            r="10"
                                            stroke="currentColor"
                                            strokeWidth="4"
                                        />
                                        <path
                                            className="opacity-75"
                                            fill="currentColor"
                                            d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                                        />
                                    </svg>
                                    Finding Match...
                                </span>
                            ) : (
                                isConnected ? "Confirm & Signal Intent" : "Connect NEAR Wallet to Continue"
                            )}
                        </button>
                    </>
                )}
            </div>
        </div>
    );
}
