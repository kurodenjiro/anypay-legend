<script lang="ts">
    import { onMount } from "svelte";
    import { nearService } from "$lib/services/near";
    import { fade, slide } from "svelte/transition";

    export let onSignal: (data: any) => void;

    let selectedChain: "BTC" | "ETH" | "ZEC" = "BTC";
    let buyAmount = "";
    let recipientAddress = "";
    let isSignaling = false;
    let error = "";

    const chains = [
        {
            id: "BTC",
            name: "Bitcoin",
            icon: "₿",
            color: "text-orange-500",
            bg: "bg-orange-500/10",
        },
        {
            id: "ETH",
            name: "Ethereum",
            icon: "Ξ",
            color: "text-blue-500",
            bg: "bg-blue-500/10",
        },
        {
            id: "ZEC",
            name: "Zcash",
            icon: "🛡️",
            color: "text-yellow-500",
            bg: "bg-yellow-500/10",
        },
    ];

    async function handleSignalIntent() {
        if (!buyAmount || isNaN(Number(buyAmount))) {
            error = "Invalid amount";
            return;
        }
        if (!recipientAddress) {
            error = "Recipient address required";
            return;
        }
        isSignaling = true;
        error = "";

        try {
            // Ensure connection
            if (!nearService.accountId) {
                await nearService.init();
                if (!nearService.accountId) {
                    await nearService.login();
                    return;
                }
            }

            await nearService.signalIntent(
                selectedChain,
                selectedChain,
                buyAmount,
                recipientAddress,
            );

            onSignal({
                chain: selectedChain,
                asset: selectedChain,
                amount: buyAmount,
                recipient: recipientAddress,
                intentId: "simulated_intent_" + Date.now(),
            });
        } catch (e: any) {
            console.error(e);
            error = "Signal failed: " + e.message;
        } finally {
            isSignaling = false;
        }
    }

    function selectChain(chain: any) {
        selectedChain = chain.id;
    }
</script>

<div class="glass-panel p-6 space-y-6">
    <div class="text-center">
        <h2 class="text-2xl font-bold text-white mb-2">Buy Crypto Privately</h2>
        <p class="text-gray-400 text-sm">Signal your intent to buy assets</p>
    </div>

    <!-- Chain Selector -->
    <div class="grid grid-cols-3 gap-3">
        {#each chains as chain}
            <button
                on:click={() => selectChain(chain)}
                class="flex flex-col items-center justify-center p-4 rounded-xl border transition-all duration-300
                {selectedChain === chain.id
                    ? `border-${chain.color.split('-')[1]}-500/50 ${chain.bg} ring-1 ring-${chain.color.split('-')[1]}-500/50`
                    : 'border-white/5 hover:bg-white/5'}"
            >
                <div class="text-2xl mb-2">{chain.icon}</div>
                <div
                    class="text-xs font-bold {selectedChain === chain.id
                        ? 'text-white'
                        : 'text-gray-500'}"
                >
                    {chain.name}
                </div>
            </button>
        {/each}
    </div>

    {#if error}
        <div
            class="p-3 bg-red-500/20 border border-red-500/50 rounded-lg text-red-200 text-sm"
            transition:slide
        >
            ⚠️ {error}
        </div>
    {/if}

    <!-- Simulation Form -->
    <div class="space-y-4 pt-4 border-t border-white/10">
        <div class="space-y-2">
            <label class="text-xs text-gray-400">Amount to Buy</label>
            <div class="relative">
                <input
                    type="number"
                    bind:value={buyAmount}
                    class="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-blue-500/50 transition-colors"
                    placeholder="0.00"
                />
                <span
                    class="absolute right-4 top-3 text-gray-500 font-bold text-sm"
                    >{selectedChain}</span
                >
            </div>
        </div>

        <div class="space-y-2">
            <label class="text-xs text-gray-400"
                >Recipient Address (on {selectedChain})</label
            >
            <input
                type="text"
                bind:value={recipientAddress}
                class="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-blue-500/50 transition-colors"
                placeholder="Enter your wallet address..."
            />
        </div>

        <button
            on:click={handleSignalIntent}
            disabled={isSignaling || !buyAmount || !recipientAddress}
            class="w-full py-4 rounded-xl font-bold text-white transition-all transform hover:scale-[1.02] active:scale-[0.98]
            {!isSignaling && buyAmount && recipientAddress
                ? 'bg-gradient-to-r from-blue-600 to-purple-600 hover:shadow-lg hover:shadow-blue-500/20'
                : 'bg-gray-700 cursor-not-allowed opacity-50'}"
        >
            {#if isSignaling}
                Processing...
            {:else}
                Signal Intent
            {/if}
        </button>
    </div>
</div>

<style>
    .glass-panel {
        background: rgba(20, 20, 25, 0.7);
        backdrop-filter: blur(20px);
        border: 1px solid rgba(255, 255, 255, 0.05);
        border-radius: 24px;
        box-shadow: 0 20px 40px -10px rgba(0, 0, 0, 0.5);
    }
</style>
