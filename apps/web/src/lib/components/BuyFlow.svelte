<script lang="ts">
    import MultiChainBuy from "./MultiChainBuy.svelte";
    import TLSNNotarization from "./TLSNNotarization.svelte";
    import { onMount } from "svelte";

    // State Machine
    type TradeState = "SIGNAL" | "NOTARIZE" | "SUCCESS";
    let currentState: TradeState = "SIGNAL";
    let tradeData: any = null;

    onMount(() => {
        // Any initialization
    });

    function handleSignal(data: any) {
        tradeData = {
            ...data,
            timestamp: Date.now(),
            mode: "buy",
        };
        // In a real flow, matching would happen here.
        // For this MVP, we simulate matching and move to notarization.
        currentState = "NOTARIZE";
    }

    function handleProofGenerated(e: any) {
        tradeData = { ...tradeData, proof: e.detail };
        console.log("Proof generated, calling fulfillIntent...");
        // Here we would call nearService.fulfillIntent(tradeData.intentId, proof)
        currentState = "SUCCESS";
    }
</script>

<div class="w-full max-w-3xl mx-auto space-y-8 relative">
    <div class="min-h-[500px] relative">
        {#if currentState === "SIGNAL"}
            <MultiChainBuy onSignal={handleSignal} />
        {:else if currentState === "NOTARIZE"}
            <div class="animate-fade-in">
                <!-- Pass simulated trade details to Notarization -->
                <TLSNNotarization
                    mode={tradeData.mode}
                    amount={tradeData.amount}
                    currency={tradeData.chain}
                    on:proof={handleProofGenerated}
                />
            </div>
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

                <h3 class="text-3xl font-bold text-white">Trade Successful!</h3>
                <p class="text-gray-400 max-w-md mx-auto">
                    Your payment has been verified and assets released.
                    <br />
                    Check your {tradeData.chain} wallet for the funds.
                </p>

                <div
                    class="bg-white/5 rounded-xl p-4 border border-white/10 max-w-md mx-auto text-left space-y-2"
                >
                    <div class="flex justify-between">
                        <span class="text-gray-400">Amount</span>
                        <span class="text-white font-mono"
                            >{tradeData.amount} {tradeData.chain}</span
                        >
                    </div>
                    <div class="flex justify-between">
                        <span class="text-gray-400">Intent ID</span>
                        <span class="text-blue-400 text-xs truncate w-32"
                            >{tradeData.intentId}</span
                        >
                    </div>
                </div>

                <button
                    on:click={() => (currentState = "SIGNAL")}
                    class="px-8 py-3 bg-white/10 hover:bg-white/20 text-white rounded-xl transition-all"
                >
                    Start New Trade
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
