"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { formatEther } from "viem";
import {
  useAccount,
  useBalance,
  useConnect,
  useDisconnect,
  useSwitchChain,
  type Connector,
} from "wagmi";
import { getActiveChainId, getChain } from "@/lib/contracts";
import { truncateHex } from "@/lib/format";
import { useSiweSession } from "./Providers";

type KnownWallet = {
  key: string;
  name: string;
  logo: string;
  match: RegExp;
  installUrl: string;
};

const KNOWN_WALLETS: KnownWallet[] = [
  {
    key: "metamask",
    name: "MetaMask",
    logo: "/wallets/metamask.svg",
    match: /metamask/i,
    installUrl: "https://metamask.io/download/",
  },
  {
    key: "rabby",
    name: "Rabby",
    logo: "/wallets/rabby.svg",
    match: /rabby/i,
    installUrl: "https://rabby.io/",
  },
  {
    key: "coinbase",
    name: "Coinbase Wallet",
    logo: "/wallets/coinbase.svg",
    match: /coinbase/i,
    installUrl: "https://www.coinbase.com/wallet/downloads",
  },
  {
    key: "okx",
    name: "OKX Wallet",
    logo: "/wallets/okx.svg",
    match: /okx|okex/i,
    installUrl: "https://www.okx.com/web3",
  },
  {
    key: "phantom",
    name: "Phantom",
    logo: "/wallets/phantom.svg",
    match: /phantom/i,
    installUrl: "https://phantom.com/download",
  },
  {
    key: "trust",
    name: "Trust Wallet",
    logo: "/wallets/trust.png",
    match: /trust/i,
    installUrl: "https://trustwallet.com/download",
  },
];

function iconForConnector(connector: Connector): string | null {
  const known = KNOWN_WALLETS.find((k) => k.match.test(connector.name) || k.match.test(connector.id));
  if (known) return known.logo;
  return connector.icon ?? null;
}

