export interface FooterLink {
  label: string;
  href: string;
  external?: boolean;
}

export interface FooterGroup {
  heading: string;
  links: FooterLink[];
}

export const FOOTER_CONTENT = {
  brandSubtitle: "Deterministic crypto mindshare index & pair markets.",
  columns: [
    {
      heading: "Product/",
      links: [
        { label: "Terminal", href: "/terminal" },
        { label: "Pair Markets", href: "/markets" },
        { label: "TWAP Baskets", href: "/baskets" },
        { label: "Stake $NTI", href: "/stake" },
      ],
    },
    {
      heading: "Intelligence/",
      links: [
        { label: "Emerging Radar", href: "/radar" },
        { label: "Builder Heatmap", href: "/heatmap" },
        { label: "Oracle & Disputes", href: "/oracle" },
        { label: "Ecosystem Grants", href: "/grants" },
      ],
    },
    {
      heading: "Resources/",
      links: [
        { label: "Methodology", href: "/methodology" },
        { label: "Deployed Contracts", href: "/#deployed-contracts" },
        {
          label: "Explorer",
          href: "https://explorer.testnet.chain.robinhood.com",
          external: true,
        },
        { label: "API Status", href: "/api/health", external: true },
        { label: "X (@NTI_Index)", href: "https://x.com/NTI_Index", external: true },
      ],
    },
  ] as FooterGroup[],
  xUrl: "https://x.com/NTI_Index",
  xHandle: "@NTI_Index",
  networkLabel: "Chain Testnet · 46630",
  copyright: "©2026 Narrative Token Index (NTI)",
};
