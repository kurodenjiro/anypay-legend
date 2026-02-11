<script lang="ts">
    import { createEventDispatcher } from "svelte";

    const dispatch = createEventDispatcher();

    // -- Data --
    const chains = [
        { id: "eth", name: "Ethereum", logo: "Ξ" },
        { id: "base", name: "Base", logo: "🔵" },
        { id: "arb", name: "Arbitrum", logo: "🔷" },
        { id: "opt", name: "Optimism", logo: "🔴" },
        { id: "poly", name: "Polygon", logo: "💜" },
        { id: "sol", name: "Solana", logo: "◎" },
    ];

    const tokens = [
        { sym: "USDC", name: "USD Coin", icon: "💲", balance: "0.00" },
        { sym: "USDT", name: "Tether USD", icon: "₮", balance: "0.00" },
        { sym: "ETH", name: "Ether", icon: "Ξ", balance: "0.00" },
        { sym: "WETH", name: "Wrapped Ether", icon: "W", balance: "0.00" },
        { sym: "DAI", name: "Dai Stablecoin", icon: "◈", balance: "0.00" },
    ];

    // -- State --
    let selectedChain = chains[1]; // Base default
    let searchQueryChain = "";
    let searchQueryToken = "";

    function selectChain(c: typeof selectedChain) {
        selectedChain = c;
    }

    function selectToken(t: (typeof tokens)[0]) {
        dispatch("select", { chain: selectedChain, token: t });
    }

    function close() {
        dispatch("close");
    }
</script>

<div
    class="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-md p-4 animate-fade-in"
>
    <div
        class="w-full max-w-2xl bg-[#09090b]/90 backdrop-blur-xl border border-white/10 rounded-3xl shadow-2xl flex flex-col h-[600px] overflow-hidden relative"
    >
        <!-- Grain Texture -->
        <div
            class="absolute inset-0 opacity-[0.03] pointer-events-none bg-[url('/noise.png')]"
        ></div>

        <!-- Header -->
        <div
            class="flex items-center justify-between px-6 py-5 border-b border-white/5 relative z-10"
        >
            <h2 class="text-xl font-bold text-white tracking-tight">
                Select Token & Chain
            </h2>
            <button
                on:click={close}
                class="w-8 h-8 rounded-full flex items-center justify-center bg-white/5 hover:bg-white/10 text-gray-400 hover:text-white transition-all"
            >
                <svg
                    class="w-5 h-5"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                >
                    <path
                        stroke-linecap="round"
                        stroke-linejoin="round"
                        stroke-width="2"
                        d="M6 18L18 6M6 6l12 12"
                    />
                </svg>
            </button>
        </div>

        <div class="flex flex-1 overflow-hidden relative z-10">
            <!-- Left Pane: Chains -->
            <div
                class="w-[35%] border-r border-white/5 flex flex-col bg-black/20"
            >
                <div class="p-4 border-b border-white/5">
                    <div
                        class="bg-white/5 border border-white/5 rounded-xl px-3 py-2.5 flex items-center gap-2 focus-within:border-blue-500/50 focus-within:bg-white/10 transition-all"
                    >
                        <svg
                            class="w-4 h-4 text-gray-400"
                            fill="none"
                            viewBox="0 0 24 24"
                            stroke="currentColor"
                        >
                            <path
                                stroke-linecap="round"
                                stroke-linejoin="round"
                                stroke-width="2"
                                d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                            />
                        </svg>
                        <input
                            bind:value={searchQueryChain}
                            type="text"
                            placeholder="Search chains"
                            class="bg-transparent outline-none text-white text-sm w-full placeholder-gray-500"
                        />
                    </div>
                </div>

                <div
                    class="flex-1 overflow-y-auto p-2 space-y-1 custom-scrollbar"
                >
                    <div
                        class="text-[10px] uppercase font-bold text-gray-500 px-3 py-2 tracking-wider"
                    >
                        Popular Chains
                    </div>
                    {#each chains as c}
                        <button
                            on:click={() => selectChain(c)}
                            class="w-full flex items-center gap-3 px-3 py-3 rounded-xl text-left transition-all duration-200 group {selectedChain.id ===
                            c.id
                                ? 'bg-blue-600/20 border border-blue-500/30'
                                : 'hover:bg-white/5 border border-transparent'}"
                        >
                            <span
                                class="text-xl filter drop-shadow-md group-hover:scale-110 transition-transform"
                                >{c.logo}</span
                            >
                            <span
                                class="font-bold text-white text-sm group-hover:text-blue-400 transition-colors"
                                >{c.name}</span
                            >
                            {#if selectedChain.id === c.id}
                                <div
                                    class="ml-auto w-1.5 h-1.5 rounded-full bg-blue-500 shadow-[0_0_8px_rgba(59,130,246,0.8)]"
                                ></div>
                            {/if}
                        </button>
                    {/each}
                </div>
            </div>

            <!-- Right Pane: Tokens -->
            <div class="flex-1 flex flex-col bg-transparent">
                <div class="p-4 border-b border-white/5">
                    <div
                        class="bg-white/5 border border-white/5 rounded-xl px-3 py-2.5 flex items-center gap-2 focus-within:border-purple-500/50 focus-within:bg-white/10 transition-all"
                    >
                        <svg
                            class="w-4 h-4 text-gray-400"
                            fill="none"
                            viewBox="0 0 24 24"
                            stroke="currentColor"
                        >
                            <path
                                stroke-linecap="round"
                                stroke-linejoin="round"
                                stroke-width="2"
                                d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                            />
                        </svg>
                        <input
                            bind:value={searchQueryToken}
                            type="text"
                            placeholder="Search token..."
                            class="bg-transparent outline-none text-white text-sm w-full placeholder-gray-500"
                        />
                    </div>
                </div>

                <div
                    class="flex-1 overflow-y-auto p-3 space-y-1 custom-scrollbar"
                >
                    <div
                        class="flex justify-between items-center px-4 py-2 text-[10px] uppercase font-bold text-gray-500 tracking-wider"
                    >
                        <span>Tokens on {selectedChain.name}</span>
                    </div>

                    {#each tokens as t}
                        <button
                            on:click={() => selectToken(t)}
                            class="w-full flex items-center justify-between px-4 py-3 rounded-xl border border-transparent hover:bg-white/5 hover:border-white/5 transition-all duration-200 group"
                        >
                            <div class="flex items-center gap-4">
                                <div
                                    class="w-10 h-10 rounded-full bg-[#1A1A1A] border border-white/10 flex items-center justify-center text-lg shadow-lg group-hover:scale-110 transition-transform"
                                >
                                    {t.icon}
                                </div>
                                <div class="text-left">
                                    <div
                                        class="font-bold text-white text-base group-hover:text-purple-400 transition-colors"
                                    >
                                        {t.sym}
                                    </div>
                                    <div class="text-[11px] text-gray-500">
                                        {t.name}
                                    </div>
                                </div>
                            </div>
                            <div class="text-right">
                                <div
                                    class="font-mono font-medium text-white text-sm"
                                >
                                    {t.balance}
                                </div>
                            </div>
                        </button>
                    {/each}
                </div>
            </div>
        </div>
    </div>
</div>
