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

    const navLinks = [
        { href: "/buy", label: "Buy" },
        { href: "/sell", label: "Sell" },
        { href: "/dashboard", label: "Dashboard" },
    ];

    return (
        <nav className="fixed top-3 left-0 right-0 z-50">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                <div className="h-16 rounded-2xl border border-slate-300/20 bg-slate-950/70 backdrop-blur-xl shadow-[0_24px_60px_-34px_rgba(8,47,73,0.95)] px-4 sm:px-5">
                    <div className="flex items-center justify-between h-full">
                        <div className="flex items-center gap-8 min-w-0">
                            <Link href="/" className="flex items-center gap-2.5 min-w-0">
                                <span className="h-8 w-8 rounded-xl bg-gradient-to-br from-cyan-400/80 to-emerald-400/80 text-slate-950 text-xs font-black grid place-items-center shadow-lg shadow-cyan-500/30">
                                    AL
                                </span>
                                <span className="brand-display text-lg font-bold text-white truncate">
                                    Anypay Legend
                                </span>
                            </Link>
                            <div className="hidden md:flex items-center gap-1 rounded-xl border border-slate-400/20 bg-slate-900/55 p-1">
                                {navLinks.map((link) => (
                                    <Link
                                        key={link.href}
                                        href={link.href}
                                        className="px-3 py-1.5 text-sm text-slate-300 hover:text-white hover:bg-white/10 rounded-lg transition-colors"
                                    >
                                        {link.label}
                                    </Link>
                                ))}
                            </div>
                        </div>
                        <div className="flex items-center gap-2">
                            {authenticated && isConnected && (
                                <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs border border-cyan-300/25 bg-cyan-500/10">
                                    <span className="text-cyan-100/70">Balance</span>
                                    <span className="font-mono text-white">
                                        {isBalanceLoading ? "..." : formatNearBalance(nearBalance)}
                                    </span>
                                </div>
                            )}
                            <button
                                type="button"
                                onClick={handleLogin}
                                className="px-4 py-2 rounded-xl border border-cyan-300/30 bg-gradient-to-r from-cyan-600/90 to-teal-600/90 hover:from-cyan-500 hover:to-teal-500 text-white text-sm font-semibold transition-all cursor-pointer z-50 relative flex items-center gap-2 shadow-lg shadow-cyan-900/40"
                            >
                                {authenticated ? (
                                    <>
                                        <span className="w-2 h-2 bg-emerald-300 rounded-full animate-pulse" />
                                        {user?.email?.address || user?.wallet?.address?.slice(0, 6) + "..." || "Connected"}
                                    </>
                                ) : (
                                    "Connect Wallet"
                                )}
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </nav>
    );
}
