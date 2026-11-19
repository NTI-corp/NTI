import { fetchActiveConfig } from "@/lib/supabase";

export const revalidate = 60;

export default async function MethodologyPage() {
  const config = await fetchActiveConfig();
  const p = config.payload;

  return (
    <div className="space-y-6">
      <div className="border-b border-[#1B2028] pb-4">
        <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-[#556173]">
          DETERMINISTIC SPECIFICATION · CONFIG V{config.version}
        </span>
        <h1 className="mt-1.5 font-display text-2xl font-bold tracking-tight text-[#EDF1F7]">
          NTI Index Methodology &amp; Independent Verification Guide
        </h1>
        <p className="mt-1 max-w-3xl text-xs text-[#8A96A8]">
          NTI measures how actively crypto narratives are discussed across X across 4-hour epochs; it does not predict token prices. Every finalized epoch is backed by a canonical dataset archived to Arweave and reproducible down to the exact basis point.
        </p>
      </div>

      {/* Mathematical Formulas */}
      <section className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="panel-surface rounded-md p-4 space-y-3">
          <h2 className="font-display text-sm font-semibold text-[#EDF1F7]">
            1. Post Score (P_i) &amp; KOL Authority (A_k)
          </h2>
          <pre className="overflow-x-auto rounded border border-[#1B2028] bg-[#0B0E13] p-3 font-mono text-xs text-[#38BDF8]">
{`A_k = min( ln(1 + F_k) · R_k · H_k,  A_max )
E_i = ln(1 + likes + 2·reposts + 3·quotes + replies)
P_i = A_k · E_i · exp( -λ · Δt_i ),   λ = ln(2) / half_life_hours`}
          </pre>
          <ul className="space-y-1 text-xs text-[#8A96A8]">
            <li>
              • <strong className="text-[#EDF1F7]">A_max</strong>: 90th percentile of ln(1 + F_k) updated monthly across the active KOL set.
            </li>
            <li>
              • <strong className="text-[#EDF1F7]">Engagement snapshot</strong>: reading closest to post age = 24h (tie-breaker: age ≥ 24h, earliest fetched_at).
            </li>
            <li>
              • <strong className="text-[#EDF1F7]">Lookback window</strong>: posts older than {p.lookback_hours}h from epoch boundary B are dropped; Δt_i is anchored to B, never wall-clock time.
            </li>
          </ul>
        </div>

        <div className="panel-surface rounded-md p-4 space-y-3">
          <h2 className="font-display text-sm font-semibold text-[#EDF1F7]">
            2. Narrative Truncation Cap &amp; Raw Mindshare (M_n)
          </h2>
          <pre className="overflow-x-auto rounded border border-[#1B2028] bg-[#0B0E13] p-3 font-mono text-xs text-[#10B981]">
{`c_{k,n} = Σ_{i ∈ posts(k)} P_i · q_{i,n}
cap_eff = 0.10   if N_active ≥ 11
cap_eff = min(1, 1.5 / N_active)   if N_active ≤ 10
Repeat: c_k = min(c_k, cap_eff · Σ c)  until Δ < 1e-12 (max 50 iters)
S_n = Σ c_k,    M_n = S_n / Σ_m S_m`}
          </pre>
          <p className="text-xs text-[#8A96A8]">
            A KOL counts as active for narrative <code className="font-mono text-[#EDF1F7]">n</code> when contributing at least one post with classification probability <code className="font-mono text-[#EDF1F7]">q_{"{i,n}"} ≥ {p.kol_active_min_q}</code>. Truncation prevents any single mega-account from dominating a narrative index.
          </p>
        </div>

        <div className="panel-surface rounded-md p-4 space-y-3">
          <h2 className="font-display text-sm font-semibold text-[#EDF1F7]">
            3. Hamilton Basis-Point Rounding &amp; EMA Smoothing (I_n)
          </h2>
          <pre className="overflow-x-auto rounded border border-[#1B2028] bg-[#0B0E13] p-3 font-mono text-xs text-[#EDF1F7]">
{`I_n(t) = α · M_n(t) + (1 − α) · I_n(t−1),   α = ${p.alpha}
bps_n  = HamiltonLargestRemainder( I_n · 10000 )
Invariant: Σ_{n=1}^{10} bps_n == 10,000   (tie-break: smallest narrative_id)`}
          </pre>
          <p className="text-xs text-[#8A96A8]">
            EMA state reads <code className="font-mono text-[#EDF1F7]">prev_I = Decimal(prev_i_bps) / 10000</code> strictly from the last <strong className="text-[#EDF1F7]">final</strong> epoch sharing the same <code className="font-mono text-[#EDF1F7]">seriesId</code>. Any LLM model or prompt upgrade increments <code className="font-mono text-[#EDF1F7]">seriesId</code> and triggers a clean re-baseline.
          </p>
        </div>

        <div className="panel-surface rounded-md p-4 space-y-3">
          <h2 className="font-display text-sm font-semibold text-[#EDF1F7]">
            4. 24-Hour Velocity (V_n) &amp; Safeguard Flags
          </h2>
          <pre className="overflow-x-auto rounded border border-[#1B2028] bg-[#0B0E13] p-3 font-mono text-xs text-[#F59E0B]">
{`V_n(t) = round( ((I_n(t) − I_n(t − 6)) / I_n(t − 6)) · 10000 )

V_n = NULL if:
  • seriesId changed in [t−6..t]       → v_flag = "series_break"
  • any incomplete epoch in [t−6..t]   → v_flag = "incomplete_gap"
  • I_n(t−6) < ${p.v_min_index_bps} bps OR w_posts < ${p.v_min_weighted_posts} → v_flag = "too_small"`}
          </pre>
          <p className="text-xs text-[#8A96A8]">
            Velocity Radar alerts fire exclusively on <strong className="text-[#EDF1F7]">final</strong> epochs (B + 210m) where <code className="font-mono text-[#10B981]">V_n &gt; +5,000 bps</code> and <code className="font-mono text-[#EDF1F7]">v_flag == null</code>.
          </p>
        </div>
      </section>

      {/* Active On-Chain Config Parameters */}
      <section className="panel-surface rounded-md p-4">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2 border-b border-[#1B2028] pb-3">
          <div>
            <h2 className="font-display text-sm font-semibold text-[#EDF1F7]">
              Active Governance Parameters (`config/nti.v1.json`)
            </h2>
            <p className="font-mono text-[11px] text-[#8A96A8]">
              Hash: {config.configHash}
            </p>
          </div>
          <div className="flex flex-wrap gap-2 font-mono text-[11px]">
            <span className="rounded border border-[#2A3342] bg-[#131820] px-2.5 py-1 text-[#38BDF8]">
              MODEL: {config.modelVersion}
            </span>
            <span className="rounded border border-[#2A3342] bg-[#131820] px-2.5 py-1 text-[#10B981]">
              PROMPT: {config.promptVersion}
            </span>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3 font-mono text-xs tabular-nums sm:grid-cols-3 lg:grid-cols-4">
          {[
            ["epoch_seconds", `${p.epoch_seconds}s (4h)`],
            ["half_life_hours", `${p.half_life_hours}h`],
            ["alpha (EMA)", p.alpha],
            ["lookback_hours", `${p.lookback_hours}h (7d)`],
            ["kol_cap", `${Number(p.kol_cap) * 100}%`],
            ["kol_active_min_q", p.kol_active_min_q],
            ["v_lag_epochs", `${p.v_lag_epochs} (24h)`],
            ["v_min_index_bps", `${p.v_min_index_bps} bps`],
            ["v_min_weighted_posts", String(p.v_min_weighted_posts)],
            ["classifier.batch_size", String(p.classifier.batch_size)],
            ["classifier.temperature", String(p.classifier.temperature)],
            ["validator.max_delta_bps", `±${p.validator.max_delta_bps} bps`],
          ].map(([k, v]) => (
            <div key={k} className="rounded border border-[#1B2028] bg-[#0B0E13] p-2.5">
              <div className="text-[10px] text-[#556173]">{k}</div>
              <div className="mt-0.5 font-semibold text-[#EDF1F7]">{v}</div>
            </div>
          ))}
        </div>
      </section>

      {/* Step-by-Step Independent Verification Guide */}
      <section className="panel-surface rounded-md p-4">
        <h2 className="font-display text-sm font-semibold text-[#EDF1F7]">
          Independent Epoch Verification Guide
        </h2>
        <p className="mt-1 text-xs text-[#8A96A8]">
          Anyone can independently reproduce any committed or finalized epoch from the public Arweave snapshot and open a dispute on Robinhood Chain if any narrative deviates by more than 100 bps.
        </p>

        <ol className="mt-3 space-y-2.5 font-mono text-xs text-[#EDF1F7]">
          <li className="rounded border border-[#1B2028] bg-[#0B0E13] p-3">
            <span className="text-[#38BDF8]">STEP 1 · DOWNLOAD SNAPSHOT</span>
            <p className="mt-1 text-[#8A96A8]">
              Fetch the canonical JSONL dataset from the <code className="text-[#EDF1F7]">arweaveTx</code> listed on <code className="text-[#EDF1F7]">/oracle</code> and verify <code className="text-[#EDF1F7]">keccak256(bytes) == datasetHash</code> stored in <code className="text-[#EDF1F7]">OracleCommit</code>.
            </p>
          </li>
          <li className="rounded border border-[#1B2028] bg-[#0B0E13] p-3">
            <span className="text-[#38BDF8]">STEP 2 · VERIFY CONFIG HASH</span>
            <p className="mt-1 text-[#8A96A8]">
              Confirm <code className="text-[#EDF1F7]">config/nti.v1.json</code> matches <code className="text-[#EDF1F7]">ConfigRegistry.active(epochId)</code>.
            </p>
          </li>
          <li className="rounded border border-[#1B2028] bg-[#0B0E13] p-3">
            <span className="text-[#38BDF8]">STEP 3 · REPLAY PURE ENGINE</span>
            <p className="mt-1 text-[#8A96A8]">
              Run the deterministic Python Decimal engine (<code className="text-[#EDF1F7]">services/engine</code>) locally — zero network calls, zero clocks, zero randomness — and compare output vectors <code className="text-[#EDF1F7]">(i_bps, v_bps)</code> against on-chain <code className="text-[#EDF1F7]">OracleCommit</code>.
            </p>
          </li>
          <li className="rounded border border-[#1B2028] bg-[#0B0E13] p-3">
            <span className="text-[#38BDF8]">STEP 4 · OMISSION AUDIT &amp; DISPUTE</span>
            <p className="mt-1 text-[#8A96A8]">
              Optionally audit 10% omission sample via <code className="text-[#EDF1F7]">seed = keccak256(prevCommitHash, epochId)</code>. If any narrative deviates &gt;100 bps or post-ID overlap falls below 95%, call <code className="text-[#EDF1F7]">Dispute.openDispute()</code> within the 2-hour window.
            </p>
          </li>
        </ol>
      </section>
    </div>
  );
}
