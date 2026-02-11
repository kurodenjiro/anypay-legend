<script lang="ts">
    const transactions = [
        {
            id: 1,
            date: "Just now",
            amount: "500.00 USDC",
            asset: "Venmo",
            status: "Verifying",
            hash: "Pending...",
        },
        {
            id: 2,
            date: "2 hrs ago",
            amount: "1,200.00 USDC",
            asset: "Revolut",
            status: "Verified",
            hash: "0x7a...9f21",
        },
        {
            id: 3,
            date: "1 day ago",
            amount: "150.00 USDC",
            asset: "Wise",
            status: "Verified",
            hash: "0xb4...3c12",
        },
    ];
</script>

<div class="w-full max-w-4xl mx-auto mt-12 mb-20 px-4">
    <div class="flex items-center justify-between mb-6">
        <h3 class="font-bold text-lg text-white">Transaction History</h3>
        <button
            class="text-xs text-indigo-400 hover:text-indigo-300 font-medium transition-colors"
            >View All</button
        >
    </div>

    <div class="glass-panel overflow-hidden">
        <div class="overflow-x-auto">
            <table class="w-full text-left">
                <thead
                    class="bg-white/5 text-xs uppercase text-gray-500 font-semibold tracking-wider"
                >
                    <tr>
                        <th class="px-6 py-4">Date</th>
                        <th class="px-6 py-4">Amount</th>
                        <th class="px-6 py-4">Via</th>
                        <th class="px-6 py-4">Status</th>
                        <th class="px-6 py-4 text-right">Hash</th>
                    </tr>
                </thead>
                <tbody class="divide-y divide-white/5">
                    {#each transactions as tx}
                        <tr class="hover:bg-white/5 transition-colors group">
                            <td class="px-6 py-4 text-sm text-gray-400"
                                >{tx.date}</td
                            >
                            <td class="px-6 py-4 font-medium text-white"
                                >{tx.amount}</td
                            >
                            <td class="px-6 py-4 text-sm text-gray-300"
                                >{tx.asset}</td
                            >
                            <td class="px-6 py-4">
                                <span
                                    class="text-xs font-bold px-2 py-1 rounded-full border
                                    {tx.status === 'Verified'
                                        ? 'bg-green-500/10 text-green-500 border-green-500/20'
                                        : tx.status === 'Verifying'
                                          ? 'bg-blue-500/10 text-blue-500 border-blue-500/20 animate-pulse'
                                          : 'bg-red-500/10 text-red-500 border-red-500/20'}"
                                >
                                    {tx.status}
                                </span>
                            </td>
                            <td class="px-6 py-4 text-right">
                                <a
                                    href="#"
                                    class="font-mono text-xs text-indigo-400 hover:text-indigo-300 transition-colors bg-indigo-500/10 px-2 py-1 rounded hover:bg-indigo-500/20"
                                >
                                    {tx.hash}
                                </a>
                            </td>
                        </tr>
                    {/each}
                </tbody>
            </table>
        </div>
    </div>
</div>
