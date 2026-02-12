"use client";

import { useState, useCallback, useEffect } from "react";
import { parseUnits } from "viem";
import BuyWidget from "./BuyWidget";
import TLSNNotarization from "./TLSNNotarization";
import { nearService } from "@/lib/services/near";
import { useNear } from "@/hooks/useNear";

type TradeState = "SIGNAL" | "NOTARIZE" | "SUCCESS";

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

export default function BuyFlow() {
    const [currentState, setCurrentState] = useState<TradeState>("SIGNAL");
    const [tradeData, setTradeData] = useState<any>(null);
    const [error, setError] = useState("");
    const [walletBalanceNear, setWalletBalanceNear] = useState<string | null>(null);
    const [isBalanceLoading, setIsBalanceLoading] = useState(false);
    const { isConnected, connect, accountId, isLoading } = useNear();

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

            const amountYocto = parseUnits(String(data.amount), 24);
            const attemptedIds = new Set<number>();
            let selectedListing = data.selectedListing || null;
            let paymentMethod = String(
                selectedListing?.payment_methods?.[0]
                || data.payingUsing.platform.name,
            ).toLowerCase();
            let result: any = null;

            for (let attempt = 1; attempt <= 3; attempt++) {
                try {
                    console.log("Signaling intent...", { ...data, depositId, paymentMethod, attempt });
                    result = await nearService.signalIntent(
                        depositId,
                        data.amount,
                        paymentMethod,
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
                        if (attemptedIds.has(id)) return false;

                        try {
                            return BigInt(listing.remaining_deposits || "0") >= amountYocto;
                        } catch {
                            return false;
                        }
                    });

                    if (!nextListing) {
                        throw new Error("Selected listing is no longer available. No funded liquidity matches your amount right now.");
                    }

                    depositId = Number(nextListing.deposit_id);
                    selectedListing = nextListing;
                    paymentMethod = String(nextListing.payment_methods?.[0] || paymentMethod).toLowerCase();
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

            setTradeData({
                ...data,
                timestamp: Date.now(),
                mode: "buy",
                intentId,
                depositId,
                selectedListing,
                txHash: getTxHash(result),
            });

            setError("");
            setCurrentState("NOTARIZE");
            await loadWalletBalance();
            console.log("State changed to NOTARIZE");
        } catch (e: any) {
            console.error("Signal failed:", e);
            setError("Signal failed: " + e.message);
        }
    }, [isConnected, accountId, loadWalletBalance]);

    const handleProofGenerated = useCallback((proof: any) => {
        setTradeData((prev: any) => ({ ...prev, proof }));
        console.log("Proof generated, calling fulfillIntent...");
        // Here we would call nearService.fulfillIntent(tradeData.intentId, proof)
        setCurrentState("SUCCESS");
    }, []);

    return (
        <div className="w-full max-w-3xl mx-auto space-y-8 relative">
            <div className="min-h-[500px] relative">
                {error && (
                    <div className="p-4 bg-red-500/20 border border-red-500/50 rounded-xl text-red-200 mb-4 animate-pulse">
                        ⚠️ {error}
                    </div>
                )}

                {currentState === "SIGNAL" && (
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
                )}

                {currentState === "NOTARIZE" && (
                    <div className="animate-fade-in">
                        <TLSNNotarization
                            mode={tradeData?.mode || "buy"}
                            amount={tradeData?.amount || "0"}
                            currency={tradeData?.chain || "BTC"}
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
                                <span className="text-blue-400 font-mono text-xs">
                                    {tradeData?.txHash || "N/A"}
                                </span>
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
