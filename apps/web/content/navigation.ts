export type NavIconKey =
  | "sui-stack"
  | "deepbook"
  | "hashi"
  | "seal"
  | "nautilus"
  | "walrus"
  | "suins"
  | "payments"
  | "capital-markets"
  | "defi"
  | "ai"
  | "privacy"
  | "release-schedule"
  | "validators"
  | "security"
  | "status"
  | "circulation"
  | "deflation"
  | "buybacks"
  | "ai-assistant"
  | "agent-skills"
  | "agent-payments"
  | "dev-hub"
  | "docs"
  | "move"
  | "starter"
  | "tools"
  | "ideas"
  | "playbook"
  | "founder"
  | "faq"
  | "funding"
  | "hackathons"
  | "community"
  | "events"
  | "building"
  | "coding"
  | "earning"
  | "connecting";

export interface NavDropdownLink {
  label: string;
  description?: string;
  href: string;
  external?: boolean;
  icon: NavIconKey;
  lottieSrc?: string;
}

export interface NavDropdownColumn {
  category: string;
  links: NavDropdownLink[];
}

export interface NavItem {
  id: string;
  label: string;
  href?: string;
  external?: boolean;
  kind: "dropdown" | "link";
  iconKind?: "plus" | "docs" | "blog";
  columns?: NavDropdownColumn[];
}

export interface AnnouncementBanner {
  enabled: boolean;
  text: string;
  href: string;
}

export const ANNOUNCEMENT_BANNER: AnnouncementBanner = {
  enabled: false,
  text: "NTI is live on Robinhood Chain Testnet (46630). Open Terminal →",
  href: "/terminal",
};

export const NAV_ITEMS: NavItem[] = [
  {
    id: "terminal",
    label: "Terminal",
    kind: "dropdown",
    iconKind: "plus",
    columns: [
      {
        category: "Analytics/",
        links: [
          {
            label: "Mindshare Terminal",
            description: "10 crypto sectors scored in Hamilton bps",
            href: "/terminal",
            icon: "sui-stack",
            lottieSrc: "/assets/lottie/intro-sui-stack.json",
          },
        ],
      },
      {
        category: "Discovery/",
        links: [
          {
            label: "Emerging Radar",
            description: "Velocity spikes & new token signals",
            href: "/radar",
            icon: "ai",
          },
          {
            label: "Builder Heatmap",
            description: "Mindshare vs. active competition",
            href: "/heatmap",
            icon: "capital-markets",
          },
        ],
      },
      {
        category: "Products/",
        links: [
          {
            label: "Pair Markets",
            description: "Relative mindshare parimutuel spreads",
            href: "/markets",
            icon: "deepbook",
          },
          {
            label: "TWAP Baskets",
            description: "Whitelisted Uniswap V3 narrative vaults",
            href: "/baskets",
            icon: "defi",
          },
          {
            label: "Ecosystem Grants",
            description: "Snapshot IVotes grant allocation",
            href: "/grants",
            icon: "walrus",
          },
        ],
      },
      {
        category: "Security/",
        links: [
          {
            label: "Oracle & Disputes",
            description: "2-of-3 EIP-712 roots & 2h challenges",
            href: "/oracle",
            icon: "seal",
          },
        ],
      },
    ],
  },
  {
    id: "markets",
    label: "Markets",
    kind: "dropdown",
    iconKind: "plus",
    columns: [
      {
        category: "Markets & Vaults/",
        links: [
          {
            label: "Pair Markets",
            href: "/markets",
            icon: "capital-markets",
            lottieSrc: "/assets/lottie/capital-markets.json",
          },
          {
            label: "TWAP Baskets",
            href: "/baskets",
            icon: "defi",
            lottieSrc: "/assets/lottie/defi.json",
          },
          {
            label: "AI Agents Vault",
            href: "/baskets/ai-agents",
            icon: "ai",
            lottieSrc: "/assets/lottie/ai.json",
          },
          {
            label: "Stake $NTI",
            href: "/stake",
            icon: "payments",
            lottieSrc: "/assets/lottie/gaming.json",
          },
        ],
      },
      {
        category: "Sectors/",
        links: [
          {
            label: "Privacy / ZK",
            href: "/narratives/1",
            icon: "privacy",
            lottieSrc: "/assets/lottie/capital-markets.json",
          },
        ],
      },
    ],
  },
  {
    id: "network",
    label: "Network",
    kind: "dropdown",
    iconKind: "plus",
    columns: [
      {
        category: "Network/",
        links: [
          {
            label: "Oracle Epochs",
            href: "/oracle",
            icon: "release-schedule",
          },
          {
            label: "Stake & Validators",
            href: "/stake",
            icon: "validators",
          },
          {
            label: "Disputes & Bonds",
            href: "/oracle",
            icon: "security",
          },
          {
            label: "API Health",
            href: "/api/health",
            external: true,
            icon: "status",
          },
          {
            label: "Index JSON Feed",
            href: "/api/indexes",
            external: true,
            icon: "circulation",
          },
          {
            label: "Chain Explorer",
            href: "https://explorer.testnet.chain.robinhood.com",
            external: true,
            icon: "events",
          },
        ],
      },
    ],
  },
  {
    id: "govern",
    label: "Govern",
    kind: "dropdown",
    iconKind: "plus",
    columns: [
      {
        category: "Governance/",
        links: [
          {
            label: "NTIGovernor",
            href: "/stake",
            icon: "funding",
          },
          {
            label: "Ecosystem Grants",
            href: "/grants",
            icon: "community",
            lottieSrc: "/assets/lottie/globe.json",
          },
          {
            label: "Builder Heatmap",
            href: "/heatmap",
            icon: "ideas",
          },
        ],
      },
      {
        category: "Verification/",
        links: [
          {
            label: "Methodology",
            href: "/methodology",
            icon: "docs",
          },
          {
            label: "Oracle Attestations",
            href: "/oracle",
            icon: "tools",
          },
          {
            label: "Emerging Radar",
            href: "/radar",
            icon: "playbook",
          },
        ],
      },
    ],
  },
  {
    id: "docs",
    label: "Docs",
    kind: "link",
    href: "/methodology",
    external: false,
    iconKind: "docs",
  },
  {
    id: "radar",
    label: "Radar",
    kind: "link",
    href: "/radar",
    external: false,
    iconKind: "blog",
  },
];

export const GET_STARTED_CTA: {
  label: string;
  href: string;
  category: string;
  links: Array<{
    label: string;
    description: string;
    href: string;
    external?: boolean;
    icon: NavIconKey;
  }>;
} = {
  label: "Launch app",
  href: "/terminal",
  category: "Launch NTI/",
  links: [
    {
      label: "Mindshare Terminal",
      description:
        "Inspect 10 narrative weights, EMA trajectories, and KOL contributors",
      href: "/terminal",
      icon: "building",
    },
    {
      label: "Trade Pair Markets",
      description:
        "Back relative sector mindshare spreads settled by finalized oracle roots",
      href: "/markets",
      icon: "coding",
    },
    {
      label: "Stake $NTI",
      description:
        "Earn ETH fee yield, unlock real-time Radar, and vote in governance",
      href: "/stake",
      icon: "earning",
    },
    {
      label: "Verify Oracle",
      description:
        "Audit dataset hashes, 2-of-3 validator signatures, and dispute bonds",
      href: "/oracle",
      icon: "connecting",
    },
  ],
};
