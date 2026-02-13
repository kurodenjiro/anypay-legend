"use client";

import { useEffect, useMemo, useState } from "react";
import { formatUnits } from "viem";
import {
    getRefundAddressHint,
    isValidRefundAddress,
    resolveIntentsAssetId,
} from "@/lib/services/asset-map";
import {
    getUsdPriceByAssetId,
    getMinDepositAmountByAssetId,
    DEFAULT_INTENTS_MIN_DEPOSIT_AMOUNT,
    getDepositQuotePreview,
    type DepositQuotePreview,
} from "@/lib/services/intents-pricing";

type SellDepositInput = {
    amount: string;
    mode: "sell";
    asset: string;
    assetId: string;
    chain: string;
    refundTo: string;
    acceptingPayment: {
        platform: { name: string; logo: string };
        currency: { code: string; flag: string };
        accountTag: string;
    };
    quotePreview?: {
        correlationId: string;
        amountAtomic: string;
        quoteAmountIn: string;
        quoteAmountInFormatted?: string;
    };
};

interface SellWidgetProps {
    onDeposit: (data: SellDepositInput) => Promise<void>;
    isConnected: boolean;
    onConnect: () => Promise<void>;
    isConnecting: boolean;
    isV2FlowEnabled: boolean;
    accountId: string | null;
    walletBalanceNear: string | null;
    isBalanceLoading: boolean;
    onRefreshBalance: () => Promise<void>;
}

function formatBalance(nearAmount: string | null): string {
    if (!nearAmount) return "Unavailable";

    const value = Number(nearAmount);
    if (!Number.isFinite(value)) return `${nearAmount} NEAR`;
    if (value >= 1) return `${value.toFixed(2)} NEAR`;
    return `${value.toFixed(4)} NEAR`;
}

function shortAccountId(accountId: string | null): string {
    if (!accountId) return "Unknown";
    if (accountId.length <= 16) return accountId;
    return `${accountId.slice(0, 8)}...${accountId.slice(-6)}`;
}

function formatUsdValue(value: number): string {
    return new Intl.NumberFormat("en-US", {
        style: "currency",
        currency: "USD",
        maximumFractionDigits: 2,
    }).format(value);
}

function getMinimumSpendableNearForFundingIntent(): number {
    const fallback = 0.07;
    try {
        const storageFeeYocto =
            process.env.NEXT_PUBLIC_NEAR_V2_STORAGE_FEE_YOCTO
            || "50000000000000000000000";
        const storageFeeNear = Number(formatUnits(BigInt(storageFeeYocto), 24));
        if (!Number.isFinite(storageFeeNear) || storageFeeNear <= 0) {
            return fallback;
        }

        // Include a small gas buffer in addition to the storage fee.
        return storageFeeNear + 0.02;
    } catch {
        return fallback;
    }
}

