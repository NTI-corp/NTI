import Link from "next/link";
import { formatSignedBps } from "@/lib/format";
import type { NarrativeIndexItem } from "@/lib/types";

/** Diverging bars: 24h mindshare velocity per sector. Suppressed values stay muted. */
export function VelocityBars({ narratives }: { narratives: NarrativeIndexItem[] }) {
  const rows = [...narratives].sort((a, b) => (b.vBps ?? -Infinity) - (a.vBps ?? -Infinity));
  const maxAbs = Math.max(1000, ...rows.map((n) => Math.abs(n.vBps ?? 0)));

  return (
    <div className="border border-[#26262A] bg-[#161618]">
      <div className="flex items-center justify-between border-b border-[#1F1F23] bg-[#111113] px-4 py-2 font-mono text-[10px] uppercase tracking-[0.12em]">
        <span className="text-[#F5F5F7]">Velocity · V_n 24H</span>
        <span className="text-[#71717A]">ACCELERATION</span>
      </div>
      <ul className="divide-y divide-[#1F1F23]">
        {rows.map((n) => {
          const v = n.vBps;
          const width = v === null ? 0 : (Math.abs(v) / maxAbs) * 50;
          const up = (v ?? 0) >= 0;
          return (
            <li key={n.narrativeId}>
              <Link
                href={`/narratives/${n.narrativeId}`}
                className="group grid grid-cols-[132px_1fr_76px] items-center gap-3 px-4 py-2.5 transition-colors hover:bg-[#1E1E21]"
              >
                <span className="truncate text-xs font-medium text-[#F5F5F7] group-hover:text-[#CCFF00]">
                  {n.label}
                </span>
                <span className="relative h-2 bg-[#0D0D0E]">
                  <span className="absolute inset-y-[-2px] left-1/2 w-px bg-[#3A3A40]" />
                  {v !== null && (
                    <span
                      className="absolute top-0 h-full"
                      style={{
                        width: `${width}%`,
                        left: up ? "50%" : `${50 - width}%`,
                        background: up ? "#4ADE80" : "#EF4444",
                      }}
                    />
                  )}
                </span>
                <span
                  className={`text-right font-mono text-[11px] tabular-nums ${
                    v === null ? "text-[#52525B]" : up ? "text-[#4ADE80]" : "text-[#EF4444]"
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
