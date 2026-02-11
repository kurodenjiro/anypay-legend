<script lang="ts">
    import { createEventDispatcher } from "svelte";

    const dispatch = createEventDispatcher();

    // -- Data --
    const currencies = [
        { code: "USD", name: "United States Dollar", flag: "🇺🇸" },
        { code: "EUR", name: "Euro", flag: "🇪🇺" },
        { code: "GBP", name: "British Pound", flag: "🇬🇧" },
        { code: "ARS", name: "Argentine Peso", flag: "🇦🇷" },
        { code: "AUD", name: "Australian Dollar", flag: "🇦🇺" },
    ];

    const platforms = [
        {
            name: "Revolut",
            logo: "R",
            limit: "500 USDC",
            cooldown: "No cooldown",
        },
        { name: "Wise", logo: "W", limit: "500 USDC", cooldown: "No cooldown" },
        { name: "Venmo", logo: "V", limit: "100 USDC", cooldown: "2h 1m" },
        { name: "Cash App", logo: "$", limit: "100 USDC", cooldown: "2h 1m" },
        { name: "Chime", logo: "C", limit: "100 USDC", cooldown: "2h 1m" },
        { name: "Zelle", logo: "Z", limit: "150 USDC", cooldown: "2h 1m" },
    ];

    // -- State --
    let selectedCurrency = currencies[0];
    let searchQueryCurrency = "";
    let searchQueryPlatform = "";

    function selectCurrency(c: typeof selectedCurrency) {
        selectedCurrency = c;
    }

    function selectPlatform(p: (typeof platforms)[0]) {
        dispatch("select", { currency: selectedCurrency, platform: p });
    }

    function close() {
        dispatch("close");
    }
</script>

<div
    class="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-md p-4 animate-fade-in"