export default function SellWidget({
    onDeposit,
    isConnected,
    onConnect,
    isConnecting,
    isV2FlowEnabled,
    accountId,
    walletBalanceNear,
    isBalanceLoading,
    onRefreshBalance,
}: SellWidgetProps) {
    const [amount, setAmount] = useState("");
    const [selectedToken, setSelectedToken] = useState({
        sym: "BTC",
        name: "Bitcoin",
        icon: "₿",
        network: "Bitcoin",
    });
    const [paymentPlatform, setPaymentPlatform] = useState("wise");
    const selectedPlatform = useMemo(
        () => ({
            name: paymentPlatform.trim() || "wise",
            logo: "W",
        }),
        [paymentPlatform],
    );
    const [selectedCurrency] = useState({ code: "USD", flag: "🇺🇸" });
    const [refundTo, setRefundTo] = useState("");
    const [wiseAccountTag, setWiseAccountTag] = useState("");
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [actionError, setActionError] = useState("");
    const [step, setStep] = useState<"list" | "form" | "review">("list");
    const [assetUsdPrice, setAssetUsdPrice] = useState<number | null>(null);
    const [minimumDepositAmount, setMinimumDepositAmount] = useState(
        DEFAULT_INTENTS_MIN_DEPOSIT_AMOUNT,
    );
    const [quotePreview, setQuotePreview] = useState<DepositQuotePreview | null>(null);
    const [quotePreviewRequestKey, setQuotePreviewRequestKey] = useState("");
    const [isQuoteLoading, setIsQuoteLoading] = useState(false);
    const [quoteError, setQuoteError] = useState("");
    const normalizedAmount = amount.trim();
    const numericAmount = Number(amount);
    const minimumAmount = Number(minimumDepositAmount);
    const normalizedMinimumAmount =
        Number.isFinite(minimumAmount) && minimumAmount > 0 ? minimumAmount : 0;
    const hasValidAmount =
        Number.isFinite(numericAmount) &&
        numericAmount >= normalizedMinimumAmount &&
        numericAmount > 0;
    const selectedAssetId = useMemo(
        () => resolveIntentsAssetId(selectedToken.sym),
        [selectedToken.sym],
    );
    const hasValidRefundAddress = useMemo(
        () => isValidRefundAddress(selectedToken.sym, refundTo),
        [selectedToken.sym, refundTo],
    );
    const normalizedPlatform = selectedPlatform.name.trim().toLowerCase();
    const hasValidPlatform = normalizedPlatform.length > 0;
    const normalizedWiseAccountTag = wiseAccountTag.trim();
    const hasValidWiseAccountTag = normalizedWiseAccountTag.length > 0;
    const quoteRequestKey = useMemo(
        () => `${selectedAssetId}|${normalizedAmount}|${String(accountId || "").trim()}`,
        [selectedAssetId, normalizedAmount, accountId],
    );
    const canRequestQuote = isV2FlowEnabled && hasValidAmount;
    const hasQuotePreviewData = Boolean(
        quotePreview?.correlationId
        && quotePreview?.quoteAmountIn
        && quotePreviewRequestKey === quoteRequestKey,
    );
    const canReview = hasValidAmount
        && hasValidRefundAddress
        && hasValidPlatform
        && hasValidWiseAccountTag
        && (!isV2FlowEnabled || (hasQuotePreviewData && !isQuoteLoading));
    const minimumSpendableNear = useMemo(
        () => getMinimumSpendableNearForFundingIntent(),
        [],
    );
    const spendableNearValue = useMemo(
        () => Number(walletBalanceNear),
        [walletBalanceNear],
    );
    const hasSufficientNearForFundingIntent = useMemo(
        () => (
            !isV2FlowEnabled
            || !isConnected
            || walletBalanceNear === null
            || walletBalanceNear === ""
            || (
                Number.isFinite(spendableNearValue)
                && spendableNearValue >= minimumSpendableNear
            )
        ),
        [
            isV2FlowEnabled,
            isConnected,
            walletBalanceNear,
            spendableNearValue,
            minimumSpendableNear,
        ],
    );

    useEffect(() => {
        let active = true;

        const loadIntentsMetadata = async () => {
            try {
                const [price, minimum] = await Promise.all([
                    getUsdPriceByAssetId(selectedAssetId, selectedToken.sym),
                    getMinDepositAmountByAssetId(selectedAssetId, selectedToken.sym),
                ]);
                if (!active) return;
                setAssetUsdPrice(price);
                setMinimumDepositAmount(minimum || DEFAULT_INTENTS_MIN_DEPOSIT_AMOUNT);
            } catch (error) {
                console.error("SellWidget: failed to load Intents metadata", error);
                if (!active) return;
                setAssetUsdPrice(null);
                setMinimumDepositAmount(DEFAULT_INTENTS_MIN_DEPOSIT_AMOUNT);
            }
        };

        void loadIntentsMetadata();
        return () => {
            active = false;
        };
    }, [selectedAssetId, selectedToken.sym]);

    useEffect(() => {
        setQuotePreview(null);
        setQuoteError("");
        setQuotePreviewRequestKey("");

        if (!canRequestQuote) {
            setIsQuoteLoading(false);
            return;
        }

        const requestKey = quoteRequestKey;
        let cancelled = false;
        const timer = setTimeout(() => {
            void (async () => {
                try {
                    setIsQuoteLoading(true);
                    const preview = await getDepositQuotePreview({
                        assetId: selectedAssetId,
                        amount: normalizedAmount,
                        recipient: accountId || undefined,
                        symbol: selectedToken.sym,
                    });

                    if (cancelled) return;
                    setQuotePreview(preview);
                    setQuotePreviewRequestKey(requestKey);
                    setQuoteError("");
                } catch (error: unknown) {
                    if (cancelled) return;
                    const message = error instanceof Error
                        ? error.message
                        : "Failed to fetch quote preview";
                    setQuotePreview(null);
                    setQuotePreviewRequestKey("");
                    setQuoteError(message);
                } finally {
                    if (!cancelled) {
                        setIsQuoteLoading(false);
                    }
                }
            })();
        }, 450);

        return () => {
            cancelled = true;
            clearTimeout(timer);
        };
    }, [
        normalizedAmount,
        selectedAssetId,
        selectedToken.sym,
        accountId,
        canRequestQuote,
        quoteRequestKey,
    ]);

    const estimatedFiat = useMemo(() => {
        if (!hasValidAmount || !assetUsdPrice) return null;
        return numericAmount * assetUsdPrice;
    }, [hasValidAmount, numericAmount, assetUsdPrice]);

    const assets = [
        { sym: "BTC", name: "Bitcoin", icon: "₿", network: "Bitcoin" },
        { sym: "ETH", name: "Ethereum", icon: "Ξ", network: "Ethereum" },
        { sym: "ZEC", name: "Zcash", icon: "🛡️", network: "Zcash" },
    ];

    const handleAssetSelect = (asset: typeof assets[0]) => {
        setSelectedToken(asset);
        setStep("form");
    };

    const handleReview = () => {
        if (!hasValidAmount) {
            setActionError(
                `Minimum deposit amount is ${minimumDepositAmount} ${selectedToken.sym}.`,
            );
            return;
        }
        if (!hasValidRefundAddress) {
            setActionError(`Enter a valid ${selectedToken.sym} refund address before continuing.`);
            return;
        }
        if (!hasValidPlatform) {
            setActionError("Enter your payout platform before continuing.");
            return;
        }
        if (!hasValidWiseAccountTag) {
            setActionError("Enter your Wise account tag before continuing.");
            return;
        }
        if (isV2FlowEnabled && !hasQuotePreviewData) {
            setActionError(quoteError || "Waiting for quote data. Please wait a moment and try again.");
            return;
        }
        setActionError("");
        setStep("review");
    };

    const handleConfirm = async () => {
        setIsSubmitting(true);
        setActionError("");

        try {
            if (isV2FlowEnabled && !hasQuotePreviewData) {
                throw new Error("Quote preview is missing. Go back and wait for quote data.");
            }
            if (isV2FlowEnabled && isConnected && !hasSufficientNearForFundingIntent) {
                throw new Error(
                    `Insufficient spendable NEAR. Keep at least `
                    + `${minimumSpendableNear.toFixed(3)} NEAR for storage fee and gas.`,
                );
            }

            const depositPromise = onDeposit({
                amount: normalizedAmount,
                mode: "sell",
                asset: selectedToken.sym,
                assetId: selectedAssetId,
                chain: selectedToken.network,
                refundTo: refundTo.trim(),
                acceptingPayment: {
                    platform: {
                        ...selectedPlatform,
                        name: normalizedPlatform,
                    },
                    currency: selectedCurrency,
                    accountTag: normalizedWiseAccountTag,
                },
                quotePreview: hasQuotePreviewData && quotePreview
                    ? {
                        correlationId: quotePreview.correlationId,
                        amountAtomic: quotePreview.amountAtomic,
                        quoteAmountIn: quotePreview.quoteAmountIn,
                        quoteAmountInFormatted: quotePreview.quoteAmountInFormatted,
                    }
                    : undefined,
                // txHash will be set by the parent after successful deposit
            });

            await Promise.race([
                depositPromise,
                new Promise((_, reject) => {
                    setTimeout(
                        () => reject(new Error("Deposit request timed out after 150 seconds. Please try again.")),
                        150000,
                    );
                }),
            ]);
        } catch (e) {
            console.error("Deposit widget error:", e);
            setActionError((e as Error).message || "Deposit failed");
        } finally {
            setIsSubmitting(false);
        }
    };

    const handlePrimaryAction = async () => {
        if (isSubmitting) return;

        if (!isConnected) {
            setActionError("");
            await onConnect();
            return;
        }

        await handleConfirm();
    };

    return (
        <div className="swap-widget w-full max-w-[500px] mx-auto p-0 overflow-hidden relative group">
            {/* Glow Effect */}
            <div className="absolute -top-20 -right-20 w-64 h-64 bg-purple-500/10 rounded-full blur-3xl pointer-events-none group-hover:bg-purple-500/20 transition-all duration-700"></div>

            {/* Header */}
            <div className="p-6 pb-2 relative z-10 text-center">
                <h2 className="text-xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-purple-400 to-pink-400 mb-1">
                    Sell Crypto
                </h2>
                <p className="text-xs text-gray-500">Off-ramp crypto to fiat instantly.</p>
            </div>

            {/* Content */}
            <div className="px-6 pb-8 space-y-5 relative z-10 pt-4">
                {step === "list" && (
                    <div className="space-y-3">
                        <div className="flex items-center justify-between px-2 pb-2 border-b border-white/5">
                            <span className="text-xs font-medium text-gray-500 uppercase tracking-wider">
                                Select Asset to Sell
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

                        {/* Deposit Card */}
                        <div className="w-full bg-[#050505]/50 border border-white/5 rounded-2xl p-4 space-y-4">
                            <div className="flex justify-between items-center">
                                <label className="text-xs font-medium text-gray-400">
                                    You Deposit (Crypto)
                                </label>
                            </div>

                            <div className="flex items-center justify-between">
                                <input
                                    type="number"
                                    min={normalizedMinimumAmount > 0 ? String(normalizedMinimumAmount) : "0"}
                                    step="any"
                                    inputMode="decimal"
                                    value={amount}
                                    onChange={(e) => setAmount(e.target.value)}
                                    placeholder="0.00"
                                    className="bg-transparent text-3xl font-medium text-white placeholder-gray-700 outline-none w-full"
                                />
                                <div className="flex items-center gap-2 bg-white/10 px-3 py-1.5 rounded-xl border border-white/10">
                                    <span className="text-xl">{selectedToken.icon}</span>
                                    <span className="font-bold text-white">{selectedToken.sym}</span>
                                </div>
                            </div>
                            <p className="text-xs text-gray-500">
                                Minimum: {minimumDepositAmount} {selectedToken.sym}
                            </p>
                        </div>

                        <div className="w-full bg-[#050505]/50 border border-white/5 rounded-2xl p-4 space-y-2">
                            <label className="text-xs font-medium text-gray-400">
                                Refund Address ({selectedToken.sym})
                            </label>
                            <input
                                type="text"
                                value={refundTo}
                                onChange={(e) => setRefundTo(e.target.value)}
                                placeholder={getRefundAddressHint(selectedToken.sym)}
                                className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-white outline-none focus:border-purple-400/60"
                            />
                            <p className="text-xs text-gray-500">
                                Used by Near Intents if funding fails or is refunded.
                            </p>
                        </div>

                        <div className="w-full bg-[#050505]/50 border border-white/5 rounded-2xl p-4 space-y-2">
                            <label className="text-xs font-medium text-gray-400">
                                Payment Platform
                            </label>
                            <input
                                type="text"
                                value={paymentPlatform}
                                onChange={(e) => setPaymentPlatform(e.target.value)}
                                placeholder="wise"
                                className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-white outline-none focus:border-purple-400/60"
                            />
                            <p className="text-xs text-gray-500">
                                Buyers will send fiat to this platform.
                            </p>
                        </div>

                        <div className="w-full bg-[#050505]/50 border border-white/5 rounded-2xl p-4 space-y-2">
                            <label className="text-xs font-medium text-gray-400">
                                Seller Tagname
                            </label>
                            <input
                                type="text"
                                value={wiseAccountTag}
                                onChange={(e) => setWiseAccountTag(e.target.value)}
                                placeholder="Enter your Wise handle / account tagname"
                                className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-white outline-none focus:border-purple-400/60"
                            />
                            <p className="text-xs text-gray-500">
                                This account tagname is shown to buyers for payout transfer.
                            </p>
                        </div>

                        {/* Receive Card */}
                        <div className="relative">
                            <div className="absolute left-1/2 -top-3 -translate-x-1/2 w-8 h-8 bg-[#111] rounded-full border border-white/10 flex items-center justify-center text-gray-500 z-10">
                                ↓
                            </div>

                            <div className="bg-[#050505]/50 border border-white/5 rounded-2xl p-4 pt-6 space-y-4">
                                <div className="flex justify-between items-center">
                                    <label className="text-xs font-medium text-gray-400">
                                        You Receive (Fiat)
                                    </label>
                                    <div className="flex items-center gap-2 px-2 py-1 rounded-full bg-white/5 border border-white/5 text-xs text-gray-300">
                                        via {selectedPlatform.name}
                                    </div>
                                </div>

                                <div className="flex items-center justify-between">
                                    <div className="text-2xl font-bold text-gray-500">
                                        {estimatedFiat === null
                                            ? `≈ -- ${selectedCurrency.code}`
                                            : `≈ ${formatUsdValue(estimatedFiat)}`}
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <div className="w-8 h-8 rounded bg-white text-black flex items-center justify-center font-bold text-lg">
                                            {selectedPlatform.logo}
                                        </div>
                                        <span className="text-white font-bold text-lg">
                                            {selectedPlatform.name}
                                        </span>
                                    </div>
                                </div>
                                <p className="text-xs text-gray-500">
                                    {assetUsdPrice
                                        ? `1 ${selectedToken.sym} ≈ ${formatUsdValue(assetUsdPrice)}`
                                        : "Price unavailable"}
                                </p>
                            </div>
                        </div>

                        <button
                            onClick={handleReview}
                            disabled={!canReview}
                            className="w-full btn-primary py-4 text-base rounded-xl mt-4 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            {isQuoteLoading ? "Checking Quote..." : "Review Deposit"}
                        </button>
                        {quoteError && (
                            <p className="text-xs text-amber-300">{quoteError}</p>
                        )}
                        {isV2FlowEnabled && hasQuotePreviewData && (
                            <p className="text-xs text-emerald-300">
                                Quote ready. Atomic amount: <span className="font-mono">{quotePreview?.amountAtomic}</span>
                            </p>
                        )}
                    </>
                )}

                {step === "review" && (
                    <>
                        <button
                            onClick={() => setStep("form")}
                            className="flex items-center gap-1 text-xs text-gray-500 hover:text-white mb-2 transition-colors"
                        >
                            ← Edit Deposit
                        </button>

                        <div className="bg-white/5 border border-white/10 rounded-2xl p-6 space-y-6">
                            <h3 className="text-lg font-bold text-white text-center">
                                Confirm Deposit
                            </h3>

                            <div className="space-y-4">
                                <div className="flex justify-between items-center">
                                    <span className="text-gray-400">Depositing</span>
                                    <span className="text-white font-bold text-lg">
                                        {amount} {selectedToken.sym}
                                    </span>
                                </div>
                                <div className="flex justify-between items-center">
                                    <span className="text-gray-400">Receiving</span>
                                    <span className="text-white font-bold text-lg">
                                        {estimatedFiat === null
                                            ? `≈ -- ${selectedCurrency.code}`
                                            : `≈ ${formatUsdValue(estimatedFiat)}`}
                                    </span>
                                </div>
                                <div className="w-full h-px bg-white/10"></div>
                                <div className="flex justify-between items-center text-sm">
                                    <span className="text-gray-400">Payment Via</span>
                                    <span className="text-white">{selectedPlatform.name}</span>
                                </div>
                                <div className="flex justify-between items-center text-sm">
                                    <span className="text-gray-400">Seller Tagname</span>
                                    <span className="text-white font-mono text-xs truncate w-56 text-right">
                                        {normalizedWiseAccountTag || "Not set"}
                                    </span>
                                </div>
                                <div className="flex justify-between items-center text-sm">
                                    <span className="text-gray-400">Network</span>
                                    <span className="text-purple-400">{selectedToken.network}</span>
                                </div>
                                <div className="flex justify-between items-center text-sm">
                                    <span className="text-gray-400">Asset ID</span>
                                    <span className="text-white font-mono text-xs">
                                        {selectedAssetId}
                                    </span>
                                </div>
                                <div className="flex justify-between items-center text-sm">
                                    <span className="text-gray-400">Refund To</span>
                                    <span className="text-white font-mono text-xs truncate w-56 text-right">
                                        {refundTo || "Not set"}
                                    </span>
                                </div>
                                {hasQuotePreviewData && quotePreview && (
                                    <>
                                        <div className="w-full h-px bg-white/10"></div>
                                        <div className="flex justify-between items-center text-sm">
                                            <span className="text-gray-400">Quote Amount (Atomic)</span>
                                            <span className="text-white font-mono text-xs">{quotePreview.quoteAmountIn}</span>
                                        </div>
                                        <div className="flex justify-between items-center text-sm">
                                            <span className="text-gray-400">Submitted Amount (Atomic)</span>
                                            <span className="text-emerald-300 font-mono text-xs">{quotePreview.amountAtomic}</span>
                                        </div>
                                    </>
                                )}
                            </div>

                            <div className="bg-purple-500/10 border border-purple-500/20 rounded-xl p-3 flex gap-3">
                                <span className="text-xl">ℹ️</span>
                                <p className="text-xs text-purple-200/80 leading-relaxed">
                                    {isV2FlowEnabled
                                        ? `You are creating a funding intent. Send ${selectedToken.sym} to the generated address before the deadline to activate your listing.`
                                        : `Your crypto will be deposited into the MPC vault. Buyers will match your order and pay you via ${selectedPlatform.name}.`}
                                </p>
                            </div>

                            {isConnected && (
                                <div className="bg-blue-500/10 border border-blue-500/20 rounded-xl p-3 space-y-3">
                                    <div className="flex items-center justify-between text-xs">
                                        <span className="text-blue-200/80">Wallet</span>
                                        <span className="font-mono text-blue-100">{shortAccountId(accountId)}</span>
                                    </div>
                                    <div className="flex items-center justify-between text-xs">
                                        <span className="text-blue-200/80">Available NEAR</span>
                                        <span className="text-blue-100">
                                            {isBalanceLoading ? "Loading..." : formatBalance(walletBalanceNear)}
                                        </span>
                                    </div>
                                    {isV2FlowEnabled && !isBalanceLoading && !hasSufficientNearForFundingIntent && (
                                        <p className="text-[11px] text-amber-200/90 leading-relaxed">
                                            Keep at least {minimumSpendableNear.toFixed(3)} available NEAR
                                            for funding intent storage fee and gas.
                                        </p>
                                    )}
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
                            type="button"
                            onClick={() => void handlePrimaryAction()}
                            disabled={
                                isSubmitting
                                || isConnecting
                                || (isConnected && isV2FlowEnabled && !hasSufficientNearForFundingIntent)
                            }
                            className={`w-full py-4 text-base rounded-xl relative overflow-hidden ${isConnected ? "btn-primary" : "bg-blue-600 hover:bg-blue-700 text-white"
                                } cursor-pointer disabled:cursor-not-allowed`}
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
                                        ></circle>
                                        <path
                                            className="opacity-75"
                                            fill="currentColor"
                                            d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                                        ></path>
                                    </svg>
                                    {isV2FlowEnabled ? "Creating Funding Intent..." : "Creating Deposit..."}
                                </span>
                            ) : (
                                isConnected
                                    ? (isV2FlowEnabled ? "Confirm & Create Funding Intent" : "Confirm & Create Deposit")
                                    : isConnecting
                                        ? "Connecting..."
                                        : "Connect NEAR Wallet to Continue"
                            )}
                        </button>

                        {actionError && (
                            <div className="p-3 mt-3 bg-red-500/20 border border-red-500/40 rounded-xl text-sm text-red-200">
                                {actionError}
                            </div>
                        )}
                    </>
                )}
            </div>
        </div>
    );
}
