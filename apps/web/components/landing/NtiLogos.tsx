import type { ComponentType } from "react";
import {
  CandlestickChart,
  Coins,
  Cpu,
  Flame,
  Gamepad2,
  Landmark,
  Layers,
  Server,
  Shield,
  Target,
} from "lucide-react";

export function NtiBrandMark({ className = "h-8 w-8" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 36 36"
      fill="none"
      aria-hidden="true"
      className={className}
    >
      <rect
        x="1"
        y="1"
        width="34"
        height="34"
        rx="8"
        fill="#0F1216"
        stroke="#272C35"
        strokeWidth="1.5"
      />
      <path
        d="M9 24L14.5 14L19.5 19.5L26.5 10"
        stroke="#F5F6F8"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="26.5" cy="10" r="2.4" fill="#CCFF00" />
    </svg>
  );
}

export function RobinhoodChainBadge({ chainId }: { chainId: number }) {
  return (
    <span
      className="inline-flex items-center gap-2 rounded-full border border-[#22262F] bg-[#0E1015] px-3 py-1 text-[11px] font-medium text-[#9CA3AF]"
      style={{ fontFamily: "var(--font-ibm-mono), monospace" }}
    >
      <img
        src="/assets/partners/robinhood.svg"
        alt="Robinhood"
        className="h-3 w-auto brightness-0 invert opacity-90 shrink-0"
      />
      <span>Chain · {chainId}</span>
    </span>
  );
}

const ICON_BY_SLUG: Record<string, ComponentType<{ className?: string }>> = {
  privacy: Shield,
  ai_agents: Cpu,
  rwa: Landmark,
  stablecoins: Coins,
  depin: Server,
  prediction_markets: Target,
  perp_dex: CandlestickChart,
  defi: Layers,
  memecoin: Flame,
  gaming: Gamepad2,
};

export function SectorIcon({
  slug,
  className = "h-4 w-4",
}: {
  slug: string;
  className?: string;
}) {
  const Icon = ICON_BY_SLUG[slug] ?? Layers;
  return <Icon className={className} />;
}
