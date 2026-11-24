import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import test from "node:test";
import {
  decodeFunctionData, encodeAbiParameters, encodeFunctionResult, keccak256, parseAbi,
  parseEther, stringToHex,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === "next/cache") {
      return nextResolve("data:text/javascript,export const unstable_cache = (callback) => callback", context);
    }
    try {
      return nextResolve(specifier, context);
    } catch (error) {
      if (error.code !== "ERR_MODULE_NOT_FOUND") throw error;
      if (specifier.startsWith(".")) return nextResolve(`${specifier}.ts`, context);
      throw error;
    }
  },
});

const { fetchGovernorProposals, fetchIndexesSnapshot, fetchNarrativeHistory, fetchEpochDetail, fetchHeatmapData } =
  await import("../lib/supabase.ts");
const { readLiveGrantRoundsFromChain, readLiveMarketsFromChain } = await import("../lib/onchain.ts");
const { governorAbi, grantsAbi, narrativeMarketAbi, oracleCommitAbi, stakingAbi } = await import("../lib/contracts.ts");
const { buildSiweMessage, verifySiweSubmission } = await import("../lib/siwe.ts");

process.env.SUPABASE_URL = "https://db.example";
process.env.SUPABASE_ANON_KEY = "test";
process.env.NEXT_PUBLIC_CHAIN_ID = "46630";

function supabase(t, tables) {
  t.mock.method(globalThis, "fetch", async (input) => {
    const url = new URL(input.toString());
    assert.equal(url.host, "db.example");
    const table = url.pathname.split("/").at(-1);
    let rows = tables[table] ?? [];
    if (rows === "unavailable") return Response.json({}, { status: 503 });
    const id = url.searchParams.get("epoch_id");
    if (id?.startsWith("eq.")) rows = rows.filter((row) => row.epoch_id === Number(id.slice(3)));
    const status = url.searchParams.get("status");
    if (status?.startsWith("eq.")) rows = rows.filter((row) => row.status === status.slice(3));
    const narrative = url.searchParams.get("narrative_id");
    if (narrative?.startsWith("eq.")) rows = rows.filter((row) => row.narrative_id === Number(narrative.slice(3)));
    const userId = url.searchParams.get("user_id");
    if (userId?.startsWith("in.(") && userId.endsWith(")")) {
      const allowed = new Set(userId.slice(4, -1).split(","));
      rows = rows.filter((row) => allowed.has(String(row.user_id)));
    }
    if (url.searchParams.get("order")?.startsWith("epoch_id") && rows.some((row) => "epoch_id" in row)) {
      const order = url.searchParams.get("order").endsWith(".desc") ? -1 : 1;
      rows = [...rows].sort((a, b) => (a.epoch_id - b.epoch_id) * order);
    }
    return Response.json(rows.slice(0, Number(url.searchParams.get("limit") ?? rows.length)));
  });
}

const datasetHash = "0x123456789abcdef0" + "0".repeat(48);
const final = (epoch_id, series_id = 1, arweave_tx = null) => ({
  epoch_id, series_id, status: "final", arweave_tx, dataset_hash: datasetHash,
  finalized_at: "2026-11-23T09:00:00.000Z",
});
const narrativeRows = (epoch_id) => Array.from({ length: 10 }, (_, id) => ({
  epoch_id, narrative_id: id + 1, i_bps: 1000, m_bps: 1000, s_n: 40, v_bps: 10, v_flag: null, weighted_posts: 70,
}));

test("an empty governance mirror does not invent proposals", async (t) => {
  supabase(t, {});
  assert.deepEqual(await fetchGovernorProposals(), []);
});

test("a database outage returns no official index figures", async (t) => {
  supabase(t, { epochs: "unavailable" });
  const snapshot = await fetchIndexesSnapshot();
  assert.equal(snapshot.dataSource, "unavailable");
  assert.equal(snapshot.latestObservedEpoch, null);
  assert.deepEqual(snapshot.narratives, []);
});

test("the latest finalized index stays visible through a backlog of incomplete epochs", async (t) => {
  const incomplete = Array.from({ length: 24 }, (_, id) => ({
    epoch_id: id + 2, series_id: 1, status: "incomplete", arweave_tx: null,
  }));
  supabase(t, { epochs: [final(1), ...incomplete], narrative_epoch: narrativeRows(1) });
  const data = await fetchIndexesSnapshot();
  assert.equal(data.latestFinalEpoch?.epochId, 1);
  assert.equal(data.latestObservedEpoch?.epochId, 25);
  assert.equal(data.narratives[0]?.iBps, 1000);
});

test("history shows incomplete epochs and series breaks even without narrative rows", async (t) => {
  supabase(t, {
    epochs: [final(1), { ...final(2), status: "incomplete", finalized_at: null }, final(3, 2)],
    narrative_epoch: [...narrativeRows(1), ...narrativeRows(3)],
  });
  const data = await fetchNarrativeHistory(1);
  assert.deepEqual(
    data.series.map(({ epochId, vBps, vFlag, seriesBreak }) => [epochId, vBps, vFlag, seriesBreak]),
    [[1, 10, null, false], [2, null, "incomplete_gap", false], [3, null, "series_break", true]],
  );
});

