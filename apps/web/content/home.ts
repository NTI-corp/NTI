export interface SectorTickerItem {
  narrativeId: number;
  slug: string;
  label: string;
  iBps: number;
  vBps: number | null;
}

export interface SuiIsCapability {
  tag: string;
  title: string;
  kind: "svg" | "lottie";
  lottieSrc?: string;
}

export interface StackTimelineCard {
  number: string;
  title: string;
  protocol: string;
  column: "left" | "right";
  iconKey: "engine" | "archive" | "oracle" | "guard" | "market" | "twap";
  rivePadClass?: string;
}

export interface IndustryCard {
  title: string;
  subtitle: string;
  href: string;
  ctaLabel: string;
  bullets: string[];
  iconKind: "svg-ai" | "lottie";
  lottieSrc?: string;
  protocolMarks: ("engine" | "archive" | "oracle" | "guard" | "market" | "twap")[];
}

export interface GetStartedRow {
  title: string;
  description: string;
  ctaLabel: string;
  href: string;
  lottieSrc: string;
  mobileIconKey: "building" | "coding" | "earning" | "connecting";
}

export interface DeployedContractMeta {
  key:
    | "registry"
    | "ntiToken"
    | "staking"
    | "configRegistry"
    | "oracleCommit"
    | "dispute"
    | "narrativeMarket"
    | "basketFactory"
    | "buybackAdapterV3"
    | "buybackAdapterV4"
    | "feeRouter"
    | "grants"
    | "insuranceFund"
    | "kolRegistry";
  number: string;
  name: string;
  category: "CORE" | "ORACLE" | "MARKETS" | "VAULTS" | "ECOSYSTEM";
  column: "left" | "right";
  description: string;
}

