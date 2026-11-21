import Link from "next/link";
import { SectorIcon } from "./landing/NtiLogos";
import { sectorColor } from "@/lib/sectors";
import { formatSignedBps } from "@/lib/format";
import type { NarrativeIndexItem } from "@/lib/types";

/** Diverging bars: 24h mindshare velocity per sector. Suppressed values (too small, series break) stay muted. */
export function VelocityBars({ narratives }: { narratives: NarrativeIndexItem[] }) {
  const rows = [...narratives].sort((a, b) => (b.vBps ?? -Infinity) - (a.vBps ?? -Infinity));
  const maxAbs = Math.max(1000, ...rows.map((n) => Math.abs(n.vBps ?? 0)));

  return (
    <div className="rounded-xl border border-[#232325] bg-[#0E0E0F] p-4">
      <div className="kicker">Velocity · V_n 24h</div>
      <div className="mt-1 font-display text-lg font-extrabold uppercase tracking-tight text-white">
        Who is accelerating
      </div>
      <ul className="mt-4 space-y-2.5">
        {rows.map((n) => {
          const v = n.vBps;
          const color = sectorColor(n.narrativeId);
          const width = v === null ? 0 : (Math.abs(v) / maxAbs) * 50;
          const up = (v ?? 0) >= 0;
          return (
            <li key={n.narrativeId}>
              <Link
                href={`/narratives/${n.narrativeId}`}
                className="group grid grid-cols-[132px_1fr_84px] items-center gap-3"
              >
                <span className="flex min-w-0 items-center gap-2 text-xs text-[#D4D4D8] group-hover:text-white">
                  <span
                    className="flex h-5 w-5 shrink-0 items-center justify-center rounded"
                    style={{ background: `${color}22`, color }}
                  >
                    <SectorIcon slug={n.slug} className="h-3 w-3" />
                  </span>
                  <span className="truncate">{n.label}</span>
                </span>
                <span className="relative h-2.5 rounded-full bg-[#151516]">
                  <span className="absolute inset-y-[-3px] left-1/2 w-px bg-[#2E2E31]" />
                  {v !== null && (
                    <span
                      className="absolute top-0 h-full rounded-full"
                      style={{
                        width: `${width}%`,
                        left: up ? "50%" : `${50 - width}%`,
                        background: up ? "#22C55E" : "#EF4444",
                        opacity: 0.9,
                      }}
                    />
                  )}
                </span>
                <span
                  className={`text-right font-mono text-[11px] tabular-nums ${
                    v === null ? "text-[#71717A]" : up ? "text-[#22C55E]" : "text-[#EF4444]"
                  }`}
                >
                  {v === null ? "warming" : formatSignedBps(v, n.vFlag)}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
