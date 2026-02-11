<script lang="ts">
    import { onMount } from "svelte";

    let data: any = null;

    onMount(async () => {
        const res = await fetch("/api/mock-transfer");
        data = await res.json();
    });
</script>

<div class="flex items-center justify-center min-h-[80vh]">
    <div
        class="bg-white rounded-3xl shadow-xl max-w-md w-full border border-gray-100 overflow-hidden relative"
    >
        <div class="bg-green-600 h-2 w-full absolute top-0"></div>
        <div class="p-8">
            <div class="text-center mb-8">
                <div
                    class="mx-auto flex items-center justify-center h-16 w-16 rounded-full bg-green-100 mb-4 animate-bounce-slow"
                >
                    <svg
                        class="h-8 w-8 text-green-600"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                    >
                        <path
                            stroke-linecap="round"
                            stroke-linejoin="round"
                            stroke-width="2"
                            d="M5 13l4 4L19 7"
                        />
                    </svg>
                </div>
                <h1 class="text-2xl font-bold text-gray-900">
                    Transfer Successful
                </h1>
                <p class="text-sm text-gray-500 mt-1">
                    Receipt for your transaction
                </p>
            </div>

            {#if data}
                <div class="space-y-6">
                    <div
                        class="text-center pb-6 border-b border-dashed border-gray-200"
                    >
                        <p
                            class="text-sm text-gray-500 uppercase tracking-wide font-semibold"
                        >
                            Total Amount
                        </p>
                        <p class="text-4xl font-extrabold text-gray-900 mt-2">
                            {parseInt(data.amount).toLocaleString()}
                            <span class="text-2xl text-gray-600 font-medium"
                                >{data.currency}</span
                            >
                        </p>
                    </div>

                    <div class="bg-gray-50 rounded-xl p-5 space-y-4">
                        <div class="flex justify-between items-center">
                            <p class="text-sm text-gray-500">Receiver</p>
                            <p class="font-semibold text-gray-900">
                                {data.receiver.name}
                            </p>
                        </div>
                        <div class="flex justify-between items-center">
                            <p class="text-sm text-gray-500">Account</p>
                            <p
                                class="font-mono text-gray-700 bg-white px-2 py-0.5 rounded border border-gray-200 text-xs"
                            >
                                {data.receiver.account}
                            </p>
                        </div>
                        <div class="flex justify-between items-center">
                            <p class="text-sm text-gray-500">Date</p>
                            <p class="text-sm text-gray-900">
                                {new Date(data.timestamp).toLocaleString()}
                            </p>
                        </div>
                    </div>

                    <div class="pt-2">
                        <p class="text-xs text-center text-gray-400 font-mono">
                            ID: {data.txId}
                        </p>
                    </div>
                </div>
            {:else}
                <div class="py-12 flex justify-center">
                    <div
                        class="animate-spin rounded-full h-8 w-8 border-b-2 border-green-600"
                    ></div>
                </div>
            {/if}
        </div>
        <div class="bg-gray-50 px-8 py-4 border-t border-gray-100">
            <a
                href="/"
                class="block w-full text-center bg-white border border-gray-300 hover:bg-gray-50 text-gray-700 font-semibold py-2.5 px-4 rounded-xl transition-all shadow-sm"
            >
                Start New Transaction
            </a>
        </div>
    </div>
</div>

<style>
    @keyframes bounce-slow {
        0%,
        100% {
            transform: translateY(-5%);
        }
        50% {
            transform: translateY(5%);
        }
    }
    .animate-bounce-slow {
        animation: bounce-slow 2s infinite ease-in-out;
    }
</style>
