export default function Home() {
  return (
    <div className="text-center space-y-8 py-20">
      <h1 className="text-6xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-blue-400 to-cyan-400">
        ZK P2P
      </h1>
      <p className="text-xl text-gray-400 max-w-2xl mx-auto">
        Privacy-preserving peer-to-peer crypto trading powered by zero-knowledge proofs
      </p>
      <div className="flex gap-4 justify-center pt-8">
        <a
          href="/buy"
          className="px-8 py-4 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold transition-colors"
        >
          Buy Crypto
        </a>
        <a
          href="/sell"
          className="px-8 py-4 bg-white/10 hover:bg-white/20 text-white rounded-xl font-bold transition-colors"
        >
          Sell Crypto
        </a>
      </div>
    </div>
  );
}
