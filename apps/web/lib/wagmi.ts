import { createConfig, http, injected } from "wagmi";
import { walletConnect } from "wagmi/connectors";
import { robinhoodMainnet, robinhoodTestnet } from "@nti/sdk";

const wcProjectId = process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID;

const connectors = wcProjectId
  ? [
      injected(),
      walletConnect({
        projectId: wcProjectId,
        metadata: {
          name: "NTI — Narrative Mindshare Index",
          description: "Institutional crypto narrative intelligence terminal on Robinhood Chain.",
          url: "https://nti-nine.vercel.app",
          icons: [],
        },
      }),
    ]
  : [injected()];

export const wagmiConfig = createConfig({
  chains: [robinhoodTestnet, robinhoodMainnet],
  multiInjectedProviderDiscovery: true,
  connectors,
  transports: {
    [robinhoodTestnet.id]: http(
      process.env.NEXT_PUBLIC_RPC_URL_TESTNET ??
        robinhoodTestnet.rpcUrls.default.http[0],
    ),
    [robinhoodMainnet.id]: http(
      process.env.NEXT_PUBLIC_RPC_URL_MAINNET ??
        robinhoodMainnet.rpcUrls.default.http[0],
    ),
  },
  ssr: true,
});
