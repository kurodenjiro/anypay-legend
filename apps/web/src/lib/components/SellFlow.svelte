<script lang="ts">
    import MultiChainDeposit from "./MultiChainDeposit.svelte";
    import { onMount } from "svelte";

    // State Machine
    type TradeState = "DEPOSIT" | "SUCCESS";
    let currentState: TradeState = "DEPOSIT";
    let tradeData: any = null;

    onMount(() => {
        // Any initialization
    });

    function handleDeposit(data: any) {
        tradeData = {
            ...data,
            timestamp: Date.now(),
            mode: "sell",
        };
        currentState = "SUCCESS";
    }
</script>

<div class="w-full max-w-3xl mx-auto space-y-8 relative">
    <div class="min-h-[500px] relative">
        {#if currentState === "DEPOSIT"}
            <MultiChainDeposit onDeposit={handleDeposit} />
        {:else if currentState === "SUCCESS"}
            <!-- Success State -->
            <div class="glass-panel p-8 text-center animate-fade-in space-y-6">
                <div
                    class="w-20 h-20 bg-green-500/20 rounded-full flex items-center justify-center mx-auto mb-6"
                >
                    <svg
                        class="w-10 h-10 text-green-500"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                    >
                        <path
                            stroke-linecap="round"
                            stroke-linejoin="round"
                            stroke-width="2"
                            d="M5 13l4 4L19 7"
                        />
                    </svg>
                </div>

                <h3 class="text-3xl font-bold text-white">
                    Deposit Successful!
                </h3>
                <p class="text-gray-400 max-w-md mx-auto">
                    Your {tradeData.chain} assets are now in the MPC Vault.
                    <br />
                    Buyers can now match your order.
                </p>

                <div
                    class="bg-white/5 rounded-xl p-4 border border-white/10 max-w-md mx-auto text-left space-y-2"
                >
                    <div class="flex justify-between">
                        <span class="text-gray-400">Amount</span>
                        <span class="text-white font-mono"
                            >{tradeData.amount} {tradeData.asset}</span
                        >
                    </div>
                    <div class="flex justify-between">
                        <span class="text-gray-400">Transaction</span>
                        <span class="text-blue-400 text-xs truncate w-32"
                            >{tradeData.txHash}</span
                        >
                    </div>
                </div>

                <button
                    on:click={() => (currentState = "DEPOSIT")}
                    class="px-8 py-3 bg-white/10 hover:bg-white/20 text-white rounded-xl transition-all"
                >
                    Create Another Deposit
                </button>
            </div>
        {/if}
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
    .animate-fade-in {
        animation: fadeIn 0.5s ease-out forwards;
    }
    @keyframes fadeIn {
        from {
            opacity: 0;
            transform: translateY(10px);
        }
        to {
            opacity: 1;
            transform: translateY(0);
        }
    }
</style>
