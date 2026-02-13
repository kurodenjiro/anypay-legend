"use client";

import { useEffect, useRef } from "react";
import { usePrivy, useWallets, type User } from "@privy-io/react-auth";
import { useCreateWallet, useSignRawHash } from "@privy-io/react-auth/extended-chains";
import { nearService } from "@/lib/services/near";
import { PrivyNearWallet } from "@/lib/services/privy-wallet";

type NearWalletLike = {
    address: string;
    publicKey?: string;
};

declare global {
    interface Window {
        checkPrivyNearConnection?: () => void;
        syncPrivyNearConnection?: () => Promise<void>;
        _debug_privy_wallet?: PrivyNearWallet;
    }
}

function isNearAccountId(address: string): boolean {
    const trimmed = address.trim().toLowerCase();
    if (!trimmed) return false;

    // Named accounts and implicit accounts are both valid on NEAR.
    return (
        trimmed.endsWith(".near")
        || trimmed.endsWith(".testnet")
        || /^[0-9a-f]{64}$/.test(trimmed)
    );
}

function normalizeNearWallet(candidate: unknown): NearWalletLike | null {
    if (!candidate || typeof candidate !== "object") return null;

    const value = candidate as Record<string, unknown>;
    const address =
        typeof value.address === "string"
            ? value.address
            : typeof value.accountId === "string"
                ? value.accountId
                : null;

    if (!address) return null;

    const chainType =
        typeof value.chainType === "string"
            ? value.chainType
            : typeof value.chain_type === "string"
                ? value.chain_type
                : typeof value.chain === "string"
                    ? value.chain
                : null;

    // Some Privy objects do not expose chainType; infer NEAR from account format.
    if (chainType && chainType !== "near") return null;
    if (!chainType && !isNearAccountId(address)) return null;

    const publicKey =
        typeof value.publicKey === "string"
            ? value.publicKey
            : typeof value.public_key === "string"
                ? value.public_key
                : undefined;

    return { address, publicKey };
}

function getNearWalletFromLinkedAccounts(user: User | null): NearWalletLike | null {
    const linkedAccounts = user?.linkedAccounts ?? [];
    for (const account of linkedAccounts) {
        const nearWallet = normalizeNearWallet(account);
        if (nearWallet) return nearWallet;
    }
    return null;
}

function getNearWalletFromWallets(wallets: readonly unknown[]): NearWalletLike | null {
    for (const wallet of wallets) {
        const nearWallet = normalizeNearWallet(wallet);
        if (nearWallet) return nearWallet;
    }
    return null;
}

/**
 * Watches Privy auth state and keeps the NEAR service in sync with
 * a Privy-managed NEAR wallet (creating one if missing).
 */
export function PrivyNearConnector() {
    const { ready, authenticated, user } = usePrivy();
    const { wallets } = useWallets();
    const { createWallet } = useCreateWallet();
    const { signRawHash } = useSignRawHash();
    const syncingRef = useRef(false);
    const lastBoundSignRawHashRef = useRef<unknown>(null);

    // Handy global debugger for quick inspection in the browser console
    useEffect(() => {
        window.checkPrivyNearConnection = () => {
            console.log("=== PRIVY / NEAR DEBUG ===");
            console.log("Privy ready:", ready);
            console.log("Authenticated:", authenticated);
            console.log("User:", user);
            console.log("Wallets:", wallets);
            console.log("NearService account:", nearService.accountId);
            console.log("NearService wallet type:", nearService.wallet?.type);
            console.log("==========================");
        };
    }, [ready, authenticated, user, wallets]);

    useEffect(() => {
        if (!ready) return;

        if (!authenticated) {
            syncingRef.current = false;
            lastBoundSignRawHashRef.current = null;
            delete window.syncPrivyNearConnection;
            nearService.logout({ silent: true });
            return;
        }

        const syncPrivyWallet = async () => {
            if (syncingRef.current) return;
            syncingRef.current = true;

            try {
                // Extended-chain wallets are not always included by useWallets().
                let nearWallet: NearWalletLike | null =
                    getNearWalletFromWallets(wallets as unknown[]) ??
                    getNearWalletFromLinkedAccounts(user);

                if (!nearWallet) {
                    // Retry a few times because wallet provisioning can be eventual.
                    for (let attempt = 1; attempt <= 3 && !nearWallet; attempt++) {
                        try {
                            const created = await createWallet({ chainType: "near" });
                            nearWallet = normalizeNearWallet(created.wallet);
                        } catch (error) {
                            console.warn("PrivyNearConnector: createWallet attempt failed", { attempt, error });
                        }

                        if (!nearWallet) {
                            nearWallet =
                                getNearWalletFromWallets(wallets as unknown[]) ??
                                getNearWalletFromLinkedAccounts(user);
                        }

                        if (!nearWallet && attempt < 3) {
                            await new Promise((resolve) => setTimeout(resolve, 700));
                        }
                    }
                }

                if (!nearWallet) {
                    console.warn("PrivyNearConnector: no NEAR wallet found after sync attempts");
                    return;
                }

                // Avoid re-wrapping the same wallet
                if (
                    nearService.accountId === nearWallet.address
                    && nearService.wallet instanceof PrivyNearWallet
                    && lastBoundSignRawHashRef.current === signRawHash
                ) {
                    return;
                }

                const adapter = new PrivyNearWallet(nearWallet.address, signRawHash, nearWallet.publicKey);

                await nearService.setWallet(adapter, nearWallet.address);
                lastBoundSignRawHashRef.current = signRawHash;
                void adapter.warmupWalletProxy();

                window._debug_privy_wallet = adapter;
            } catch (err) {
                console.error("PrivyNearConnector: failed to sync NEAR wallet", err);
            } finally {
                syncingRef.current = false;
            }
        };

        window.syncPrivyNearConnection = syncPrivyWallet;
        syncPrivyWallet();
    }, [ready, authenticated, user, wallets, createWallet, signRawHash]);

    return null;
}
