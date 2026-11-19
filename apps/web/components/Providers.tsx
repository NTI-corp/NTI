"use client";

import React, { createContext, useCallback, useContext, useEffect, useState } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { WagmiProvider, useAccount, useChainId, useSignMessage } from "wagmi";
import { wagmiConfig } from "@/lib/wagmi";
import type { SiweSessionState } from "@/lib/types";

interface SiweContextValue {
  session: SiweSessionState | null;
  loading: boolean;
  signingIn: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  signIn: () => Promise<void>;
  signOut: () => Promise<void>;
}

const SiweContext = createContext<SiweContextValue>({
  session: null,
  loading: true,
  signingIn: false,
  error: null,
  refresh: async () => {},
  signIn: async () => {},
  signOut: async () => {},
});

export function useSiweSession() {
  return useContext(SiweContext);
}

function SiweProviderInner({ children }: { children: React.ReactNode }) {
  const { address, isConnected } = useAccount();
  const chainId = useChainId();
  const { signMessageAsync } = useSignMessage();

  const [session, setSession] = useState<SiweSessionState | null>(null);
  const [loading, setLoading] = useState(true);
  const [signingIn, setSigningIn] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/auth/siwe", { cache: "no-store" });
      if (res.ok) {
        const data = (await res.json()) as SiweSessionState;
        setSession(data);
      }
    } catch {
      // keep existing state
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const signIn = useCallback(async () => {
    if (!isConnected || !address) {
      setError("Connect a wallet first to sign in with Ethereum.");
      return;
    }
    setSigningIn(true);
    setError(null);
    try {
      const nonceRes = await fetch("/api/auth/siwe?nonce=1", { cache: "no-store" });
      if (!nonceRes.ok) throw new Error("Failed to issue SIWE nonce");
      const { nonce } = (await nonceRes.json()) as { nonce: string };

      const domain = window.location.host;
      const uri = window.location.origin;
      const issuedAt = new Date().toISOString();
      const message = [
        `${domain} wants you to sign in with your Ethereum account:`,
        address,
        "",
        "Sign in to NTI Terminal to verify $NTI stake ownership for real-time Radar access.",
        "",
        `URI: ${uri}`,
        "Version: 1",
        `Chain ID: ${chainId}`,
        `Nonce: ${nonce}`,
        `Issued At: ${issuedAt}`,
      ].join("\n");

      const signature = await signMessageAsync({ message });
      const verifyRes = await fetch("/api/auth/siwe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message, signature, address }),
      });

      if (!verifyRes.ok) {
        const errBody = (await verifyRes.json().catch(() => ({}))) as { error?: string };
        throw new Error(errBody.error || "SIWE verification failed");
      }

      const nextState = (await verifyRes.json()) as SiweSessionState;
      setSession(nextState);
    } catch (err) {
      setError(err instanceof Error ? err.message : "SIWE sign-in canceled");
    } finally {
      setSigningIn(false);
    }
  }, [address, chainId, isConnected, signMessageAsync]);

  const signOut = useCallback(async () => {
    await fetch("/api/auth/siwe", { method: "DELETE" });
    await refresh();
  }, [refresh]);

  return (
    <SiweContext.Provider
      value={{ session, loading, signingIn, error, refresh, signIn, signOut }}
    >
      {children}
    </SiweContext.Provider>
  );
}

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 30_000,
            refetchOnWindowFocus: false,
          },
        },
      }),
  );

  return (
    <WagmiProvider config={wagmiConfig}>
      <QueryClientProvider client={queryClient}>
        <SiweProviderInner>{children}</SiweProviderInner>
      </QueryClientProvider>
    </WagmiProvider>
  );
}
