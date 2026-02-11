<script>
    // Simple trust badge component
</script>

<div
    class="inline-flex items-center gap-2 px-3 py-1 bg-green-900/20 border border-green-500/20 rounded-full cursor-help group transition-colors hover:bg-green-900/30"
>
    <div
        class="w-1.5 h-1.5 rounded-full bg-green-400 shadow-[0_0_8px_rgba(74,222,128,0.5)] animate-pulse"
    ></div>
    <span class="text-[10px] font-bold uppercase tracking-wider text-green-400"
        >Zero-Knowledge Verified</span
    >

    <!-- Tooltip -->
    <div
        class="absolute bottom-full mb-2 left-1/2 -translate-x-1/2 w-max px-3 py-2 bg-gray-900 border border-white/10 rounded-lg text-xs text-gray-300 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none shadow-xl"
    >
        Verified without revealing private information
        <div
            class="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-gray-900"
        ></div>
    </div>
</div>
