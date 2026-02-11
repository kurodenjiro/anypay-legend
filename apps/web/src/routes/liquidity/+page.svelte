<script lang="ts">
    // Mock Data for Liquidity Pools
    const pools = [
        {
            id: 1,
            pair: "USDC / Venmo",
            tvl: "$1,240,500",
            volume: "$45,000",
            apy: "4.5%",
        },
        {
            id: 2,
            pair: "USDC / PayPal",
            tvl: "$890,200",
            volume: "$32,100",
            apy: "3.8%",
        },
        {
            id: 3,
            pair: "USDC / Revolut",
            tvl: "$560,000",
            volume: "$12,400",
            apy: "5.2%",
        },
        {
            id: 4,
            pair: "USDC / Wise",
            tvl: "$2,100,000",
            volume: "$120,000",
            apy: "6.1%",
        },
    ];
</script>

<div
    class="w-full h-full min-h-[80vh] flex flex-col items-center pt-24 pb-20 px-4"
>
    <div class="mb-12 text-center space-y-4">
        <h1 class="text-4xl font-extrabold tracking-tight text-white/90">
            Liquidity <span class="text-gray-500">Pools</span>
        </h1>
        <p class="text-gray-500 text-md max-w-lg mx-auto">
            Provide liquidity to the protocol and earn yield from transaction
            fees. Secure and non-custodial.
        </p>
    </div>

    <div
        class="w-full max-w-5xl bg-[#111111] border border-[#222] rounded-3xl overflow-hidden shadow-2xl"
    >
        <div class="overflow-x-auto">
            <table class="w-full text-left">
                <thead>
                    <tr class="border-b border-[#222] bg-[#161616]">
                        <th
                            class="py-4 px-6 text-xs font-bold text-gray-500 uppercase tracking-wider"
                            >Pair</th
                        >
                        <th
                            class="py-4 px-6 text-xs font-bold text-gray-500 uppercase tracking-wider text-right"
                            >TVL</th
                        >
                        <th
                            class="py-4 px-6 text-xs font-bold text-gray-500 uppercase tracking-wider text-right"
                            >24h Vol</th
                        >
                        <th
                            class="py-4 px-6 text-xs font-bold text-gray-500 uppercase tracking-wider text-right"
                            >APY</th
                        >
                        <th
                            class="py-4 px-6 text-xs font-bold text-gray-500 uppercase tracking-wider text-right"
                            >Action</th
                        >
                    </tr>
                </thead>
                <tbody class="divide-y divide-[#222]">
                    {#each pools as pool}
                        <tr class="group hover:bg-[#1A1A1A] transition-colors">
                            <td class="py-4 px-6">
                                <div class="flex items-center gap-3">
                                    <div
                                        class="w-8 h-8 rounded-full bg-blue-500/20 text-blue-500 flex items-center justify-center font-bold text-xs border border-blue-500/30"
                                    >
                                        {pool.pair[0]}
                                    </div>
                                    <span
                                        class="font-bold text-white tracking-wide"
                                        >{pool.pair}</span
                                    >
                                </div>
                            </td>
                            <td
                                class="py-4 px-6 text-right font-mono text-gray-400"
                                >{pool.tvl}</td
                            >
                            <td
                                class="py-4 px-6 text-right font-mono text-gray-400"
                                >{pool.volume}</td
                            >
                            <td
                                class="py-4 px-6 text-right font-bold text-green-500"
                                >{pool.apy}</td
                            >
                            <td class="py-4 px-6 text-right">
                                <button
                                    class="bg-[#2A2A2A] hover:bg-[#333] text-white text-xs font-bold px-4 py-2 rounded-lg transition-colors border border-[#3A3A3A]"
                                >
                                    Deposit
                                </button>
                            </td>
                        </tr>
                    {/each}
                </tbody>
            </table>
        </div>
    </div>
</div>
