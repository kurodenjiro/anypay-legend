<script lang="ts">
    import { nearService } from "$lib/services/near";
    import { onMount } from "svelte";

    let name = "";
    let verifier = "";
    let currencies = ""; // Comma separated
    let status = "";
    let isLoading = false;

    async function handleAdd() {
        isLoading = true;
        status = "Adding...";
        try {
            const currencyList = currencies
                .split(",")
                .map((c) => c.trim())
                .filter((c) => c.length > 0);
            await nearService.addPaymentMethod(name, verifier, currencyList);
            status = `Success! Added ${name}`;
            name = "";
            verifier = "";
            currencies = "";
        } catch (e: any) {
            console.error(e);
            status = "Error: " + e.message;
        } finally {
            isLoading = false;
        }
    }

    async function handleRemove() {
        if (!name) return;
        isLoading = true;
        status = "Removing...";
        try {
            await nearService.removePaymentMethod(name);
            status = `Success! Removed ${name}`;
            name = "";
        } catch (e: any) {
            console.error(e);
            status = "Error: " + e.message;
        } finally {
            isLoading = false;
        }
    }
</script>

<div class="p-6 bg-gray-900 rounded-xl border border-gray-800">
    <h2 class="text-xl font-bold mb-4 text-white">
        zkTLS Platform Registry (Admin)
    </h2>

    <div class="space-y-4">
        <div>
            <label class="block text-sm font-medium text-gray-400 mb-1"
                >Platform Name</label
            >
            <input
                type="text"
                bind:value={name}
                placeholder="e.g. venmo, revolut"
                class="w-full bg-gray-800 border-gray-700 rounded-lg p-2.5 text-white focus:ring-blue-500 focus:border-blue-500"
            />
        </div>

        <div>
            <label class="block text-sm font-medium text-gray-400 mb-1"
                >Verifier Address / ID</label
            >
            <input
                type="text"
                bind:value={verifier}
                placeholder="zkTLS Verifier Contract ID or PubKey"
                class="w-full bg-gray-800 border-gray-700 rounded-lg p-2.5 text-white focus:ring-blue-500 focus:border-blue-500"
            />
        </div>

        <div>
            <label class="block text-sm font-medium text-gray-400 mb-1"
                >Currencies (comma separated)</label
            >
            <input
                type="text"
                bind:value={currencies}
                placeholder="USD, EUR, GBP"
                class="w-full bg-gray-800 border-gray-700 rounded-lg p-2.5 text-white focus:ring-blue-500 focus:border-blue-500"
            />
        </div>

        <div class="flex space-x-3 pt-2">
            <button
                on:click={handleAdd}
                disabled={isLoading || !name || !verifier || !currencies}
                class="flex-1 bg-blue-600 hover:bg-blue-700 text-white font-medium py-2.5 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
                {isLoading ? "Processing..." : "Add Platform"}
            </button>

            <button
                on:click={handleRemove}
                disabled={isLoading || !name}
                class="px-4 bg-red-900/50 hover:bg-red-900 text-red-200 border border-red-800 font-medium py-2.5 rounded-lg disabled:opacity-50 transition-colors"
            >
                Remove
            </button>
        </div>

        {#if status}
            <div
                class="p-3 rounded-lg bg-gray-800 text-sm {status.includes(
                    'Error',
                )
                    ? 'text-red-400'
                    : 'text-green-400'}"
            >
                {status}
            </div>
        {/if}
    </div>
</div>
