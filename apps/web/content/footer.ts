export interface FooterLink {
  label: string;
  href: string;
  external?: boolean;
}

export interface FooterGroup {
  heading: string;
  links: FooterLink[];
}

export interface FooterSocial {
  name: "youtube" | "discord" | "linkedin" | "x";
  href: string;
  label: string;
}

export const FOOTER_CONTENT = {
  // Arranged in 4 visual grid columns matching sui.io:
  // Col 1: Stack/ | Col 2: Solutions/ + Network/ | Col 3: Build/ | Col 4: Learn/ + About/
  gridColumns: [
    [
      {
        heading: "Stack/",
        links: [
          { label: "Intro to Sui Stack", href: "https://www.sui.io/intro-to-sui" },
          { label: "zkLogin", href: "https://www.sui.io/zklogin" },
          { label: "Passkey", href: "https://www.sui.io/passkey" },
          { label: "Hashi", href: "https://www.sui.io/hashi" },
          { label: "DeepBook", href: "https://deepbook.tech/", external: true },
          { label: "Walrus", href: "https://www.walrus.xyz/", external: true },
          { label: "Seal", href: "https://seal.mystenlabs.com/", external: true },
          { label: "Nautilus", href: "https://www.sui.io/nautilus" },
          { label: "SuiNS", href: "https://suins.io/", external: true },
          { label: "Mysticeti", href: "https://www.sui.io/mysticeti" },
        ],
      },
    ],
    [
      {
        heading: "Solutions/",
        links: [
          { label: "Payments", href: "https://www.sui.io/payments" },
          {
            label: "Capital Markets",
            href: "https://www.sui.io/institutions-capital-markets",
          },
          { label: "DeFi", href: "https://www.sui.io/defi" },
          { label: "AI and Agents", href: "https://www.sui.io/ai" },
          { label: "Gaming", href: "https://www.sui.io/gaming" },
          { label: "USDC", href: "https://www.sui.io/usdc" },
          { label: "Privacy", href: "https://www.sui.io/privacy" },
        ],
      },
      {
        heading: "Network/",
        links: [
          { label: "Validators", href: "https://www.sui.io/validators" },
          { label: "Security", href: "https://www.sui.io/security" },
          {
            label: "Bug Bounty Program",
            href: "https://www.sui.io/bug-bounty-program",
          },
          { label: "Network Info", href: "https://www.sui.io/networkinfo" },
          {
            label: "Network Status",
            href: "https://status.sui.io/",
            external: true,
          },
          {
            label: "Incident History",
            href: "https://status.sui.io/history",
            external: true,
          },
          { label: "Uptime", href: "https://status.sui.io/uptime", external: true },
          {
            label: "SUI Circulation",
            href: "https://www.sui.io/token-schedule",
          },
          { label: "SUI Deflation", href: "https://www.sui.io/deflation" },
          { label: "SUI Buybacks", href: "https://www.sui.io/buybacks" },
        ],
      },
    ],
    [
      {
        heading: "Build/",
        links: [
          { label: "Builder Hub", href: "https://www.sui.io/ecosystem" },
          { label: "Move", href: "https://www.sui.io/move" },
          { label: "Docs", href: "https://docs.sui.io/", external: true },
          {
            label: "AI Coding Assistant",
            href: "https://docs.sui.io/getting-started/sui-mcp-server",
            external: true,
          },
          {
            label: "Getting Started",
            href: "https://docs.sui.io/guides/developer/getting-started",
            external: true,
          },
          {
            label: "Tools",
            href: "https://github.com/sui-foundation/awesome-sui/tree/main",
            external: true,
          },
          { label: "Project Ideas", href: "https://www.sui.io/project-ideas" },
          {
            label: "Hackathons",
            href: "https://www.deepsurge.xyz/",
            external: true,
          },
          {
            label: "Events",
            href: "https://luma.com/sui-network?period=past",
            external: true,
          },
          {
            label: "Discord",
            href: "https://discord.com/invite/sui",
            external: true,
          },
          {
            label: "Online Communities",
            href: "https://www.sui.io/community",
          },
          { label: "Launch Playbook", href: "https://www.sui.io/launch-on-sui" },
          {
            label: "Founder Starter Pack",
            href: "https://www.sui.io/founder-starter-pack",
          },
          { label: "Builder FAQ", href: "https://www.sui.io/faq" },
          {
            label: "Programs & Funding",
            href: "https://www.sui.io/programs-funding",
          },
        ],
      },
    ],
    [
      {
        heading: "Learn/",
        links: [
          { label: "Blog", href: "https://www.sui.io/blog" },
          { label: "Press Center", href: "https://www.sui.io/press-center" },
          { label: "Research", href: "https://www.sui.io/research" },
        ],
      },
      {
        heading: "About/",
        links: [
          { label: "About Sui Foundation", href: "https://www.sui.io/about" },
          {
            label: "Brand Kit",
            href: "https://live.standards.site/sui-media-kit",
            external: true,
          },
          {
            label: "Careers",
            href: "https://jobs.ashbyhq.com/Sui%20Foundation",
            external: true,
          },
          { label: "Terms of Service", href: "https://www.sui.io/terms" },
          { label: "Privacy Policy", href: "https://www.sui.io/privacy-policy" },
        ],
      },
    ],
  ] as FooterGroup[][],
  socials: [
    {
      name: "youtube",
      href: "https://www.youtube.com/@Sui-Network",
      label: "YouTube",
    },
    {
      name: "discord",
      href: "https://discord.com/invite/sui",
      label: "Discord",
    },
    {
      name: "linkedin",
      href: "https://www.linkedin.com/company/sui-foundation/",
      label: "LinkedIn",
    },
    {
      name: "x",
      href: "https://twitter.com/SuiNetwork",
      label: "X",
    },
  ] as FooterSocial[],
  copyright: "©2026 Copyright Sui Foundation. All rights reserved",
};