>
    <!-- Modal Container -->
    <div
        class="w-full max-w-2xl bg-[#09090b]/90 backdrop-blur-xl border border-white/10 rounded-3xl shadow-2xl flex flex-col h-[600px] overflow-hidden relative"
    >
        <!-- Grain Texture -->
        <div
            class="absolute inset-0 opacity-[0.03] pointer-events-none bg-[url('/noise.png')]"
        ></div>

        <!-- Header -->
        <div
            class="flex items-center justify-between px-6 py-5 border-b border-white/5 relative z-10"
        >
            <h2 class="text-xl font-bold text-white tracking-tight">
                Select Currency & Platform
            </h2>
            <button
                on:click={close}
                class="w-8 h-8 rounded-full flex items-center justify-center bg-white/5 hover:bg-white/10 text-gray-400 hover:text-white transition-all"
            >
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
                        d="M6 18L18 6M6 6l12 12"
                    />
                </svg>
            </button>
        </div>

        <div class="flex flex-1 overflow-hidden relative z-10">
            <!-- Left Pane: Currencies -->
            <div
                class="w-[40%] border-r border-white/5 flex flex-col bg-black/20"
            >
                <div class="p-4 border-b border-white/5">
                    <div
                        class="bg-white/5 border border-white/5 rounded-xl px-3 py-2.5 flex items-center gap-2 focus-within:border-blue-500/50 focus-within:bg-white/10 transition-all"
                    >
                        <svg
                            class="w-4 h-4 text-gray-400"
                            fill="none"
                            viewBox="0 0 24 24"
                            stroke="currentColor"
                        >
                            <path
                                stroke-linecap="round"
                                stroke-linejoin="round"
                                stroke-width="2"
                                d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                            />
                        </svg>
                        <input
                            bind:value={searchQueryCurrency}
                            type="text"
                            placeholder="Search currency"
                            class="bg-transparent outline-none text-white text-sm w-full placeholder-gray-500"
                        />
                    </div>
                </div>

                <div
                    class="flex-1 overflow-y-auto p-2 space-y-1 custom-scrollbar"
                >
                    <div
                        class="text-[10px] uppercase font-bold text-gray-500 px-3 py-2 tracking-wider"
                    >
                        Popular Currencies
                    </div>
                    {#each currencies as c}
                        <button
                            on:click={() => selectCurrency(c)}
                            class="w-full flex items-center gap-3 px-3 py-3 rounded-xl text-left transition-all duration-200 group {selectedCurrency.code ===
                            c.code
                                ? 'bg-blue-600/20 border border-blue-500/30'
                                : 'hover:bg-white/5 border border-transparent'}"
                        >
                            <span class="text-2xl filter drop-shadow-lg"
                                >{c.flag}</span
                            >
                            <div>
                                <div
                                    class="font-bold text-white text-sm group-hover:text-blue-400 transition-colors"
                                >
                                    {c.code}
                                </div>
                                <div
                                    class="text-[11px] text-gray-500 group-hover:text-gray-400"
                                >
                                    {c.name}
                                </div>
                            </div>
                            {#if selectedCurrency.code === c.code}
                                <div
                                    class="ml-auto w-1.5 h-1.5 rounded-full bg-blue-500 shadow-[0_0_8px_rgba(59,130,246,0.8)]"
                                ></div>
                            {/if}
                        </button>
                    {/each}

                    <!-- Simulating more list items for scroll feel -->
                    <div
                        class="text-[10px] uppercase font-bold text-gray-500 px-3 py-2 mt-4 tracking-wider"
                    >
                        All Currencies
                    </div>
                    {#each currencies as c}
                        <button
                            on:click={() => selectCurrency(c)}
                            class="w-full flex items-center gap-3 px-3 py-3 rounded-xl text-left transition-all duration-200 hover:bg-white/5 border border-transparent"
                        >
                            <span
                                class="text-2xl opacity-50 grayscale group-hover:grayscale-0 transition-all"
                                >{c.flag}</span
                            >
                            <div>
                                <div class="font-bold text-gray-400 text-sm">
                                    {c.code}
                                </div>
                                <div class="text-[11px] text-gray-600">
                                    {c.name}
                                </div>
                            </div>
                        </button>
                    {/each}
                </div>
            </div>

            <!-- Right Pane: Platforms -->
            <div class="flex-1 flex flex-col bg-transparent">
                <div class="p-4 border-b border-white/5">
                    <div
                        class="bg-white/5 border border-white/5 rounded-xl px-3 py-2.5 flex items-center gap-2 focus-within:border-purple-500/50 focus-within:bg-white/10 transition-all"
                    >
                        <svg
                            class="w-4 h-4 text-gray-400"
                            fill="none"
                            viewBox="0 0 24 24"
                            stroke="currentColor"
                        >
                            <path
                                stroke-linecap="round"
                                stroke-linejoin="round"
                                stroke-width="2"
                                d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                            />
                        </svg>
                        <input
                            bind:value={searchQueryPlatform}
                            type="text"
                            placeholder="Search platform"
                            class="bg-transparent outline-none text-white text-sm w-full placeholder-gray-500"
                        />
                    </div>
                </div>

                <div
                    class="flex-1 overflow-y-auto p-3 space-y-2 custom-scrollbar"
                >
                    <div
                        class="flex justify-between items-center px-2 py-1 text-[10px] uppercase font-bold text-gray-500 tracking-wider"
                    >
                        <span>Available Platforms</span>
                    </div>

                    {#each platforms as p}
                        <button
                            on:click={() => selectPlatform(p)}
                            class="w-full flex items-center justify-between px-4 py-4 rounded-xl border border-white/5 bg-white/[0.02] hover:bg-white/[0.06] hover:border-white/10 hover:shadow-lg transition-all duration-300 group"
                        >
                            <div class="flex items-center gap-4">
                                <div
                                    class="w-10 h-10 rounded-xl bg-gradient-to-br from-gray-800 to-black border border-white/10 flex items-center justify-center text-lg font-bold text-white shadow-inner group-hover:scale-105 transition-transform"
                                >
                                    {p.logo}
                                </div>
                                <div class="text-left">
                                    <span
                                        class="font-bold text-white text-base block group-hover:text-purple-400 transition-colors"
                                        >{p.name}</span
                                    >
                                    <span
                                        class="text-[11px] text-gray-500 flex items-center gap-1"
                                    >
                                        <span
                                            class="w-1.5 h-1.5 rounded-full bg-green-500"
                                        ></span>
                                        Instant Transfer
                                    </span>
                                </div>
                            </div>
                            <div class="text-right">
                                <div
                                    class="font-mono font-medium text-white text-sm"
                                >
                                    {p.limit}
                                </div>
                                <div
                                    class="text-[10px] text-gray-500 bg-white/5 px-2 py-0.5 rounded-md inline-block mt-1"
                                >
                                    {p.cooldown}
                                </div>
                            </div>
                        </button>
                    {/each}
                </div>
            </div>
        </div>

        <!-- Footer -->
        <div
            class="p-4 border-t border-white/5 bg-black/20 text-center backdrop-blur-md"
        >
            <button
                class="text-xs text-blue-400 hover:text-blue-300 font-medium transition-colors flex items-center justify-center gap-1 mx-auto"
            >
                Missing a platform? Let us know
                <svg
                    class="w-3 h-3"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                >
                    <path
                        stroke-linecap="round"
                        stroke-linejoin="round"
                        stroke-width="2"
                        d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
                    />
                </svg>
            </button>
        </div>
    </div>
</div>
