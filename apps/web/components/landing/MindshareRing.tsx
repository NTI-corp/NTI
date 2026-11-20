import type { NarrativeIndexItem } from "@/lib/types";
import { formatBpsPercent } from "@/lib/format";

const RING_COLORS = [
  "#38BDF8", // Glacier Sky
  "#F59E0B", // Warm Amber
  "#10B981", // Emerald
  "#818CF8", // Periwinkle Indigo
  "#2DD4BF", // Mint Teal
  "#FB7185", // Soft Rose
  "#60A5FA", // Cobalt
  "#FBBF24", // Gold
  "#A78BFA", // Lavender
  "#94A3B8", // Slate
] as const;

export function MindshareRing({
  narratives,
  epochId,
}: {
  narratives: NarrativeIndexItem[];
  epochId: number | null;
}) {
  const sorted = [...narratives].sort((a, b) => b.iBps - a.iBps);
  const total = sorted.reduce((s, n) => s + n.iBps, 0) || 10_000;
  const leader = sorted[0];

  const radius = 72;
  const circumference = 2 * Math.PI * radius;

  let cumulativeFraction = 0;
  const segments = sorted.map((n, idx) => {
    const fraction = n.iBps / total;
    const strokeLength = Math.max(0, fraction * circumference - 2.5);
    const dashOffset = -cumulativeFraction * circumference;
    cumulativeFraction += fraction;
    return {
      ...n,
      color: RING_COLORS[idx % RING_COLORS.length] ?? "#38BDF8",
      strokeLength,
      dashOffset,
    };
  });

  return (
    <div className="grid items-center gap-6 sm:grid-cols-12">
      {/* Proportional SVG Concentric Ring */}
      <div className="relative flex items-center justify-center sm:col-span-5">
        <svg viewBox="0 0 184 184" className="h-44 w-44" role="img" aria-label="Mindshare vector distribution">
          <circle
            cx="92"
            cy="92"
            r={radius}
            fill="none"
            stroke="#1B2130"
            strokeWidth="14"
          />
          <g transform="rotate(-90 92 92)">
            {segments.map((seg) => (
              <circle
                key={seg.narrativeId}
                cx="92"
                cy="92"
                r={radius}
                fill="none"
                stroke={seg.color}
                strokeWidth="14"
                strokeDasharray={`${seg.strokeLength} ${circumference}`}
                strokeDashoffset={seg.dashOffset}
                strokeLinecap="butt"
              />
            ))}
          </g>
        </svg>

        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center">
          <span
            className="text-[10px] uppercase tracking-wider text-[#64748B]"
            style={{ fontFamily: "var(--font-ibm-mono), monospace" }}
          >
            {epochId ? `EP-${epochId}` : "LIVE"}
          </span>
          <span
            className="mt-0.5 text-xl font-bold tabular-nums text-[#F4F6FA]"
            style={{ fontFamily: "var(--font-ibm-mono), monospace" }}
          >
            {leader ? formatBpsPercent(leader.iBps) : "—"}
          </span>
          <span className="max-w-[92px] truncate text-[11px] font-medium text-[#38BDF8]">
            {leader?.label ?? "Leader"}
          </span>
        </div>
      </div>

      {/* Top 5 Sector Legend */}
      <div className="space-y-2.5 sm:col-span-7">
        {segments.slice(0, 5).map((seg) => (
          <div key={seg.narrativeId} className="space-y-1">
            <div className="flex items-center justify-between text-xs">
              <span className="flex items-center gap-2 font-medium text-[#E2E8F0]">
                <span
                  className="h-2 w-2 rounded-full"
                  style={{ backgroundColor: seg.color }}
                />
                <span>{seg.label}</span>
              </span>
              <span
                className="font-semibold tabular-nums text-[#F4F6FA]"
                style={{ fontFamily: "var(--font-ibm-mono), monospace" }}
              >
                {formatBpsPercent(seg.iBps)}
              </span>
            </div>
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-[#191E2B]">
              <div
                className="h-full rounded-full"
                style={{
                  width: `${Math.min(100, (seg.iBps / 2600) * 100)}%`,
                  backgroundColor: seg.color,
                }}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
