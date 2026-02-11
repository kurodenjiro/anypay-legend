<script lang="ts">
    import { page } from "$app/stores";
    import { nearService, nearStore } from "$lib/services/near";
    import { onMount } from "svelte";

    // Computed properties from NEAR store
    $: authenticated = $nearStore.isConnected;
    $: address = $nearStore.accountId;

    onMount(async () => {
        await nearService.init();
    });

    function handleLogin() {
        nearService.login();
    }
</script>

<nav
    class="fixed top-0 left-0 right-0 z-50 flex items-center justify-between px-6 py-4 backdrop-blur-md bg-black/20 border-b border-white/5"
>
    <!-- Left: Logo -->
    <a href="/" class="flex items-center gap-2 group">
        <div
            class="w-10 h-10 bg-white rounded-xl flex items-center justify-center text-black font-bold text-xl group-hover:scale-105 transition-transform"
        >
            Z
        </div>
        <span class="font-bold text-xl tracking-tight hidden sm:block"
            >ZK P2P</span
        >
    </a>

    <!-- Center: Navigation -->
    <div class="hidden md:flex items-center gap-8">
        <a
            href="/buy"
            class="text-sm font-medium text-gray-400 hover:text-white transition-colors border-b-2 border-transparent hover:border-white/20 pb-1"
            >Buy</a
        >
        <a
            href="/sell"
            class="text-sm font-medium text-gray-400 hover:text-white transition-colors border-b-2 border-transparent hover:border-white/20 pb-1"
            >Sell</a
        >
        <a
            href="/leaderboard"
            class="text-sm font-medium text-gray-400 hover:text-white transition-colors border-b-2 border-transparent hover:border-white/20 pb-1"
            >Leaderboard</a
        >
        <a
            href="/dashboard"
            class="text-sm font-medium text-gray-400 hover:text-white transition-colors border-b-2 border-transparent hover:border-white/20 pb-1"
            >Dashboard</a
        >
    </div>

    <!-- Right: Wallet -->
    <div class="flex items-center">
        {#if authenticated}
            <button
                on:click={() => nearService.logout()}
                class="flex items-center gap-2 bg-white/5 hover:bg-white/10 border border-white/5 px-4 py-2 rounded-full transition-all group"
            >
                <div
                    class="w-2 h-2 rounded-full bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.5)]"
                ></div>
                <span
                    class="text-sm font-medium text-gray-300 group-hover:text-white"
                >
                    {address?.length > 20
                        ? address.slice(0, 15) + "..."
                        : address}
                </span>
            </button>
        {:else}
            <button
                on:click={handleLogin}
                class="btn-primary text-sm py-2 px-6"
            >
                Connect Wallet
            </button>
        {/if}
    </div>
</nav>
