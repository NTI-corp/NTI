import { NARRATIVES, ROBINHOOD_MAINNET_ID, ROBINHOOD_TESTNET_ID } from "@nti/sdk";

export default function HomePage() {
  return (
    <main className="mx-auto max-w-4xl px-6 py-16">
      <header className="mb-10 border-b border-neutral-800 pb-6">
        <p className="text-xs font-mono uppercase tracking-widest text-neutral-400">
          Robinhood Chain · Mainnet {ROBINHOOD_MAINNET_ID} / Testnet {ROBINHOOD_TESTNET_ID}
        </p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight">
          NTI — Narrative Mindshare Index
        </h1>
        <p className="mt-2 text-sm text-neutral-400">
          Measures how actively crypto narratives are discussed across X every 4-hour epoch.
          Does not predict token prices.
        </p>
      </header>

      <section>
        <h2 className="mb-4 text-sm font-mono uppercase tracking-wider text-neutral-400">
          Tracked Narratives ({NARRATIVES.length})
        </h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {NARRATIVES.map((n) => (
            <div
              key={n.id}
              className="rounded-lg border border-neutral-800 bg-neutral-900/50 p-4"
            >
              <div className="flex items-center justify-between">
                <span className="font-medium">{n.label}</span>
                <span className="font-mono text-xs text-neutral-500">#{n.id}</span>
              </div>
              <p className="mt-1 text-xs text-neutral-400">{n.description}</p>
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}
