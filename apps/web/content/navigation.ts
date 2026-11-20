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
  text: "Sui Basecamp starts this week. Final tickets →",
  href: "https://www.sui.io/basecamp?utm_source=pencil_banner",
};

export const NAV_ITEMS: NavItem[] = [
  {
    id: "stack",
    label: "Stack",
    kind: "dropdown",
    iconKind: "plus",
    columns: [
      {
        category: "Overview/",
        links: [
          {
            label: "Intro to Sui Stack",
            description: "Modular decentralized infrastructure",
            href: "https://www.sui.io/intro-to-sui",
            icon: "sui-stack",
            lottieSrc: "/assets/lottie/intro-sui-stack.json",
          },
        ],
      },
      {
        category: "Finance/",
        links: [
          {
            label: "DeepBook",
            description: "Programmable liquidity layer",
            href: "https://deepbook.tech/",
            external: true,
            icon: "deepbook",
          },
          {
            label: "Hashi",
            description: "Native Bitcoin collateralization",
            href: "https://www.sui.io/hashi",
            icon: "hashi",
          },
        ],
      },
      {
        category: "Data/",
        links: [
          {
            label: "Seal",
            description: "Encryption with access control",
            href: "https://seal.mystenlabs.com/",
            external: true,
            icon: "seal",
          },
          {
            label: "Nautilus",
            description: "Verifiable offchain compute",
            href: "https://www.sui.io/nautilus",
            icon: "nautilus",
          },
          {
            label: "Walrus",
            description: "Trusted data layer",
            href: "https://www.walrus.xyz/",
            external: true,
            icon: "walrus",
          },
        ],
      },
      {
        category: "Identity/",
        links: [
          {
            label: "SuiNS",
            description: "Onchain naming & identity",
            href: "https://suins.io/",
            external: true,
            icon: "suins",
          },
        ],
      },
    ],
  },
  {
    id: "solutions",
    label: "Solutions",
    kind: "dropdown",
    iconKind: "plus",
    columns: [
      {
        category: "Industries/",
        links: [
          {
            label: "Payments",
            href: "https://www.sui.io/payments",
            icon: "payments",
            lottieSrc: "/assets/lottie/gaming.json",
          },
          {
            label: "Capital Markets",
            href: "https://www.sui.io/institutions-capital-markets",
            icon: "capital-markets",
            lottieSrc: "/assets/lottie/capital-markets.json",
          },
          {
            label: "DeFi",
            href: "https://www.sui.io/defi",
            icon: "defi",
            lottieSrc: "/assets/lottie/defi.json",
          },
          {
            label: "AI and Agents",
            href: "https://www.sui.io/ai",
            icon: "ai",
            lottieSrc: "/assets/lottie/ai.json",
          },
        ],
      },
      {
        category: "Core Capabilities/",
        links: [
          {
            label: "Privacy",
            href: "https://www.sui.io/privacy",
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
            label: "Release Schedule",
            href: "https://www.sui.io/networkinfo",
            icon: "release-schedule",
          },
          {
            label: "Validators",
            href: "https://www.sui.io/validators",
            icon: "validators",
          },
          {
            label: "Security",
            href: "https://www.sui.io/security",
            icon: "security",
          },
          {
            label: "Status",
            href: "https://status.sui.io/",
            external: true,
            icon: "status",
          },
          {
            label: "SUI Circulation",
            href: "https://www.sui.io/token-schedule",
            icon: "circulation",
          },
          {
            label: "SUI Deflation",
            href: "https://www.sui.io/deflation",
            icon: "deflation",
          },
          {
            label: "SUI Buybacks",
            href: "https://www.sui.io/buybacks",
            icon: "buybacks",
          },
        ],
      },
    ],
  },
  {
    id: "build",
    label: "Build",
    kind: "dropdown",
    iconKind: "plus",
    columns: [
      {
        category: "Build with AI/",
        links: [
          {
            label: "AI Coding Assistant",
            href: "https://docs.sui.io/getting-started/sui-mcp-server",
            external: true,
            icon: "ai-assistant",
          },
          {
            label: "Agent Skills",
            href: "https://docs.sui.io/skills",
            external: true,
            icon: "agent-skills",
          },
          {
            label: "Agent Payments",
            href: "https://www.sui.io/agentpayments",
            icon: "agent-payments",
          },
        ],
      },
      {
        category: "Core Tooling/",
        links: [
          {
            label: "Developer Hub",
            href: "https://www.sui.io/builders",
            icon: "dev-hub",
          },
          {
            label: "Docs",
            href: "https://docs.sui.io/",
            external: true,
            icon: "docs",
          },
          {
            label: "Move",
            href: "https://www.sui.io/move",
            icon: "move",
          },
          {
            label: "Starter Template",
            href: "https://docs.sui.io/getting-started",
            external: true,
            icon: "starter",
          },
          {
            label: "Tools",
            href: "https://docs.sui.io/getting-started/tooling",
            external: true,
            icon: "tools",
          },
        ],
      },
      {
        category: "Launch/",
        links: [
          {
            label: "Project Ideas",
            href: "https://www.sui.io/project-ideas",
            icon: "ideas",
          },
          {
            label: "Launch Playbook",
            href: "https://www.sui.io/launch-on-sui",
            icon: "playbook",
          },
          {
            label: "Founder Starter Pack",
            href: "https://www.sui.io/founder-starter-pack",
            icon: "founder",
          },
          {
            label: "Builder FAQ",
            href: "https://www.sui.io/faq",
            icon: "faq",
          },
          {
            label: "Programs & Funding",
            href: "https://www.sui.io/programs-funding",
            icon: "funding",
          },
        ],
      },
      {
        category: "Get Involved/",
        links: [
          {
            label: "Hackathons",
            href: "https://www.deepsurge.xyz/",
            external: true,
            icon: "hackathons",
          },
          {
            label: "Online Communities",
            href: "https://www.sui.io/community",
            icon: "community",
            lottieSrc: "/assets/lottie/globe.json",
          },
          {
            label: "Events",
            href: "https://luma.com/sui-network",
            external: true,
            icon: "events",
          },
        ],
      },
    ],
  },
  {
    id: "docs",
    label: "Docs",
    kind: "link",
    href: "https://docs.sui.io/",
    external: true,
    iconKind: "docs",
  },
  {
    id: "blog",
    label: "Blog",
    kind: "link",
    href: "https://www.sui.io/blog",
    external: true,
    iconKind: "blog",
  },
];

export const GET_STARTED_CTA = {
  label: "Get started",
  category: "Get Started/",
  links: [
    {
      label: "Start building",
      description:
        "Build, launch, and scale your product with the right resources and support",
      href: "https://www.sui.io/ecosystem",
      icon: "building" as NavIconKey,
    },
    {
      label: "Start coding",
      description:
        "Get started with Move, the most powerful smart contract programming language",
      href: "https://www.sui.io/builders",
      icon: "coding" as NavIconKey,
    },
    {
      label: "Start earning",
      description: "Get a wallet, buy SUI, and explore top dApps",
      href: "https://www.sui.io/get-started",
      icon: "earning" as NavIconKey,
    },
    {
      label: "Start connecting",
      description: "Join a global community of builders and collaborators",
      href: "https://www.sui.io/community",
      icon: "connecting" as NavIconKey,
    },
  ],
};
