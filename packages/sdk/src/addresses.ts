import type { Address } from "viem";
import {
  ROBINHOOD_MAINNET_ID,
  ROBINHOOD_TESTNET_ID,
  type SupportedChainId,
} from "./chains.js";

export interface VerifiedAddress {
  address: Address;
  verifiedAt: string;
  source: string;
}

export interface ExternalAddresses {
  weth: VerifiedAddress | null;
  usdg: VerifiedAddress | null;
  uniswapV3Factory: VerifiedAddress | null;
  uniswapV3SwapRouter02: VerifiedAddress | null;
  uniswapV3QuoterV2: VerifiedAddress | null;
  uniswapV4PoolManager: VerifiedAddress;
  uniswapV4PositionManager: VerifiedAddress;
  uniswapV4Quoter: VerifiedAddress;
  uniswapV4StateView: VerifiedAddress;
  universalRouter: VerifiedAddress;
  permit2: VerifiedAddress;
  ponsV2Factory: VerifiedAddress | null;
  ponsV2MemeHook: VerifiedAddress | null;
  ponsFeeEscrow: VerifiedAddress | null;
  safeSingletonL2_141: VerifiedAddress;
  safeProxyFactory_141: VerifiedAddress;
  multicall3: VerifiedAddress;
}

export interface ProtocolAddresses {
  registry: Address | null;
  ntiToken: Address | null;
  staking: Address | null;
  configRegistry: Address | null;
  oracleCommit: Address | null;
  dispute: Address | null;
  narrativeMarket: Address | null;
  feeRouter: Address | null;
  buybackAdapterV3: Address | null;
  buybackAdapterV4: Address | null;
  basketFactory: Address | null;
  grants: Address | null;
  governor: Address | null;
  timelock: Address | null;
  insuranceFund: Address | null;
  kolRegistry: Address | null;
}

const VERIFIED_DATE = "2026-11-19";
const MAINNET_EXPLORER = "https://robinhoodchain.blockscout.com/address";
const TESTNET_EXPLORER = "https://explorer.testnet.chain.robinhood.com/address";

const mainnetAddr = (address: Address): VerifiedAddress => ({
  address,
  verifiedAt: VERIFIED_DATE,
  source: `${MAINNET_EXPLORER}/${address}`,
});

const testnetAddr = (address: Address): VerifiedAddress => ({
  address,
  verifiedAt: VERIFIED_DATE,
  source: `${TESTNET_EXPLORER}/${address}`,
});

/**
 * Canonical external dependencies verified live via eth_getCode on 2026-11-19.
 */
