"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { usePrivy } from "@privy-io/react-auth";
import { nearService } from "@/lib/services/near";
import { useNear } from "@/hooks/useNear";

function formatNearBalance(balance: string | null): string {
    if (!balance) return "N/A";

    const value = Number(balance);
    if (!Number.isFinite(value)) return `${balance} NEAR`;
    if (value >= 1) return `${value.toFixed(2)} NEAR`;
    return `${value.toFixed(4)} NEAR`;
}

export default function Navbar() {
    const { login, authenticated, user, logout } = usePrivy();
    const { accountId, isConnected } = useNear();
    const [nearBalance, setNearBalance] = useState<string | null>(null);
    const [isBalanceLoading, setIsBalanceLoading] = useState(false);

    const loadNearBalance = useCallback(async () => {
        if (!authenticated || !isConnected || !accountId) {
            setNearBalance(null);
            setIsBalanceLoading(false);
            return;
        }

        setIsBalanceLoading(true);
        try {
            const { near } = await nearService.getNativeBalance(accountId);
            setNearBalance(near);
        } catch (error) {
            console.error("Navbar: Failed to load NEAR balance", error);
            setNearBalance(null);
        } finally {
            setIsBalanceLoading(false);
        }
    }, [authenticated, isConnected, accountId]);

    useEffect(() => {
        void loadNearBalance();
    }, [loadNearBalance]);

    useEffect(() => {
        if (!authenticated || !isConnected || !accountId) return;
        const interval = setInterval(() => {
            void loadNearBalance();
        }, 15000);
        return () => clearInterval(interval);
    }, [authenticated, isConnected, accountId, loadNearBalance]);

    const handleLogin = async () => {
        if (authenticated) {
            await logout();
            await nearService.logout({ silent: true }); // Also clear NEAR service state
        } else {
            login();
        }
    };

    return (
        <nav className="fixed top-0 left-0 right-0 z-50 bg-black/50 backdrop-blur-xl border-b border-white/10">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                <div className="flex items-center justify-between h-16">
                    <div className="flex items-center gap-8">
                        <Link href="/" className="text-xl font-bold text-white">
                            ZK P2P
                        </Link>
                        <div className="hidden md:flex items-center gap-6">
                            <Link href="/buy" className="text-gray-300 hover:text-white transition-colors">Buy</Link>
                            <Link href="/sell" className="text-gray-300 hover:text-white transition-colors">Sell</Link>
                            <Link href="/dashboard" className="text-gray-300 hover:text-white transition-colors">Dashboard</Link>
                        </div>
                    </div>
                    <div>
                        <div className="flex items-center gap-2">
                            {authenticated && isConnected && (
                                <div className="hidden sm:flex items-center gap-2 px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-xs">
                                    <span className="text-gray-400">Balance</span>
                                    <span className="font-mono text-white">
                                        {isBalanceLoading ? "..." : formatNearBalance(nearBalance)}
                                    </span>
                                </div>
                            )}
                            <button
                                type="button"
                                onClick={handleLogin}
                                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors cursor-pointer z-50 relative flex items-center gap-2"
                            >
                                {authenticated ? (
                                    <>
                                        <span className="w-2 h-2 bg-green-400 rounded-full animate-pulse"></span>
                                        {user?.email?.address || user?.wallet?.address?.slice(0, 6) + "..." || "Connected"}
                                    </>
                                ) : (
                                    "Connect"
                                )}
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </nav>
    );
}
