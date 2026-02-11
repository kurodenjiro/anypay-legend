<script>
    import Vault from "$lib/components/Vault.svelte";
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

        <!-- Stakes -->
        <section>
            <Vault />
        </section>
    </div>
</div>
