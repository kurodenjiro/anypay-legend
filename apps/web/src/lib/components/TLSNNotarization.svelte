<script lang="ts">
    import { createEventDispatcher, onMount } from "svelte";

    export let tradeData: any;

    const dispatch = createEventDispatcher();

    // Commitment Time Order:
    // 1. Signal (T0) -> 2. Payment (T1) -> 3. Proof
    // We must ensure T1 is within [T0, T0 + 15min]

    const COMMITMENT_WINDOW_MS = 15 * 60 * 1000; // 15 minutes
    const deadline = tradeData.timestamp + COMMITMENT_WINDOW_MS;

    let timeLeft = Math.floor((deadline - Date.now()) / 1000);
    let timeString = "15:00";
    let step = "pay"; // 'pay' | 'notarize' | 'processing' | 'success'

    function formatTime(seconds: number) {
        if (seconds < 0) return "EXPIRED";
        const m = Math.floor(seconds / 60);
        const s = seconds % 60;
        return `${m}:${s < 10 ? "0" : ""}${s}`;
    }

    onMount(() => {
        const timer = setInterval(() => {
            timeLeft = Math.floor((deadline - Date.now()) / 1000);
            timeString = formatTime(timeLeft);

            if (timeLeft <= 0) {
                clearInterval(timer);
                // Ideally disable the button here
            }
        }, 1000);
        return () => clearInterval(timer);
    });

    import { tlsnService } from "$lib/services/tlsn";

    // ...

    // Real-world API configurations (Assembly)
    const BANK_APIS: any = {
        Revolut: {
            url: "https://app.revolut.com/api/retail/transaction",
            host: "app.revolut.com",
        },
        Wise: {
            url: "https://wise.com/gateway/v1/transfer",
            host: "wise.com",
        },
        Venmo: {
            url: "https://api.venmo.com/v1/payments",
            host: "api.venmo.com",
        },
    };

    async function handleStartNotarization() {
        step = "processing";
        try {
            // 1. Connect to Extension
            await tlsnService.connect();

            // Select the REAL API config based on user choice
            const platform = tradeData.payingUsing.platform.name;
            const apiConfig = BANK_APIS[platform];

            if (!apiConfig)
                throw new Error(
                    `Platform ${platform} not supported for automated proof.`,
                );

            // 2. Generate Proof via Extension
            // This will trigger the actual browser extension popup
            // Pass REAL parameters to the service
            const proof = await tlsnService.generateProof(
                tradeData,
                {
                    url: apiConfig.url,
                    method: "GET",
                    headers: {
                        Host: apiConfig.host,
                        Connection: "close",
                        // The extension will naturally require the user to be logged in to these domains
                        // We do NOT mock auth tokens; we rely on the browser session.
                    },
                },
                {
                    verificationUrl: "http://localhost:3000", // Notary Server
                },
            );

            dispatch("proofGenerated", {
                proofHash: "0xProof...", // Placeholder for the actual unique hash from proof
                proofData: proof,
                timestamp: Date.now(),
            });

            // For buyers, call fulfillIntent to release escrowed funds
            if (tradeData.mode === "buy" && tradeData.matchedSeller) {
                try {
                    step = "processing";
                    console.log("Calling fulfillIntent for buyer...");

                    const { contractService } = await import(
                        "$lib/services/contract"
                    );
                    const hash = await contractService.fulfillIntent(
                        tradeData.matchedSeller.intentHash,
                        proof,
                    );

                    console.log("FulfillIntent transaction hash:", hash);
                    step = "success";
                } catch (error) {
                    console.error("Failed to fulfill intent:", error);
                    alert("Failed to release funds: " + (error as any).message);
                    step = "notarize";
                    return;
                }
            } else {
                // For sellers, just show success (no on-chain action needed)
                step = "success";
            }
        } catch (e) {
            console.error("TLSN Error:", e);
            alert("TLSN Error: " + (e as any).message);
            step = "notarize"; // Reset state on error
        }
    }
