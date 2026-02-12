"use client";

interface TLSNNotarizationProps {
    mode: string;
    amount: string;
    currency: string;
    onProof: (proof: any) => void;
}

export default function TLSNNotarization({
    mode,
    amount,
    currency,
    onProof,
}: TLSNNotarizationProps) {
    const handleGenerateProof = () => {
        // Simulate proof generation
        const mockProof = {
            timestamp: Date.now(),
            data: "mock_proof_data",
        };
        onProof(mockProof);
    };

    return (
        <div className="glass-panel p-8 space-y-6">
            <div className="text-center">
                <h2 className="text-2xl font-bold text-white mb-2">
                    Generate Proof of Payment
                </h2>
                <p className="text-gray-400 text-sm">
                    Use TLSNotary to prove your {mode} transaction
                </p>
            </div>

            <div className="bg-white/5 border border-white/10 rounded-xl p-4 space-y-2">
                <div className="flex justify-between">
                    <span className="text-gray-400">Mode:</span>
                    <span className="text-white font-mono">{mode}</span>
                </div>
                <div className="flex justify-between">
                    <span className="text-gray-400">Amount:</span>
                    <span className="text-white font-mono">{amount}</span>
                </div>
                <div className="flex justify-between">
                    <span className="text-gray-400">Currency:</span>
                    <span className="text-white font-mono">{currency}</span>
                </div>
            </div>

            <div className="bg-blue-500/10 border border-blue-500/20 rounded-xl p-4">
                <p className="text-sm text-blue-200/80">
                    📝 This is a placeholder for TLSNotary integration. In production, this
                    would open the TLSNotary extension to generate a cryptographic proof of
                    your payment.
                </p>
            </div>

            <button
                onClick={handleGenerateProof}
                className="w-full btn-primary py-4 text-base rounded-xl"
            >
                Generate Proof (Mock)
            </button>
        </div>
    );
}