test("top influential posts stay aligned with the narrative top contributors and cap 2 posts per KOL", async (t) => {
  supabase(t, {
    epochs: [final(10)],
    narrative_epoch: narrativeRows(10),
    kol_contribution: [
      { epoch_id: 10, narrative_id: 2, user_id: 101, share_bps: 300, capped: false, kols: { handle: "DamiDefi", followers: 98000 } },
      { epoch_id: 10, narrative_id: 2, user_id: 102, share_bps: 200, capped: false, kols: { handle: "v_3394", followers: 20000 } },
    ],
    posts: [
      { tweet_id: "1", user_id: 999, created_at: "2026-11-23T20:00:00Z", kols: { handle: "Outsider", followers: 500000 }, post_engagement: [{ likes: 50000, reposts: 2000, quotes: 100, replies: 50 }], classifications: [{ q: { "2": 0.4 } }] },
      { tweet_id: "2", user_id: 101, created_at: "2026-11-23T15:00:00Z", kols: { handle: "DamiDefi", followers: 98000 }, post_engagement: [{ likes: 300, reposts: 20, quotes: 2, replies: 5 }], classifications: [{ q: { "2": 0.95 } }] },
      { tweet_id: "3", user_id: 101, created_at: "2026-11-23T14:00:00Z", kols: { handle: "DamiDefi", followers: 98000 }, post_engagement: [{ likes: 250, reposts: 15, quotes: 1, replies: 4 }], classifications: [{ q: { "2": 0.9 } }] },
      { tweet_id: "4", user_id: 101, created_at: "2026-11-23T13:00:00Z", kols: { handle: "DamiDefi", followers: 98000 }, post_engagement: [{ likes: 200, reposts: 10, quotes: 0, replies: 2 }], classifications: [{ q: { "2": 0.85 } }] },
      { tweet_id: "5", user_id: 102, created_at: "2026-11-23T12:00:00Z", kols: { handle: "v_3394", followers: 20000 }, post_engagement: [{ likes: 180, reposts: 5, quotes: 0, replies: 1 }], classifications: [{ q: { "2": 0.85 } }] },
    ],
  });
  const data = await fetchNarrativeHistory(2);
  assert.deepEqual(data.topPosts.map((p) => p.handle), ["DamiDefi", "DamiDefi", "v_3394"]);
  assert.ok(!data.topPosts.some((p) => p.handle === "Outsider"));
});

test("a packed local locator reconstructs the verifiable public archive path", async (t) => {
  const locator = keccak256(stringToHex("local_42_123456789abcdef0"));
  supabase(t, { epochs: [final(42, 1, locator)], narrative_epoch: narrativeRows(42) });
  const data = await fetchEpochDetail(42);
  assert.equal(data.epoch?.datasetUrl, "https://db.example/storage/v1/object/public/nti-datasets/local_42_123456789abcdef0.jsonl.gz");
});

test("an opaque commitment is not treated as an Arweave transaction id", async (t) => {
  supabase(t, { epochs: [final(43, 1, datasetHash)], narrative_epoch: narrativeRows(43) });
  const data = await fetchEpochDetail(43);
  assert.equal(data.epoch?.datasetUrl, null);
});

test("an unknown epoch returns no detail instead of a different epoch", async (t) => {
  supabase(t, { epochs: [final(43)], narrative_epoch: narrativeRows(43) });
  const data = await fetchEpochDetail(44);
  assert.equal(data.epoch, null);
});

test("heatmap reports zero indexed assets when its tables are empty", async (t) => {
  supabase(t, { epochs: [final(43)], narrative_epoch: narrativeRows(43) });
  const data = await fetchHeatmapData();
  assert.equal(data.points.length, 10);
  assert.ok(data.points.every((point) => point.activeProjects === 0));
});

test("SIWE only accepts messages bound to this origin, nonce and testnet", async () => {
  const signer = privateKeyToAccount(`0x${"05".repeat(32)}`);
  const expectedNonce = "aabbccddeeff0011";
  const domain = "nti.example";
  const uri = "https://nti.example";
  for (const [overrides, ok] of [
    [{}, true],
    [{ domain: "elsewhere.example" }, false],
    [{ uri: "https://elsewhere.example" }, false],
    [{ nonce: expectedNonce + "abc" }, false],
    [{ chainId: 4663 }, false],
    [{ issuedAt: "2020-01-01T00:00:00.000Z" }, false],
  ]) {
    const message = buildSiweMessage({
      address: signer.address, nonce: expectedNonce, chainId: 46630, domain, uri, ...overrides,
    });
    const signature = await signer.signMessage({ message });
    const result = await verifySiweSubmission({ message, signature, address: signer.address, expectedNonce, expectedOrigin: uri });
    assert.equal(result.ok, ok, JSON.stringify(overrides));
  }
});

