<script>
    const features = [
        {
            icon: "🔒",
            title: "No Bank Data Revealed",
            desc: "Your login credentials stay local.",
        },
        {
            icon: "📸",
            title: "No Screenshots",
            desc: "Automated cryptographic checks.",
        },
        {
            icon: "🛡️",
            title: "Trustless",
            desc: "Math verifies payment, not humans.",
        },
        {
            icon: "⚡",
            title: "Instant Settlement",
            desc: "Funds release immediately on proof.",
        },
    ];
</script>

<div
    class="grid grid-cols-2 md:grid-cols-4 gap-4 w-full max-w-4xl mx-auto mt-12 px-4"
>
    {#each features as feature}
        <div
            class="glass-card p-6 flex flex-col items-center text-center gap-3 hover:-translate-y-1 transition-transform cursor-default group"
        >
            <div
                class="w-12 h-12 rounded-2xl bg-white/5 flex items-center justify-center text-2xl mb-1 group-hover:bg-white/10 transition-colors border border-white/5"
            >
                {feature.icon}
            </div>
            <h3 class="font-bold text-sm text-gray-200">{feature.title}</h3>
            <p class="text-xs text-gray-500 leading-relaxed">{feature.desc}</p>
        </div>
    {/each}
</div>
