import { Suspense } from "react";
import { BadgeCheck, Calculator, Link2, Radio, ShieldCheck, Tags } from "lucide-react";
import { FlowSteps } from "@/components/ui/Visuals";
import { fetchActiveConfig } from "@/lib/supabase";
import { InstantRouteShell } from "@/components/InstantRouteShell";

export const revalidate = 60;

async function MethodologyContent() {
  const config = await fetchActiveConfig();
  const p = config.payload;

  return (
    <div className="tab-panel-enter space-y-4">
      <div className="border-b border-[#26262A] pb-3.5">
        <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-[#71717A]">
          Deterministic Specification · Config V{config.version}
        </span>
        <h1 className="mt-1 text-lg font-semibold tracking-tight text-[#F5F5F7]">
          Methodology
        </h1>
        <p className="mt-0.5 max-w-3xl text-xs text-[#71717A]">
          NTI measures how actively crypto narratives are discussed on X across 4-hour epochs; it does not predict token prices. Every finalized epoch is backed by a canonical dataset archived publicly and reproducible down to the exact basis point.
        </p>
      </div>

      <FlowSteps
        steps={[
          { icon: Radio, title: "Fetch", text: "Posts from the KOL universe are pulled from X every epoch." },
          { icon: Tags, title: "Classify", text: "Each post is mapped to one of 10 narrative sectors." },
          { icon: Calculator, title: "Compute", text: "Authority-weighted mindshare I and velocity V in basis points." },
          { icon: ShieldCheck, title: "Attest", text: "3+ validators re-derive the vector and sign EIP-712." },
          { icon: Link2, title: "Commit", text: "Median is committed on-chain with the dataset hash." },
          { icon: BadgeCheck, title: "Finalize", text: "After the dispute window the epoch becomes final." },
        ]}
      />

      {/* Mathematical Formulas */}
      <section className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="border border-[#26262A] bg-[#161618]">
          <div className="border-b border-[#1F1F23] bg-[#111113] px-4 py-2 font-mono text-[10px] uppercase tracking-[0.12em] text-[#F5F5F7]">
            01 · Post Score (P_i) &amp; KOL Authority (A_k)
          </div>
          <div className="space-y-3 p-4">
            <pre className="overflow-x-auto border border-[#1F1F23] bg-[#0D0D0E] p-3 font-mono text-[11.5px] text-[#CCFF00]">
{`A_k = min( ln(1 + F_k) · R_k · H_k,  A_max )
E_i = ln(1 + likes + 2·reposts + 3·quotes + replies)
P_i = A_k · E_i · exp( -λ · Δt_i ),   λ = ln(2) / half_life_hours`}
            </pre>
            <ul className="space-y-1 text-xs text-[#71717A]">
              <li>
                • <strong className="text-[#F5F5F7]">A_max</strong>: 90th percentile of ln(1 + F_k) updated monthly across the active KOL set.
              </li>
              <li>
                • <strong className="text-[#F5F5F7]">Engagement snapshot</strong>: reading closest to post age = 24h (tie-breaker: age ≥ 24h, earliest fetched_at).
              </li>
              <li>
                • <strong className="text-[#F5F5F7]">Lookback window</strong>: posts are selected through epoch boundary B using a {p.lookback_hours}h lookback; engagement is observed through the cutoff recorded in the public archive before commit; Δt_i is anchored to B.
              </li>
            </ul>
          </div>
        </div>

        <div className="border border-[#26262A] bg-[#161618]">
          <div className="border-b border-[#1F1F23] bg-[#111113] px-4 py-2 font-mono text-[10px] uppercase tracking-[0.12em] text-[#F5F5F7]">
            02 · Narrative Truncation Cap &amp; Raw Mindshare (M_n)
          </div>
          <div className="space-y-3 p-4">
            <pre className="overflow-x-auto border border-[#1F1F23] bg-[#0D0D0E] p-3 font-mono text-[11.5px] text-[#4ADE80]">
{`c_{k,n} = Σ_{i ∈ posts(k)} P_i · q_{i,n}
cap_eff = 0.10   if N_active ≥ 11
cap_eff = min(1, 1.5 / N_active)   if N_active ≤ 10
Repeat: c_k = min(c_k, cap_eff · Σ c)  until Δ < 1e-12 (max 50 iters)
S_n = Σ c_k,    M_n = S_n / Σ_m S_m`}
            </pre>
            <p className="text-xs text-[#71717A]">
              A KOL counts as active for narrative <code className="font-mono text-[#F5F5F7]">n</code> when contributing at least one post with classification probability <code className="font-mono text-[#F5F5F7]">q_{"{i,n}"} ≥ {p.kol_active_min_q}</code>. Truncation prevents any single mega-account from dominating a narrative index.
            </p>
          </div>
        </div>

        <div className="border border-[#26262A] bg-[#161618]">
          <div className="border-b border-[#1F1F23] bg-[#111113] px-4 py-2 font-mono text-[10px] uppercase tracking-[0.12em] text-[#F5F5F7]">
            03 · Hamilton Basis-Point Rounding &amp; EMA Smoothing (I_n)
          </div>
          <div className="space-y-3 p-4">
            <pre className="overflow-x-auto border border-[#1F1F23] bg-[#0D0D0E] p-3 font-mono text-[11.5px] text-[#F5F5F7]">
{`I_n(t) = α · M_n(t) + (1 − α) · I_n(t−1),   α = ${p.alpha}
bps_n  = HamiltonLargestRemainder( I_n · 10000 )
Invariant: Σ_{n=1}^{10} bps_n == 10,000   (tie-break: smallest narrative_id)`}
            </pre>
            <p className="text-xs text-[#71717A]">
              EMA state reads <code className="font-mono text-[#F5F5F7]">prev_I = Decimal(prev_i_bps) / 10000</code> strictly from the last <strong className="text-[#F5F5F7]">final</strong> epoch sharing the same <code className="font-mono text-[#F5F5F7]">seriesId</code>. Any LLM model or prompt upgrade increments <code className="font-mono text-[#F5F5F7]">seriesId</code> and triggers a clean re-baseline.
            </p>
          </div>
        </div>

        <div className="border border-[#26262A] bg-[#161618]">
          <div className="border-b border-[#1F1F23] bg-[#111113] px-4 py-2 font-mono text-[10px] uppercase tracking-[0.12em] text-[#F5F5F7]">
            04 · 24-Hour Velocity (V_n) &amp; Safeguard Flags
          </div>
          <div className="space-y-3 p-4">
            <pre className="overflow-x-auto border border-[#1F1F23] bg-[#0D0D0E] p-3 font-mono text-[11.5px] text-[#F59E0B]">
{`V_n(t) = round( ((I_n(t) − I_n(t − 6)) / I_n(t − 6)) · 10000 )

V_n = NULL if:
  • seriesId changed in [t−6..t]       → v_flag = "series_break"
  • any incomplete epoch in [t−6..t]   → v_flag = "incomplete_gap"
  • I_n(t−6) < ${p.v_min_index_bps} bps OR w_posts < ${p.v_min_weighted_posts} → v_flag = "too_small"`}
            </pre>
            <p className="text-xs text-[#71717A]">
              Velocity Radar alerts fire exclusively on <strong className="text-[#F5F5F7]">final</strong> epochs (B + 210m) where <code className="font-mono text-[#4ADE80]">V_n &gt; +5,000 bps</code> and <code className="font-mono text-[#F5F5F7]">v_flag == null</code>.
            </p>
          </div>
        </div>
      </section>

      {/* Active On-Chain Config Parameters */}
      <section className="border border-[#26262A] bg-[#161618]">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#1F1F23] bg-[#111113] px-4 py-2.5">
          <div>
            <h2 className="font-mono text-[11px] font-medium uppercase tracking-[0.1em] text-[#F5F5F7]">
              Active Protocol Parameters (`config/nti.v1.json`)
            </h2>
            <p className="font-mono text-[10.5px] text-[#71717A]">Hash: {config.configHash}</p>
          </div>
          <div className="flex flex-wrap gap-2 font-mono text-[10.5px]">
            <span className="border border-[#26262A] bg-[#0D0D0E] px-2.5 py-1 text-[#CCFF00]">
              MODEL: {config.modelVersion}
            </span>
            <span className="border border-[#26262A] bg-[#0D0D0E] px-2.5 py-1 text-[#4ADE80]">
              PROMPT: {config.promptVersion}
            </span>
          </div>
        </div>

        <div className="grid grid-cols-2 border-l border-t border-[#1F1F23] font-mono text-xs tabular-nums sm:grid-cols-3 lg:grid-cols-4">
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
            <div key={k} className="border-b border-r border-[#1F1F23] bg-[#0D0D0E] p-3">
              <div className="text-[9.5px] uppercase tracking-[0.08em] text-[#71717A]">{k}</div>
              <div className="mt-1 font-medium text-[#F5F5F7]">{v}</div>
            </div>
          ))}
        </div>
      </section>

      {/* Step-by-Step Independent Verification Guide */}
      <section className="border border-[#26262A] bg-[#161618]">
        <div className="border-b border-[#1F1F23] bg-[#111113] px-4 py-2.5">
          <h2 className="font-mono text-[11px] font-medium uppercase tracking-[0.1em] text-[#F5F5F7]">
            Independent Epoch Verification Guide
          </h2>
          <p className="mt-0.5 text-[11px] text-[#71717A]">
            Anyone can independently reproduce any committed or finalized epoch from the public Arweave snapshot and open a dispute on Robinhood Chain if any narrative deviates by more than 100 bps.
          </p>
        </div>

        <ol className="divide-y divide-[#1F1F23] font-mono text-xs text-[#F5F5F7]">
          <li className="p-4">
            <span className="text-[10.5px] text-[#CCFF00]">STEP 01 · DOWNLOAD SNAPSHOT</span>
            <p className="mt-1 font-sans text-xs text-[#71717A]">
              Fetch the canonical JSONL dataset from the <code className="font-mono text-[#F5F5F7]">arweaveTx</code> listed on <code className="font-mono text-[#F5F5F7]">/oracle</code> and verify <code className="font-mono text-[#F5F5F7]">keccak256(bytes) == datasetHash</code> stored in <code className="font-mono text-[#F5F5F7]">OracleCommit</code>.
            </p>
          </li>
          <li className="p-4">
            <span className="text-[10.5px] text-[#CCFF00]">STEP 02 · VERIFY CONFIG HASH</span>
            <p className="mt-1 font-sans text-xs text-[#71717A]">
              Confirm <code className="font-mono text-[#F5F5F7]">config/nti.v1.json</code> matches <code className="font-mono text-[#F5F5F7]">ConfigRegistry.active(epochId)</code>.
            </p>
          </li>
          <li className="p-4">
            <span className="text-[10.5px] text-[#CCFF00]">STEP 03 · REPLAY PURE ENGINE</span>
            <p className="mt-1 font-sans text-xs text-[#71717A]">
              Run the deterministic Python Decimal engine (<code className="font-mono text-[#F5F5F7]">services/engine</code>) locally (zero network calls, zero clocks, zero randomness) and compare output vectors <code className="font-mono text-[#F5F5F7]">(i_bps, v_bps)</code> against on-chain <code className="font-mono text-[#F5F5F7]">OracleCommit</code>.
            </p>
          </li>
          <li className="p-4">
            <span className="text-[10.5px] text-[#CCFF00]">STEP 04 · OMISSION AUDIT &amp; DISPUTE</span>
            <p className="mt-1 font-sans text-xs text-[#71717A]">
              Optionally audit 10% omission sample via <code className="font-mono text-[#F5F5F7]">seed = keccak256(prevCommitHash, epochId)</code>. If any narrative deviates &gt;100 bps or post-ID overlap falls below 95%, call <code className="font-mono text-[#F5F5F7]">Dispute.openDispute()</code> within the contract-defined window.
            </p>
          </li>
        </ol>
      </section>
    </div>
  );
}

export default function MethodologyPage() {
  return (
    <Suspense fallback={<InstantRouteShell path="/methodology" />}>
      <MethodologyContent />
    </Suspense>
  );
}
