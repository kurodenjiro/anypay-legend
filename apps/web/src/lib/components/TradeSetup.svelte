<script lang="ts">
    import { createEventDispatcher } from "svelte";
    import { nearService, nearStore } from "$lib/services/near";

    const dispatch = createEventDispatcher();

    $: if ($nearStore.isConnected) {
        dispatch("next");
    }

    function handleConnect() {
        nearService.login();
    }
</script>

<div
    class="flex flex-col items-center justify-center p-8 space-y-6 text-center animate-fade-in-up"
>
    {#if !$nearStore.isConnected}
        <div
            class="w-20 h-20 rounded-full bg-white/5 flex items-center justify-center text-4xl mb-4 border border-white/10"
        >
            🔌
        </div>
        <h3 class="text-2xl font-bold">Connect Vault</h3>
        <p class="text-gray-400 max-w-sm">
            Connect your NEAR wallet to access your secure Multi-Chain Vault.
            Assets are held in an MPC-controlled account.
        </p>

        <button
            on:click={handleConnect}
            class="btn-primary py-4 px-8 text-lg w-full max-w-xs mt-4"
        >
            Connect Wallet
        </button>
    {:else}
        <!-- Transient state while transitioning -->
        <div class="animate-pulse flex flex-col items-center">
            <div
                class="w-16 h-16 rounded-full bg-green-500/20 flex items-center justify-center mb-4"
            >
                <span class="text-2xl">⚡️</span>
            </div>
            <p class="text-green-400 font-bold">Connected! Proceeding...</p>
        </div>
    {/if}
</div>
