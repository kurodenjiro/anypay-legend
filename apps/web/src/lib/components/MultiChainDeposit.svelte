<script lang="ts">
    import { onMount } from "svelte";
    import { nearService } from "$lib/services/near";
    import { fade, slide } from "svelte/transition";

    export let onDeposit: (data: any) => void;

    let selectedChain: "BTC" | "ETH" | "ZEC" = "BTC";
    let mpcAddress = "";
    let isLoadingAddress = false;
    let depositAmount = "";
    let isDepositing = false;
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

    async function loadAddress(chain: "BTC" | "ETH" | "ZEC") {
        isLoadingAddress = true;
        error = "";
        mpcAddress = "";
        try {
            // Ensure we are connected
            if (!nearService.accountId) {
                await nearService.init();
                if (!nearService.accountId) {
                    await nearService.login();
                    return; // Will reload on login
                }
            }

            // Derive address (path 0 for default)
            mpcAddress = await nearService.deriveAddress(
                chain === "ZEC" ? "BTC" : chain,
                chain.toLowerCase() + "-0",
            );
        } catch (e: any) {
            console.error(e);
            error = e.message;
        } finally {
            isLoadingAddress = false;
        }
    }

    // Auto-load initial address
    onMount(() => {
        loadAddress(selectedChain);
    });

    async function handleSimulateDeposit() {
        if (!depositAmount || isNaN(Number(depositAmount))) {
            error = "Invalid amount";
            return;
        }
        isDepositing = true;
        error = "";

        try {
            await nearService.deposit(
                selectedChain,
                selectedChain,
                depositAmount,
            );
            // Notify parent to move to next step
            onDeposit({
                chain: selectedChain,
                asset: selectedChain,
                amount: depositAmount,
                txHash: "simulated_tx_hash_" + Date.now(),
            });
        } catch (e: any) {
            console.error(e);
            error = "Deposit failed: " + e.message;
        } finally {
            isDepositing = false;
        }
    }

    function selectChain(chain: any) {
        selectedChain = chain.id;
        loadAddress(selectedChain);
    }
</script>

<div class="glass-panel p-6 space-y-6">
    <div class="text-center">
        <h2 class="text-2xl font-bold text-white mb-2">Multi-Chain Deposit</h2>
        <p class="text-gray-400 text-sm">
            Send assets to your unique MPC Vault
        </p>
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

    <!-- Address Display -->
    <div
        class="bg-black/40 rounded-xl p-4 border border-white/5 space-y-2 relative overflow-hidden group"
    >
        <div class="flex justify-between items-center">
            <span class="text-xs text-gray-500 uppercase tracking-wider"
                >Your Vault Address</span
            >
            {#if isLoadingAddress}
                <div
                    class="w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin"
                ></div>
            {/if}
        </div>

        {#if mpcAddress}
            <div
                class="font-mono text-sm break-all text-white/90 select-all"
                transition:fade
            >
                {mpcAddress}
            </div>
            <div
                class="absolute inset-0 bg-blue-500/5 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none"
            ></div>
        {:else if !isLoadingAddress}
            <div class="text-gray-500 text-sm italic">
                Connect wallet to view address
            </div>
        {/if}
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
            <label class="text-xs text-gray-400">Amount to Deposit</label>
            <div class="relative">
                <input
                    type="number"
                    bind:value={depositAmount}
                    class="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-blue-500/50 transition-colors"
                    placeholder="0.00"
                />
                <span
                    class="absolute right-4 top-3 text-gray-500 font-bold text-sm"
                    >{selectedChain}</span
                >
            </div>
        </div>

        <button
            on:click={handleSimulateDeposit}
            disabled={isDepositing || !mpcAddress || !depositAmount}
            class="w-full py-4 rounded-xl font-bold text-white transition-all transform hover:scale-[1.02] active:scale-[0.98]
            {!isDepositing && mpcAddress && depositAmount
                ? 'bg-gradient-to-r from-blue-600 to-purple-600 hover:shadow-lg hover:shadow-blue-500/20'
                : 'bg-gray-700 cursor-not-allowed opacity-50'}"
        >
            {#if isDepositing}
                Processing...
            {:else}
                Simulate Deposit
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
