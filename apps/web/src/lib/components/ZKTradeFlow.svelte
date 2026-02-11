<script lang="ts">
    import BuyFlow from "./BuyFlow.svelte";
    import SellFlow from "./SellFlow.svelte";
    import { onMount } from "svelte";

    export let defaultTab = "fiat"; // 'fiat' (Buy) | 'crypto' (Sell)
    let activeTab = defaultTab === "fiat" ? "buy" : "sell";

    function setTab(tab: "buy" | "sell") {
        activeTab = tab;
    }
</script>

<div class="w-full max-w-3xl mx-auto space-y-8 relative">
    <!-- Header / Tab Switcher -->
    <div class="flex flex-col items-center justify-center space-y-6 pt-8">
        <h1 class="text-4xl font-bold text-white tracking-tight">
            {activeTab === "buy" ? "Buy Crypto" : "Sell Crypto"}
            <span
                class="text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-purple-400"
            >
                Privately
            </span>
        </h1>

        <!-- Custom Tab Switcher -->
        <div
            class="flex p-1 bg-white/5 border border-white/10 rounded-2xl backdrop-blur-md relative"
        >
            <button
                on:click={() => setTab("buy")}
                class="relative z-10 px-8 py-3 text-sm font-bold transition-all duration-300 rounded-xl {activeTab ===
                'buy'
                    ? 'text-white'
                    : 'text-gray-400 hover:text-white'}"
            >
                Buy Crypto
                {#if activeTab === "buy"}
                    <div
                        class="absolute inset-0 bg-white/10 border border-white/5 shadow-lg rounded-xl -z-10"
                    ></div>
                {/if}
            </button>
            <button
                on:click={() => setTab("sell")}
                class="relative z-10 px-8 py-3 text-sm font-bold transition-all duration-300 rounded-xl {activeTab ===
                'sell'
                    ? 'text-white'
                    : 'text-gray-400 hover:text-white'}"
            >
                Sell Crypto
                {#if activeTab === "sell"}
                    <div
                        class="absolute inset-0 bg-white/10 border border-white/5 shadow-lg rounded-xl -z-10"
                    ></div>
                {/if}
            </button>
        </div>
    </div>

    <!-- Main Content Area -->
    <div class="relative min-h-[500px]">
        {#if activeTab === "buy"}
            <div class="animate-fade-in">
                <BuyFlow />
            </div>
        {:else}
            <div class="animate-fade-in">
                <SellFlow />
            </div>
        {/if}
    </div>
</div>

<style>
    .animate-fade-in {
        animation: fadeIn 0.3s ease-out forwards;
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
