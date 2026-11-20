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
    registry: "0x7CEc746e7e3Ed8530F8c32f070a161EEBd718aaf",
    ntiToken: "0x70fcb6fCB8CB2465D1Ddab93022957B6d5750AB3",
    staking: "0x81CEE008B7b615218BE0f23EC77AaA790e74Ed04",
    configRegistry: "0x3E2619CD4810b5ddbbC1C4f598c7B4f2e04707b7",
    oracleCommit: "0xa95D0A16f208CFe1BD661d483c18eAfc564e3fE9",
    dispute: "0xe6b3EfAc5e9A0b0602B9932181a4A7D985ca9C0C",
    narrativeMarket: "0x2602Ad6Cc4a46dc857EEEaF0f16da7A55f3eb7B9",
    feeRouter: "0x08c38113265AaF359123249bD390e5042901b179",
    // Mock Uniswap V3 stack (46630 has no real V3); see contracts/deployments/46630.finalize.json
    buybackAdapterV3: "0x2710b6BBE9B5E745fE5D974dA61B097182DE6114",
    buybackAdapterV4: null,
    basketFactory: "0x1e486B30E893C556c9655D75Fd670f26de7f1988",
    grants: "0xFc64E92675F34957Cac5e0f71EEf969Af84D1378",
    // Fast-parameter testnet governance (60s timelock, 50-block vote)
    governor: "0x446bAafAE07B200206B8Ee2E5BD1176AA1245b44",
    timelock: "0x715f61B046c612697d71434C46ba8368ecAf4276",
    insuranceFund: "0x6ff3773EB830d75101A14FA6A5114e01C890bB6d",
    kolRegistry: "0xb17dd8f08B00CE8a389d49C6Ed09a31E96C3197a",
  },
};
