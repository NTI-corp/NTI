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

export const metadata: Metadata = {
  title: "NTI | AI-Priced Crypto Mindshare",
  description:
    "Autonomous AI scores 1,500+ crypto KOLs across X every 4 hours, powering verifiable onchain narrative indexes, pair markets, and self-rebalancing vaults on Robinhood Chain.",
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
