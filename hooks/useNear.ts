"use client";

import { useCallback, useEffect, useState } from "react";
import { usePrivy } from "@privy-io/react-auth";
import { nearService, subscribeToNearState, type NearState } from "@/lib/services/near";

export function useNear() {
    const { ready, authenticated, login, logout } = usePrivy();
    const [state, setState] = useState<NearState>({
        accountId: nearService.accountId,
        isConnected: !!nearService.accountId,
        isLoading: false,
    });
    const [isSyncing, setIsSyncing] = useState(false);

    useEffect(() => {
        // Subscribe to state changes
        const unsubscribe = subscribeToNearState((newState) => {
            setState(newState);
            if (newState.isConnected) {
                setIsSyncing(false);
            }
        });

        // Initial sync
        setState({
            accountId: nearService.accountId,
            isConnected: !!nearService.accountId,
            isLoading: false,
        });

        return () => unsubscribe();
    }, []);

    const connect = useCallback(async () => {
        if (!ready) return;

        if (!authenticated) {
            await login();
            return;
        }

        if (nearService.accountId) return;

        setIsSyncing(true);
        try {
            // Ask the Privy connector to sync now, then wait briefly for wallet hydration.
            const forceSync = window.syncPrivyNearConnection;
            if (typeof forceSync === "function") {
                await forceSync();
            }

            for (let i = 0; i < 8; i++) {
                if (nearService.accountId) return;
                await new Promise((resolve) => setTimeout(resolve, 250));
            }

            // Fallback: allow users to connect via wallet-selector modal.
            await nearService.init();
            if (!nearService.accountId) {
                await nearService.login();
            }
        } finally {
            setIsSyncing(false);
        }
    }, [ready, authenticated, login]);

    const disconnect = useCallback(async () => {
        setIsSyncing(true);
        try {
            await logout();
        } finally {
            await nearService.logout({ silent: true });
            setIsSyncing(false);
        }
    }, [logout]);

    return {
        ...state,
        ready,
        authenticated,
        isLoading: state.isLoading || !ready || isSyncing,
        connect,
        disconnect,
    };
}
