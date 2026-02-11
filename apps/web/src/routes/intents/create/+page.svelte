<script lang="ts">
    import { onMount } from "svelte";
    import { walletStore } from "$lib/stores/wallet";
    import { CONTRACTS } from "$lib/contracts";
    import { goto } from "$app/navigation";

    let amount = "20"; // USDC
    let bank = "vpbank";
    let isLoading = false;
    let intentId = "";

    // Reactive wallet state
    $: authenticated = $walletStore.authenticated;
    $: user = $walletStore.user;

    const handleConnect = () => {
        if ($walletStore.login) $walletStore.login();
    };

    const handleSubmit = async (e: Event) => {
        e.preventDefault();
        if (!authenticated) return;

        isLoading = true;

        try {
            console.log("Preparing intent...", {
                amount,
                bank,
                user: user?.wallet?.address,
            });

            // Mock API Work
            await new Promise((resolve) => setTimeout(resolve, 1500));

            intentId = "intent_" + Math.random().toString(36).substring(7);
        } catch (error) {
            console.error(error);
            alert("Failed to broadcast intent");
        } finally {
            isLoading = false;
        }
    };
</script>

<div
    class="flex items-center justify-center py-20 px-4 sm:px-6 lg:px-8 relative"
>
    <!-- Background Decor -->
    <div
        class="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-blue-100/30 rounded-full blur-3xl -z-10 animate-pulse"
    ></div>

    <div
        class="max-w-md w-full glass-panel rounded-3xl p-10 relative overflow-hidden"
    >
        {#if intentId}
            <div class="text-center animate-in fade-in duration-500">
                <div
                    class="mx-auto flex items-center justify-center h-20 w-20 rounded-full bg-blue-50 border border-blue-100 mb-6 shadow-sm"
                >
                    <svg
                        class="h-10 w-10 text-blue-600"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                    >
                        <path
                            stroke-linecap="round"
                            stroke-linejoin="round"
                            stroke-width="2"
                            d="M13 10V3L4 14h7v7l9-11h-7z"
                        />
                    </svg>
                </div>
                <h2
                    class="text-3xl font-extrabold text-slate-900 mb-2 tracking-tight"
                >
                    Broadcasted!
                </h2>
                <p class="text-slate-500 mb-8 leading-relaxed">
                    Your off-ramp intent is now live on the solver network.
                </p>

                <div
                    class="bg-slate-50/80 p-5 rounded-xl border border-slate-200 mb-8 text-left"
                >
                    <p
                        class="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2"
                    >
                        Intent Identifier
                    </p>
                    <p
                        class="font-mono text-sm break-all text-slate-700 bg-white p-2 rounded border border-slate-100"
                    >
                        {intentId}
                    </p>
                </div>

                <div class="space-y-4">
                    <a
                        href="/mock-bank/transfer"
                        class="btn-primary w-full flex items-center justify-center bg-blue-600 hover:bg-blue-700 border-transparent shadow-xl shadow-blue-200/50"
                    >
                        <span>Simulate Bank Transfer</span>
                        <svg
                            class="w-4 h-4 ml-2"
                            fill="none"
                            viewBox="0 0 24 24"
                            stroke="currentColor"
                            ><path
                                stroke-linecap="round"
                                stroke-linejoin="round"
                                stroke-width="2"
                                d="M17 8l4 4m0 0l-4 4m4-4H3"
                            /></svg
                        >
                    </a>
                    <button
                        on:click={() => (intentId = "")}
                        class="block w-full text-center text-slate-500 hover:text-slate-800 font-medium py-2 transition-colors"
                    >
                        Create New Intent
                    </button>
                </div>
            </div>
        {:else}
            <div>
                <h2
                    class="text-center text-3xl font-extrabold text-slate-900 tracking-tight mb-2"
                >
                    Create Sell Intent
                </h2>
                <p class="text-center text-slate-500 mb-8">
                    Liquidity via ZKP2P Network
                </p>
            </div>

            {#if !authenticated}
                <div class="space-y-8">
                    <div
                        class="bg-blue-50/50 border border-blue-200/60 rounded-xl p-6 flex items-start space-x-4"
                    >
                        <div class="flex-shrink-0 mt-0.5">
                            <svg
                                class="h-5 w-5 text-blue-500"
                                xmlns="http://www.w3.org/2000/svg"
                                viewBox="0 0 20 20"
                                fill="currentColor"
                            >
                                <path
                                    fill-rule="evenodd"
                                    d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z"
                                    clip-rule="evenodd"
                                />
                            </svg>
                        </div>
                        <div>
                            <p class="text-sm font-medium text-blue-900">
                                Wallet Connection Needed
                            </p>
                            <p class="text-sm text-blue-700 mt-1">
                                Connect to sign the intent broadcast.
                            </p>
                        </div>
                    </div>
                    <button
                        on:click={handleConnect}
                        class="btn-primary w-full shadow-xl shadow-slate-200"
                    >
                        Connect Wallet
                    </button>
                </div>
            {:else}
                <form class="space-y-6" on:submit={handleSubmit}>
                    <div class="space-y-6">
                        <!-- Amount Input -->
                        <div>
                            <label
                                for="amount"
                                class="block text-sm font-semibold text-slate-700 mb-2"
                                >Amount to Sell</label
                            >
                            <div class="relative group">
                                <div
                                    class="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none"
                                >
                                    <span class="text-slate-400 text-lg">$</span
                                    >
                                </div>
                                <input
                                    type="number"
                                    name="amount"
                                    id="amount"
                                    bind:value={amount}
                                    class="input-field pl-8 pr-16 text-lg font-medium tabular-nums"
                                    placeholder="0.00"
                                />
                                <div
                                    class="absolute inset-y-0 right-0 pr-4 flex items-center pointer-events-none"
                                >
                                    <span
                                        class="text-slate-400 font-medium text-sm bg-slate-100 px-2 py-1 rounded"
                                        >USDC</span
                                    >
                                </div>
                            </div>
                        </div>

                        <!-- Bank Selection -->
                        <div>
                            <label
                                for="bank"
                                class="block text-sm font-semibold text-slate-700 mb-2"
                                >Fiat Destination</label
                            >
                            <div class="relative">
                                <select
                                    id="bank"
                                    name="bank"
                                    bind:value={bank}
                                    class="input-field appearance-none"
                                >
                                    <option value="vpbank">VPBank</option>
                                    <option value="vietcombank"
                                        >Vietcombank</option
                                    >
                                    <option value="acb">ACB</option>
                                </select>
                                <div
                                    class="absolute inset-y-0 right-0 flex items-center px-4 pointer-events-none"
                                >
                                    <svg
                                        class="h-4 w-4 text-slate-400"
                                        fill="none"
                                        viewBox="0 0 24 24"
                                        stroke="currentColor"
                                    >
                                        <path
                                            stroke-linecap="round"
                                            stroke-linejoin="round"
                                            stroke-width="2"
                                            d="M19 9l-7 7-7-7"
                                        />
                                    </svg>
                                </div>
                            </div>
                        </div>
                    </div>

                    <div class="pt-4">
                        <button
                            type="submit"
                            disabled={isLoading}
                            class="btn-primary w-full flex items-center justify-center bg-blue-600 hover:bg-blue-700 border-transparent shadow-xl shadow-blue-200/50 disabled:shadow-none"
                        >
                            {#if isLoading}
                                <svg
                                    class="animate-spin h-5 w-5 text-white/80 mr-3"
                                    xmlns="http://www.w3.org/2000/svg"
                                    fill="none"
                                    viewBox="0 0 24 24"
                                >
                                    <circle
                                        class="opacity-25"
                                        cx="12"
                                        cy="12"
                                        r="10"
                                        stroke="currentColor"
                                        stroke-width="4"
                                    ></circle>
                                    <path
                                        class="opacity-75"
                                        fill="currentColor"
                                        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                                    ></path>
                                </svg>
                                <span>Broadcasting...</span>
                            {:else}
                                Create Intent
                            {/if}
                        </button>
                    </div>
                </form>
            {/if}
        {/if}
    </div>
</div>
