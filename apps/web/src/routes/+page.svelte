<script lang="ts">
    import PrivacyPanel from "$lib/components/PrivacyPanel.svelte";
</script>

<div class="w-full min-h-screen pt-32 pb-12 flex flex-col items-center">
    <!-- Hero Header -->
    <div class="text-center space-y-4 mb-16 max-w-2xl px-4">
        <h1
            class="text-5xl md:text-6xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-white via-gray-200 to-gray-500 tracking-tight"
        >
            Trustless Trading
        </h1>
        <p class="text-lg text-gray-400">
            Swap fiat and crypto using zero-knowledge proofs. <br />
            No middleman. No data leaks. Complete privacy.
        </p>
    </div>

    <!-- Selection Cards -->
    <div
        class="grid grid-cols-1 md:grid-cols-2 gap-6 w-full max-w-4xl px-4 mb-24"
    >
        <!-- Card: Buy (Has Fiat) -->
        <a
            href="/buy"
            class="group relative flex flex-col items-start justify-between min-h-[300px] p-8 rounded-3xl bg-white/5 border border-white/5 hover:bg-white/10 hover:border-white/20 transition-all duration-500 overflow-hidden"
        >
            <!-- Background Glow -->
            <div
                class="absolute -right-20 -top-20 w-64 h-64 bg-blue-500/10 rounded-full blur-3xl group-hover:bg-blue-500/20 transition-all duration-700"
            ></div>

            <div class="relative z-10">
                <div
                    class="w-12 h-12 rounded-xl bg-blue-500/20 text-blue-400 flex items-center justify-center text-2xl mb-6 group-hover:scale-110 transition-transform"
                >
                    💵
                </div>
                <h2 class="text-3xl font-bold text-white mb-2">I have Fiat</h2>
                <p class="text-gray-400 text-sm">
                    Use localized payment methods like Venmo, Revolut, or Wise
                    to buy crypto directly on-chain.
                </p>
            </div>

            <div
                class="relative z-10 flex items-center gap-2 text-blue-400 font-bold mt-8 group-hover:translate-x-2 transition-transform"
            >
                Start Buying <span class="text-xl">→</span>
            </div>
        </a>

        <!-- Card: Sell (Has Crypto) -->
        <a
            href="/sell"
            class="group relative flex flex-col items-start justify-between min-h-[300px] p-8 rounded-3xl bg-white/5 border border-white/5 hover:bg-white/10 hover:border-white/20 transition-all duration-500 overflow-hidden"
        >
            <!-- Background Glow -->
            <div
                class="absolute -right-20 -top-20 w-64 h-64 bg-purple-500/10 rounded-full blur-3xl group-hover:bg-purple-500/20 transition-all duration-700"
            ></div>

            <div class="relative z-10">
                <div
                    class="w-12 h-12 rounded-xl bg-purple-500/20 text-purple-400 flex items-center justify-center text-2xl mb-6 group-hover:scale-110 transition-transform"
                >
                    💎
                </div>
                <h2 class="text-3xl font-bold text-white mb-2">
                    I have Crypto
                </h2>
                <p class="text-gray-400 text-sm">
                    Off-ramp your USDC or ETH to your bank account securely
                    using TLSNotary proofs.
                </p>
            </div>

            <div
                class="relative z-10 flex items-center gap-2 text-purple-400 font-bold mt-8 group-hover:translate-x-2 transition-transform"
            >
                Start Selling <span class="text-xl">→</span>
            </div>
        </a>
    </div>

    <!-- Privacy Guarantees -->
    <PrivacyPanel />

    <!-- Footer -->
    <footer
        class="mt-auto pt-10 border-t border-white/5 w-full max-w-4xl flex items-center justify-between text-xs text-gray-600 px-4"
    >
        <div class="flex gap-6">
            <a
                href="https://github.com/anypay-legend"
                target="_blank"
                class="hover:text-gray-400 transition-colors">GitHub</a
            >
            <a href="/" class="hover:text-gray-400 transition-colors"
                >Documentation</a
            >
            <a href="/" class="hover:text-gray-400 transition-colors"
                >How ZK Works</a
            >
        </div>
        <p>No personal data is stored. Verifiable & Trustless.</p>
    </footer>
</div>
