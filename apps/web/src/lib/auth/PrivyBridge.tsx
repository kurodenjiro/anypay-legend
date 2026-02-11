import React, { useEffect } from 'react';
import { usePrivy, useWallets } from '@privy-io/react-auth';
import { walletStore } from '../stores/wallet';

export const PrivyBridge = () => {
    const { ready, authenticated, user, login, logout, createWallet } = usePrivy();
    const { wallets } = useWallets();

    useEffect(() => {
        walletStore.update(s => ({
            ...s,
            ready,
            authenticated,
            user,
            login,
            logout,
            createWallet,
            wallets
        }));
    }, [ready, authenticated, user, wallets, login, logout, createWallet]);

    return null;
}
