import test from "node:test";
import assert from "node:assert/strict";
import { encodeAbiParameters, encodeEventTopics, parseAbiParameters } from "viem";
import {
  ALL_NTI_EVENTS_ABI,
  InMemoryStore,
  IndexerPoller,
} from "../dist/index.js";

const CHAIN_ID = 46630;
const CONTRACT = "0x1111111111111111111111111111111111111111";
const ALICE = "0x2222222222222222222222222222222222222222";
const BOB = "0x3333333333333333333333333333333333333333";
const HASH_A = "0x" + "aa".repeat(32);
const HASH_B = "0x" + "bb".repeat(32);
const HASH_C = "0x" + "cc".repeat(32);

function makeLog({
  blockNumber,
  txHash,
  logIndex,
  eventName,
  topicsArgs,
  dataTypes,
  dataValues,
  address = CONTRACT,
}) {
  const topics = encodeEventTopics({
    abi: ALL_NTI_EVENTS_ABI,
    eventName,
    args: topicsArgs,
  });
  const data = dataTypes
    ? encodeAbiParameters(parseAbiParameters(dataTypes), dataValues)
    : "0x";
  return {
    address,
    blockNumber,
    transactionHash: txHash,
    logIndex,
    topics,
    data,
  };
}

function createFakeClient(initialHead, logs) {
  let head = initialHead;
  const calls = [];
  return {
    calls,
    setHead(next) {
      head = next;
    },
    async getBlockNumber() {
      return head;
    },
    async getLogs({ fromBlock, toBlock, address }) {
      calls.push({ fromBlock, toBlock, address });
      return logs.filter(
        (l) => l.blockNumber >= fromBlock && l.blockNumber <= toBlock &&
          (address === undefined || [address].flat().some((a) => a.toLowerCase() === l.address.toLowerCase())),
      );
    },
  };
}

test("enforces 50-block reorg safety buffer before indexing head blocks", async () => {
  const safeLog = makeLog({
    blockNumber: 65n,
    txHash: "0x" + "01".repeat(32),
    logIndex: 0,
    eventName: "Staked",
    topicsArgs: { account: ALICE },
    dataTypes: "uint256",
    dataValues: [100_000n * 10n ** 18n],
  });

  const unsafeLog = makeLog({
    blockNumber: 95n,
    txHash: "0x" + "02".repeat(32),
    logIndex: 0,
    eventName: "Staked",
    topicsArgs: { account: BOB },
    dataTypes: "uint256",
    dataValues: [500_000n * 10n ** 18n],
  });

  const client = createFakeClient(120n, [safeLog, unsafeLog]);
  const store = new InMemoryStore();
  const poller = new IndexerPoller(client, store, {
    chainId: CHAIN_ID,
    addresses: [CONTRACT],
    startBlock: 1n,
    reorgBufferBlocks: 50n,
    batchBlocks: 2_000n,
  });

  const first = await poller.pollOnce();
  assert.equal(first.safeHead, 70n);
  assert.equal(first.eventsIndexed, 1);
  assert.equal(await store.getLastBlock(CHAIN_ID), 70n);

  let snap = store.getSnapshot();
  assert.equal(snap.chainEvents.length, 1);
  assert.equal(snap.chainEvents[0].block_number, "65");

  // Advance head so block 95 is now >= 50 blocks behind head (150 - 50 = 100).
  client.setHead(150n);
  const second = await poller.pollOnce();
  assert.equal(second.safeHead, 100n);
  assert.equal(second.eventsIndexed, 1);
  assert.equal(await store.getLastBlock(CHAIN_ID), 100n);

  snap = store.getSnapshot();
  assert.equal(snap.chainEvents.length, 2);
});

