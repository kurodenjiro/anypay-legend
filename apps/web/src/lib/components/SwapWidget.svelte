<script lang="ts">
    import { createEventDispatcher } from "svelte";
    import CurrencyPlatformModal from "./CurrencyPlatformModal.svelte";
    import TokenSelectorModal from "./TokenSelectorModal.svelte";

    // Tabs
    export let defaultTab = "fiat"; // 'fiat' | 'crypto'
    let activeTab = defaultTab;

    // Form Data
    let amount = "";

    // Fiat Side State
    let selectedPlatform = { name: "Venmo", logo: "V" };
    let selectedCurrency = { code: "USD", flag: "🇺🇸" };

    // Crypto Side State
    let selectedToken = { sym: "USDC", icon: "💲" };
    let selectedChain = { name: "Base", logo: "🔵" };

    let counterparty = "";

    // Modal State
    let showCurrencyModal = false;
    let showTokenModal = false;

    // UI State
    let isSubmitting = false;
    let cryptoStep = "list"; // 'list' | 'form'

    function handleDepositSelect(asset: any) {
        selectedToken = asset;
        cryptoStep = "form";
    }

    const dispatch = createEventDispatcher();

    function handleGenerate() {
        if (!amount) return;
        isSubmitting = true;

        // Dispatch signal intent
        dispatch("signal", {
            amount,
            activeTab,
            payingUsing: {
                platform: selectedPlatform,
                currency: selectedCurrency,
            },
            sellingAsset: { chain: selectedChain, token: selectedToken },
            recipient: counterparty || "0xMyWallet...",
        });

        // Reset sub state
        setTimeout(() => {
            isSubmitting = false;
        }, 500);
    }

    function handleCurrencySelect(e: any) {
        selectedCurrency = e.detail.currency;
        selectedPlatform = e.detail.platform;
        showCurrencyModal = false;
    }

    function handleTokenSelect(e: any) {
        selectedToken = e.detail.token;
        selectedChain = e.detail.chain;
        showTokenModal = false;
    }
</script>

<div
    class="swap-widget w-full max-w-[500px] mx-auto p-0 overflow-hidden relative group"