function rpc(t, handlers, supabaseRows) {
  process.env.RPC_URL_TESTNET = "https://rpc.example";
  t.mock.method(globalThis, "fetch", async (input, init) => {
    const request = new Request(input, init);
    const url = new URL(request.url);
    if (url.host === "db.example") {
      assert.match(url.searchParams.get("select"), /proposal_id::text/);
      return Response.json(supabaseRows);
    }
    assert.equal(url.host, "rpc.example");
    const req = await request.json();
    if (req.method === "eth_blockNumber") {
      return Response.json({ jsonrpc: "2.0", id: req.id, result: "0x90" });
    }
    const calldata = req.params[0].data;
    const handler = handlers.find(({ abi }) => {
      try { return Boolean(decodeFunctionData({ abi, data: calldata })); } catch { return false; }
    });
    assert.ok(handler, `Unknown call ${calldata}`);
    const { functionName, args } = decodeFunctionData({ abi: handler.abi, data: calldata });
    const result = typeof handler.results[functionName] === "function"
      ? handler.results[functionName](args)
      : handler.results[functionName];
    return Response.json({ jsonrpc: "2.0", id: req.id, result: encodeFunctionResult({ abi: handler.abi, functionName, result }) });
  });
  t.after(() => { delete process.env.RPC_URL_TESTNET; });
}

test("an indexed governor proposal uses exact uint256 ID, chain quorum, votes and block deadline", async (t) => {
  const target = "0x123456789abcdef0123456789abcdef012345678";
  const description = "Testnet proposal";
  const proposalId = BigInt(keccak256(encodeAbiParameters(
    [{ type: "address[]" }, { type: "uint256[]" }, { type: "bytes[]" }, { type: "bytes32" }],
    [[target], [0n], ["0x"], keccak256(stringToHex(description))],
  )));
  rpc(t, [{ abi: governorAbi, results: {
    clock: 144, CLOCK_MODE: "mode=blocknumber&from=default",
    state: ([id]) => { assert.equal(id, proposalId); return 5; },
    proposalSnapshot: 100n, proposalDeadline: 130n, proposalEta: 1795428000n,
    proposalVotes: [parseEther("2"), parseEther("11"), parseEther("3")],
    quorum: ([block]) => { assert.equal(block, 100n); return parseEther("9"); },
  } }], [{ proposal_id: proposalId.toString(), description, proposer: target, targets: [target], values: ["0"], calldatas: ["0x"] }]);
  const [proposal] = await fetchGovernorProposals();
  assert.equal(proposal.status, "Queued");
  assert.equal(proposal.quorumNti, 9);
  assert.equal(proposal.forVotesNti, 11);
  assert.equal(proposal.againstVotesNti, 2);
  assert.equal(proposal.abstainVotesNti, 3);
  assert.equal(proposal.voteDeadline, "130");
  assert.equal(proposal.clockMode, "blocknumber");
  assert.deepEqual(proposal.actions, [{ target, value: "0", calldata: "0x" }]);
});

test("a two-epoch market with zero cutoff epochs uses its contract betting window", async (t) => {
  const now = Math.floor(Date.now() / 1000);
  const extraAbi = parseAbi(["function BET_CUTOFF_EPOCHS() view returns (uint32)"]);
  rpc(t, [
    { abi: narrativeMarketAbi, results: {
      nextMarketId: 2n, maxPoolPerMarket: parseEther("5"),
      markets: [1, 0, 5, 7, 2, 0n, 0n, 0n, 0n, 0n, 0, false],
      BET_CUTOFF_EPOCHS: 0,
      BASE_FEE_BPS: 10n,
      SETTLE_TIMEOUT: 172800n,
    } },
    { abi: extraAbi, results: { BET_CUTOFF_EPOCHS: 0 } },
    { abi: oracleCommitAbi, results: {
      latestFinalEpoch: 5,
      epochBoundary: ([epoch]) => BigInt(now + (epoch - 6) * 14400),
      finalIndex: 850,
      epochStatus: 0,
    } },
  ]);
  const [market] = await readLiveMarketsFromChain(new Map());
  assert.equal(market.status, "open");
  assert.equal(market.horizonLabel, "2 epochs");
  assert.equal(market.cutoffAt, market.settleAt);
});

test("an ended grants vote remains eligible for finalize until the on-chain flag changes", async (t) => {
  rpc(t, [
    { abi: grantsAbi, results: {
      currentRoundId: 1n,
      rounds: [parseEther("1"), 100n, 1795000000n, 1795100000n, 0n, 0n, false],
      QUORUM_BPS: 100, staking: "0x123456789abcdef0123456789abcdef012345678",
    } },
    { abi: stakingAbi, results: { getPastTotalSupply: parseEther("700") } },
  ]);
  const [round] = await readLiveGrantRoundsFromChain();
  assert.equal(round.status, "awaiting_finalization");
  assert.equal(round.quorumNti, 7);
});
