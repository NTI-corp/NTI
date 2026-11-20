import type { Metadata } from "next";
import { Inter, JetBrains_Mono, Space_Grotesk } from "next/font/google";
import "./globals.css";
import { Providers } from "@/components/Providers";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
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
  title: "NTI — Narrative Token Index",
  description:
    "Narrative Token Index (NTI): onchain crypto mindshare index, relative pair markets, TWAP narrative vaults, and native ETH yield on Robinhood Chain.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${inter.variable} ${spaceGrotesk.variable} ${jetbrainsMono.variable}`}
    >
      <body className="min-h-screen bg-[#06070A] font-sans text-[#F3F5F8] antialiased selection:bg-[#B8FF2E]/25 selection:text-[#F3F5F8]">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
