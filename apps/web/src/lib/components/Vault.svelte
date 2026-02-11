<script lang="ts">
    import { nearService } from "$lib/services/near";
    import { onMount } from "svelte";
    import { formatUnits } from "viem";

    let accountId: string | null = null;
    let stakes: Array<{ chain: string; asset: string; amount: string }> = [];
    let isLoading = false;
    let status = "";

    // Withdrawal Form
    let selectedStake: { chain: string; asset: string; amount: string } | null =
        null;
    let withdrawAmount = "";
    let recipientAddress = "";

    onMount(async () => {
        if (nearService.wallet?.isSignedIn()) {
            accountId = nearService.wallet.getAccountId();
            await loadStakes();
        }
    });

    async function loadStakes() {
        if (!accountId) return;
        isLoading = true;
        try {
            // For MVP, if contract call fails (not deployed), show mock
            try {
                // @ts-ignore
                const rawStakes =
                    await nearService.getUserStakesReal(accountId);
                // Parse raw stakes (Vec<(String, u128)>)
                // Asset Key format "CHAIN:ASSET"
                stakes = rawStakes.map(([key, amount]: [string, string]) => {
                    const [chain, asset] = key.split(":");
                    return { chain, asset, amount };
                });
            } catch (e) {
                console.warn(
                    "Failed to fetch real stakes (contract might not be deployed), showing empty state or mock for dev",
                    e,
                );
                stakes = [];
            }
        } catch (e) {
            console.error(e);
        } finally {
            isLoading = false;
        }
    }

    function selectForWithdraw(stake: any) {
        selectedStake = stake;
        withdrawAmount = formatUnits(BigInt(stake.amount), 24); // Default to max
        recipientAddress = "";
        status = "";
    }

    async function handleWithdraw() {
        if (!selectedStake || !recipientAddress) return;
        isLoading = true;
        status = "Processing Withdrawal...";
        try {
            await nearService.withdraw(
                selectedStake.chain,
                selectedStake.asset,
                withdrawAmount,
                recipientAddress,
            );
            status = "Withdrawal Initiated! Check transaction history.";
            selectedStake = null;
            await loadStakes(); // Refresh
        } catch (e: any) {
            console.error(e);
            status = "Error: " + e.message;
        } finally {
            isLoading = false;
        }
    }
</script>

<div class="p-6 bg-gray-900 rounded-xl border border-gray-800">
    <div class="flex justify-between items-center mb-6">
        <h2 class="text-xl font-bold text-white">My Vault</h2>
        <button
            on:click={loadStakes}
            class="text-sm text-blue-400 hover:text-blue-300">Refresh</button
        >
    </div>

    {#if !accountId}
        <div class="text-gray-400 text-center py-8">
            Please connect your wallet to view vault assets.
        </div>
    {:else if stakes.length === 0 && !isLoading}
        <div
            class="text-gray-400 text-center py-8 bg-gray-800/50 rounded-lg border border-gray-700/50 border-dashed"
        >
            No assets in vault. <br />
            <span class="text-sm text-gray-500"
                >Deposits from trades will appear here.</span
            >
        </div>
    {:else}
        <div class="overflow-x-auto">
            <table class="w-full text-left text-gray-300">
                <thead class="bg-gray-800 text-xs uppercase text-gray-400">
                    <tr>
                        <th class="px-4 py-3">Chain</th>
                        <th class="px-4 py-3">Asset</th>
                        <th class="px-4 py-3 align-right">Balance</th>
                        <th class="px-4 py-3">Action</th>
                    </tr>
                </thead>
                <tbody>
                    {#each stakes as stake}
                        <tr
                            class="border-b border-gray-800 hover:bg-gray-800/30"
                        >
                            <td class="px-4 py-3 font-medium text-white"
                                >{stake.chain}</td
                            >
                            <td class="px-4 py-3">{stake.asset}</td>
                            <td class="px-4 py-3 font-mono"
                                >{formatUnits(BigInt(stake.amount), 24)}</td
                            >
                            <td class="px-4 py-3">
                                <button
                                    on:click={() => selectForWithdraw(stake)}
                                    class="text-xs bg-gray-700 hover:bg-gray-600 text-white px-3 py-1.5 rounded transition-colors"
                                >
                                    Withdraw
                                </button>
                            </td>
                        </tr>
                    {/each}
                </tbody>
            </table>
        </div>
    {/if}

    <!-- Withdrawal Modal / Section -->
    {#if selectedStake}
        <div
            class="mt-6 p-4 bg-gray-800 rounded-lg border border-gray-700 animate-in fade-in slide-in-from-top-2"
        >
            <h3 class="text-lg font-bold text-white mb-4">
                Withdraw {selectedStake.asset} ({selectedStake.chain})
            </h3>

            <div class="space-y-4">
                <div>
                    <label class="block text-sm font-medium text-gray-400 mb-1"
                        >Amount</label
                    >
                    <input
                        type="number"
                        bind:value={withdrawAmount}
                        class="w-full bg-gray-900 border-gray-600 rounded-lg p-2.5 text-white"
                    />
                </div>

                <div>
                    <label class="block text-sm font-medium text-gray-400 mb-1"
                        >Recipient Address ({selectedStake.chain})</label
                    >
                    <input
                        type="text"
                        bind:value={recipientAddress}
                        placeholder={selectedStake.chain === "ETH"
                            ? "0x..."
                            : "tb1..."}
                        class="w-full bg-gray-900 border-gray-600 rounded-lg p-2.5 text-white"
                    />
                </div>

                <div class="flex space-x-3 pt-2">
                    <button
                        on:click={handleWithdraw}
                        disabled={isLoading}
                        class="flex-1 bg-blue-600 hover:bg-blue-700 text-white font-medium py-2.5 rounded-lg"
                    >
                        {isLoading ? "Confirming..." : "Confirm Withdrawal"}
                    </button>
                    <button
                        on:click={() => (selectedStake = null)}
                        class="px-4 text-gray-400 hover:text-white"
                    >
                        Cancel
                    </button>
                </div>

                {#if status}
                    <div
                        class="text-sm {status.includes('Error')
                            ? 'text-red-400'
                            : 'text-blue-400'}"
                    >
                        {status}
                    </div>
                {/if}
            </div>
        </div>
    {/if}
</div>