export function WalletButton() {
  const targetChainId = getActiveChainId();
  const targetChain = getChain(targetChainId);

  const { address, isConnected, chainId, connector: activeConnector } = useAccount();
  const { connectors, connectAsync, isPending: isConnecting } = useConnect();
  const { disconnect } = useDisconnect();
  const { switchChainAsync, isPending: isSwitching } = useSwitchChain();
  const { data: balanceData, isLoading: balanceLoading } = useBalance({
    address,
    chainId: targetChainId,
    query: { enabled: Boolean(address) },
  });
  const { session, signingIn, signIn, signOut } = useSiweSession();

  const [modalOpen, setModalOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [pendingConnectorId, setPendingConnectorId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [mounted, setMounted] = useState(false);
  const popoverRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!menuOpen && !modalOpen) return;
    const onMouseDown = (event: MouseEvent) => {
      if (menuOpen && !popoverRef.current?.contains(event.target as Node)) {
        setMenuOpen(false);
      }
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setMenuOpen(false);
        if (!pendingConnectorId) setModalOpen(false);
      }
    };
    document.addEventListener("mousedown", onMouseDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onMouseDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [menuOpen, modalOpen, pendingConnectorId]);

  // Dedupe EIP-6963 connectors and suppress generic "Injected" when named EIP-6963 providers exist
  const availableConnectors = useMemo(() => {
    const eip6963 = connectors.filter(
      (c) => c.id !== "injected" && c.type !== "injected",
    );
    const list = eip6963.length > 0 ? eip6963 : connectors;
    const seen = new Set<string>();
    return list.filter((c) => {
      const key = `${c.id}:${c.name}`.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }, [connectors]);

  const missingWallets = useMemo(() => {
    return KNOWN_WALLETS.filter(
      (kw) => !availableConnectors.some((c) => kw.match.test(c.name) || kw.match.test(c.id)),
    );
  }, [availableConnectors]);

  const wrongChain = isConnected && chainId !== undefined && chainId !== targetChainId;
  const explorerBase = targetChain.blockExplorers?.default.url ?? "https://explorer.testnet.chain.robinhood.com";

  const handleSelectConnector = async (connector: Connector) => {
    setPendingConnectorId(connector.uid);
    setError(null);
    try {
      await connectAsync({ connector, chainId: targetChainId });
      setModalOpen(false);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Could not connect selected wallet.";
      setError(msg.length > 140 ? `${msg.slice(0, 140)}…` : msg);
    } finally {
      setPendingConnectorId(null);
    }
  };

  const handleSwitchChain = async () => {
    setError(null);
    try {
      await switchChainAsync({ chainId: targetChainId });
    } catch {
      try {
        const provider = (await activeConnector?.getProvider?.()) as
          | { request(args: { method: string; params?: unknown[] }): Promise<unknown> }
          | undefined;
        if (provider) {
          await provider.request({
            method: "wallet_addEthereumChain",
            params: [
              {
                chainId: `0x${targetChainId.toString(16)}`,
                chainName: targetChain.name,
                nativeCurrency: targetChain.nativeCurrency,
                rpcUrls: [...targetChain.rpcUrls.default.http],
                blockExplorerUrls: targetChain.blockExplorers?.default.url
                  ? [targetChain.blockExplorers.default.url]
                  : undefined,
              },
            ],
          });
        }
      } catch (addErr) {
        setError(addErr instanceof Error ? addErr.message : "Failed to switch to Robinhood Chain.");
      }
    }
  };

  const handleCopyAddress = async () => {
    if (!address) return;
    try {
      await navigator.clipboard.writeText(address);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      // ignore clipboard errors
    }
  };

  const formattedBalance = balanceData
    ? Number(formatEther(balanceData.value)).toLocaleString("en-US", {
        maximumFractionDigits: 4,
      })
    : "—";
  const activeIcon = activeConnector ? iconForConnector(activeConnector) : null;

  return (
    <div ref={popoverRef} className="relative flex items-center gap-2">
      {!isConnected ? (
        <button
          type="button"
          onClick={() => {
            setError(null);
            setModalOpen(true);
          }}
          className="inline-flex min-h-[34px] cursor-pointer items-center rounded-lg bg-[#CCFF00] px-3.5 py-1.5 text-xs font-semibold text-black transition-colors hover:bg-[#B8E600]"
        >
          <span>{isConnecting ? "Connecting..." : "Connect Wallet"}</span>
        </button>
      ) : (
        <>
          {wrongChain && (
            <button
              type="button"
              disabled={isSwitching}
              onClick={() => void handleSwitchChain()}
              className="min-h-[34px] cursor-pointer rounded-lg border border-[#F59E0B]/50 bg-[#F59E0B]/15 px-2.5 py-1.5 text-xs font-semibold text-[#F59E0B] transition-colors hover:bg-[#F59E0B]/25 disabled:opacity-50"
            >
              {isSwitching ? "Switching..." : "Switch Chain"}
            </button>
          )}

          {!wrongChain && session?.authenticated && (
            <span
              className={`hidden min-h-[34px] items-center rounded-lg border px-2.5 py-1.5 text-[11px] font-medium sm:inline-flex ${
                session.hasRadarAccess
                  ? "border-[#10B981]/40 bg-[#10B981]/10 text-[#34D399]"
                  : "border-[#26262E] bg-[#141418] text-[#A1A1AA]"
              }`}
            >
              {session.hasRadarAccess ? "RT Radar" : "SIWE"}
            </span>
          )}

          <button
            type="button"
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen((v) => !v)}
            className={`inline-flex min-h-[34px] cursor-pointer items-center gap-2 rounded-lg border px-3 py-1.5 font-mono text-xs transition-colors ${
              wrongChain
                ? "border-[#F59E0B]/50 bg-[#141418] text-[#F59E0B]"
                : "border-[#26262E] bg-[#141418] text-[#F4F4F5] hover:border-[#3F3F4C]"
            }`}
          >
            {activeIcon && (
              <img src={activeIcon} alt="" className="h-4 w-4 shrink-0 object-contain" />
            )}
            <span className="tabular-nums">{truncateHex(address, 6, 4)}</span>
            <span className="text-[9px] text-[#71717A]">{menuOpen ? "▲" : "▼"}</span>
          </button>
        </>
      )}

      {/* Connected Account Popover */}
      {menuOpen && isConnected && address && (
        <div
          role="dialog"
          aria-label="Connected wallet details"
          className="absolute top-[calc(100%+8px)] right-0 z-50 w-76 overflow-hidden rounded-xl border border-[#24242C] bg-[#131317] shadow-2xl"
        >
          <div className="flex items-center justify-between border-b border-[#24242C] px-4 py-3">
            <div className="flex items-center gap-2.5">
              {activeIcon && (
                <img src={activeIcon} alt="" className="h-5 w-5 shrink-0 object-contain" />
              )}
              <div>
                <div className="font-mono text-[9px] uppercase tracking-wider text-[#71717A]">
                  CONNECTED WALLET
                </div>
                <div className="text-xs font-semibold text-[#F4F4F5]">
                  {activeConnector?.name ?? "EVM Wallet"}
                </div>
              </div>
            </div>
            <span className="rounded border border-[#22C55E]/40 bg-[#22C55E]/10 px-1.5 py-0.5 font-mono text-[9px] uppercase text-[#22C55E]">
              ONLINE
            </span>
          </div>

          <div className="divide-y divide-[#24242C] font-mono text-[11px]">
            <div className="flex items-center justify-between px-4 py-2.5">
              <span className="text-[10px] uppercase text-[#71717A]">NETWORK</span>
              <span className={wrongChain ? "text-[#F59E0B]" : "text-[#22C55E]"}>
                {wrongChain ? `Chain ${chainId}` : `${targetChain.name} · ${targetChainId}`}
              </span>
            </div>

            <div className="flex items-center justify-between px-4 py-2.5 tabular-nums">
              <span className="text-[10px] uppercase text-[#71717A]">BALANCE</span>
              <span className="font-semibold text-[#F4F4F5]">
                {balanceLoading ? "Reading…" : `${formattedBalance} ETH`}
              </span>
            </div>

            <div className="flex items-center justify-between px-4 py-2.5">
              <span className="text-[10px] uppercase text-[#71717A]">RADAR SIWE</span>
              {session?.authenticated ? (
                <button
                  type="button"
                  onClick={() => void signOut()}
                  className="cursor-pointer text-[10px] uppercase text-[#22C55E] hover:underline"
                >
                  {session.hasRadarAccess ? "RT UNLOCKED · SIGN OUT" : "VERIFIED · SIGN OUT"}
                </button>
              ) : (
                <button
                  type="button"
                  disabled={signingIn}
                  onClick={() => void signIn()}
                  className="cursor-pointer rounded border border-[#CCFF00]/50 bg-[#CCFF00]/12 px-2 py-0.5 text-[10px] uppercase text-[#CCFF00] hover:bg-[#CCFF00]/22 disabled:opacity-50"
                >
                  {signingIn ? "SIGNING..." : "SIGN IN (SIWE)"}
                </button>
              )}
            </div>
          </div>

          {wrongChain && (
            <div className="border-t border-[#24242C] p-3">
              <button
                type="button"
                disabled={isSwitching}
                onClick={() => void handleSwitchChain()}
                className="w-full cursor-pointer rounded-md bg-[#F59E0B] py-2 font-mono text-[11px] font-semibold uppercase tracking-wider text-[#0B0B0E] hover:bg-[#fbbf24]"
              >
                Switch to {targetChain.name}
              </button>
            </div>
          )}

          {error && (
            <div className="border-t border-[#EF4444]/30 bg-[#EF4444]/10 px-4 py-2 font-mono text-[10px] text-[#F87171]">
              {error}
            </div>
          )}

          <div className="grid grid-cols-3 border-t border-[#24242C] font-mono text-[10px] uppercase">
            <button
              type="button"
              onClick={() => void handleCopyAddress()}
              className="cursor-pointer border-r border-[#24242C] py-2.5 text-[#A1A1AA] transition-colors hover:bg-[#19191F] hover:text-[#F4F4F5]"
            >
              {copied ? "COPIED ✓" : "COPY"}
            </button>
            <a
              href={`${explorerBase}/address/${address}`}
              target="_blank"
              rel="noreferrer noopener"
              className="flex items-center justify-center border-r border-[#24242C] py-2.5 text-[#A1A1AA] transition-colors hover:bg-[#19191F] hover:text-[#CCFF00]"
            >
              EXPLORER ↗
            </a>
            <button
              type="button"
              onClick={() => {
                disconnect();
                setMenuOpen(false);
              }}
              className="cursor-pointer py-2.5 text-[#F87171] transition-colors hover:bg-[#EF4444]/10"
            >
              DISCONNECT
            </button>
          </div>
        </div>
      )}

      {/* EIP-6963 Multi-Wallet Picker Modal */}
      {mounted &&
        modalOpen &&
        createPortal(
          <div
            role="presentation"
            onClick={() => {
              if (!pendingConnectorId) setModalOpen(false);
            }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm"
          >
            <section
              role="dialog"
              aria-modal="true"
              aria-labelledby="nti-wallet-modal-title"
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-md overflow-hidden rounded-xl border border-[#24242C] bg-[#131317] shadow-2xl"
            >
              <header className="flex items-start justify-between border-b border-[#24242C] px-5 py-4">
                <div>
                  <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-[#CCFF00]">
                    CONNECT TO NTI TERMINAL
                  </span>
                  <h2
                    id="nti-wallet-modal-title"
                    className="mt-1 text-lg font-semibold text-[#F4F4F5]"
                  >
                    Select an EVM Wallet
                  </h2>
                </div>
                <button
                  type="button"
                  aria-label="Close wallet picker"
                  disabled={Boolean(pendingConnectorId)}
                  onClick={() => setModalOpen(false)}
                  className="cursor-pointer rounded border border-[#24242C] bg-[#0B0B0E] px-2.5 py-1 font-mono text-xs text-[#A1A1AA] hover:border-[#32323D] hover:text-[#F4F4F5]"
                >
                  ESC
                </button>
              </header>

              <p className="border-b border-[#24242C] bg-[#0B0B0E] px-5 py-2.5 font-mono text-[11px] text-[#A1A1AA]">
                Connect via EIP-6963 or WalletConnect. Target network: {targetChain.name} ({targetChainId}).
              </p>

              <div className="max-h-[60vh] divide-y divide-[#24242C] overflow-y-auto">
                {availableConnectors.map((connector) => {
                  const logo = iconForConnector(connector);
                  const isBusy = pendingConnectorId === connector.uid;
                  return (
                    <button
                      key={connector.uid}
                      type="button"
                      disabled={Boolean(pendingConnectorId)}
                      onClick={() => void handleSelectConnector(connector)}
                      className="flex w-full cursor-pointer items-center justify-between px-5 py-3.5 text-left transition-colors hover:bg-[#19191F] disabled:opacity-60"
                    >
                      <div className="flex items-center gap-3">
                        <div className="flex h-9 w-9 items-center justify-center rounded-md border border-[#24242C] bg-[#0B0B0E]">
                          {logo ? (
                            <img src={logo} alt="" className="h-5 w-5 object-contain" />
                          ) : (
                            <span className="font-mono text-xs text-[#CCFF00]">W</span>
                          )}
                        </div>
                        <div>
                          <div className="text-sm font-semibold text-[#F4F4F5]">
                            {connector.name}
                          </div>
                          <div className="font-mono text-[10px] uppercase text-[#71717A]">
                            {connector.type === "walletConnect" ? "QR / MOBILE RELAY" : "EIP-6963 DETECTED"}
                          </div>
                        </div>
                      </div>
                      <span className="rounded border border-[#22C55E]/40 bg-[#22C55E]/10 px-2 py-0.5 font-mono text-[10px] uppercase text-[#22C55E]">
                        {isBusy ? "CHECK WALLET..." : "AVAILABLE"}
                      </span>
                    </button>
                  );
                })}

                {missingWallets.map((kw) => (
                  <a
                    key={kw.key}
                    href={kw.installUrl}
                    target="_blank"
                    rel="noreferrer noopener"
                    className="flex items-center justify-between px-5 py-3 opacity-75 transition-colors hover:bg-[#19191F] hover:opacity-100"
                  >
                    <div className="flex items-center gap-3">
                      <div className="flex h-9 w-9 items-center justify-center rounded-md border border-[#24242C] bg-[#0B0B0E]">
                        <img src={kw.logo} alt="" className="h-5 w-5 object-contain grayscale" />
                      </div>
                      <span className="text-sm text-[#A1A1AA]">{kw.name}</span>
                    </div>
                    <span className="font-mono text-[10px] uppercase text-[#71717A]">
                      INSTALL ↗
                    </span>
                  </a>
                ))}
              </div>

              {error && (
                <div
                  role="alert"
                  className="border-t border-[#EF4444]/40 bg-[#EF4444]/10 px-5 py-2.5 font-mono text-[11px] text-[#F87171]"
                >
                  {error}
                </div>
              )}

              <footer className="flex items-center justify-between border-t border-[#24242C] bg-[#0B0B0E] px-5 py-2.5 font-mono text-[10px] uppercase tracking-wider text-[#71717A]">
                <span>{targetChain.name}</span>
                <span className="tabular-nums">CHAIN ID {targetChainId}</span>
              </footer>
            </section>
          </div>,
          document.body,
        )}
    </div>
  );
}
