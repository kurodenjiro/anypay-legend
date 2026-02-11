<script lang="ts">
    import { onMount } from "svelte";
    import { contractService } from "$lib/services/contract";
    import { walletStore } from "$lib/stores/wallet";
    import { fade } from "svelte/transition";

    let history: any[] = [];
    let isLoading = true;
    let error = "";
    let useDemoData = false;

    // Demo data for when no on-chain history exists
    const demoHistory = [
        {
            hash: "0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef",
            amount: "1500000000000000000", // 1.5 ETH
            remaining: "1500000000000000000", // 1.5 ETH still available
            taken: "0", // None taken yet
            timestamp: Math.floor(Date.now() / 1000) - 3600, // 1 hour ago
            currency: "USD",
            platform: "Venmo",
            statusLocked: true,
            status: "Active",
        },
        {
            hash: "0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890",
            amount: "500000000000000000", // 0.5 ETH
            remaining: "200000000000000000", // 0.2 ETH remaining
            taken: "300000000000000000", // 0.3 ETH taken
            timestamp: Math.floor(Date.now() / 1000) - 7200, // 2 hours ago
            currency: "USD",
            platform: "Revolut",
            statusLocked: true,
            status: "Partial",
        },
        {
            hash: "0x9876543210fedcba9876543210fedcba9876543210fedcba9876543210fedcba",
            amount: "2000000000000000000", // 2 ETH
            remaining: "0", // Fully taken
            taken: "2000000000000000000", // 2 ETH taken
            timestamp: Math.floor(Date.now() / 1000) - 86400, // 1 day ago
            currency: "EUR",
            platform: "Venmo",
            statusLocked: false,
            status: "Completed",
        },
    ];

    onMount(async () => {
        if (!$walletStore.address) {
            isLoading = false;
            return;
        }

        try {
            const fetchedHistory = await contractService.getHistory(
                $walletStore.address,
            );

            // If no on-chain history, use demo data
            if (fetchedHistory.length === 0) {
                history = demoHistory;
                useDemoData = true;
            } else {
                history = fetchedHistory;
                useDemoData = false;
            }
        } catch (e: any) {
            console.error("Failed to load history:", e);
            // On error, also show demo data
            history = demoHistory;
            useDemoData = true;
        } finally {
            isLoading = false;
        }
    });

    // Filter deposits into active and closed
    $: activeDeposits = history.filter((item) => item.statusLocked === true);
    $: closedDeposits = history.filter((item) => item.statusLocked === false);

    function formatTime(ts: number) {
        return new Date(ts * 1000).toLocaleString();
    }
</script>

