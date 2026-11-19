import crypto from "node:crypto";
import {
  createPublicClient,
  formatUnits,
  getAddress,
  http,
  verifyMessage,
  type Address,
  type Hex,
} from "viem";
import { getChain } from "@nti/sdk";
import { getActiveChainId, getProtocolAddresses, stakingAbi } from "./contracts";
import { getStakerTier } from "./format";
import type { SiweSessionState } from "./types";

export const SIWE_SESSION_COOKIE = "nti_siwe_session";
export const SIWE_NONCE_COOKIE = "nti_siwe_nonce";

const SESSION_TTL_SECONDS = 60 * 60 * 24 * 7; // 7 days
const NONCE_TTL_SECONDS = 60 * 10; // 10 minutes
const STAKE_CACHE_TTL_MS = 60_000; // 60-second on-chain stakeOf TTL cache
const DEFAULT_RADAR_MIN_STAKE_WEI = 100_000n * 10n ** 18n;

interface CachedStake {
  stakeWei: bigint;
  discountBps: number;
  source: "onchain" | "unconfigured";
  expiresAt: number;
}

const stakeCache = new Map<string, CachedStake>();

function getSessionSecret(): string {
  return (
    process.env.SIWE_SESSION_SECRET ||
    process.env.SUPABASE_SERVICE_KEY ||
    "nti-dev-ephemeral-siwe-secret-change-in-production"
  );
}

export function getRadarMinStakeWei(): bigint {
  const raw = process.env.RADAR_MIN_STAKE;
  if (!raw) return DEFAULT_RADAR_MIN_STAKE_WEI;
  try {
    return BigInt(raw);
  } catch {
    return DEFAULT_RADAR_MIN_STAKE_WEI;
  }
}

function signPayload(payloadB64: string): string {
  return crypto
    .createHmac("sha256", getSessionSecret())
    .update(payloadB64)
    .digest("base64url");
}

function encodeSignedToken<T extends object>(payload: T): string {
  const b64 = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  const sig = signPayload(b64);
  return `${b64}.${sig}`;
}

function decodeSignedToken<T>(token: string | undefined | null): T | null {
  if (!token) return null;
  const parts = token.split(".");
  if (parts.length !== 2) return null;
  const [b64, sig] = parts;
  if (!b64 || !sig) return null;

  const expected = signPayload(b64);
  const sigBuf = Buffer.from(sig);
  const expBuf = Buffer.from(expected);
  if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) {
    return null;
  }

  try {
    return JSON.parse(Buffer.from(b64, "base64url").toString("utf8")) as T;
  } catch {
    return null;
  }
}

export interface SignedNoncePayload {
  nonce: string;
  exp: number;
}

export interface SignedSessionPayload {
  address: Address;
  chainId: number;
  iat: number;
  exp: number;
}

export function issueNonce(): { nonce: string; cookieValue: string; maxAge: number } {
  const nonce = crypto.randomBytes(16).toString("hex");
  const payload: SignedNoncePayload = {
    nonce,
    exp: Math.floor(Date.now() / 1000) + NONCE_TTL_SECONDS,
  };
  return {
    nonce,
    cookieValue: encodeSignedToken(payload),
    maxAge: NONCE_TTL_SECONDS,
  };
}

export function verifyNonceCookie(cookieValue: string | undefined): string | null {
  const payload = decodeSignedToken<SignedNoncePayload>(cookieValue);
  if (!payload || payload.exp < Math.floor(Date.now() / 1000)) return null;
  return payload.nonce;
}

export function createSessionCookie(
  address: Address,
  chainId: number,
): { cookieValue: string; maxAge: number } {
  const now = Math.floor(Date.now() / 1000);
  const payload: SignedSessionPayload = {
    address: getAddress(address),
    chainId,
    iat: now,
    exp: now + SESSION_TTL_SECONDS,
  };
  return {
    cookieValue: encodeSignedToken(payload),
    maxAge: SESSION_TTL_SECONDS,
  };
}

export function readSessionCookie(cookieValue: string | undefined): SignedSessionPayload | null {
  const payload = decodeSignedToken<SignedSessionPayload>(cookieValue);
  if (!payload || payload.exp < Math.floor(Date.now() / 1000)) return null;
  try {
    return {
      ...payload,
      address: getAddress(payload.address),
    };
  } catch {
    return null;
  }
}

export function buildSiweMessage(params: {
  domain: string;
  uri: string;
  address: Address;
  nonce: string;
  chainId: number;
  issuedAt?: string;
}): string {
  const issuedAt = params.issuedAt ?? new Date().toISOString();
  return [
    `${params.domain} wants you to sign in with your Ethereum account:`,
    getAddress(params.address),
    "",
    "Sign in to NTI Terminal to verify $NTI stake ownership for real-time Radar access.",
    "",
    `URI: ${params.uri}`,
    "Version: 1",
    `Chain ID: ${params.chainId}`,
    `Nonce: ${params.nonce}`,
    `Issued At: ${issuedAt}`,
  ].join("\n");
}

