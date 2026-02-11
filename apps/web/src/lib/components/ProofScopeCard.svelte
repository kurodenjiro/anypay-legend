<script>
    // Visualizer for what is shared vs hidden
</script>

<div class="grid grid-cols-1 md:grid-cols-2 gap-4">
    <!-- Proven Facts -->
    <div class="bg-green-900/10 border border-green-500/20 rounded-2xl p-4">
        <h4
            class="text-xs font-bold text-green-400 uppercase tracking-widest mb-3 flex items-center gap-2"
        >
            <svg
                class="w-4 h-4"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                ><path
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    stroke-width="2"
                    d="M5 13l4 4L19 7"
                /></svg
            >
            Proven Facts
        </h4>
        <ul class="space-y-2 text-sm text-gray-300">
            <li class="flex items-center gap-2">
                <div class="w-1 h-1 rounded-full bg-green-500"></div>
                 Amount matches
            </li>
            <li class="flex items-center gap-2">
                <div class="w-1 h-1 rounded-full bg-green-500"></div>
                 Timestamp in range
            </li>
            <li class="flex items-center gap-2">
                <div class="w-1 h-1 rounded-full bg-green-500"></div>
                 Reference code valid
            </li>
        </ul>
    </div>

    <!-- Hidden Data -->
    <div
        class="bg-gray-800/30 border border-gray-700/50 rounded-2xl p-4 opacity-75"
    >
        <h4
            class="text-xs font-bold text-gray-500 uppercase tracking-widest mb-3 flex items-center gap-2"
        >
            <svg
                class="w-4 h-4"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                ><path
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    stroke-width="2"
                    d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21"
                /></svg
            >
            Hidden Data
        </h4>
        <ul
            class="space-y-2 text-sm text-gray-500 line-through decoration-gray-600"
        >
            <li>Account Number</li>
            <li>Full Transaction History</li>
            <li>Personal Identity / Name</li>
        </ul>
    </div>
</div>
