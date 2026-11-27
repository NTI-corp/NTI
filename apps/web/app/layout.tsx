import type { Metadata } from "next";
import { Archivo, Inter, JetBrains_Mono, Newsreader, Space_Grotesk } from "next/font/google";
import "./globals.css";
import { Providers } from "@/components/Providers";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

const archivo = Archivo({
  subsets: ["latin"],
  variable: "--font-archivo",
  display: "swap",
});

const newsreader = Newsreader({
  subsets: ["latin"],
  variable: "--font-serif",
  display: "swap",
});

const spaceGrotesk = Space_Grotesk({
  subsets: ["latin"],
  variable: "--font-space-grotesk",
  display: "swap",
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-jetbrains-mono",
  display: "swap",
});

const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL ?? "https://narrativeindex.tech";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: "NTI | Narrative Token Index",
  description:
    "Narrative Token Index (NTI) uses autonomous AI to score 1,500+ crypto KOLs across X every 4 hours, powering verifiable onchain narrative indexes, pair markets, and self-rebalancing vaults on Robinhood Chain.",
  openGraph: {
    type: "website",
    siteName: "Narrative Token Index (NTI)",
    title: "NTI | AI-priced crypto mindshare",
    description:
      "Autonomous AI scoring across 1,500+ X KOLs every 4 hours. Verifiable onchain indexes, pair markets & TWAP baskets on Robinhood Chain (4663).",
    url: "/",
    images: [
      {
        url: "/og-banner.jpg",
        width: 1200,
        height: 630,
        alt: "NTI — AI-priced crypto mindshare on Robinhood Chain",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    site: "@NarrativeIdx",
    creator: "@NarrativeIdx",
    title: "NTI | AI-priced crypto mindshare",
    description:
      "Autonomous AI scoring across 1,500+ X KOLs every 4 hours. Verifiable onchain indexes, pair markets & TWAP baskets on Robinhood Chain (4663).",
    images: ["/og-banner.jpg"],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${inter.variable} ${archivo.variable} ${spaceGrotesk.variable} ${newsreader.variable} ${jetbrainsMono.variable}`}
    >
      <body className="min-h-screen bg-[#06070A] font-sans text-[#F3F5F8] antialiased selection:bg-[#B8FF2E]/25 selection:text-[#F3F5F8]">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
