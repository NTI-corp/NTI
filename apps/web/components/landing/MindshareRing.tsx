import type { NarrativeIndexItem } from "@/lib/types";
import { formatBpsPercent } from "@/lib/format";

/* Monochromatic + single emerald accent scale (no rainbow clutter) */
const MONO_RING_RAMP = [
  "#34D399", // Top leader highlight
  "#E5E7EB", // #2 Platinum
  "#9CA3AF", // #3 Silver
  "#6B7280", // #4 Mid slate
  "#4B5563", // #5 Charcoal
  "#374151",
  "#2D333E",
  "#252A34",
  "#1F242D",
  "#181C24",
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

  const radius = 74;
  const circumference = 2 * Math.PI * radius;

  let cumulativeFraction = 0;
  const segments = sorted.map((n, idx) => {
    const fraction = n.iBps / total;
    const strokeLength = Math.max(0, fraction * circumference - 2.5);
    const dashOffset = -cumulativeFraction * circumference;
    cumulativeFraction += fraction;
    return {
      ...n,
      color: MONO_RING_RAMP[idx] ?? "#1F242D",
      strokeLength,
      dashOffset,
    };
  });

  return (
    <div className="grid items-center gap-6 sm:grid-cols-12">
      {/* Concentric Mindshare SVG Ring */}
      <div className="relative flex items-center justify-center sm:col-span-5">
        <svg viewBox="0 0 188 188" className="h-44 w-44" role="img" aria-label="Mindshare vector distribution">
          <circle
            cx="94"
            cy="94"
            r={radius}
            fill="none"
            stroke="#181C24"
            strokeWidth="12"
          />
          <g transform="rotate(-90 94 94)">
            {segments.map((seg) => (
              <circle
                key={seg.narrativeId}
                cx="94"
                cy="94"
                r={radius}
                fill="none"
                stroke={seg.color}
                strokeWidth="12"
                strokeDasharray={`${seg.strokeLength} ${circumference}`}
                strokeDashoffset={seg.dashOffset}
                strokeLinecap="butt"
              />
            ))}
          </g>
        </svg>

        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center">
          <span
            className="text-[10px] uppercase tracking-wider text-[#6B7280]"
            style={{ fontFamily: "var(--font-ibm-mono), monospace" }}
          >
            {epochId ? `EP-${epochId}` : "LIVE"}
          </span>
          <span
            className="mt-0.5 text-xl font-bold tabular-nums text-[#F5F6F8]"
            style={{ fontFamily: "var(--font-ibm-mono), monospace" }}
          >
            {leader ? formatBpsPercent(leader.iBps) : "—"}
          </span>
          <span className="max-w-[92px] truncate text-[11px] font-medium text-[#34D399]">
            {leader?.label ?? "Leader"}
          </span>
        </div>
      </div>

      {/* Top 5 Sector Legend */}
      <div className="space-y-3 sm:col-span-7">
        {segments.slice(0, 5).map((seg, idx) => (
          <div key={seg.narrativeId} className="space-y-1.5">
            <div className="flex items-center justify-between text-xs">
              <span className="flex items-center gap-2 font-medium text-[#E5E7EB]">
                <span
                  className="h-2 w-2 rounded-full"
                  style={{ backgroundColor: seg.color }}
                />
                <span>{seg.label}</span>
              </span>
              <span
                className="font-semibold tabular-nums text-[#F5F6F8]"
                style={{ fontFamily: "var(--font-ibm-mono), monospace" }}
              >
                {formatBpsPercent(seg.iBps)}
              </span>
            </div>
            <div className="h-1 w-full overflow-hidden rounded-full bg-[#181C24]">
              <div
                className="h-full rounded-full"
                style={{
                  width: `${Math.min(100, (seg.iBps / 2600) * 100)}%`,
                  backgroundColor: idx === 0 ? "#34D399" : "#9CA3AF",
                }}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
