export function formatBpsPercent(bps: number, digits = 2): string {
  return `${(bps / 100).toFixed(digits)}%`;
}

export function formatSignedBps(bps: number | null, vFlag?: string | null): string {
  if (bps === null || bps === undefined) {
    if (vFlag === "too_small") return "TOO SMALL";
    if (vFlag === "series_break") return "NEW SERIES";
    if (vFlag === "incomplete_gap") return "INCOMPLETE GAP";
    return "—";
  }
  const sign = bps > 0 ? "+" : "";
  return `${sign}${bps.toLocaleString("en-US")} bps`;
}

export function formatSignedPctFromBps(bps: number | null, vFlag?: string | null): string {
  if (bps === null || bps === undefined) {
    if (vFlag === "too_small") return "too small";
    if (vFlag === "series_break") return "new series";
    if (vFlag === "incomplete_gap") return "gap";
    return "—";
  }
  const sign = bps > 0 ? "+" : "";
  return `${sign}${(bps / 100).toFixed(1)}%`;
}

export function formatEth(amount: number, digits = 4): string {
  return `${amount.toFixed(digits)} ETH`;
}

export function formatCompactNumber(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toLocaleString("en-US");
}

export function truncateHex(value: string | null | undefined, start = 6, end = 4): string {
  if (!value) return "—";
  if (value.length <= start + end + 2) return value;
  return `${value.slice(0, start)}…${value.slice(-end)}`;
}

export function formatCountdown(targetIso: string, nowMs = Date.now()): string {
  const diffSec = Math.floor((new Date(targetIso).getTime() - nowMs) / 1000);
  if (diffSec <= 0) return "0m";
  const d = Math.floor(diffSec / 86400);
  const h = Math.floor((diffSec % 86400) / 3600);
  const m = Math.floor((diffSec % 3600) / 60);
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  return `${Math.max(1, m)}m`;
}

export function formatRelativeTime(iso: string | null | undefined, nowMs = Date.now()): string {
  if (!iso) return "—";
  const diffSec = Math.floor((nowMs - new Date(iso).getTime()) / 1000);
  if (diffSec < 60) return `${Math.max(0, diffSec)}s ago`;
  const min = Math.floor(diffSec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  return `${Math.floor(hr / 24)}d ago`;
}

export function getStakerTier(stakeNti: number): {
  tierName: string;
  discountBps: number;
  hasRadarAccess: boolean;
} {
  if (stakeNti >= 5_000_000) {
    return { tierName: "Tier 3 · 50% Fee Discount + Real-Time Radar", discountBps: 5000, hasRadarAccess: true };
  }
  if (stakeNti >= 1_000_000) {
    return { tierName: "Tier 2 · 25% Fee Discount + Real-Time Radar", discountBps: 2500, hasRadarAccess: true };
  }
  if (stakeNti >= 100_000) {
    return { tierName: "Tier 1 · 10% Fee Discount + Real-Time Radar", discountBps: 1000, hasRadarAccess: true };
  }
  return { tierName: "Public Tier · 1h Delayed Radar", discountBps: 0, hasRadarAccess: false };
}