export const EXTERNAL_ADDRESSES: Record<SupportedChainId, ExternalAddresses> = {
  [ROBINHOOD_MAINNET_ID]: {
    weth: mainnetAddr("0x0Bd7D308f8E1639FAb988df18A8011f41EAcAD73"),
    usdg: mainnetAddr("0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168"),
    uniswapV3Factory: mainnetAddr("0x1f7d7550b1b028f7571e69a784071f0205fd2efa"),
    uniswapV3SwapRouter02: mainnetAddr("0xcaf681a66d020601342297493863e78c959e5cb2"),
    uniswapV3QuoterV2: mainnetAddr("0x33e885ed0ec9bf04ecfb19341582aadcb4c8a9e7"),
    uniswapV4PoolManager: mainnetAddr("0x8366a39CC670B4001A1121B8F6A443A643e40951"),
    uniswapV4PositionManager: mainnetAddr("0x58daec3116aae6D93017bAAea7749052E8a04fA7"),
    uniswapV4Quoter: mainnetAddr("0x8Dc178eFB8111BB0973Dd9d722ebeFF267c98F94"),
    uniswapV4StateView: mainnetAddr("0xf3334192d15450cdd385c8b70e03f9a6bd9e673b"),
    universalRouter: mainnetAddr("0x8876789976dEcBfCbBbe364623C63652db8C0904"),
    permit2: mainnetAddr("0x000000000022D473030F116dDEE9F6B43aC78BA3"),
    ponsV2Factory: mainnetAddr("0x7eD598BcEf8bd9Edd8C97A195C6d13f40801EC7e"),
    ponsV2MemeHook: mainnetAddr("0xE5e702641Ea86F4ae6cC3cDaeD2B886f976Be044"),
    ponsFeeEscrow: mainnetAddr("0xd3AFEB2a57f70eF218Aa82451c51B2fb0416Ac9e"),
    safeSingletonL2_141: mainnetAddr("0x29fcB43b46531BcA003ddC8FCB67FFE91900C762"),
    safeProxyFactory_141: mainnetAddr("0x4e1DCf7AD4e460CfD30791CCC4F9c8a4f820ec67"),
    multicall3: mainnetAddr("0xcA11bde05977b3631167028862bE2a173976CA11"),
  },
  [ROBINHOOD_TESTNET_ID]: {
    // WETH, Uniswap V3, and Pons V2 have no bytecode at mainnet addresses on 46630;
    // testnet deployments provision local mocks while fork tests target 4663.
    weth: null,
    usdg: null,
    uniswapV3Factory: null,
    uniswapV3SwapRouter02: null,
    uniswapV3QuoterV2: null,
    uniswapV4PoolManager: testnetAddr("0x8366a39CC670B4001A1121B8F6A443A643e40951"),
    uniswapV4PositionManager: testnetAddr("0x58daec3116aae6D93017bAAea7749052E8a04fA7"),
    uniswapV4Quoter: testnetAddr("0x8Dc178eFB8111BB0973Dd9d722ebeFF267c98F94"),
    uniswapV4StateView: testnetAddr("0xf3334192d15450cdd385c8b70e03f9a6bd9e673b"),
    universalRouter: testnetAddr("0x8876789976dEcBfCbBbe364623C63652db8C0904"),
    permit2: testnetAddr("0x000000000022D473030F116dDEE9F6B43aC78BA3"),
    ponsV2Factory: null,
    ponsV2MemeHook: null,
    ponsFeeEscrow: null,
    safeSingletonL2_141: testnetAddr("0x29fcB43b46531BcA003ddC8FCB67FFE91900C762"),
    safeProxyFactory_141: testnetAddr("0x4e1DCf7AD4e460CfD30791CCC4F9c8a4f820ec67"),
    multicall3: testnetAddr("0xcA11bde05977b3631167028862bE2a173976CA11"),
  },
};

const EMPTY_PROTOCOL: ProtocolAddresses = {
  registry: null,
  ntiToken: null,
  staking: null,
  configRegistry: null,
  oracleCommit: null,
  dispute: null,
  narrativeMarket: null,
  feeRouter: null,
  buybackAdapterV3: null,
  buybackAdapterV4: null,
  basketFactory: null,
  grants: null,
  governor: null,
  timelock: null,
  insuranceFund: null,
  kolRegistry: null,
};

/** Populated from live deployment manifests (`contracts/deployments/{chainId}.json`). */
export const PROTOCOL_ADDRESSES: Record<SupportedChainId, ProtocolAddresses> = {
  [ROBINHOOD_MAINNET_ID]: { ...EMPTY_PROTOCOL },
  [ROBINHOOD_TESTNET_ID]: {
    registry: "0x6253BB6f36102AC40Df17ca1D173f8C6dE5cb9f4",
    ntiToken: "0x8f13Ce903e37EDB2aDeAAeB000792a66CAaF83CE",
    staking: "0xbfCA03EBB9A2274acd67d5b4b83200b28222f7e2",
    configRegistry: "0xe3742D81dC3a9d8A087E5Fbf523b4afe9019f85F",
    oracleCommit: "0x8Fd88A223C5a73Bd13f1e100bEDBB2cA2389Fee4",
    dispute: "0x2526eFc15FeFafee9C51a8ff2e078e3494794B71",
    narrativeMarket: "0xA3D54141719d7937f5c2e1EAa2aaC97d44359DBE",
    feeRouter: "0x25D2D1f8aC4B4673585dC3D69EF2B93daC715f25",
    buybackAdapterV3: null,
    buybackAdapterV4: null,
    basketFactory: "0x49bE60aAAF1c0CCeB8214aDe88cc3c8Ffdf51A09",
    grants: "0x4f600E5bf2Bc7a9DEb35F77F946E280F8900D3E5",
    governor: "0x82328D31742c133F791daA4e8014A9CcA682e9D0",
    timelock: "0x11a35A4Ca88A20e6d2F9B73aEB4F5b760F60391A",
    insuranceFund: "0x289C161854D3FdD0129156aE28E8307129D3eAb9",
    kolRegistry: "0x4f7ec78dF7f4b6a83FE357c277367b188Cf0A8F3",
  },
};