test("chunks getLogs by 2,000 blocks and replays same block range idempotently with zero duplicates", async () => {
  const logs = [
    makeLog({
      blockNumber: 100n,
      txHash: "0x" + "11".repeat(32),
      logIndex: 0,
      eventName: "EpochCommitted",
      topicsArgs: { epochId: 42, seriesId: 1, operator: ALICE },
      dataTypes: "bytes32, bytes32, bytes32",
      dataValues: [HASH_A, HASH_B, HASH_C],
    }),
    makeLog({
      blockNumber: 2_150n,
      txHash: "0x" + "12".repeat(32),
      logIndex: 1,
      eventName: "MarketCreated",
      topicsArgs: { marketId: 7n },
      dataTypes: "uint8, uint8, uint32, uint32, uint32",
      dataValues: [2, 1, 42, 48, 1],
    }),
    makeLog({
      blockNumber: 4_500n,
      txHash: "0x" + "13".repeat(32),
      logIndex: 2,
      eventName: "BasketCreated",
      topicsArgs: { narrativeId: 2, basket: BOB },
      dataTypes: "string, string",
      dataValues: ["AI Agents Basket", "ntiAI"],
    }),
    makeLog({
      blockNumber: 4_600n,
      txHash: "0x" + "14".repeat(32),
      logIndex: 0,
      eventName: "RoundStarted",
      topicsArgs: { roundId: 1n },
      dataTypes: "uint256, uint64, uint64",
      dataValues: [2n * 10n ** 18n, 4_590n, 1_800_100_000n],
    }),
    makeLog({
      blockNumber: 4_700n,
      txHash: "0x" + "15".repeat(32),
      logIndex: 3,
      eventName: "ProposalCreated",
      topicsArgs: {},
      dataTypes: "uint256, address, address[], uint256[], string[], bytes[], uint256, uint256, string",
      dataValues: [999n, ALICE, [BOB], [0n], [""], ["0x"], 4_701n, 4_751n, "Reconfigure"],
    }),
  ];

  // Head 5250 -> safeHead 5200 (blocks 1..5200 => 3 chunks: 1..2000, 2001..4000, 4001..5200)
  const client = createFakeClient(5_250n, logs);
  const store = new InMemoryStore();
  const poller = new IndexerPoller(client, store, {
    chainId: CHAIN_ID,
    addresses: [CONTRACT],
    startBlock: 1n,
    batchBlocks: 2_000n,
    reorgBufferBlocks: 50n,
  });

  const cycle = await poller.pollOnce();
  assert.equal(cycle.chunksProcessed, 3);
  assert.equal(cycle.eventsIndexed, 5);
  assert.deepEqual(client.calls.filter((call) => call.address.includes(CONTRACT)).map(({ fromBlock, toBlock }) => ({ fromBlock, toBlock })), [
    { fromBlock: 1n, toBlock: 2_000n },
    { fromBlock: 2_001n, toBlock: 4_000n },
    { fromBlock: 4_001n, toBlock: 5_200n },
  ]);

  const snapBeforeReplay = store.getSnapshot();
  assert.equal(snapBeforeReplay.chainEvents.length, 5);
  assert.equal(snapBeforeReplay.mirrors.epochs.length, 1);
  assert.equal(snapBeforeReplay.mirrors.markets.length, 1);
  assert.equal(snapBeforeReplay.mirrors.baskets.length, 1);
  assert.equal(snapBeforeReplay.mirrors.grant_rounds.length, 1);
  assert.equal(snapBeforeReplay.mirrors.governance_proposals.length, 1);

  // Replay the exact same block range [1, 5200] — state must be 100% identical (zero duplicates).
  await poller.replayRange(1n, 5_200n);
  const snapAfterReplay = store.getSnapshot();

  assert.equal(snapAfterReplay.chainEvents.length, 5);
  assert.deepEqual(snapAfterReplay.chainEvents, snapBeforeReplay.chainEvents);
  assert.equal(snapAfterReplay.mirrors.epochs.length, 1);
  assert.equal(snapAfterReplay.mirrors.markets.length, 1);
  assert.equal(snapAfterReplay.mirrors.baskets.length, 1);
  assert.equal(snapAfterReplay.mirrors.grant_rounds.length, 1);
  assert.equal(snapAfterReplay.mirrors.governance_proposals.length, 1);
  assert.equal(snapAfterReplay.checkpoints[CHAIN_ID], "5200");
});

test("indexes newly created vault logs in the same chunk, even before the creation log", async () => {
  const allocation = makeLog({
    blockNumber: 100n, txHash: HASH_A, logIndex: 0, eventName: "Rebalanced",
    dataTypes: "address[], uint16[], uint256, uint256", dataValues: [[ALICE], [10_000], 0n, 10n],
    address: BOB,
  });
  const creation = makeLog({
    blockNumber: 100n, txHash: HASH_A, logIndex: 1, eventName: "BasketCreated",
    topicsArgs: { narrativeId: 2, basket: BOB }, dataTypes: "string, string", dataValues: ["AI", "nAI"],
  });
  const deposit = makeLog({
    blockNumber: 101n, txHash: HASH_B, logIndex: 0, eventName: "Deposited",
    topicsArgs: { account: ALICE }, dataTypes: "uint256, uint256, uint256", dataValues: [12n, 10n, 7n],
    address: BOB,
  });
  const client = createFakeClient(151n, [deposit, creation, allocation]);
  const store = new InMemoryStore();
  const poller = new IndexerPoller(client, store, { chainId: CHAIN_ID, addresses: [CONTRACT] });
  const cycle = await poller.pollOnce();
  assert.equal(cycle.eventsIndexed, 3);
  const { mirrors } = store.getSnapshot();
  assert.equal(mirrors.baskets[0].name, "AI");
  assert.equal(mirrors.baskets[0].nav_eth, "10");
  assert.deepEqual(mirrors.basket_events.map((row) => row.kind), ["Rebalanced", "Deposited"]);
});

test("backfills only finalized history and leaves both live state and mirrors alone", async () => {
  const log = makeLog({
    blockNumber: 65n, txHash: HASH_A, logIndex: 0, eventName: "Staked",
    topicsArgs: { account: ALICE }, dataTypes: "uint256", dataValues: [10n],
  });
  const store = new InMemoryStore();
  await store.setLastBlock(CHAIN_ID, 60n);
  const poller = new IndexerPoller(createFakeClient(120n, [log]), store, { chainId: CHAIN_ID, addresses: [CONTRACT] });
  await assert.rejects(async () => poller.backfillRange(60n, 71n), /safe head/);
  await poller.backfillRange(60n, 70n);
  const snapshot = store.getSnapshot();
  assert.equal(snapshot.checkpoints[CHAIN_ID], "60");
  assert.equal(snapshot.chainEvents.length, 1);
  assert.deepEqual(snapshot.mirrors, {});
});
