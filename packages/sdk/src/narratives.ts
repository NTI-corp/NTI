export interface NarrativeMeta {
  id: number;
  slug: string;
  label: string;
  description: string;
}

export const NARRATIVES: readonly NarrativeMeta[] = [
  { id: 1, slug: "privacy", label: "Privacy / ZK", description: "Privacy protocols and zero-knowledge cryptography" },
  { id: 2, slug: "ai_agents", label: "AI Agents", description: "Autonomous AI agents and agentic payments" },
  { id: 3, slug: "rwa", label: "RWA", description: "Tokenized real-world assets" },
  { id: 4, slug: "stablecoins", label: "Stablecoins", description: "Stablecoins and stablechains" },
  { id: 5, slug: "depin", label: "DePIN", description: "Decentralized physical infrastructure and GPU compute" },
  { id: 6, slug: "prediction_markets", label: "Prediction Markets", description: "On-chain prediction and event markets" },
  { id: 7, slug: "perp_dex", label: "Perp DEX", description: "Decentralized perpetual exchanges" },
  { id: 8, slug: "defi", label: "DeFi", description: "Core DeFi outside perp DEX and stablecoins" },
  { id: 9, slug: "memecoin", label: "Memecoin", description: "Memecoins and trenching culture" },
  { id: 10, slug: "gaming", label: "Gaming", description: "On-chain and web3 gaming ecosystems" },
] as const;

export const NARRATIVE_BY_ID: ReadonlyMap<number, NarrativeMeta> = new Map(
  NARRATIVES.map((n) => [n.id, n]),
);

export const NARRATIVE_BY_SLUG: ReadonlyMap<string, NarrativeMeta> = new Map(
  NARRATIVES.map((n) => [n.slug, n]),
);
