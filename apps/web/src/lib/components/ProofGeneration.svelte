<script lang="ts">
    import ProofScopeCard from "./ProofScopeCard.svelte";
    import { createEventDispatcher } from "svelte";

    let selectedSource = "bank"; // 'bank' | 'app' | 'exchange'

    const dispatch = createEventDispatcher();
</script>

<div class="space-y-8 animate-fade-in-up">
    <!-- 1. Source Selector -->
    <div class="space-y-3">
        <label
            class="text-xs font-bold text-gray-500 uppercase tracking-wider block"
            >1. Select Proof Source</label
        >
        <div class="grid grid-cols-3 gap-3">
            <button
                on:click={() => (selectedSource = "bank")}
                class="p-4 rounded-xl border transition-all text-center space-y-2 {selectedSource ===
                'bank'
                    ? 'bg-blue-500/10 border-blue-500/50 text-white'
                    : 'bg-[#111] border-[#222] text-gray-500 hover:bg-[#1A1A1A]'}"
            >
                <div class="text-2xl">🏦</div>
                <div class="text-xs font-bold">Bank Portal</div>
            </button>
            <button
                on:click={() => (selectedSource = "app")}
                class="p-4 rounded-xl border transition-all text-center space-y-2 {selectedSource ===
                'app'
                    ? 'bg-blue-500/10 border-blue-500/50 text-white'
                    : 'bg-[#111] border-[#222] text-gray-500 hover:bg-[#1A1A1A]'}"
            >
                <div class="text-2xl">📱</div>
                <div class="text-xs font-bold">Payment App</div>
            </button>
            <button
                on:click={() => (selectedSource = "exchange")}
                class="p-4 rounded-xl border transition-all text-center space-y-2 {selectedSource ===
                'exchange'
                    ? 'bg-blue-500/10 border-blue-500/50 text-white'
                    : 'bg-[#111] border-[#222] text-gray-500 hover:bg-[#1A1A1A]'}"
            >
                <div class="text-2xl">📈</div>
                <div class="text-xs font-bold">Exchange</div>
            </button>
        </div>
    </div>

    <!-- 2. Proof Scope Preview -->
    <div class="space-y-3">
        <label
            class="text-xs font-bold text-gray-500 uppercase tracking-wider block"
            >2. Verify Proof Scope</label
        >
        <ProofScopeCard />
    </div>

    <!-- CTA -->
    <button
        on:click={() => dispatch("next")}
        class="w-full btn-primary py-4 text-lg"
    >
        Generate Zero-Knowledge Proof
    </button>

    <p class="text-[10px] text-center text-gray-600">
        Using TLSNotary via secure local proxy. No raw data leaves your device.
    </p>
</div>