</script>

<div class="space-y-6">
    <!-- Escrow Status Table -->
    <div class="glass-panel p-4 border-l-4 border-green-500">
        <div class="flex items-center gap-2 mb-4">
            <div
                class="w-6 h-6 rounded-full bg-green-500/20 flex items-center justify-center"
            >
                <svg
                    class="w-4 h-4 text-green-500"
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
            <h3 class="font-bold text-white">Funds Escrowed Successfully</h3>
        </div>

        <div class="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
            <div>
                <p class="text-gray-500 text-xs uppercase tracking-wider mb-1">
                    Amount Locked
                </p>
                <p class="text-white font-mono font-bold">
                    {tradeData.amount}
                    {tradeData.sellingAsset?.token?.sym || "ETH"}
                </p>
            </div>
            <div>
                <p class="text-gray-500 text-xs uppercase tracking-wider mb-1">
                    Platform
                </p>
                <p class="text-white font-bold">
                    {tradeData.payingUsing.platform.name}
                </p>
            </div>
            <div>
                <p class="text-gray-500 text-xs uppercase tracking-wider mb-1">
                    Currency
                </p>
                <p class="text-white font-bold">
                    {tradeData.payingUsing.currency.code}
                </p>
            </div>
            <div>
                <p class="text-gray-500 text-xs uppercase tracking-wider mb-1">
                    Status
                </p>
                <span
                    class="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-bold bg-green-500/20 text-green-400 border border-green-500/20"
                >
                    <span
                        class="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse"
                    ></span>
                    LOCKED
                </span>
            </div>
        </div>
    </div>

    {#if step === "success"}
        <!-- Success State -->
        <div class="glass-panel p-8 text-center animate-fade-in">
            <div
                class="w-20 h-20 bg-green-500/20 rounded-full flex items-center justify-center mx-auto mb-6"
            >
                <svg
                    class="w-10 h-10 text-green-500"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                >
                    <path
                        stroke-linecap="round"
                        stroke-linejoin="round"
                        stroke-width="2"
                        d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
                    />
                </svg>
            </div>
            <h2 class="text-3xl font-bold text-white mb-2">Proof Generated!</h2>
            <p class="text-gray-400 max-w-md mx-auto mb-8">
                Your payment has been cryptographically proven. The funds will
                now be released to your wallet.
            </p>
            <a
                href="/history"
                class="btn-primary inline-flex items-center gap-2 px-8 py-3 rounded-xl no-underline"
            >
                View in Dashboard
                <svg
                    class="w-4 h-4"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                >
                    <path
                        stroke-linecap="round"
                        stroke-linejoin="round"
                        stroke-width="2"
                        d="M14 5l7 7m0 0l-7 7m7-7H3"
                    />
                </svg>
            </a>
        </div>
    {:else}
        <!-- Timer Header -->
        <div
            class="flex items-center justify-between p-4 bg-red-500/10 border border-red-500/20 rounded-xl"
        >
            <span
                class="text-xs font-bold text-red-400 uppercase tracking-widest"
                >Time Remaining</span
            >
            <span class="font-mono text-xl font-bold text-white"
                >{timeString}</span
            >
        </div>

        <div class="glass-panel p-6 space-y-8">
            <!-- Step 1: Payment Action -->
            <div
                class="space-y-4 {step !== 'pay'
                    ? 'opacity-50 pointer-events-none'
                    : ''}"
            >
                <div class="flex items-center gap-3">
                    <div
                        class="w-8 h-8 rounded-full bg-blue-500 flex items-center justify-center text-white font-bold"
                    >
                        1
                    </div>
                    <h3 class="text-lg font-bold">
                        {tradeData.mode === "sell"
                            ? "Confirm Payment Receipt"
                            : "Make Payment"}
                    </h3>
                </div>

                <div
                    class="bg-black/40 rounded-xl p-4 space-y-3 border border-white/5"
                >
                    {#if tradeData.mode === "sell"}
                        <div
                            class="flex items-center gap-3 p-3 bg-yellow-500/10 border border-yellow-500/20 rounded-lg"
                        >
                            <svg
                                class="w-5 h-5 text-yellow-500"
                                fill="none"
                                viewBox="0 0 24 24"
                                stroke="currentColor"
                                ><path
                                    stroke-linecap="round"
                                    stroke-linejoin="round"
                                    stroke-width="2"
                                    d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                                /></svg
                            >
                            <p class="text-sm text-yellow-200">
                                Please check your <strong
                                    >{tradeData.payingUsing.platform
                                        .name}</strong
                                >
                                app. Verify you have received
                                <strong
                                    >{tradeData.amount}
                                    {tradeData.payingUsing.currency
                                        .code}</strong
                                >.
                            </p>
                        </div>
                    {/if}

                    <div class="flex justify-between text-sm">
                        <span class="text-gray-500">Amount</span>
                        <span class="text-white font-bold text-lg"
                            >{tradeData.amount}
                            {tradeData.payingUsing.currency.code}</span
                        >
                    </div>
                    <div class="flex justify-between text-sm">
                        <span class="text-gray-500">Counterparty</span>
                        <span class="text-white select-all"
                            >{tradeData.lp.name}</span
                        >
                    </div>
                    <div class="flex justify-between text-sm">
                        <span class="text-gray-500"
                            >{tradeData.payingUsing.platform.name} ID</span
                        >
                        <span class="text-white select-all"
                            >{tradeData.lp.handle}</span
                        >
                    </div>
                    <div class="flex justify-between text-sm">
                        <span class="text-gray-500">Reference / Memo</span>
                        <span class="text-blue-400 font-mono select-all"
                            >{tradeData.lp.referenceId}</span
                        >
                    </div>
                </div>

                {#if step === "pay"}
                    <button
                        on:click={() => (step = "notarize")}
                        class="w-full btn-ghost border border-white/10 hover:bg-white/5"
                    >
                        {tradeData.mode === "sell"
                            ? "I have received the payment"
                            : "I have made the payment"}
                    </button>
                {/if}
            </div>

            <div class="w-full h-px bg-white/5"></div>

            <!-- Step 2: TLSN Notarization -->
            <div
                class="space-y-4 {step === 'pay'
                    ? 'opacity-50 blur-sm pointer-events-none'
                    : ''}"
            >
                <div class="flex items-center gap-3">
                    <div
                        class="w-8 h-8 rounded-full bg-purple-500 flex items-center justify-center text-white font-bold"
                    >
                        2
                    </div>
                    <h3 class="text-lg font-bold">Secure Proof (TLSN)</h3>
                </div>

                <p class="text-xs text-gray-500">
                    Open the TLSN extension to verify the payment on banking
                    portal. Only the timestamp and amount will be revealed.
                </p>

                <button
                    on:click={handleStartNotarization}
                    disabled={step !== "notarize"}
                    class="w-full btn-primary py-4 relative overflow-hidden"
                >
                    {#if step === "processing"}
                        <span class="flex items-center justify-center gap-2">
                            <svg
                                class="animate-spin h-5 w-5"
                                viewBox="0 0 24 24"
                                ><circle
                                    class="opacity-25"
                                    cx="12"
                                    cy="12"
                                    r="10"
                                    stroke="currentColor"
                                    stroke-width="4"
                                ></circle><path
                                    class="opacity-75"
                                    fill="currentColor"
                                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                                ></path></svg
                            >
                            Generating ZK Proof...
                        </span>
                    {:else}
                        Start Notarization Session
                    {/if}
                </button>
            </div>
        </div>
    {/if}
</div>

<style>
    .animate-fade-in {
        animation: fadeIn 0.5s ease-out forwards;
    }
    @keyframes fadeIn {
        from {
            opacity: 0;
            transform: translateY(10px);
        }
        to {
            opacity: 1;
            transform: translateY(0);
        }
    }
</style>
