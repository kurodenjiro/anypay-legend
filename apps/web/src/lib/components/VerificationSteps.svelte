<script lang="ts">
    import { onMount, createEventDispatcher } from "svelte";

    // 'steps' or 'success'
    let view = "steps";

    let steps = [
        { id: 1, label: "Collect cryptographic evidence", status: "pending" }, // pending, active, done
        { id: 2, label: "Generate zk-SNARK proof", status: "pending" },
        { id: 3, label: "Submit to Smart Contract", status: "pending" },
        { id: 4, label: "On-chain Verification", status: "pending" },
        { id: 5, label: "Release Funds", status: "pending" },
    ];

    const dispatch = createEventDispatcher();

    onMount(async () => {
        // Mock Progress
        for (let i = 0; i < steps.length; i++) {
            steps[i].status = "active";
            steps = [...steps]; // Reactivity
            await new Promise((r) => setTimeout(r, 1000));
            steps[i].status = "done";
            steps = [...steps];
        }
        await new Promise((r) => setTimeout(r, 500));
        view = "success";
    });
</script>

<div
    class="w-full h-full flex flex-col items-center justify-center animate-fade-in-up"
>
    {#if view === "steps"}
        <div class="w-full max-w-sm space-y-6">
            <h3 class="text-xl font-bold text-center mb-8">
                Verifying Payment...
            </h3>
            {#each steps as step, i}
                <div class="flex items-center gap-4 group">
                    <div class="relative flex-none">
                        <div
                            class="w-8 h-8 rounded-full border-2 flex items-center justify-center text-xs font-bold transition-all duration-300
                            {step.status === 'done'
                                ? 'bg-green-500 border-green-500 text-black'
                                : step.status === 'active'
                                  ? 'bg-blue-500 border-blue-500 text-white animate-pulse'
                                  : 'bg-transparent border-[#333] text-gray-600'}"
                        >
                            {#if step.status === "done"}✓{:else}{i + 1}{/if}
                        </div>
                        {#if i < steps.length - 1}
                            <div
                                class="absolute top-8 left-1/2 -translate-x-1/2 w-0.5 h-6 bg-[#222]"
                            >
                                <div
                                    class="h-full bg-green-500 transition-all duration-500"
                                    style="height: {step.status === 'done'
                                        ? '100%'
                                        : '0%'}"
                                ></div>
                            </div>
                        {/if}
                    </div>
                    <span
                        class="text-sm font-medium transition-colors {step.status ===
                        'pending'
                            ? 'text-gray-600'
                            : 'text-white'}">{step.label}</span
                    >
                </div>
            {/each}
        </div>
    {:else}
        <!-- Success Screen -->
        <div class="text-center space-y-6 animate-fade-in-up">
            <div
                class="w-24 h-24 rounded-full bg-green-500/10 flex items-center justify-center mx-auto border border-green-500/20"
            >
                <svg
                    class="w-12 h-12 text-green-500"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                >
                    <path
                        stroke-linecap="round"
                        stroke-linejoin="round"
                        stroke-width="3"
                        d="M5 13l4 4L19 7"
                    />
                </svg>
            </div>

            <div class="space-y-2">
                <h2 class="text-3xl font-bold text-white">Payment Verified</h2>
                <p class="text-gray-400">
                    Funds have been released trustlessly.
                </p>
            </div>

            <div class="glass-panel p-6 w-full max-w-md mx-auto space-y-4">
                <div
                    class="flex justify-between text-sm border-b border-white/5 pb-3"
                >
                    <span class="text-gray-500">Amount Sent</span>
                    <span class="text-white font-bold">500.00 USDC</span>
                </div>
                <div
                    class="flex justify-between text-sm border-b border-white/5 pb-3"
                >
                    <span class="text-gray-500">To</span>
                    <span class="text-white font-mono">0x71C...9A21</span>
                </div>
                <div class="flex justify-between text-sm">
                    <span class="text-gray-500">Proof Hash</span>
                    <span
                        class="text-blue-400 font-mono text-xs cursor-pointer hover:underline"
                        >0x8f2...b1a9</span
                    >
                </div>
            </div>

            <div class="flex gap-4 pt-4">
                <button class="flex-1 btn-ghost border border-white/10"
                    >Download Receipt</button
                >
                <button class="flex-1 btn-primary">View on Explorer</button>
            </div>
        </div>
    {/if}
</div>
