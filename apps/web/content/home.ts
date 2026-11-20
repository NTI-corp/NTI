export interface PartnerLogo {
  name: string;
  src: string;
  variant?: "invert" | "opacity-50" | "default";
}

export interface SuiIsCapability {
  title: string;
  kind: "svg" | "lottie";
  lottieSrc?: string;
}

export interface StackTimelineCard {
  number: string;
  title: string;
  protocol: string;
  column: "left" | "right";
  iconKey: "sui" | "walrus" | "seal" | "nautilus" | "deepbook" | "suins";
  riveSrc: string;
  riveFit: "cover" | "contain";
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
  protocolMarks: ("sui" | "walrus" | "seal" | "nautilus" | "deepbook" | "suins")[];
}

export interface GetStartedRow {
  title: string;
  description: string;
  ctaLabel: string;
  href: string;
  lottieSrc: string;
  mobileIconKey: "building" | "coding" | "earning" | "connecting";
}

export interface FeaturedItem {
  title: string;
  href: string;
  thumbnail: string;
  external?: boolean;
}

export interface VideoRecapItem {
  title: string;
  ctaLabel: string;
  href: string;
  videoSrc: string;
  posterSrc: string;
}

export const HOME_CONTENT = {
  hero: {
    headline: "Track & trade crypto mindshare",
    subheadline:
      "NTI indexes real-time sector attention across X every 4 hours — powering relative pair markets, TWAP narrative vaults, and native ETH yield on Robinhood Chain.",
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
    heading: "The most innovative companies build on Sui",
    logos: [
      { name: "Google", src: "/assets/logos/google-logo.svg", variant: "invert" },
      {
        name: "Sui Group Holdings",
        src: "/assets/logos/sui-group-holdings-logo.svg",
        variant: "invert",
      },
      {
        name: "NAVI Protocol",
        src: "/assets/logos/navi-protocol-logo.svg",
        variant: "invert",
      },
      {
        name: "EVE Frontier",
        src: "/assets/logos/eve-frontier-logo.png",
        variant: "invert",
      },
      {
        name: "Franklin Templeton",
        src: "/assets/logos/franklin-templeton-logo.png",
        variant: "default",
      },
      { name: "OKX", src: "/assets/logos/okx-logo.svg", variant: "invert" },
      {
        name: "Fireblocks",
        src: "/assets/logos/fireblocks-logo.svg",
        variant: "invert",
      },
      {
        name: "Claynosaurz",
        src: "/assets/logos/claynosaurz-logo.svg",
        variant: "invert",
      },
      {
        name: "Ethena",
        src: "/assets/logos/ethena-logo.svg",
        variant: "opacity-50",
      },
      {
        name: "Bluefin",
        src: "/assets/logos/bluefin-logo.svg",
        variant: "invert",
      },
      { name: "Beep", src: "/assets/logos/beep-logo.svg", variant: "invert" },
      { name: "One", src: "/assets/logos/one-logo.svg", variant: "invert" },
      {
        name: "Grayscale",
        src: "/assets/logos/grayscale-logo.svg",
        variant: "invert",
      },
      {
        name: "21Shares",
        src: "/assets/logos/21shares-logo.svg",
        variant: "invert",
      },
      {
        name: "Hudi",
        src: "/assets/logos/hudi-logo.svg",
        variant: "opacity-50",
      },
      {
        name: "Canary Capital",
        src: "/assets/logos/canary-capital-logo.svg",
        variant: "invert",
      },
    ] as PartnerLogo[],
  },
  manifesto: {
    badge: "The economy, rebuilt for autonomous participants",
    statement:
      "Money and work are being handed to agents. When you can't watch every action, the rules have to. On Sui, the rules travel with the money and hold at machine speed — for people and agents alike. Don't trust the agent. Trust the rules.",
  },
  suiIs: {
    prefix: "[ → ]",
    badge: "Sui is",
    items: [
      { title: "Policy-enforced assets", kind: "svg" },
      {
        title: "All-or-nothing settlement",
        kind: "lottie",
        lottieSrc: "/assets/lottie/onchain-validation.json",
      },
      {
        title: "Controlled visibility",
        kind: "lottie",
        lottieSrc: "/assets/lottie/research.json",
      },
      {
        title: "Always-on security",
        kind: "lottie",
        lottieSrc: "/assets/lottie/shield-security.json",
      },
      {
        title: "Performance without compromise",
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
    heading: "The stack autonomous systems run on",
    cards: [
      {
        number: "01",
        title: "Policy-enforced execution",
        protocol: "Sui",
        column: "right",
        iconKey: "sui",
        riveSrc: "/assets/rive/sui-execution.riv",
        riveFit: "cover",
        rivePadClass: "",
      },
      {
        number: "02",
        title: "Persistent data",
        protocol: "Walrus",
        column: "left",
        iconKey: "walrus",
        riveSrc: "/assets/rive/walrus-storage.riv",
        riveFit: "cover",
        rivePadClass: "pr-[2em]",
      },
      {
        number: "03",
        title: "Controlled access to encrypted data",
        protocol: "Seal",
        column: "right",
        iconKey: "seal",
        riveSrc: "/assets/rive/seal-security.riv",
        riveFit: "contain",
        rivePadClass: "px-[1em]",
      },
      {
        number: "04",
        title: "Protected compute, verified onchain",
        protocol: "Nautilus",
        column: "left",
        iconKey: "nautilus",
        riveSrc: "/assets/rive/nautilus-compute.riv",
        riveFit: "contain",
        rivePadClass: "px-[2em]",
      },
      {
        number: "05",
        title: "Programmable liquidity",
        protocol: "DeepBook",
        column: "right",
        iconKey: "deepbook",
        riveSrc: "/assets/rive/deepbook-liquidity.riv",
        riveFit: "cover",
        rivePadClass: "py-[0.5em]",
      },
      {
        number: "06",
        title: "Verifiable agent identity",
        protocol: "SuiNS",
        column: "left",
        iconKey: "suins",
        riveSrc: "/assets/rive/suins-identity.riv",
        riveFit: "cover",
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
      heading: "For businesses",
      items: [
        "Settle multi-step transactions without manual reconciliation.",
        "Attach policy to assets so rules hold wherever value moves.",
        "Move capital directly from settlement into liquidity and yield.",
        "Coordinate treasury, collateral, and compliance on shared infrastructure.",
      ],
    },
    rightColumn: {
      heading: "For autonomous systems",
      items: [
        "Operate autonomously, constrained by rules.",
        "Act only within the policy attached to each asset.",
        "Settle complete workflows, never partial ones.",
        "See only the data they're authorized to access.",
      ],
    },
    cta: {
      label: "Discover the Sui Stack",
      href: "https://www.sui.io/intro-to-sui",
    },
  },
  industry: {
    headingWords: ["Industry", "transformation", "powered", "by", "Sui"],
    cards: [
      {
        title: "AI and agents",
        subtitle: "Agents transact under policy, not supervision",
        href: "https://www.sui.io/ai",
        ctaLabel: "Explore Sui Stack for AI",
        bullets: [
          "Coordinate financial workflows autonomously",
          "Settle in full, never in part",
          "Access only authorized information",
        ],
        iconKind: "svg-ai",
        protocolMarks: ["sui", "walrus", "seal"],
      },
      {
        title: "Capital Markets",
        subtitle: "Control from issuance through settlement",
        href: "https://www.sui.io/institutions-capital-markets",
        ctaLabel: "Explore Sui Stack for Capital Markets",
        bullets: [
          "Run treasury and collateral on shared infrastructure",
          "Settle assets and payments together",
          "Set visibility by participant and role",
        ],
        iconKind: "lottie",
        lottieSrc: "/assets/lottie/capital-markets.json",
        protocolMarks: ["sui", "deepbook", "nautilus"],
      },
      {
        title: "Decentralized Finance (DeFi)",
        subtitle: "Financial strategies that execute atomically",
        href: "https://www.sui.io/defi",
        ctaLabel: "Explore Sui Stack for DeFi",
        bullets: [
          "Access programmable liquidity",
          "Compose strategies across protocols",
          "Connect assets and liquidity across platforms",
        ],
        iconKind: "lottie",
        lottieSrc: "/assets/lottie/defi.json",
        protocolMarks: ["deepbook", "hashi", "sui"] as unknown as IndustryCard["protocolMarks"],
      },
    ] as IndustryCard[],
    getStartedHeading: "Get started",
    getStartedRows: [
      {
        title: "Start building",
        description:
          "Build, launch, and scale your product with the right resources and support.",
        ctaLabel: "Read launch playbook",
        href: "https://www.sui.io/launch-on-sui",
        lottieSrc: "/assets/lottie/intro-sui-stack.json",
        mobileIconKey: "building",
      },
      {
        title: "Start coding",
        description:
          "Get started with Move, the most powerful smart contract programming language.",
        ctaLabel: "Go to docs",
        href: "https://docs.sui.io/",
        lottieSrc: "/assets/lottie/developer.json",
        mobileIconKey: "coding",
      },
      {
        title: "Start earning",
        description: "Get a wallet, claim SUI, and explore top apps.",
        ctaLabel: "Get a wallet",
        href: "https://www.sui.io/get-started",
        lottieSrc: "/assets/lottie/assets-fiscal.json",
        mobileIconKey: "earning",
      },
      {
        title: "Start connecting",
        description: "Join a global community of builders and collaborators.",
        ctaLabel: "Join the community",
        href: "https://www.sui.io/community",
        lottieSrc: "/assets/lottie/community-people.json",
        mobileIconKey: "connecting",
      },
    ] as GetStartedRow[],
  },
  stayInLoop: {
    headingPrefix: "Stay in the",
    headingSuffix: "loop",
    subtitle:
      "Events, blogs, press, videos, podcasts, and livestreams—all in one place",
    featuredHeading: "Featured",
    featuredItems: [
      {
        title: "Sui explainer video: The full stack, built on Sui",
        href: "https://youtube.com/playlist?list=PL9t2y-BKvZBTbRfsl-7zxGb2Yhrwl2bQ4&si=bnEYQl7pyxgJGMcI",
        thumbnail: "/assets/images/sui-explainer-video-thumbnail.avif",
        external: true,
      },
      {
        title: "Unlock Sui with the Right Wallet",
        href: "https://www.sui.io/blog/unlock-sui-with-the-right-wallet/",
        thumbnail: "/assets/images/unlock-sui-right-wallet-thumbnail.avif",
        external: true,
      },
      {
        title: "Reimagining Bitcoin’s Role in Sui DeFi",
        href: "https://www.sui.io/blog/reimagining-bitcoins-role-in-sui-defi/",
        thumbnail: "/assets/images/bitcoin-role-sui-defi-thumbnail.avif",
        external: true,
      },
    ] as FeaturedItem[],
    videoRecaps: [
      {
        title: "SuiFest Singapore",
        ctaLabel: "Watch recap",
        href: "https://www.sui.io/blog/suifest-singapore-event-2025/",
        videoSrc: "/assets/videos/suifest-recap.mp4",
        posterSrc: "/assets/images/suifest-poster.avif",
      },
      {
        title: "KBW",
        ctaLabel: "Watch recap",
        href: "https://youtube.com/playlist?list=PL9t2y-BKvZBSoBBosd9OtTuFZSsmPhbL_&si=wuqhYwoL3UKfGJau",
        videoSrc: "/assets/videos/kbw-recap.mp4",
        posterSrc: "/assets/images/kbw-poster.avif",
      },
    ] as VideoRecapItem[],
    tvl: {
      caption: "(Total value locked)",
      label: "TVL",
      fallbackFormatted: "$380,000,000",
      fallbackNumeric: 380_000_000,
      apiUrl: "https://api.llama.fi/v2/chains",
    },
    socialTiles: [
      {
        name: "Discord",
        href: "https://discord.com/invite/sui",
        kind: "discord" as const,
      },
      {
        name: "X",
        href: "https://x.com/SuiNetwork",
        kind: "x" as const,
      },
    ],
  },
};