<div class="min-h-screen bg-[#050505] text-white pt-24 px-4">
    <div class="max-w-4xl mx-auto space-y-8">
        <!-- Header -->
        <div class="flex items-center justify-between">
            <div>
                <h1
                    class="text-3xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-white to-gray-500"
                >
                    My Dashboard
                </h1>
                <p class="text-gray-500 mt-2">
                    Track your active stakes and transaction history
                </p>
            </div>
            <div
                class="px-4 py-2 bg-white/5 rounded-xl border border-white/10 text-sm"
            >
                Address: <span class="font-mono text-blue-400"
                    >{$walletStore.address?.slice(
                        0,
                        6,
                    )}...{$walletStore.address?.slice(-4)}</span
                >
            </div>
        </div>

        {#if isLoading}
            <div
                class="glass-panel p-12 flex flex-col items-center justify-center text-gray-500 animate-pulse"
            >
                <div
                    class="w-12 h-12 border-4 border-white/10 border-t-blue-500 rounded-full animate-spin mb-4"
                ></div>
                <p>Loading dashboard data...</p>
            </div>
        {:else}
            {#if useDemoData}
                <div
                    class="bg-blue-500/10 border border-blue-500/20 rounded-xl p-4 flex items-start gap-3"
                    transition:fade
                >
                    <svg
                        class="w-5 h-5 text-blue-400 mt-0.5 flex-shrink-0"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                    >
                        <path
                            stroke-linecap="round"
                            stroke-linejoin="round"
                            stroke-width="2"
                            d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                        />
                    </svg>
                    <div>
                        <p class="text-sm text-blue-200 font-medium mb-1">
                            Demo Data
                        </p>
                        <p class="text-xs text-blue-300/80">
                            Showing sample transactions. Complete a trade to see
                            your real activity here.
                        </p>
                    </div>
                </div>
            {/if}
            <!-- Stats Summary -->
            <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div class="glass-panel p-6">
                    <p class="text-xs text-gray-500 uppercase font-bold">
                        Total Deposits
                    </p>
                    <p class="text-2xl font-bold text-white mt-1">
                        {history.length}
                    </p>
                </div>
                <div class="glass-panel p-6">
                    <p class="text-xs text-gray-500 uppercase font-bold">
                        Active Stakes
                    </p>
                    <p class="text-2xl font-bold text-green-400 mt-1">
                        {activeDeposits.length}
                    </p>
                </div>
                <div class="glass-panel p-6">
                    <p class="text-xs text-gray-500 uppercase font-bold">
                        Closed Stakes
                    </p>
                    <p class="text-2xl font-bold text-gray-400 mt-1">
                        {closedDeposits.length}
                    </p>
                </div>
            </div>

            <!-- Active Deposits Table -->
            <div class="space-y-3">
                <div class="flex items-center justify-between">
                    <h2 class="text-xl font-bold text-white">
                        Active Deposits
                    </h2>
                    <span class="text-sm text-gray-500"
                        >{activeDeposits.length} active</span
                    >
                </div>

                {#if activeDeposits.length === 0}
                    <div class="glass-panel p-8 text-center text-gray-500">
                        <p>No active deposits</p>
                    </div>
                {:else}
                    <div class="glass-panel overflow-hidden" transition:fade>
                        <div class="overflow-x-auto">
                            <table class="w-full text-left">
                                <thead>
                                    <tr
                                        class="border-b border-white/5 bg-white/5"
                                    >
                                        <th
                                            class="p-4 text-xs font-bold text-gray-400 uppercase tracking-wider"
                                            >Platform</th
                                        >
                                        <th
                                            class="p-4 text-xs font-bold text-gray-400 uppercase tracking-wider"
                                            >Amount</th
                                        >
                                        <th
                                            class="p-4 text-xs font-bold text-gray-400 uppercase tracking-wider"
                                            >Remaining</th
                                        >
                                        <th
                                            class="p-4 text-xs font-bold text-gray-400 uppercase tracking-wider"
                                            >Taken</th
                                        >
                                        <th
                                            class="p-4 text-xs font-bold text-gray-400 uppercase tracking-wider"
                                            >Currency</th
                                        >
                                        <th
                                            class="p-4 text-xs font-bold text-gray-400 uppercase tracking-wider"
                                            >Status</th
                                        >
                                    </tr>
                                </thead>
                                <tbody class="divide-y divide-white/5">
                                    {#each activeDeposits as item}
                                        <tr
                                            class="hover:bg-white/5 transition-colors group"
                                        >
                                            <td class="p-4">
                                                <div
                                                    class="flex items-center gap-2"
                                                >
                                                    <div
                                                        class="w-8 h-8 rounded bg-white/10 flex items-center justify-center text-xs font-bold"
                                                    >
                                                        {item.platform?.charAt(
                                                            0,
                                                        ) || "?"}
                                                    </div>
                                                    <span
                                                        class="text-white font-medium"
                                                        >{item.platform ||
                                                            "Unknown"}</span
                                                    >
                                                </div>
                                            </td>
                                            <td
                                                class="p-4 text-sm font-bold text-white"
                                            >
                                                {item.amount
                                                    ? (
                                                          Number(item.amount) /
                                                          1e18
                                                      ).toFixed(4)
                                                    : "0.00"} ETH
                                            </td>
                                            <td
                                                class="p-4 text-sm text-green-400"
                                            >
                                                {item.remaining
                                                    ? (
                                                          Number(
                                                              item.remaining,
                                                          ) / 1e18
                                                      ).toFixed(4)
                                                    : "0.00"} ETH
                                            </td>
                                            <td
                                                class="p-4 text-sm text-blue-400"
                                            >
                                                {item.taken
                                                    ? (
                                                          Number(item.taken) /
                                                          1e18
                                                      ).toFixed(4)
                                                    : "0.00"} ETH
                                            </td>
                                            <td
                                                class="p-4 text-sm text-gray-300"
                                            >
                                                <span
                                                    class="px-2 py-1 bg-white/5 rounded text-xs font-medium"
                                                >
                                                    {item.currency || "USD"}
                                                </span>
                                            </td>
                                            <td class="p-4">
                                                <div
                                                    class="flex items-center gap-2"
                                                >
                                                    <span
                                                        class="w-2 h-2 rounded-full bg-yellow-500"
                                                    ></span>
                                                    <span
                                                        class="text-sm font-medium text-yellow-400"
                                                        >🔒 Locked</span
                                                    >
                                                </div>
                                            </td>
                                        </tr>
                                    {/each}
                                </tbody>
                            </table>
                        </div>
                    </div>
                {/if}
            </div>

            <!-- Closed Deposits Table -->
            <div class="space-y-3">
                <div class="flex items-center justify-between">
                    <h2 class="text-xl font-bold text-white">
                        Closed Deposits
                    </h2>
                    <span class="text-sm text-gray-500"
                        >{closedDeposits.length} closed</span
                    >
                </div>

                {#if closedDeposits.length === 0}
                    <div class="glass-panel p-8 text-center text-gray-500">
                        <p>No closed deposits</p>
                    </div>
                {:else}
                    <div class="glass-panel overflow-hidden" transition:fade>
                        <div class="overflow-x-auto">
                            <table class="w-full text-left">
                                <thead>
                                    <tr
                                        class="border-b border-white/5 bg-white/5"
                                    >
                                        <th
                                            class="p-4 text-xs font-bold text-gray-400 uppercase tracking-wider"
                                            >Platform</th
                                        >
                                        <th
                                            class="p-4 text-xs font-bold text-gray-400 uppercase tracking-wider"
                                            >Amount</th
                                        >
                                        <th
                                            class="p-4 text-xs font-bold text-gray-400 uppercase tracking-wider"
                                            >Remaining</th
                                        >
                                        <th
                                            class="p-4 text-xs font-bold text-gray-400 uppercase tracking-wider"
                                            >Taken</th
                                        >
                                        <th
                                            class="p-4 text-xs font-bold text-gray-400 uppercase tracking-wider"
                                            >Currency</th
                                        >
                                        <th
                                            class="p-4 text-xs font-bold text-gray-400 uppercase tracking-wider"
                                            >Status</th
                                        >
                                    </tr>
                                </thead>
                                <tbody class="divide-y divide-white/5">
                                    {#each closedDeposits as item}
                                        <tr
                                            class="hover:bg-white/5 transition-colors group"
                                        >
                                            <td class="p-4">
                                                <div
                                                    class="flex items-center gap-2"
                                                >
                                                    <div
                                                        class="w-8 h-8 rounded bg-white/10 flex items-center justify-center text-xs font-bold"
                                                    >
                                                        {item.platform?.charAt(
                                                            0,
                                                        ) || "?"}
                                                    </div>
                                                    <span
                                                        class="text-white font-medium"
                                                        >{item.platform ||
                                                            "Unknown"}</span
                                                    >
                                                </div>
                                            </td>
                                            <td
                                                class="p-4 text-sm font-bold text-white"
                                            >
                                                {item.amount
                                                    ? (
                                                          Number(item.amount) /
                                                          1e18
                                                      ).toFixed(4)
                                                    : "0.00"} ETH
                                            </td>
                                            <td
                                                class="p-4 text-sm text-green-400"
                                            >
                                                {item.remaining
                                                    ? (
                                                          Number(
                                                              item.remaining,
                                                          ) / 1e18
                                                      ).toFixed(4)
                                                    : "0.00"} ETH
                                            </td>
                                            <td
                                                class="p-4 text-sm text-blue-400"
                                            >
                                                {item.taken
                                                    ? (
                                                          Number(item.taken) /
                                                          1e18
                                                      ).toFixed(4)
                                                    : "0.00"} ETH
                                            </td>
                                            <td
                                                class="p-4 text-sm text-gray-300"
                                            >
                                                <span
                                                    class="px-2 py-1 bg-white/5 rounded text-xs font-medium"
                                                >
                                                    {item.currency || "USD"}
                                                </span>
                                            </td>
                                            <td class="p-4">
                                                <div
                                                    class="flex items-center gap-2"
                                                >
                                                    <span
                                                        class="w-2 h-2 rounded-full bg-green-500"
                                                    ></span>
                                                    <span
                                                        class="text-sm font-medium text-green-400"
                                                        >✓ {item.status ||
                                                            "Completed"}</span
                                                    >
                                                </div>
                                            </td>
                                        </tr>
                                    {/each}
                                </tbody>
                            </table>
                        </div>
                    </div>
                {/if}
            </div>
        {/if}
    </div>
</div>

<style>
    .glass-panel {
        background: rgba(255, 255, 255, 0.03);
        backdrop-filter: blur(10px);
        border: 1px solid rgba(255, 255, 255, 0.05);
        border-radius: 1.5rem;
    }
</style>
