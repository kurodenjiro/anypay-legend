"use client";

export default function Dashboard() {
    return (
        <div className="container mx-auto px-6 py-24 min-h-screen">
            <div className="max-w-4xl mx-auto space-y-12">
                {/* Header */}
                <div>
                    <h1 className="text-3xl font-bold text-white tracking-tight">
                        Dashboard
                    </h1>
                    <p className="text-gray-400 mt-2">Manage your cross-chain assets.</p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                    {/* Vault Section */}
                    <section className="glass-panel p-6 space-y-4">
                        <h2 className="text-xl font-bold text-white">Your Vault</h2>
                        <p className="text-sm text-gray-400">
                            Your deposited assets in the MPC vault
                        </p>

                        <div className="space-y-3">
                            {/* Mock vault items */}
                            <div className="bg-white/5 rounded-lg p-4 border border-white/10">
                                <div className="flex justify-between items-center">
                                    <div>
                                        <div className="text-white font-bold">100 USDC</div>
                                        <div className="text-xs text-gray-400">Base Sepolia</div>
                                    </div>
                                    <div className="text-sm text-green-400">Available</div>
                                </div>
                            </div>

                            <div className="bg-white/5 rounded-lg p-4 border border-white/10">
                                <div className="flex justify-between items-center">
                                    <div>
                                        <div className="text-white font-bold">0.005 BTC</div>
                                        <div className="text-xs text-gray-400">Bitcoin Testnet</div>
                                    </div>
                                    <div className="text-sm text-yellow-400">Locked</div>
                                </div>
                            </div>
                        </div>

                        <button className="w-full btn-ghost py-2 text-sm">
                            View All Deposits
                        </button>
                    </section>

                    {/* Quick Actions */}
                    <section className="glass-panel p-6 space-y-4">
                        <h2 className="text-xl font-bold text-white">Quick Actions</h2>

                        <div className="space-y-3">
                            <a
                                href="/buy"
                                className="block w-full bg-blue-600 hover:bg-blue-700 text-white rounded-xl py-3 px-4 text-center transition-colors"
                            >
                                Buy Crypto
                            </a>

                            <a
                                href="/sell"
                                className="block w-full bg-purple-600 hover:bg-purple-700 text-white rounded-xl py-3 px-4 text-center transition-colors"
                            >
                                Sell Crypto
                            </a>

                            <button className="w-full bg-white/5 hover:bg-white/10 text-white rounded-xl py-3 px-4 transition-colors">
                                View Trade History
                            </button>
                        </div>
                    </section>
                </div>

                {/* Recent Activity */}
                <section className="glass-panel p-6 space-y-4">
                    <h2 className="text-xl font-bold text-white">Recent Activity</h2>

                    <div className="space-y-3">
                        <div className="flex justify-between items-center py-3 border-b border-white/5">
                            <div>
                                <div className="text-white font-medium">Buy 100 USDC</div>
                                <div className="text-xs text-gray-400">2 hours ago</div>
                            </div>
                            <div className="text-green-400 text-sm">Completed</div>
                        </div>

                        <div className="flex justify-between items-center py-3 border-b border-white/5">
                            <div>
                                <div className="text-white font-medium">Sell 0.01 BTC</div>
                                <div className="text-xs text-gray-400">1 day ago</div>
                            </div>
                            <div className="text-green-400 text-sm">Completed</div>
                        </div>

                        <div className="flex justify-between items-center py-3">
                            <div>
                                <div className="text-white font-medium">Buy 50 USDC</div>
                                <div className="text-xs text-gray-400">3 days ago</div>
                            </div>
                            <div className="text-green-400 text-sm">Completed</div>
                        </div>
                    </div>
                </section>
            </div>
        </div>
    );
}
