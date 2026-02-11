import { writable } from 'svelte/store';
import { createWalletClient, custom, type WalletClient } from 'viem';
import { base, baseSepolia } from 'viem/chains';

function createWalletStore() {
    const { subscribe, set, update } = writable({
        ready: false,
        authenticated: false,
        user: null as any,
        address: null as string | null,
        chainId: null as number | null,
        wallets: [] as any[],
        // Injected by Privy
        login: undefined as (() => void) | undefined,
        logout: undefined as (() => void) | undefined,
        createWallet: undefined as (() => void) | undefined,
    });

    let client: WalletClient | null = null;

    // Initialize on client side
    if (typeof window !== 'undefined' && (window as any).ethereum) {
        client = createWalletClient({
            chain: baseSepolia,
            transport: custom((window as any).ethereum)
        });

        // Auto-connect if already authorized
        client.requestAddresses().then((addresses) => {
            if (addresses.length > 0) {
                update(s => ({
                    ...s,
                    ready: true,
                    authenticated: true,
                    address: addresses[0],
                    user: { wallet: { address: addresses[0] } } // Compat
                }));
            }
        }).catch(() => {
            update(s => ({ ...s, ready: true }));
        });

        // Listen for account changes
        (window as any).ethereum.on('accountsChanged', (accounts: string[]) => {
            if (accounts.length > 0) {
                update(s => ({
                    ...s,
                    authenticated: true,
                    address: accounts[0],
                    user: { wallet: { address: accounts[0] } }
                }));
            } else {
                update(s => ({ ...s, authenticated: false, address: null, user: null }));
            }
        });
    }

    return {
        subscribe,
        set,
        update,
        login: async () => {
            if (!client) {
                if (typeof window !== 'undefined') alert("Please install a wallet like Rabby or MetaMask");
                return;
            }
            try {
                const [address] = await client.requestAddresses();
                const chainId = await client.getChainId();

                update(s => ({
                    ...s,
                    authenticated: true,
                    address,
                    chainId,
                    user: { wallet: { address } },
                    ready: true
                }));
            } catch (e) {
                console.error("Connection failed:", e);
            }
        },
        logout: () => {
            update(s => ({ ...s, authenticated: false, user: null, address: null }));
        },
        createWallet: () => { },
        signMessage: async (message: string) => {
            if (!client) throw new Error("No wallet");
            const [account] = await client.getAddresses();
            return client.signMessage({ account, message });
        }
    };
}

export const walletStore = createWalletStore();
