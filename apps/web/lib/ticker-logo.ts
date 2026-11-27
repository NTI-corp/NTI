type LogoPair = {
  chainId?: string;
  url?: string;
  priceUsd?: string;
  baseToken?: { address?: string; symbol?: string; name?: string };
  info?: { imageUrl?: string };
};
type LogoRequest = (url: string) => Promise<{ ok: boolean; json(): Promise<LogoPair[]> }>;

const ADDRESS_RE = /\b0x[a-fA-F0-9]{40}\b/g;
const TICKER_RE = /\$([A-Za-z][A-Za-z0-9]{1,9})\b/g;

// Associate a contract with a ticker only when the post itself contains one of each.
// A post with two tickers or two addresses is ambiguous, so it yields no contract.
export function tickerContractFromPost(body: string, symbol: string): string | null {
  const tickers = new Set([...body.matchAll(TICKER_RE)].map((m) => m[1]!.toUpperCase()));
  const addresses = new Set([...body.matchAll(ADDRESS_RE)].map((m) => m[0].toLowerCase()));
  return tickers.size === 1 && tickers.has(symbol.toUpperCase()) && addresses.size === 1
    ? [...addresses][0]!
    : null;
}

export type RobinhoodTokenInfo = {
  address: string;
  name: string | null;
  imageUrl: string | null;
  priceUsd: number | null;
  dexUrl: string | null;
};

function httpsUrl(value: unknown): string | null {
  if (typeof value !== "string") return null;
  try {
    return new URL(value).protocol === "https:" ? value : null;
  } catch {
    return null;
  }
}

/**
 * Resolve a token only against Robinhood Chain market data. A symbol alone is never enough:
 * the caller must supply candidate contracts (from the post or the verified `tokens` registry).
 * Cross-chain hits with the same ticker are rejected, which is what made the old list wrong.
 */
export async function resolveRobinhoodToken(
  symbol: string,
  addresses: string[],
  request: LogoRequest = (url) =>
    fetch(url, { next: { revalidate: 3600 }, signal: AbortSignal.timeout(3000) }),
): Promise<RobinhoodTokenInfo | null> {
  for (const raw of addresses) {
    if (!/^0x[a-f0-9]{40}$/i.test(raw)) continue;
    try {
      const response = await request(`https://api.dexscreener.com/tokens/v1/robinhood/${raw}`);
      if (!response.ok) continue;
      const pairs = await response.json();
      for (const pair of pairs) {
        if (pair.chainId !== "robinhood") continue;
        if (pair.baseToken?.address?.toLowerCase() !== raw.toLowerCase()) continue;
        if (pair.baseToken?.symbol?.toUpperCase() !== symbol.toUpperCase()) continue;
        return {
          address: raw.toLowerCase(),
          name: pair.baseToken?.name ?? null,
          imageUrl: httpsUrl(pair.info?.imageUrl),
          priceUsd:
            pair.priceUsd != null && Number.isFinite(Number(pair.priceUsd))
              ? Number(pair.priceUsd)
              : null,
          dexUrl: httpsUrl(pair.url),
        };
      }
    } catch {
      // Missing market data is not evidence of a logo; try the next candidate.
    }
  }
  return null;
}

/** Backwards-compatible logo-only helper; resolution still requires a Robinhood contract. */
export async function resolveTickerLogo(
  symbol: string,
  address: string | null,
  request: LogoRequest = (url) =>
    fetch(url, { next: { revalidate: 3600 }, signal: AbortSignal.timeout(3000) }),
): Promise<string | null> {
  if (!address) return null;
  const info = await resolveRobinhoodToken(symbol, [address], request);
  return info?.imageUrl ?? null;
}

type FetchLike = (
  input: string,
  init?: RequestInit & { next?: { revalidate?: number | false } },
) => Promise<{ ok: boolean; json(): Promise<unknown> }>;

export type SymbolLogo = { name: string | null; imageUrl: string };
const COINGECKO_RANK_LIMIT = 1000;

/**
 * Last resort for tickers that are not Robinhood tokens: a recognized major-asset icon by exact
 * symbol. Price is deliberately not returned, because a logo identifies the asset, not this chain.
 * The CoinGecko rank limit keeps obscure or spoof tokens from stealing a famous ticker's icon.
 */
export async function resolveSymbolLogo(
  symbol: string,
  request: FetchLike = fetch as unknown as FetchLike,
): Promise<SymbolLogo | null> {
  const key = symbol.toUpperCase();
  if (!/^[A-Z0-9]{2,10}$/.test(key)) return null;
  const coinCap = `https://assets.coincap.io/assets/icons/${key.toLowerCase()}@2x.png`;
  try {
    const head = await request(coinCap, {
      method: "HEAD",
      next: { revalidate: 86_400 },
      signal: AbortSignal.timeout(1_500),
    } as RequestInit);
    if (head.ok) return { name: null, imageUrl: coinCap };
  } catch {
    // Fall through to CoinGecko search.
  }
  try {
    const response = await request(
      `https://api.coingecko.com/api/v3/search?query=${encodeURIComponent(key)}`,
      {
        headers: { Accept: "application/json" },
        next: { revalidate: 86_400 },
        signal: AbortSignal.timeout(2_000),
      } as RequestInit,
    );
    if (!response.ok) return null;
    const json = (await response.json()) as {
      coins?: Array<{
        symbol?: string;
        name?: string;
        market_cap_rank?: number | null;
        large?: string;
        thumb?: string;
      }>;
    };
    const matches = (json.coins ?? [])
      .filter((c) => (c.symbol ?? "").toUpperCase() === key && (c.large || c.thumb))
      .filter((c) => c.market_cap_rank == null || c.market_cap_rank <= COINGECKO_RANK_LIMIT)
      .sort((a, b) => (a.market_cap_rank ?? Number.MAX_SAFE_INTEGER) -
        (b.market_cap_rank ?? Number.MAX_SAFE_INTEGER));
    const best = matches[0];
    if (!best) return null;
    const imageUrl = best.large ?? best.thumb;
    return imageUrl ? { name: best.name ?? null, imageUrl } : null;
  } catch {
    return null;
  }
}