<script lang="ts">
    import MultiChainAssetSelector from "./MultiChainAssetSelector.svelte";
    import { createEventDispatcher } from "svelte";

    // Form Stats
    let direction: "fiat_to_crypto" | "crypto_to_fiat" = "fiat_to_crypto";
    let amount = "";
    let counterparty = "";

    // Asset State
    let selectedAsset: any = null;
    let selectedChain: any = null;
    let showAssetSelector = false;

    const dispatch = createEventDispatcher();

    function handleAssetSelect(e: CustomEvent) {
        selectedAsset = e.detail.asset;
        selectedChain = e.detail.chain;
        showAssetSelector = false;
    }

    function handleLock() {
        if (!amount || !selectedAsset || !counterparty) return;
        dispatch("next");
    }
</script>

<div class="space-y-6 w-full max-w-xl mx-auto">
    <!-- Direction Toggle -->
    <div
        class="grid grid-cols-2 gap-2 p-1 bg-[#111] rounded-2xl border border-[#222]"
    >
        <button
            on:click={() => (direction = "fiat_to_crypto")}
            class="py-3 text-sm font-bold rounded-xl transition-all {direction ===
            'fiat_to_crypto'
                ? 'bg-[#222] text-white shadow-lg'
                : 'text-gray-500 hover:text-gray-300'}"
        >
            I Paid Fiat
        </button>
        <button
            on:click={() => (direction = "crypto_to_fiat")}
            class="py-3 text-sm font-bold rounded-xl transition-all {direction ===
            'crypto_to_fiat'
                ? 'bg-[#222] text-white shadow-lg'
                : 'text-gray-500 hover:text-gray-300'}"
        >
            I Sent Crypto
        </button>
    </div>

    <div class="glass-panel p-6 space-y-6">
        <!-- Amount Input -->
        <div>
            <label
                class="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2 block"
                >Amount</label
            >
            <div
                class="bg-[#050505] border border-[#222] rounded-2xl p-4 flex items-center gap-4 focus-within:border-blue-500/50 transition-colors"
            >
                <input
                    bind:value={amount}
                    type="number"
                    placeholder="0.00"
                    class="bg-transparent text-2xl font-bold text-white w-full outline-none placeholder-gray-700"
                />
                <span class="text-gray-500 font-bold">USD</span>
            </div>
        </div>

        <!-- Asset Selector -->
        <div>
            <label
                class="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2 block"
                >Receiving Asset</label
            >
            {#if !selectedAsset}
                <button
                    on:click={() => (showAssetSelector = !showAssetSelector)}
                    class="w-full bg-[#050505] border border-[#222] border-dashed rounded-2xl p-4 text-gray-500 hover:text-white hover:border-blue-500/50 transition-all flex items-center justify-center gap-2"
                >
                    <span>+ Select Asset & Chain</span>
                </button>
            {:else}
                <button
                    on:click={() => (showAssetSelector = !showAssetSelector)}
                    class="w-full bg-[#050505] border border-[#222] rounded-2xl p-3 flex items-center justify-between hover:border-[#333] transition-colors"
                >
                    <div class="flex items-center gap-3">
                        <div
                            class="w-10 h-10 rounded-full bg-[#222] flex items-center justify-center text-lg"
                        >
                            {selectedAsset.logoVal}
                        </div>
                        <div class="text-left">
                            <div class="font-bold text-white">
                                {selectedAsset.ticker}
                            </div>
                            <div class="text-xs text-gray-500">
                                on {selectedChain.name}
                            </div>
                        </div>
                    </div>
                    <span class="text-xs text-blue-500 font-bold">Change</span>
                </button>
            {/if}

            {#if showAssetSelector}
                <div class="mt-4 animate-fade-in-up">
                    <MultiChainAssetSelector on:select={handleAssetSelect} />
                </div>
            {/if}
        </div>

        <!-- Counterparty -->
        <div>
            <label
                class="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2 block"
                >Counterparty Address</label
            >
            <input
                bind:value={counterparty}
                type="text"
                placeholder="0x..."
                class="input-dark text-base"
            />
        </div>

        <!-- Submit -->
        <button
            on:click={handleLock}
            disabled={!amount || !selectedAsset}
            class="w-full btn-primary py-4 text-lg"
        >
            Lock Funds & Await Proof
        </button>

        <p class="text-[10px] text-center text-gray-600">
            Funds are held in a smart contract and only released upon valid ZK
            proof verification.
        </p>
    </div>
</div>
