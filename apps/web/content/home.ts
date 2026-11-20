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
    | "feeRouter"
    | "grants"
    | "governor"
    | "timelock"
    | "insuranceFund"
    | "kolRegistry";
  number: string;
  name: string;
  category: "CORE" | "ORACLE" | "MARKETS" | "VAULTS" | "GOVERNANCE";
  column: "left" | "right";
  description: string;
}

export const HOME_CONTENT = {
  hero: {
    headline: "Track & trade crypto mindshare",
    subheadline:
      "Narrative Token Index (NTI) scores real-time sector attention across X every 4 hours, powering relative pair markets, TWAP vaults, and native ETH yield on Robinhood Chain.",
    primaryCta: {
      label: "Open terminal",
      href: "/terminal",
      external: false,
    },
    secondaryCta: {
      label: "Trade markets",
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
    heading: "Tracking 10 crypto narratives every 4 hours",
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
    badge: "Crypto attention, priced with deterministic precision",
    statement:
      "Capital rotates around narratives long before price catches up. NTI scores X sector mindshare every 4 hours with EMA smoothing and Hamilton bps weighting, verified by 2-of-3 EIP-712 validators before settling pair markets and TWAP baskets on Robinhood Chain.",
  },
  suiIs: {
    prefix: "[ → ]",
    badge: "NTI is",
    items: [
      { tag: "4H CADENCE", title: "4-hour mindshare scoring", kind: "svg" },
      {
        tag: "10,000 BPS",
        title: "Hamilton bps index weights",
        kind: "lottie",
        lottieSrc: "/assets/lottie/onchain-validation.json",
      },
      {
        tag: "QUORUM 2/3",
        title: "2-of-3 EIP-712 oracle roots",
        kind: "lottie",
        lottieSrc: "/assets/lottie/research.json",
      },
      {
        tag: "2H GUARD",
        title: "2-hour dispute protection",
        kind: "lottie",
        lottieSrc: "/assets/lottie/shield-security.json",
      },
      {
        tag: "ETH YIELD",
        title: "Native ETH fee yield",
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
    heading: "The stack mindshare markets run on",
    cards: [
      {
        number: "01",
        title: "Deterministic mindshare scoring",
        protocol: "NTI Engine",
        column: "right",
        iconKey: "engine",
        rivePadClass: "",
      },
      {
        number: "02",
        title: "Raw tweet snapshot hashing",
        protocol: "IPFS & Archive",
        column: "left",
        iconKey: "archive",
        rivePadClass: "",
      },
      {
        number: "03",
        title: "2-of-3 EIP-712 attestations",
        protocol: "NarrativeOracle",
        column: "right",
        iconKey: "oracle",
        rivePadClass: "",
      },
      {
        number: "04",
        title: "2-hour challenge bonds",
        protocol: "Dispute Guard",
        column: "left",
        iconKey: "guard",
        rivePadClass: "",
      },
      {
        number: "05",
        title: "Parimutuel pair liquidity",
        protocol: "RelativePairMarket",
        column: "right",
        iconKey: "market",
        rivePadClass: "",
      },
      {
        number: "06",
        title: "Automated TWAP basket execution",
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
      heading: "For traders",
      items: [
        "Compare sector velocity across 10 crypto narratives in real time.",
        "Trade relative mindshare spreads without picking single-token tops.",
        "Allocate ETH into whitelisted Uniswap V3 TWAP narrative baskets.",
        "Audit every epoch dataset hash and validator signature onchain.",
      ],
    },
    rightColumn: {
      heading: "For stakers & builders",
      items: [
        "Stake $NTI with 7-day cooldowns to earn native ETH fee distributions.",
        "Unlock live Emerging Radar spikes and Builder Heatmap saturation metrics.",
        "Vote on ecosystem grants via Snapshot IVotes and NTIGovernor.",
        "Spot crowded narratives early before launching new protocols.",
      ],
    },
    cta: {
      label: "Explore NTI Terminal",
      href: "/terminal",
    },
  },
  industry: {
    headingWords: ["Narrative", "markets", "powered", "by", "NTI"],
    cards: [
      {
        title: "Mindshare Analytics",
        subtitle: "See capital rotation across 10 crypto sectors",
        href: "/terminal",
        ctaLabel: "Open Mindshare Terminal",
        bullets: [
          "4-hour EMA smoothed attention scores",
          "Deterministic Hamilton bps ranking",
          "KOL velocity & sector heatmaps",
        ],
        iconKind: "svg-ai",
        protocolMarks: ["engine", "archive", "oracle"],
      },
      {
        title: "Relative Pair Markets",
        subtitle: "Trade which narrative wins the 4-hour epoch",
        href: "/markets",
        ctaLabel: "Trade Pair Markets",
        bullets: [
          "Parimutuel ETH pools settled by oracle roots",
          "Zero external price-feed oracle risk",
          "2-hour dispute window before payout claims",
        ],
        iconKind: "lottie",
        lottieSrc: "/assets/lottie/capital-markets.json",
        protocolMarks: ["engine", "market", "guard"],
      },
      {
        title: "TWAP Baskets & Yield",
        subtitle: "Automated execution meets native ETH fees",
        href: "/baskets",
        ctaLabel: "Explore TWAP Baskets",
        bullets: [
          "Whitelisted Uniswap V3 narrative baskets",
          "ETH-denominated fee yield for $NTI stakers",
          "Governor-controlled grants and parameters",
        ],
        iconKind: "lottie",
        lottieSrc: "/assets/lottie/defi.json",
        protocolMarks: ["market", "twap", "oracle"],
      },
    ] as IndustryCard[],
    getStartedHeading: "Get started",
    getStartedRows: [
      {
        title: "Inspect live terminal",
        description:
          "Track all 10 crypto sectors scored in Hamilton bps across 4-hour epochs.",
        ctaLabel: "Open Terminal",
        href: "/terminal",
        lottieSrc: "/assets/lottie/intro-sui-stack.json",
        mobileIconKey: "building",
      },
      {
        title: "Trade pair markets",
        description:
          "Take positions on relative mindshare spreads settled by 2-of-3 oracle roots.",
        ctaLabel: "View Markets",
        href: "/markets",
        lottieSrc: "/assets/lottie/developer.json",
        mobileIconKey: "coding",
      },
      {
        title: "Stake & earn yield",
        description:
          "Stake $NTI to unlock Emerging Radar signals and claim native ETH fee yield.",
        ctaLabel: "Go to Staking",
        href: "/stake",
        lottieSrc: "/assets/lottie/assets-fiscal.json",
        mobileIconKey: "earning",
      },
      {
        title: "Verify methodology",
        description:
          "Inspect formula docs, EIP-712 dataset hashes, and validator quorum rules.",
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
      "15 protocol contracts live on Robinhood Chain Testnet (Chain ID 46630)",
    cards: [
      {
        key: "registry",
        number: "01",
        name: "NTIRegistry",
        category: "CORE",
        column: "left",
        description: "Canonical module directory resolving all protocol contracts.",
      },
      {
        key: "ntiToken",
        number: "02",
        name: "NTIToken ($NTI)",
        category: "CORE",
        column: "right",
        description: "ERC-20 protocol asset with ERC20Votes governance snapshots.",
      },
      {
        key: "staking",
        number: "03",
        name: "NTIStaking",
        category: "CORE",
        column: "left",
        description: "7-day cooldown staking vault streaming native ETH fee yield.",
      },
      {
        key: "oracleCommit",
        number: "04",
        name: "OracleCommit",
        category: "ORACLE",
        column: "right",
        description: "Publishes 4-hour scoring roots attested by 2-of-3 EIP-712 validators.",
      },
      {
        key: "dispute",
        number: "05",
        name: "DisputeGuard",
        category: "ORACLE",
        column: "left",
        description: "Enforces the 2-hour challenge window and validator slash bonds.",
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
        description: "Deploys whitelisted Uniswap V3 TWAP narrative basket vaults.",
      },
      {
        key: "buybackAdapterV3",
        number: "08",
        name: "BuybackAdapterV3",
        category: "VAULTS",
        column: "right",
        description: "Routes protocol ETH fees into automated Uniswap V3 $NTI buybacks.",
      },
      {
        key: "feeRouter",
        number: "09",
        name: "FeeRouter",
        category: "CORE",
        column: "left",
        description: "Splits market & basket fees across stakers, buybacks, and treasury.",
      },
      {
        key: "grants",
        number: "10",
        name: "NTIGrants",
        category: "GOVERNANCE",
        column: "right",
        description: "Snapshot IVotes grant rounds funded with native ETH allocations.",
      },
      {
        key: "governor",
        number: "11",
        name: "NTIGovernor",
        category: "GOVERNANCE",
        column: "left",
        description: "Onchain voting contract governing protocol caps and basket whitelists.",
      },
      {
        key: "timelock",
        number: "12",
        name: "NTITimelock",
        category: "GOVERNANCE",
        column: "right",
        description: "Queued execution delay protecting governor parameter changes.",
      },
      {
        key: "configRegistry",
        number: "13",
        name: "ConfigRegistry",
        category: "ORACLE",
        column: "left",
        description: "Immutable hash anchor for EMA alpha and sector taxonomy specs.",
      },
      {
        key: "insuranceFund",
        number: "14",
        name: "InsuranceFund",
        category: "MARKETS",
        column: "right",
        description: "Protocol reserve backstopping market settlement edge cases.",
      },
      {
        key: "kolRegistry",
        number: "15",
        name: "KOLRegistry",
        category: "ORACLE",
        column: "left",
        description: "Verified X contributor weights backing deterministic epoch scoring.",
      },
    ] as DeployedContractMeta[],
  },
};