export const HOME_CONTENT = {
  hero: {
    headline: "AI-priced crypto mindshare",
    subheadline:
      "Narrative Token Index (NTI) uses autonomous AI to read 1,500+ crypto KOLs across X every 4 hours, turning narrative velocity into verifiable onchain indexes, pair markets, and self-rebalancing vaults on Robinhood Chain.",
    primaryCta: {
      label: "Open AI terminal",
      href: "/terminal",
      external: false,
    },
    secondaryCta: {
      label: "Trade narratives",
      href: "/markets",
      external: false,
    },
    desktopVideoMp4: "/assets/videos/sui-homepage-visual.mp4",
    desktopVideoWebm: "/assets/videos/sui-homepage-visual.webm",
    desktopPoster: "/assets/videos/sui-homepage-visual-poster.jpg",
    mobileVideoMp4: "/assets/videos/sui-homepage-visual-mobile.mp4",
    mobilePoster: "/assets/videos/sui-homepage-visual-mobile-poster.jpg",
    dividerImage: "/assets/images/hero-divider-gradient-rule.avif",
  },
  marquee: {
    heading: "AI-scored attention across 10 crypto narratives",
    apiUrl: "/api/indexes",
    sectors: [
      { narrativeId: 1, slug: "privacy", label: "Privacy / ZK", iBps: 1120, vBps: 85 },
      { narrativeId: 2, slug: "ai_agents", label: "AI Agents", iBps: 1840, vBps: 210 },
      { narrativeId: 3, slug: "rwa", label: "RWA", iBps: 1290, vBps: 95 },
      { narrativeId: 4, slug: "stablecoins", label: "Stablecoins", iBps: 940, vBps: -40 },
      { narrativeId: 5, slug: "depin", label: "DePIN", iBps: 1080, vBps: 60 },
      { narrativeId: 6, slug: "prediction_markets", label: "Prediction Markets", iBps: 980, vBps: 125 },
      { narrativeId: 7, slug: "perp_dex", label: "Perp DEX", iBps: 1050, vBps: 45 },
      { narrativeId: 8, slug: "defi", label: "DeFi", iBps: 760, vBps: -90 },
      { narrativeId: 9, slug: "memecoin", label: "Memecoin", iBps: 560, vBps: -180 },
      { narrativeId: 10, slug: "gaming", label: "Gaming", iBps: 380, vBps: -110 },
    ] as SectorTickerItem[],
  },
  manifesto: {
    badge: "AI-native intelligence, verified onchain",
    statement:
      "Narratives move markets before charts ever react. NTI deploys deterministic AI classification across 1,500+ X voices every 4 hours, filtering noise with anti-bot reputation scoring and EIP-712 validator quorum so traders and AI agents can price attention onchain.",
  },
  suiIs: {
    prefix: "[ → ]",
    badge: "NTI is",
    items: [
      { tag: "AI ENGINE", title: "Autonomous AI narrative scoring", kind: "svg" },
      {
        tag: "1,500+ KOLS",
        title: "Anti-bot KOL reputation weights",
        kind: "lottie",
        lottieSrc: "/assets/lottie/onchain-validation.json",
      },
      {
        tag: "QUORUM 2/3",
        title: "Verifiable EIP-712 AI oracle roots",
        kind: "lottie",
        lottieSrc: "/assets/lottie/research.json",
      },
      {
        tag: "2H GUARD",
        title: "Bonded onchain dispute protection",
        kind: "lottie",
        lottieSrc: "/assets/lottie/shield-security.json",
      },
      {
        tag: "ETH YIELD",
        title: "Real ETH yield from narrative flow",
        kind: "lottie",
        lottieSrc: "/assets/lottie/performance.json",
      },
    ] as SuiIsCapability[],
  },
  scrollSequence: {
    totalFrames: 75,
    framePrefix: "/assets/sequences/homepage-scroll/frame_",
    frameExt: ".webp",
  },
  stackTimeline: {
    heading: "The AI oracle stack behind every epoch",
    cards: [
      {
        number: "01",
        title: "Autonomous AI post classification",
        protocol: "NTI AI Engine",
        column: "right",
        iconKey: "engine",
        rivePadClass: "",
      },
      {
        number: "02",
        title: "Immutable X dataset hashing",
        protocol: "IPFS & Archive",
        column: "left",
        iconKey: "archive",
        rivePadClass: "",
      },
      {
        number: "03",
        title: "Validator EIP-712 quorum roots",
        protocol: "NarrativeOracle",
        column: "right",
        iconKey: "oracle",
        rivePadClass: "",
      },
      {
        number: "04",
        title: "Bonded challenge & slash guard",
        protocol: "Dispute Guard",
        column: "left",
        iconKey: "guard",
        rivePadClass: "",
      },
      {
        number: "05",
        title: "Narrative spread pair markets",
        protocol: "RelativePairMarket",
        column: "right",
        iconKey: "market",
        rivePadClass: "",
      },
      {
        number: "06",
        title: "Auto-rebalancing AI & sector vaults",
        protocol: "Uniswap V3 Vaults",
        column: "left",
        iconKey: "twap",
        rivePadClass: "",
      },
    ] as StackTimelineCard[],
  },
  dropletFrames: [
    "/assets/images/droplet-frame-1.svg",
    "/assets/images/droplet-frame-2.svg",
    "/assets/images/droplet-frame-3.svg",
    "/assets/images/droplet-frame-4.svg",
    "/assets/images/droplet-frame-5.svg",
    "/assets/images/droplet-frame-6.svg",
  ],
  benefits: {
    leftColumn: {
      heading: "For traders & AI agents",
      items: [
        "Track AI-scored mindshare velocity across 10 narratives before price catches up.",
        "Trade AI Agents vs. DeFi, RWA, or Memecoins without timing single-token tops.",
        "Discover live tokens mentioned by top KOLs, auto-enriched with DEX liquidity.",
        "Feed verifiable 4-hour AI oracle roots directly into autonomous trading strategies.",
      ],
    },
    rightColumn: {
      heading: "For stakers & builders",
      items: [
        "Stake $NTI to earn native ETH fee yield from pair markets and TWAP vaults.",
        "Unlock live AI Radar breakout alerts and sector saturation heatmaps.",
        "Govern narrative taxonomy, AI scoring upgrades, and ETH grants onchain.",
        "Audit every dataset hash, KOL score, and validator signature with zero black boxes.",
      ],
    },
    cta: {
      label: "Launch AI Terminal",
      href: "/terminal",
    },
  },
  industry: {
    headingWords: ["AI-powered", "narrative", "markets", "onchain"],
    cards: [
      {
        title: "AI Mindshare Terminal",
        subtitle: "Real-time sector intelligence from 1,500+ KOLs",
        href: "/terminal",
        ctaLabel: "Open AI Terminal",
        bullets: [
          "Deterministic AI classification every 4 hours",
          "Anti-bot KOL reputation & spam-decay scoring",
          "Auto-extracted KOL token mentions & heatmaps",
        ],
        iconKind: "svg-ai",
        protocolMarks: ["engine", "archive", "oracle"],
      },
      {
        title: "Relative Pair Markets",
        subtitle: "Bet which narrative leads the next 4-hour epoch",
        href: "/markets",
        ctaLabel: "Trade Pair Markets",
        bullets: [
          "Parimutuel ETH pools settled by AI oracle roots",
          "Trade sector rotation with zero single-token risk",
          "Bonded onchain dispute window before payout claims",
        ],
        iconKind: "lottie",
        lottieSrc: "/assets/lottie/capital-markets.json",
        protocolMarks: ["engine", "market", "guard"],
      },
      {
        title: "Autonomous TWAP Vaults",
        subtitle: "Hands-free sector exposure meets native ETH yield",
        href: "/baskets",
        ctaLabel: "Explore TWAP Vaults",
        bullets: [
          "Self-rebalancing Uniswap V3 narrative baskets",
          "Native ETH fee yield streamed to $NTI stakers",
          "Onchain governance over caps, weights, and grants",
        ],
        iconKind: "lottie",
        lottieSrc: "/assets/lottie/defi.json",
        protocolMarks: ["market", "twap", "oracle"],
      },
    ] as IndustryCard[],
    getStartedHeading: "Get started",
    getStartedRows: [
      {
        title: "Open AI terminal",
        description:
          "Explore 10 live narratives, KOL reputation rankings, and AI-extracted token signals.",
        ctaLabel: "Open Terminal",
        href: "/terminal",
        lottieSrc: "/assets/lottie/intro-sui-stack.json",
        mobileIconKey: "building",
      },
      {
        title: "Trade narrative pairs",
        description:
          "Long AI Agents against any crypto sector in ETH markets settled by validator-attested AI roots.",
        ctaLabel: "View Markets",
        href: "/markets",
        lottieSrc: "/assets/lottie/developer.json",
        mobileIconKey: "coding",
      },
      {
        title: "Stake for ETH yield",
        description:
          "Stake $NTI to unlock live AI breakout radar and claim native ETH protocol fees.",
        ctaLabel: "Go to Staking",
        href: "/stake",
        lottieSrc: "/assets/lottie/assets-fiscal.json",
        mobileIconKey: "earning",
      },
      {
        title: "Audit the AI oracle",
        description:
          "Inspect deterministic formulas, archived X snapshots, and EIP-712 validator proofs.",
        ctaLabel: "Read Methodology",
        href: "/methodology",
        lottieSrc: "/assets/lottie/community-people.json",
        mobileIconKey: "connecting",
      },
    ] as GetStartedRow[],
  },
  deployedContracts: {
    headingPrefix: "Deployed",
    headingSuffix: "contracts",
    subtitle:
      "14 protocol contracts live on Robinhood Chain Mainnet (Chain ID 4663)",
    cards: [
      {
        key: "registry",
        number: "01",
        name: "NTIRegistry",
        category: "CORE",
        column: "left",
        description: "Canonical module directory resolving all protocol UUPS proxies.",
      },
      {
        key: "ntiToken",
        number: "02",
        name: "Prelaunch NTI (pNTI)",
        category: "CORE",
        column: "right",
        description: "Prelaunch ERC-20 stand-in token active for staking & markets until $NTI launches on Pons.",
      },
      {
        key: "staking",
        number: "03",
        name: "NTIStaking",
        category: "CORE",
        column: "left",
        description: "Staking vault streaming real native ETH protocol fee yield to stakers.",
      },
      {
        key: "oracleCommit",
        number: "04",
        name: "OracleCommit",
        category: "ORACLE",
        column: "right",
        description: "Publishes 4-hour scoring roots attested by at least three EIP-712 validators.",
      },
      {
        key: "dispute",
        number: "05",
        name: "DisputeGuard",
        category: "ORACLE",
        column: "left",
        description: "Enforces the onchain challenge window and validator slash bonds.",
      },
      {
        key: "narrativeMarket",
        number: "06",
        name: "RelativePairMarket",
        category: "MARKETS",
        column: "right",
        description: "Parimutuel ETH spread pools settled against finalized oracle weights.",
      },
      {
        key: "basketFactory",
        number: "07",
        name: "NarrativeBasketFactory",
        category: "VAULTS",
        column: "left",
        description: "Deploys whitelisted Uniswap V3 30-minute TWAP narrative basket vaults (RWA & Memecoin).",
      },
      {
        key: "buybackAdapterV3",
        number: "08",
        name: "BuybackAdapterV3",
        category: "VAULTS",
        column: "right",
        description: "Routes protocol ETH fees into automated Uniswap V3 buybacks.",
      },
      {
        key: "buybackAdapterV4",
        number: "09",
        name: "BuybackAdapterV4",
        category: "VAULTS",
        column: "left",
        description: "Routes protocol ETH fees through the Uniswap V4 Universal Router.",
      },
      {
        key: "feeRouter",
        number: "10",
        name: "FeeRouter",
        category: "CORE",
        column: "right",
        description: "Splits market & basket fees across stakers, buybacks, and treasury.",
      },
      {
        key: "grants",
        number: "11",
        name: "NTIGrants",
        category: "ECOSYSTEM",
        column: "left",
        description: "Keeper-funded builder grant rounds distributed in native ETH.",
      },
      {
        key: "configRegistry",
        number: "12",
        name: "ConfigRegistry",
        category: "ORACLE",
        column: "right",
        description: "Immutable hash anchor for EMA alpha and sector taxonomy specs.",
      },
      {
        key: "insuranceFund",
        number: "13",
        name: "InsuranceFund",
        category: "MARKETS",
        column: "left",
        description: "Protocol reserve backstopping market settlement edge cases.",
      },
      {
        key: "kolRegistry",
        number: "14",
        name: "KOLRegistry",
        category: "ORACLE",
        column: "right",
        description: "Contributor reputation registry backing deterministic epoch scoring.",
      },
    ] as DeployedContractMeta[],
  },
};
