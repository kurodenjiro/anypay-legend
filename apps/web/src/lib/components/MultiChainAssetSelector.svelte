<script lang="ts">
    import { createEventDispatcher } from "svelte";

    // --- State ---
    // Step 1: Asset Selection, Step 2: Chain Selection
    let step = 1;
    let selectedAsset: any = null;
    let selectedChain: any = null;
    let searchQuery = "";

    type AssetType = "Stablecoin" | "Native" | "Wrapped";

    interface Chain {
        id: string;
        name: string;
        type: "L1" | "L2";
    }

    interface Asset {
        ticker: string;
        name: string;
        type: AssetType;
        chains: Chain[];
        logoVal?: string; // Placeholder for logo text/icon
    }

    // Mock Data
    const allAssets: Asset[] = [
        {
            ticker: "USDT",
            name: "Tether USD",
            type: "Stablecoin",
            logoVal: "T",
            chains: [
                { id: "eth", name: "Ethereum", type: "L1" },
                { id: "base", name: "Base", type: "L2" },
                { id: "arb", name: "Arbitrum", type: "L2" },
            ],
        },
        {
            ticker: "USDC",
            name: "USD Coin",
            type: "Stablecoin",
            logoVal: "C",
            chains: [
                { id: "eth", name: "Ethereum", type: "L1" },
                { id: "base", name: "Base", type: "L2" },
                { id: "sol", name: "Solana", type: "L1" },
            ],
        },
        {
            ticker: "ETH",
            name: "Ethereum",
            type: "Native",
            logoVal: "Ξ",
            chains: [
                { id: "eth", name: "Ethereum", type: "L1" },
                { id: "base", name: "Base", type: "L2" },
            ],
        },
        {
            ticker: "WBTC",
            name: "Wrapped BTC",
            type: "Wrapped",
            logoVal: "₿",
            chains: [{ id: "eth", name: "Ethereum", type: "L1" }],
        },
        {
            ticker: "NEAR",
            name: "NEAR Protocol",
            type: "Native",
            logoVal: "N",
            chains: [{ id: "near", name: "NEAR", type: "L1" }],
        },
    ];

    let filterType: AssetType | "All" = "All";

    // Derived
    $: filteredAssets = allAssets.filter((a) => {
        const matchesSearch =
            a.ticker.toLowerCase().includes(searchQuery.toLowerCase()) ||
            a.name.toLowerCase().includes(searchQuery.toLowerCase());
        const matchesType = filterType === "All" || a.type === filterType;
        return matchesSearch && matchesType;
    });

    const dispatch = createEventDispatcher();

    function selectAsset(asset: Asset) {
        selectedAsset = asset;
        step = 2;
    }

    function selectChain(chain: Chain) {
        selectedChain = chain;
        dispatch("select", { asset: selectedAsset, chain: selectedChain });
        // Reset or close? Usually handled by parent closing modal or similar.
    }

    function back() {
        step = 1;
        selectedAsset = null;
    }
</script>

<div
    class="w-full bg-[#0A0A0A] border border-[#222] rounded-2xl overflow-hidden flex flex-col max-h-[500px]"
>
    <!-- Step 1: Select Asset -->
    {#if step === 1}
        <div class="p-4 border-b border-[#222] space-y-3">
            <h3
                class="text-sm font-bold text-gray-400 uppercase tracking-widest"
            >
                Select Asset
            </h3>

            <!-- Search -->
            <div
                class="bg-[#111] border border-[#222] rounded-xl px-3 py-2 flex items-center gap-2 focus-within:border-blue-500/50 transition-colors"
            >
                <svg
                    class="w-4 h-4 text-gray-500"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    ><path
                        stroke-linecap="round"
                        stroke-linejoin="round"
                        stroke-width="2"
                        d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                    /></svg
                >
                <input
                    bind:value={searchQuery}
                    type="text"
                    placeholder="Search ticker..."
                    class="bg-transparent outline-none text-white text-sm w-full placeholder-gray-600"
                />
            </div>

            <!-- Filters -->
            <div class="flex gap-2 overflow-x-auto pb-1 no-scrollbar">
                {#each ["All", "Stablecoin", "Native", "Wrapped"] as type}
                    <button
                        on:click={() => (filterType = type as any)}
                        class="text-[10px] uppercase font-bold px-3 py-1 rounded-full border transition-all whitespace-nowrap
                        {filterType === type
                            ? 'bg-white text-black border-white'
                            : 'bg-[#111] text-gray-500 border-[#222] hover:bg-[#1A1A1A] hover:text-gray-300'}"
                    >
                        {type}
                    </button>
                {/each}
            </div>
        </div>

        <div class="overflow-y-auto p-2 grid grid-cols-1 gap-1">
            {#each filteredAssets as asset}
                <button
                    on:click={() => selectAsset(asset)}
                    class="flex items-center gap-3 p-3 rounded-xl hover:bg-[#111] transition-colors group text-left w-full"
                >
                    <!-- Logo mock -->
                    <div
                        class="w-10 h-10 rounded-full bg-[#1A1A1A] flex items-center justify-center text-lg font-bold text-white group-hover:bg-[#222] border border-[#222]"
                    >
                        {asset.logoVal}
                    </div>

                    <div class="flex-1">
                        <div class="flex items-center gap-2">
                            <span class="font-bold text-white"
                                >{asset.ticker}</span
                            >
                            <span
                                class="text-[10px] px-1.5 rounded bg-[#1A1A1A] text-gray-400 border border-[#222]"
                                >{asset.type}</span
                            >
                        </div>
                        <span class="text-xs text-gray-500">{asset.name}</span>
                    </div>

                    <div
                        class="text-xs text-gray-600 group-hover:text-blue-400 transition-colors"
                    >
                        {asset.chains.length} chains
                    </div>
                </button>
            {/each}
        </div>

        <!-- Step 2: Select Chain -->
    {:else}
        <div class="p-4 border-b border-[#222] flex items-center gap-3">
            <button
                on:click={back}
                class="p-1 -ml-1 hover:bg-[#1A1A1A] rounded-lg text-gray-400 hover:text-white transition-colors"
            >
                <svg
                    class="w-5 h-5"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    ><path
                        stroke-linecap="round"
                        stroke-linejoin="round"
                        stroke-width="2"
                        d="M15 19l-7-7 7-7"
                    /></svg
                >
            </button>
            <div class="flex items-center gap-2">
                <div
                    class="w-6 h-6 rounded-full bg-[#222] flex items-center justify-center text-xs font-bold text-white border border-[#333]"
                >
                    {selectedAsset.logoVal}
                </div>
                <h3 class="text-sm font-bold text-white">
                    Select Chain for {selectedAsset.ticker}
                </h3>
            </div>
        </div>

        <div class="overflow-y-auto p-2 space-y-1">
            {#each selectedAsset.chains as chain}
                <button
                    on:click={() => selectChain(chain)}
                    class="flex items-center justify-between w-full p-3 rounded-xl hover:bg-[#111] transition-colors group"
                >
                    <div class="flex items-center gap-3">
                        <div
                            class="w-8 h-8 rounded-full bg-[#1A1A1A] border border-[#222] flex items-center justify-center text-xs"
                        >
                            {chain.name[0]}
                        </div>
                        <span class="font-bold text-gray-200">{chain.name}</span
                        >
                    </div>
                    <span
                        class="text-[10px] px-2 py-0.5 rounded bg-[#1A1A1A] text-gray-500 border border-[#222]"
                        >{chain.type}</span
                    >
                </button>
            {/each}
        </div>
    {/if}
</div>