export async function verifySiweSubmission(params: {
  message: string;
  signature: Hex;
  address: Address;
  expectedNonce: string;
}): Promise<{ ok: true; address: Address; chainId: number } | { ok: false; error: string }> {
  const checksumAddress = getAddress(params.address);

  if (!params.message.includes(`Nonce: ${params.expectedNonce}`)) {
    return { ok: false, error: "SIWE nonce mismatch or expired" };
  }
  if (!params.message.includes(checksumAddress)) {
    return { ok: false, error: "SIWE message address mismatch" };
  }

  const chainMatch = params.message.match(/Chain ID:\s*(\d+)/);
  const chainId = chainMatch ? Number(chainMatch[1]) : getActiveChainId();

  let valid = false;
  try {
    valid = await verifyMessage({
      address: checksumAddress,
      message: params.message,
      signature: params.signature,
    });
  } catch {
    valid = false;
  }

  if (!valid) {
    return { ok: false, error: "Invalid EIP-191 signature" };
  }

  return { ok: true, address: checksumAddress, chainId };
}

export async function readWalletStakeCached(
  wallet: Address,
): Promise<{
  stakeWei: bigint;
  discountBps: number;
  hasRadarAccess: boolean;
  source: "onchain" | "unconfigured";
}> {
  const key = wallet.toLowerCase();
  const now = Date.now();
  const hit = stakeCache.get(key);
  const minStake = getRadarMinStakeWei();

  if (hit && hit.expiresAt > now) {
    return {
      stakeWei: hit.stakeWei,
      discountBps: hit.discountBps,
      hasRadarAccess: hit.stakeWei >= minStake,
      source: hit.source,
    };
  }

  const chainId = getActiveChainId();
  const addrs = getProtocolAddresses(chainId);

  if (!addrs.staking) {
    const entry: CachedStake = {
      stakeWei: 0n,
      discountBps: 0,
      source: "unconfigured",
      expiresAt: now + STAKE_CACHE_TTL_MS,
    };
    stakeCache.set(key, entry);
    return {
      stakeWei: 0n,
      discountBps: 0,
      hasRadarAccess: false,
      source: "unconfigured",
    };
  }

  const rpcUrl =
    chainId === 4663
      ? process.env.RPC_URL_MAINNET ?? getChain(chainId).rpcUrls.default.http[0]!
      : process.env.RPC_URL_TESTNET ?? getChain(chainId).rpcUrls.default.http[0]!;

  const client = createPublicClient({
    chain: getChain(chainId),
    transport: http(rpcUrl),
  });

  try {
    const [stakeWei, discountRaw] = await Promise.all([
      client.readContract({
        address: addrs.staking,
        abi: stakingAbi,
        functionName: "stakeOf",
        args: [wallet],
      }),
      client.readContract({
        address: addrs.staking,
        abi: stakingAbi,
        functionName: "discountBps",
        args: [wallet],
      }),
    ]);

    const entry: CachedStake = {
      stakeWei,
      discountBps: Number(discountRaw),
      source: "onchain",
      expiresAt: now + STAKE_CACHE_TTL_MS,
    };
    stakeCache.set(key, entry);
    return {
      stakeWei,
      discountBps: entry.discountBps,
      hasRadarAccess: stakeWei >= minStake,
      source: "onchain",
    };
  } catch {
    return {
      stakeWei: 0n,
      discountBps: 0,
      hasRadarAccess: false,
      source: "unconfigured",
    };
  }
}

export async function getSiweSessionState(
  sessionCookieValue: string | undefined,
): Promise<SiweSessionState> {
  const minStakeWei = getRadarMinStakeWei();
  const radarMinStakeFormatted = Number(formatUnits(minStakeWei, 18)).toLocaleString("en-US");
  const session = readSessionCookie(sessionCookieValue);

  if (!session) {
    return {
      authenticated: false,
      address: null,
      chainId: null,
      stakeWei: "0",
      stakeFormatted: "0",
      discountBps: 0,
      hasRadarAccess: false,
      radarMinStakeFormatted,
      tierName: "Public Tier · 1h Delayed Radar",
      stakeSource: "unconfigured",
    };
  }

  const stake = await readWalletStakeCached(session.address);
  const stakeNum = Number(formatUnits(stake.stakeWei, 18));
  const tier = getStakerTier(stakeNum);

  return {
    authenticated: true,
    address: session.address,
    chainId: session.chainId,
    stakeWei: stake.stakeWei.toString(),
    stakeFormatted: Math.floor(stakeNum).toLocaleString("en-US"),
    discountBps: stake.discountBps || tier.discountBps,
    hasRadarAccess: stake.hasRadarAccess,
    radarMinStakeFormatted,
    tierName: tier.tierName,
    stakeSource: stake.source,
  };
}
