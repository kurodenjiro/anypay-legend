<script lang="ts">
    import { createEventDispatcher } from "svelte";
    import CurrencyPlatformModal from "./CurrencyPlatformModal.svelte";

    // Form Data
    let amount = "";
    let counterparty = "";

    // Crypto Side State
    let selectedToken = { sym: "USDC", icon: "💲", network: "Base" };
    let selectedPlatform = { name: "Venmo", logo: "V" }; // Receiving Platform
    let selectedCurrency = { code: "USD", flag: "🇺🇸" };

    let isSubmitting = false;
    let step = "list"; // 'list' | 'form' | 'review'

    const dispatch = createEventDispatcher();

    function handleDepositSelect(asset: any) {
        selectedToken = asset;
        step = "form";
    }

    function handleReview() {
        if (!amount || !counterparty) return;
        step = "review";
    }

    function handleConfirm() {
        isSubmitting = true;

        // Dispatch signal intent
        dispatch("signal", {
            amount,
            mode: "sell",
            payingUsing: {
                platform: selectedPlatform,
                currency: selectedCurrency,
            },
            sellingAsset: { token: selectedToken },
            recipient: counterparty,
        });

        setTimeout(() => {
            isSubmitting = false;
        }, 500);
    }

    function handleCurrencySelect(e: any) {
        selectedCurrency = e.detail.currency;
        selectedPlatform = e.detail.platform;
        showCurrencyModal = false;
    }

    let showCurrencyModal = false;
</script>

<div
    class="swap-widget w-full max-w-[500px] mx-auto p-0 overflow-hidden relative group"