>
    <!-- Glow Effect -->
    <div
        class="absolute -top-20 -right-20 w-64 h-64 bg-blue-500/10 rounded-full blur-3xl pointer-events-none group-hover:bg-blue-500/20 transition-all duration-700"
    ></div>
    <div
        class="absolute -bottom-20 -left-20 w-64 h-64 bg-purple-500/10 rounded-full blur-3xl pointer-events-none group-hover:bg-purple-500/20 transition-all duration-700"
    ></div>

    <!-- Header -->
    <div class="p-6 pb-2 relative z-10 text-center">
        <h2
            class="text-xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-white to-gray-400 mb-1"
        >
            Trustless P2P Settlement
        </h2>
        <p class="text-xs text-gray-500">Zero-knowledge verification layer</p>
    </div>

    <!-- Tabs -->
    <div class="px-6 flex gap-2 mb-6 relative z-50">
        <button
            type="button"
            on:click={() => {
                console.log("Clicked Fiat Tab");
                activeTab = "fiat";
            }}
            class="flex-1 py-3 text-sm font-semibold rounded-2xl transition-all duration-300 border cursor-pointer {activeTab ===
            'fiat'
                ? 'bg-white/10 border-white/10 text-white shadow-lg shadow-blue-500/5'
                : 'bg-transparent border-transparent text-gray-500 hover:text-gray-300 hover:bg-white/5'}"
        >
            I Paid Fiat
        </button>
        <button
            type="button"
            on:click={() => {
                console.log("Clicked Crypto Tab");
                activeTab = "crypto";
            }}
            class="flex-1 py-3 text-sm font-semibold rounded-2xl transition-all duration-300 border cursor-pointer {activeTab ===
            'crypto'
                ? 'bg-white/10 border-white/10 text-white shadow-lg shadow-purple-500/5'
                : 'bg-transparent border-transparent text-gray-500 hover:text-gray-300 hover:bg-white/5'}"
        >
            I Sent Crypto
        </button>
    </div>

    <!-- Content -->
    <div class="px-6 pb-8 space-y-5 relative z-10">
        <!-- Input Group -->
        <div class="space-y-4">
            <!-- Paying using (Fiat) OR Asset (Crypto) Selector -->
            {#if activeTab === "fiat"}
                <button
                    on:click={() => (showCurrencyModal = true)}
                    class="w-full bg-[#050505]/50 border border-white/5 rounded-2xl p-4 transition-all hover:border-white/10 group/input flex items-center justify-between text-left"
                    aria-label="Select Fiat Payment Platform"
                >
                    <div>
                        <span
                            class="text-xs font-medium text-gray-400 block mb-1"
                            >Paying using</span
                        >
                        <div class="flex items-center gap-2">
                            <div
                                class="w-6 h-6 rounded bg-white text-black flex items-center justify-center font-bold text-xs"
                            >
                                {selectedPlatform.logo}
                            </div>
                            <span class="text-white font-bold text-lg"
                                >{selectedPlatform.name}</span
                            >
                            <span class="text-gray-500 text-sm"
                                >({selectedCurrency.code})</span
                            >
                        </div>
                    </div>
                    <svg
                        class="w-5 h-5 text-gray-500"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                        ><path
                            stroke-linecap="round"
                            stroke-linejoin="round"
                            stroke-width="2"
                            d="M19 9l-7 7-7-7"
                        /></svg
                    >
                </button>
            {:else if cryptoStep === "list"}
                <!-- Step 1: Deposit Table -->
                <div class="space-y-3">
                    <div
                        class="flex items-center justify-between px-2 pb-2 border-b border-white/5"
                    >
                        <span
                            class="text-xs font-medium text-gray-500 uppercase tracking-wider"
                            >Asset</span
                        >
                        <span
                            class="text-xs font-medium text-gray-500 uppercase tracking-wider"
                            >Action</span
                        >
                    </div>

                    {#each [{ sym: "USDC", name: "USD Coin", icon: "💲", network: "Base" }, { sym: "ETH", name: "Ethereum", icon: "Ξ", network: "Base" }] as asset}
                        <div
                            class="flex items-center justify-between bg-[#050505]/50 p-3 rounded-xl border border-white/5 hover:bg-white/5 transition-all group"
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
                            <button
                                on:click={() => handleDepositSelect(asset)}
                                class="px-4 py-2 bg-white/10 hover:bg-white/20 text-white text-sm font-bold rounded-lg transition-colors border border-white/5"
                            >
                                Deposit
                            </button>
                        </div>
                    {/each}
                </div>
            {:else}
                <!-- Step 2: Amount & Details (Original Form) -->

                <!-- Back Button -->
                <button
                    on:click={() => (cryptoStep = "list")}
                    class="flex items-center gap-1 text-xs text-gray-500 hover:text-white mb-2 transition-colors"
                >
                    <svg
                        class="w-4 h-4"
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
                    Back to Assets
                </button>

                <!-- Selected Asset Display (ReadOnly) -->
                <div
                    class="bg-[#050505]/50 border border-white/5 rounded-2xl p-4 flex items-center justify-between"
                >
                    <div>
                        <label
                            class="text-xs font-medium text-gray-400 block mb-1"
                            >Selling Asset</label
                        >
                        <div class="flex items-center gap-2">
                            <span class="text-xl">{selectedToken.icon}</span>
                            <span class="text-white font-bold text-lg"
                                >{selectedToken.sym}</span
                            >
                            <span class="text-gray-500 text-sm">on Base</span>
                        </div>
                    </div>
                </div>

                <!-- Receive On (Platform) -->
                <button
                    on:click={() => (showCurrencyModal = true)}
                    class="w-full bg-[#050505]/50 border border-white/5 rounded-2xl p-4 transition-all hover:border-white/10 group/input flex items-center justify-between text-left"
                    aria-label="Select Receive Platform"
                >
                    <!-- ... unchanged platform selector content ... -->
                    <div>
                        <span
                            class="text-xs font-medium text-gray-400 block mb-1"
                            >Receive Fiat On</span
                        >
                        <div class="flex items-center gap-2">
                            <div
                                class="w-6 h-6 rounded bg-white text-black flex items-center justify-center font-bold text-xs"
                            >
                                {selectedPlatform.logo}
                            </div>
                            <span class="text-white font-bold text-lg"
                                >{selectedPlatform.name}</span
                            >
                            <span class="text-gray-500 text-sm"
                                >({selectedCurrency.code})</span
                            >
                        </div>
                    </div>
                    <svg
                        class="w-5 h-5 text-gray-500"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                    >
                        <path
                            stroke-linecap="round"
                            stroke-linejoin="round"
                            stroke-width="2"
                            d="M19 9l-7 7-7-7"
                        />
                    </svg>
                </button>

                <!-- Amount -->
                <div
                    class="bg-[#050505]/50 border border-white/5 rounded-2xl p-4 transition-all focus-within:border-indigo-500/30 focus-within:bg-white/5 hover:border-white/10"
                >
                    <div class="flex justify-between items-center mb-1">
                        <label
                            for="amount-input"
                            class="text-xs font-medium text-gray-400"
                            >Amount to Send</label
                        >
                        <span
                            class="text-xs text-indigo-400 font-medium cursor-pointer hover:text-indigo-300"
                            >Max: 1,000.00</span
                        >
                    </div>
                    <div class="flex items-center gap-3">
                        <input
                            id="amount-input"
                            bind:value={amount}
                            type="number"
                            placeholder="0.00"
                            class="bg-transparent text-3xl font-medium text-white placeholder-gray-700 outline-none w-full"
                        />
                        <div
                            class="flex items-center gap-2 bg-white/10 px-3 py-1.5 rounded-xl border border-white/5"
                        >
                            <span class="text-sm font-bold text-white"
                                >{selectedToken.sym}</span
                            >
                        </div>
                    </div>
                </div>

                <!-- Recipient Address OR Bank Details -->
                <div
                    class="bg-[#050505]/50 border border-white/5 rounded-2xl p-4 transition-all focus-within:border-indigo-500/30 focus-within:bg-white/5 hover:border-white/10"
                >
                    <label
                        for="details-input"
                        class="text-xs font-medium text-gray-400 block mb-2"
                    >
                        My {selectedPlatform.name} Details
                    </label>
                    <input
                        id="details-input"
                        bind:value={counterparty}
                        type="text"
                        placeholder={`Enter your ${selectedPlatform.name} tag/email`}
                        class="bg-transparent text-lg font-medium text-white placeholder-gray-700 outline-none w-full"
                    />
                </div>
            {/if}
        </div>

        <!-- Action Button (Only show if not in crypto list mode) -->
        {#if activeTab !== "crypto" || cryptoStep !== "list"}
            <button
                on:click={handleGenerate}
                disabled={!amount || isSubmitting}
                class="w-full btn-primary py-4 text-base tracking-wide rounded-2xl relative overflow-hidden group/btn"
            >
                <div
                    class="absolute inset-0 bg-gradient-to-r from-blue-600 to-purple-600 opacity-0 group-hover/btn:opacity-100 transition-opacity duration-500"
                ></div>
                <span
                    class="relative z-10 flex items-center justify-center gap-2"
                >
                    {#if isSubmitting}
                        <!-- Spinner -->
                        <svg
                            class="animate-spin h-5 w-5 text-white"
                            xmlns="http://www.w3.org/2000/svg"
                            fill="none"
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
                        Generating Proof...
                    {:else}
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
                                d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
                            />
                        </svg>
                        {activeTab === "fiat"
                            ? "Generate Zero-Knowledge Proof"
                            : "Escrow Funds & Signal"}
                    {/if}
                </span>
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

    {#if showTokenModal}
        <TokenSelectorModal
            on:close={() => (showTokenModal = false)}
            on:select={handleTokenSelect}
        />
    {/if}
</div>
