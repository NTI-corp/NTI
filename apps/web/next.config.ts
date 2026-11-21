import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    // Keep visited and prefetched dashboards in the client router cache so tab switches are instant.
    staleTimes: { dynamic: 45, static: 300 },
  },
  transpilePackages: ["@nti/sdk"],
  serverExternalPackages: ["viem"],
  onDemandEntries: {
    maxInactiveAge: 60 * 60 * 1000,
    pagesBufferLength: 50,
  },
  images: {
    unoptimized: true,
  },
  webpack: (config) => {
    config.resolve.alias = {
      ...(config.resolve.alias ?? {}),
      // Prevent @wagmi/connectors barrel from pulling unused optional SDKs into client/server bundles.
      "@base-org/account": false,
      "@coinbase/wallet-sdk": false,
      "@coinbase/cdp-sdk": false,
      "@gemini-wallet/core": false,
      "@metamask/sdk": false,
      porto: false,
      "porto/internal": false,
      "@safe-global/safe-apps-sdk": false,
      "@safe-global/safe-apps-provider": false,
    };
    config.externals = [
      ...(Array.isArray(config.externals) ? config.externals : []),
      "pino-pretty",
      "lokijs",
      "encoding",
    ];
    return config;
  },
};

export default nextConfig;
