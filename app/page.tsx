export default function Home() {
  return (
    <section className="w-full py-16 sm:py-22">
      <div className="w-full max-w-5xl mx-auto space-y-8">
        <div className="glass-panel p-8 sm:p-12 text-center space-y-5">
          <span className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs tracking-wide uppercase border border-cyan-300/30 bg-cyan-500/10 text-cyan-100/80">
            P2P Settlement with Proofs
          </span>
          <h1 className="text-5xl sm:text-6xl md:text-7xl font-bold leading-[0.94] bg-clip-text text-transparent bg-gradient-to-r from-cyan-300 via-teal-200 to-emerald-300">
            Anypay Legend
          </h1>
          <p className="text-base sm:text-lg text-slate-300/90 max-w-2xl mx-auto text-balance">
            Buy and sell crypto in a privacy-preserving flow where payment evidence can be
            proven before funds are released.
          </p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center pt-3">
            <a
              href="/buy"
              className="btn-primary px-8 py-3 text-sm sm:text-base font-semibold"
            >
              Buy Crypto
            </a>
            <a
              href="/sell"
              className="px-8 py-3 rounded-xl border border-slate-300/25 bg-slate-800/50 hover:bg-slate-700/55 text-white text-sm sm:text-base font-semibold transition-colors"
            >
              Sell Crypto
            </a>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <article className="glass-panel p-5 space-y-2">
            <p className="text-xs uppercase tracking-wide text-slate-400">Step 1</p>
            <h2 className="text-xl font-semibold text-white">Create Intent</h2>
            <p className="text-sm text-slate-300/85">
              Select your asset and amount, then signal or fund directly from your NEAR wallet.
            </p>
          </article>
          <article className="glass-panel p-5 space-y-2">
            <p className="text-xs uppercase tracking-wide text-slate-400">Step 2</p>
            <h2 className="text-xl font-semibold text-white">Transfer Fiat</h2>
            <p className="text-sm text-slate-300/85">
              Buyers send fiat to the seller using the platform and tagname shown in the intent details.
            </p>
          </article>
          <article className="glass-panel p-5 space-y-2">
            <p className="text-xs uppercase tracking-wide text-slate-400">Step 3</p>
            <h2 className="text-xl font-semibold text-white">Verify + Release</h2>
            <p className="text-sm text-slate-300/85">
              Proof verification confirms transfer details and the trade finalizes with secure release.
            </p>
          </article>
        </div>
      </div>
    </section>
  );
}