>
    <!-- Glow Effect -->
    <div
        class="absolute -bottom-20 -left-20 w-64 h-64 bg-purple-500/10 rounded-full blur-3xl pointer-events-none group-hover:bg-purple-500/20 transition-all duration-700"
    ></div>

    <!-- Header -->
    <div class="p-6 pb-2 relative z-10 text-center">
        <h2
            class="text-xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-blue-400 to-purple-400 mb-1"
        >
            Sell Crypto
        </h2>
        <p class="text-xs text-gray-500">Off-ramp assets to your bank.</p>
    </div>

    <!-- Content -->
    <div class="px-6 pb-8 space-y-5 relative z-10 pt-4">
        {#if step === "list"}
            <!-- Step 1: Asset Selection -->
            <div class="space-y-3">
                <div
                    class="flex items-center justify-between px-2 pb-2 border-b border-white/5"
                >
                    <span
                        class="text-xs font-medium text-gray-500 uppercase tracking-wider"
                        >Select Asset to Sell</span
                    >
                </div>

                {#each [{ sym: "USDC", name: "USD Coin", icon: "💲", network: "Base" }, { sym: "ETH", name: "Ethereum", icon: "Ξ", network: "Base" }] as asset}
                    <button
                        on:click={() => handleDepositSelect(asset)}
                        class="w-full flex items-center justify-between bg-[#050505]/50 p-4 rounded-xl border border-white/5 hover:bg-white/5 transition-all group text-left"
                    >
                        <div class="flex items-center gap-3">
                            <div
                                class="w-10 h-10 rounded-full bg-white/10 flex items-center justify-center text-xl"
                            >
                                {asset.icon}
                            </div>
                            <div>
                                <h4 class="text-white font-bold">
                                    {asset.sym}
                                </h4>
                                <p class="text-xs text-gray-500">
                                    {asset.network}
                                </p>
                            </div>
                        </div>
                        <div
                            class="w-8 h-8 rounded-full bg-white/5 flex items-center justify-center text-gray-400 group-hover:bg-white/10 group-hover:text-white transition-colors"
                        >
                            →
                        </div>
                    </button>
                {/each}
            </div>
        {:else if step === "form"}
            <!-- Step 2: Input Form -->
            <button
                on:click={() => (step = "list")}
                class="flex items-center gap-1 text-xs text-gray-500 hover:text-white mb-2 transition-colors"
            >
                ← Back to Assets
            </button>

            <!-- Sell Card -->
            <div
                class="bg-[#050505]/50 border border-white/5 rounded-2xl p-4 space-y-4"
            >
                <div class="flex justify-between items-center">
                    <label class="text-xs font-medium text-gray-400"
                        >You Sell</label
                    >
                    <div
                        class="flex items-center gap-2 px-2 py-1 rounded-full bg-white/5 border border-white/5 text-xs text-gray-300"
                    >
                        {selectedToken.network} Network
                    </div>
                </div>

                <div class="flex items-center gap-4">
                    <input
                        bind:value={amount}
                        type="number"
                        placeholder="0.00"
                        class="bg-transparent text-4xl font-medium text-white placeholder-gray-700 outline-none w-full"
                    />
                    <div
                        class="flex items-center gap-2 bg-white/10 px-3 py-1.5 rounded-xl border border-white/10"
                    >
                        <span class="text-xl">{selectedToken.icon}</span>
                        <span class="font-bold text-white"
                            >{selectedToken.sym}</span
                        >
                    </div>
                </div>
            </div>

            <!-- Receive Card -->
            <div class="relative">
                <div
                    class="absolute left-1/2 -top-3 -translate-x-1/2 w-8 h-8 bg-[#111] rounded-full border border-white/10 flex items-center justify-center text-gray-500 z-10"
                >
                    ↓
                </div>
                <!-- Platform Selection -->
                <button
                    on:click={() => (showCurrencyModal = true)}
                    class="w-full bg-[#050505]/50 border border-white/5 rounded-2xl p-4 pt-6 transition-all hover:bg-white/5 hover:border-white/10 text-left space-y-4"
                >
                    <div class="flex justify-between items-center">
                        <label class="text-xs font-medium text-gray-400"
                            >You Receive (Fiat)</label
                        >
                        <div
                            class="flex items-center gap-1 text-xs text-gray-500"
                        >
                            Change Platform ›
                        </div>
                    </div>

                    <div class="flex items-center justify-between">
                        <div class="text-2xl font-bold text-gray-500">
                            ≈ {amount || "0.00"}
                            {selectedCurrency.code}
                        </div>
                        <div class="flex items-center gap-2">
                            <div
                                class="w-8 h-8 rounded bg-white text-black flex items-center justify-center font-bold text-lg"
                            >
                                {selectedPlatform.logo}
                            </div>
                            <span class="text-white font-bold text-lg"
                                >{selectedPlatform.name}</span
                            >
                        </div>
                    </div>
                </button>
            </div>

            <!-- Recipient Details -->
            <div class="pt-2">
                <label
                    for="details-input"
                    class="text-xs font-medium text-gray-400 block mb-2 px-1"
                    >Your {selectedPlatform.name} Tag/Email</label
                >
                <input
                    id="details-input"
                    bind:value={counterparty}
                    type="text"
                    placeholder={`e.g. @username or email`}
                    class="w-full bg-[#050505]/50 border border-white/5 rounded-xl p-4 text-white placeholder-gray-600 outline-none focus:border-blue-500/50 transition-colors"
                />
            </div>

            <button
                on:click={handleReview}
                disabled={!amount || !counterparty}
                class="w-full btn-primary py-4 text-base rounded-xl mt-4 disabled:opacity-50 disabled:cursor-not-allowed"
            >
                Review Order
            </button>
        {:else if step === "review"}
            <!-- Step 3: Review -->
            <button
                on:click={() => (step = "form")}
                class="flex items-center gap-1 text-xs text-gray-500 hover:text-white mb-2 transition-colors"
            >
                ← Edit Order
            </button>

            <div
                class="bg-white/5 border border-white/10 rounded-2xl p-6 space-y-6"
            >
                <h3 class="text-lg font-bold text-white text-center">
                    Confirm Sell Order
                </h3>

                <div class="space-y-4">
                    <div class="flex justify-between items-center">
                        <span class="text-gray-400">Selling</span>
                        <span class="text-white font-bold text-lg"
                            >{amount} {selectedToken.sym}</span
                        >
                    </div>
                    <div class="flex justify-between items-center">
                        <span class="text-gray-400">Receiving</span>
                        <span class="text-white font-bold text-lg"
                            >≈ {amount} {selectedCurrency.code}</span
                        >
                    </div>
                    <div class="w-full h-px bg-white/10"></div>
                    <div class="flex justify-between items-center text-sm">
                        <span class="text-gray-400">Platform</span>
                        <div class="flex items-center gap-2">
                            <span class="text-white"
                                >{selectedPlatform.name}</span
                            >
                        </div>
                    </div>
                    <div class="flex justify-between items-center text-sm">
                        <span class="text-gray-400">Recipient ID</span>
                        <span class="text-blue-400 font-mono"
                            >{counterparty}</span
                        >
                    </div>
                </div>

                <div
                    class="bg-yellow-500/10 border border-yellow-500/20 rounded-xl p-3 flex gap-3"
                >
                    <span class="text-xl">⚠️</span>
                    <p class="text-xs text-yellow-200/80 leading-relaxed">
                        Funds will be escrowed on-chain in a Smart Contract. You
                        will verify payment receipt via TLSN proof to release
                        funds.
                    </p>
                </div>
            </div>

            <button
                on:click={handleConfirm}
                disabled={isSubmitting}
                class="w-full btn-primary py-4 text-base rounded-xl relative overflow-hidden"
            >
                {#if isSubmitting}
                    <span class="flex items-center justify-center gap-2">
                        <svg
                            class="animate-spin h-5 w-5 text-white"
                            viewBox="0 0 24 24"
                        >
                            <circle
                                class="opacity-25"
                                cx="12"
                                cy="12"
                                r="10"
                                stroke="currentColor"
                                stroke-width="4"
                            ></circle>
                            <path
                                class="opacity-75"
                                fill="currentColor"
                                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                            ></path>
                        </svg>
                        Sign & Escrow
                    </span>
                {:else}
                    Confirm & Signal Intent
                {/if}
            </button>
        {/if}
    </div>

    <!-- Modals -->
    {#if showCurrencyModal}
        <CurrencyPlatformModal
            on:close={() => (showCurrencyModal = false)}
            on:select={handleCurrencySelect}
        />
    {/if}
</div>
