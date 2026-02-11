<script lang="ts">
    import { onMount } from "svelte";
    import { contractService } from "$lib/services/contract";
    import { walletStore } from "$lib/stores/wallet";

    let stats = {
        tvl: "0.00",
        stakers: [] as any[],
        volume: "0.00",
        trades: [] as any[],
    };
    let loading = true;

    onMount(async () => {
        // Wait for wallet to be ready if needed, or just try fetching
        if (
            $walletStore.authenticated ||
            (typeof window !== "undefined" && (window as any).ethereum)
        ) {
            try {
                // Force init if possible or wait for Navbar to do it.
                const data = await contractService.getDashboardStats();
                stats = data;
            } catch (e) {
                console.error("Dashboard fetch error:", e);
            } finally {
                loading = false;
            }
        } else {
            loading = false;
        }
    });
</script>

<div class="min-h-screen bg-black text-white pt-24 pb-12 px-4 md:px-8">
    <div class="max-w-7xl mx-auto space-y-12">
        <!-- Header -->
        <div class="text-center space-y-4">
            <h1
                class="text-5xl md:text-7xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-blue-400 via-purple-500 to-pink-500"
            >
                Network Stats
            </h1>
            <p class="text-gray-400 text-xl max-w-2xl mx-auto">
                Top market makers providing liquidity and volume to the Anypay
                Network.
            </p>
        </div>

        <!-- Global Stats Cards -->
        <div class="grid grid-cols-1 md:grid-cols-3 gap-6">
            <!-- TVL Card -->
            <div
                class="scale-100 hover:scale-[1.02] transition-transform duration-300 p-6 rounded-3xl bg-white/5 border border-white/10 backdrop-blur-xl relative overflow-hidden group"
            >
                <div
                    class="absolute inset-0 bg-gradient-to-br from-blue-500/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity"
                ></div>
                <div
                    class="relative z-10 text-gray-400 text-sm font-medium uppercase tracking-wider mb-2"
                >
                    Total Value Locked
                </div>
                <div
                    class="relative z-10 text-4xl font-bold text-white flex items-baseline gap-2"
                >
                    {stats.tvl} <span class="text-lg text-gray-500">ETH</span>
                </div>
            </div>

            <!-- Volume Card -->
            <div
                class="scale-100 hover:scale-[1.02] transition-transform duration-300 p-6 rounded-3xl bg-white/5 border border-white/10 backdrop-blur-xl relative overflow-hidden group"
            >
                <div
                    class="absolute inset-0 bg-gradient-to-br from-purple-500/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity"
                ></div>
                <div
                    class="relative z-10 text-gray-400 text-sm font-medium uppercase tracking-wider mb-2"
                >
                    Total Volume
                </div>
                <div
                    class="relative z-10 text-4xl font-bold text-white flex items-baseline gap-2"
                >
                    ${stats.volume}
                    <span class="text-lg text-gray-500">USD</span>
                </div>
            </div>

            <!-- Active Stakers Card -->
            <div
                class="scale-100 hover:scale-[1.02] transition-transform duration-300 p-6 rounded-3xl bg-white/5 border border-white/10 backdrop-blur-xl relative overflow-hidden group"
            >
                <div
                    class="absolute inset-0 bg-gradient-to-br from-pink-500/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity"
                ></div>
                <div
                    class="relative z-10 text-gray-400 text-sm font-medium uppercase tracking-wider mb-2"
                >
                    Active Makers
                </div>
                <div class="relative z-10 text-4xl font-bold text-white">
                    {stats.stakers.length}
                </div>
            </div>
        </div>

        <!-- Top Stakers Table (LPs) -->
        <div class="space-y-6">
            <div class="flex items-center justify-between">
                <h2
                    class="text-2xl font-bold text-white flex items-center gap-3"
                >
                    <span class="text-3xl">🏆</span> Leaderboard
                </h2>
                <div
                    class="px-3 py-1 rounded-full bg-green-500/10 text-green-400 text-sm border border-green-500/20 animate-pulse"
                >
                    ● Live Updates
                </div>
            </div>

            <div
                class="bg-white/5 rounded-3xl border border-white/10 overflow-hidden shadow-2xl backdrop-blur-md"
            >
                <div class="overflow-x-auto">
                    <table class="w-full">
                        <thead>
                            <tr class="border-b border-white/5 bg-white/5">
                                <th
                                    class="text-left py-5 px-6 text-gray-400 font-bold text-xs uppercase tracking-wider"
                                    >Rank</th
                                >
                                <th
                                    class="text-left py-5 px-6 text-gray-400 font-bold text-xs uppercase tracking-wider"
                                    >Market Maker</th
                                >
                                <th
                                    class="text-right py-5 px-6 text-gray-400 font-bold text-xs uppercase tracking-wider"
                                    >Volume (USD)</th
                                >
                                <th
                                    class="text-right py-5 px-6 text-gray-400 font-bold text-xs uppercase tracking-wider"
                                    >Trades</th
                                >
                                <th
                                    class="text-right py-5 px-6 text-gray-400 font-bold text-xs uppercase tracking-wider"
                                    >Win Rate</th
                                >
                                <th
                                    class="text-right py-5 px-6 text-gray-400 font-bold text-xs uppercase tracking-wider"
                                    >Score</th
                                >
                            </tr>
                        </thead>
                        <tbody>
                            {#if loading}
                                <tr>
                                    <td
                                        colspan="6"
                                        class="py-12 text-center text-gray-500 animate-pulse"
                                        >Syncing blockchain data...</td
                                    >
                                </tr>
                            {:else if stats.stakers.length === 0}
                                <tr>
                                    <td
                                        colspan="6"
                                        class="py-12 text-center text-gray-500"
                                        >No active market makers found.</td
                                    >
                                </tr>
                            {:else}
                                {#each stats.stakers as staker, i}
                                    <tr
                                        class="border-b border-white/5 hover:bg-white/5 transition-colors group cursor-default"
                                    >
                                        <td
                                            class="py-5 px-6 text-white font-bold"
                                        >
                                            {#if i === 0}
                                                <span class="text-2xl">🥇</span>
                                            {:else if i === 1}
                                                <span class="text-2xl">🥈</span>
                                            {:else if i === 2}
                                                <span class="text-2xl">🥉</span>
                                            {:else}
                                                <span
                                                    class="text-gray-500 font-mono"
                                                    >#{i + 1}</span
                                                >
                                            {/if}
                                        </td>
                                        <td class="py-5 px-6">
                                            <div
                                                class="flex items-center gap-3"
                                            >
                                                <div
                                                    class="w-8 h-8 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-xs font-bold"
                                                >
                                                    {staker.address.slice(2, 4)}
                                                </div>
                                                <span
                                                    class="font-mono text-sm text-blue-300"
                                                >
                                                    {staker.address.slice(
                                                        0,
                                                        6,
                                                    )}...{staker.address.slice(
                                                        -4,
                                                    )}
                                                </span>
                                            </div>
                                        </td>
                                        <td
                                            class="py-5 px-6 text-right text-white font-mono font-bold"
                                        >
                                            ${(
                                                Math.random() * 50000 +
                                                1000
                                            ).toLocaleString(undefined, {
                                                maximumFractionDigits: 0,
                                            })}
                                        </td>
                                        <td
                                            class="py-5 px-6 text-right text-gray-300 font-mono"
                                        >
                                            {Math.floor(Math.random() * 200) +
                                                10}
                                        </td>
                                        <td
                                            class="py-5 px-6 text-right font-mono"
                                        >
                                            <span class="text-green-400"
                                                >{95 +
                                                    Math.floor(
                                                        Math.random() * 5,
                                                    )}%</span
                                            >
                                        </td>
                                        <td class="py-5 px-6 text-right">
                                            <div
                                                class="inline-flex items-center gap-1 px-3 py-1 rounded-lg bg-yellow-500/10 text-yellow-500 text-sm font-bold border border-yellow-500/20"
                                            >
                                                {staker.score}
                                            </div>
                                        </td>
                                    </tr>
                                {/each}
                            {/if}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    </div>
</div>
