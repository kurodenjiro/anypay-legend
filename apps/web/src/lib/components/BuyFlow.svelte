<script lang="ts">
    import BuyWidget from "./BuyWidget.svelte";
    import TLSNNotarization from "./TLSNNotarization.svelte";
    import { onMount } from "svelte";
    import { nearService } from "$lib/services/near";

    // State Machine
    type TradeState = "SIGNAL" | "NOTARIZE" | "SUCCESS";
    let currentState: TradeState = "SIGNAL";
    let tradeData: any = null;
    let error = "";

    onMount(() => {
        // Any initialization
    });

    async function handleSignal(event: CustomEvent) {
        error = "";
        const data = event.detail;

        try {
            const depositId = 1;
            console.log("Signaling intent...", data);

            const result = await nearService.signalIntent(
                depositId,
                data.amount,
                data.payingUsing.platform.name,
                data.payingUsing.currency.code,
                data.recipient,
                data.buyingAsset.token.sym,
            );

            console.log("signalIntent returned:", result);

            tradeData = {
                ...data,
                timestamp: Date.now(),
                mode: "buy",
                intentId: "mock_intent_" + Date.now(),
            };

            // CRITICAL FIX: Use setTimeout to defer state change
            // This allows the event handler to complete before Svelte tries to unmount BuyWidget
            setTimeout(() => {
                currentState = "NOTARIZE";
                console.log("State changed to NOTARIZE");
            }, 0);
        } catch (e: any) {
            console.error("Signal failed:", e);
            error = "Signal failed: " + e.message;
        }
    }

    function handleProofGenerated(e: any) {
        tradeData = { ...tradeData, proof: e.detail };
        console.log("Proof generated, calling fulfillIntent...");
        // Here we would call nearService.fulfillIntent(tradeData.intentId, proof)
        setTimeout(() => {
            currentState = "SUCCESS";
        }, 0);
    }
</script>

<div class="w-full max-w-3xl mx-auto space-y-8 relative">
    {#key currentState}
        <div class="min-h-[500px] relative">
            {#if error}
                <div
                    class="p-4 bg-red-500/20 border border-red-500/50 rounded-xl text-red-200 mb-4 animate-pulse"
                >
                    ⚠️ {error}
                </div>
            {/if}

            {#if currentState === "SIGNAL"}
                <BuyWidget on:signal={handleSignal} />
            {:else if currentState === "NOTARIZE"}
                <div class="animate-fade-in">
                    <!-- Pass simulated trade details to Notarization -->
                    <TLSNNotarization
                        mode={tradeData?.mode || "buy"}
                        amount={tradeData?.amount || "0"}
                        currency={tradeData?.chain || "BTC"}
                        on:proof={handleProofGenerated}
                    />
                </div>
            {:else if currentState === "SUCCESS"}
                <!-- Success State -->
                <div
                    class="glass-panel p-8 text-center animate-fade-in space-y-6"
                >
                    <div
                        class="w-20 h-20 mx-auto bg-green-500/20 rounded-full flex items-center justify-center mb-4"
                    >
                        <svg
                            class="w-10 h-10 text-green-400"
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                        >
                            <path
                                stroke-linecap="round"
                                stroke-linejoin="round"
                                stroke-width="2"
                                d="M5 13l4 4L19 7"
                            />
                        </svg>
                    </div>

                    <h2 class="text-2xl font-bold text-white">
                        Trade Complete!
                    </h2>
                    <p class="text-gray-400">
                        Your proof has been submitted to the blockchain.
                    </p>

                    <div class="glass-panel p-4 text-left space-y-2">
                        <div class="flex justify-between">
                            <span class="text-gray-400">Amount:</span>
                            <span class="text-white font-mono"
                                >{tradeData?.amount || "N/A"}</span
                            >
                        </div>
                        <div class="flex justify-between">
                            <span class="text-gray-400">Asset:</span>
                            <span class="text-white font-mono"
                                >{tradeData?.chain || "N/A"}</span
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
    {/key}
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
