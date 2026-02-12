<script>
    import Vault from "$lib/components/Vault.svelte";
    import MultiChainDeposit from "$lib/components/MultiChainDeposit.svelte";

    let depositStatus = "";

    function handleDeposit(data) {
        console.log("Deposit initiated:", data);
        depositStatus = `Deposit simulated! Mock TX: ${data.txHash}`;
    }
</script>

<div class="container mx-auto px-6 py-24 min-h-screen">
    <div class="max-w-4xl mx-auto space-y-12">
        <!-- Header -->
        <div>
            <h1 class="text-3xl font-bold text-white tracking-tight">
                Dashboard
            </h1>
            <p class="text-gray-400 mt-2">Manage your cross-chain assets.</p>
        </div>

        <div class="grid grid-cols-1 md:grid-cols-2 gap-8">
            <!-- Stakes (Vault) -->
            <section>
                <Vault />
            </section>

            <!-- Deposit -->
            <section>
                <MultiChainDeposit onDeposit={handleDeposit} />
                {#if depositStatus}
                    <div
                        class="mt-4 p-4 bg-green-900/50 border border-green-500/50 rounded-lg text-green-200"
                    >
                        {depositStatus}
                    </div>
                {/if}
            </section>
        </div>
    </div>
</div>
