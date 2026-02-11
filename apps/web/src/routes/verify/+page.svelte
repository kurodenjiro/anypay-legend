<script>
    import PrivacyPanel from "$lib/components/PrivacyPanel.svelte";
</script>

<div
    class="w-full min-h-[80vh] flex flex-col items-center justify-center pt-24 pb-20"
>
    <div class="glass-panel p-8 max-w-lg w-full text-center">
        <h1 class="text-2xl font-bold mb-4">Verify Payment Proof</h1>
        <p class="text-gray-400 mb-8">
            Enter a proof hash to verify the zero-knowledge proof validity
            on-chain.
        </p>

        <input
            type="text"
            placeholder="0x..."
            class="input-dark mb-6 text-sm"
        />

        <button class="btn-primary w-full py-4">Verify Proof</button>
    </div>

    <PrivacyPanel />
</div>
