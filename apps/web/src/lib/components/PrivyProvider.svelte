<script lang="ts">
    import { onMount } from "svelte";
    import { createRoot } from "react-dom/client";
    import React from "react";
    import { PrivyProvider } from "@privy-io/react-auth";
    import { PrivyBridge } from "../auth/PrivyBridge";
    import { CONTRACTS } from "$lib/contracts";

    // Safely access env
    const appId = import.meta.env.VITE_PRIVY_APP_ID;

    let container: HTMLDivElement;

    onMount(() => {
        if (!container) return;
        const root = createRoot(container);
        root.render(
            React.createElement(PrivyProvider, {
                appId: appId || "insert-app-id",
                config: {
                    loginMethods: ["email", "wallet"],
                    appearance: {
                        theme: "dark",
                        accentColor: "#676FFF",
                        showWalletLoginFirst: true,
                    },
                    defaultChain: {
                        id: CONTRACTS.BASE_SEPOLIA.CHAIN_ID,
                        name: "Base Sepolia",
                        network: "base-sepolia",
                        nativeCurrency: {
                            name: "Ether",
                            symbol: "ETH",
                            decimals: 18,
                        },
                        rpcUrls: {
                            default: {
                                http: [CONTRACTS.BASE_SEPOLIA.RPC_URL],
                            },
                        },
                        blockExplorers: {
                            default: {
                                name: "Basescan",
                                url: "https://sepolia.basescan.org",
                            },
                        },
                    },
                    supportedChains: [
                        {
                            id: CONTRACTS.BASE_SEPOLIA.CHAIN_ID,
                            name: "Base Sepolia",
                            network: "base-sepolia",
                            nativeCurrency: {
                                name: "Ether",
                                symbol: "ETH",
                                decimals: 18,
                            },
                            rpcUrls: {
                                default: {
                                    http: [CONTRACTS.BASE_SEPOLIA.RPC_URL],
                                },
                            },
                            blockExplorers: {
                                default: {
                                    name: "Basescan",
                                    url: "https://sepolia.basescan.org",
                                },
                            },
                        },
                    ],
                },
                children: React.createElement(PrivyBridge),
            }),
        );

        return () => root.unmount();
    });
</script>

<div bind:this={container} class="hidden" style="display: none;"></div>
