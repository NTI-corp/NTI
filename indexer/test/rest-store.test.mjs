import test from "node:test";
import assert from "node:assert/strict";
import { keccak256, stringToHex } from "viem";
import * as indexer from "../dist/index.js";

const chainId = 46630;
const address = "0x" + "11".repeat(20);
const oldAddress = "0x" + "22".repeat(20);
const hash = "0x" + "aa".repeat(32);
const hash2 = "0x" + "bb".repeat(32);
const blockTime = "2026-11-23T00:00:00.000Z";
const bytea = (hex) => "\\x" + hex.slice(2).toLowerCase();
const txHash = (i) => "0x" + i.toString(16).padStart(64, "0");

function event(name, args, block = 100, index = 0, source = address) {
  return {
    chain_id: chainId,
    event_name: name,
    args,
    block_number: String(block),
    log_index: index,
    tx_hash: txHash(block),
    contract_address: source,
    block_time: blockTime,
  };
}

function project(row) {
  return indexer.dispatchEventHandlers({
    chainId,
    eventName: row.event_name,
    args: row.args,
    txHash: row.tx_hash,
    blockNumber: BigInt(row.block_number),
    logIndex: row.log_index,
    contractAddress: row.contract_address,
    blockTimeIso: row.block_time,
  });
}

function stored(row) {
  return { ...row, tx_hash: bytea(row.tx_hash), contract_address: bytea(row.contract_address) };
}

// Emulate PostgREST's insert-side constraints, filters, defaults, and representations at the fetch boundary.
function rest(seed = {}, { missing = [], pageLimit = 2 } = {}) {
  const tables = structuredClone(seed);
  const required = {
    epochs: ["epoch_id", "series_id", "status"],
    disputes: ["dispute_id", "epoch_id", "narrative_id", "challenger", "claimed_i_bps", "evidence_hash", "status", "opened_at"],
    registry_state: ["chain_id", "frozen"],
    governance_proposals: ["chain_id", "proposal_id"],
    governance_votes: ["chain_id", "proposal_id", "voter"],
    baskets: ["chain_id", "basket_address"],
  };
  const json = (body, status = 200) => Response.json(body, { status });
  function matches(row, key, filter) {
    const [op, ...parts] = filter.split(".");
    const value = parts.join(".").replace(/^"|"$/g, "").replace(/\\\\/g, "\\");
    if (op === "is") return row[key] == null && value === "null";
    if (op === "neq") return row[key] != null && String(row[key]) !== value;
    if (op === "gt") return key === "tx_hash" ? row[key] > value : BigInt(row[key]) > BigInt(value);
    return String(row[key]) === value;
  }
  function terms(expression) {
    return expression.match(/(?:and\([^()]+\)|[^,()]+)/g) ?? [];
  }
  function expressionMatches(row, expression) {
    return terms(expression).some((term) => term.startsWith("and(")
      ? terms(term.slice(4, -1)).every((nested) => expressionMatches(row, nested))
      : matches(row, term.slice(0, term.indexOf(".")), term.slice(term.indexOf(".") + 1)));
  }
  const fetchImpl = async (request, options) => {
    const url = new URL(request);
    const table = url.pathname.split("/").at(-1);
    if (missing.includes(table)) return json({ code: "PGRST205", message: "Table missing" }, 404);
    const rows = tables[table] ??= [];
    const prefer = options.headers.Prefer ?? "";
    const representation = prefer.includes("return=representation");
    const query = [...url.searchParams].filter(([key]) => !["select", "limit", "order", "on_conflict"].includes(key));
    const matching = rows.filter((row) => query.every(([key, filter]) => key === "or"
      ? expressionMatches(row, filter.slice(1, -1))
      : matches(row, key, filter)));

    if (options.method === "GET") {
      const ordered = matching.toSorted((a, b) =>
        Number(a.block_number) - Number(b.block_number) || a.log_index - b.log_index || a.tx_hash.localeCompare(b.tx_hash),
      );
      return json(ordered.slice(0, Math.min(Number(url.searchParams.get("limit")) || pageLimit, pageLimit)));
    }

    const incoming = JSON.parse(options.body);
    if (options.method === "PATCH") {
      for (const row of matching) {
        const hypothetical = { ...row, ...incoming };
        if ((required[table] ?? []).some((col) => hypothetical[col] == null)) return json({ code: "23502" }, 400);
      }
      for (const row of matching) Object.assign(row, incoming);
      return representation ? json(matching) : new Response(null, { status: 204 });
    }

    const payload = Array.isArray(incoming) ? incoming : [incoming];
    const keys = Object.keys(payload[0]).sort().join(",");
    if (payload.some((row) => Object.keys(row).sort().join(",") !== keys)) return json({ code: "PGRST102" }, 400);
    const inserted = [];
    for (const row of payload) {
      const projected = { ...row };
      if (table === "registry_state" && prefer.includes("missing=default")) projected.frozen ??= false;
      const missingKey = (required[table] ?? []).find((key) => projected[key] == null);
      if (missingKey) return json({ code: "23502", message: `${table}.${missingKey} is required` }, 400);
      if (table === "disputes" && !tables.epochs?.some((epoch) => epoch.epoch_id === row.epoch_id)) {
        return json({ code: "23503", message: "Missing disputed epoch" }, 409);
      }
      const conflict = url.searchParams.get("on_conflict").split(",");
      const existing = rows.find((item) => conflict.every((col) => String(item[col]) === String(row[col])));
      if (existing && prefer.includes("resolution=ignore-duplicates")) continue;
      if (existing) Object.assign(existing, row);
      else rows.push(projected);
      inserted.push(existing ?? projected);
    }
    return representation ? json(inserted, 201) : new Response(null, { status: 201 });
  };
  return {
    tables,
    store: new indexer.SupabaseRestStore({ supabaseUrl: "https://example.test", serviceKey: "test", fetchImpl }),
  };
}

test("an incomplete event inserts the on-chain zero series and preserves the committed series on updates", async () => {
  const { tables, store } = rest({ epochs: [{ epoch_id: 11, series_id: 9, status: "disputed" }] });
  await store.upsertMirror([
    ...project(event("EpochMarkedIncomplete", { epochId: 10 })),
    ...project(event("EpochMarkedIncomplete", { epochId: 11 })),
  ]);
  assert.deepEqual(tables.epochs, [
    { epoch_id: 11, series_id: 9, status: "incomplete" },
    { epoch_id: 10, series_id: 0, status: "incomplete" },
  ]);
});

test("a finalized event with no epoch row stops the checkpoint advance", async () => {
  const { encodeEventTopics } = await import("viem");
  const { tables, store } = rest({ indexer_state: [{ chain_id: chainId, last_block: "99" }] });
  const poller = new indexer.IndexerPoller({
    getBlockNumber: async () => 150n,
    getLogs: async () => [{
      address, blockNumber: 100n, logIndex: 0, transactionHash: txHash(100), data: "0x",
      topics: encodeEventTopics({ abi: indexer.ALL_NTI_EVENTS_ABI, eventName: "EpochFinalized", args: { epochId: 55 } }),
    }],
  }, store, { chainId, addresses: [address] });
  await assert.rejects(poller.pollOnce(), /epochs.*(missing|required)/i);
  assert.equal(await store.getLastBlock(chainId), 99n);
  assert.equal(tables.chain_events.length, 1);
});

test("missing mirror tables and broken foreign keys are surfaced", async () => {
  const missing = rest({}, { missing: ["registry_state"] });
  await assert.rejects(missing.store.upsertMirror(project(event("RegistryFrozen", { ntiToken: address }))), /registry_state/);
  const { store } = rest();
  await assert.rejects(store.upsertMirror([project(event("DisputeOpened", {
    disputeId: "3", epochId: 40, narrativeId: 2, challenger: address, claimedI: 900, evidenceHash: hash,
  }))[0]]), /23503/);
});

test("registry metadata keeps SQL defaults and distinguishes omitted payload fields from explicit nulls", async () => {
  const { tables, store } = rest();
  const conflictColumns = ["chain_id"];
  await store.upsertMirror([
    { table: "registry_state", conflictColumns, row: { chain_id: chainId, nti_token: address } },
    { table: "registry_state", conflictColumns, row: { chain_id: chainId, staking: oldAddress } },
    { table: "registry_state", conflictColumns, row: { chain_id: chainId, nti_token: null, staking: undefined } },
  ]);
  assert.deepEqual(tables.registry_state, [{
    chain_id: chainId, frozen: false, nti_token: null, staking: bytea(oldAddress),
  }]);
});

test("a commit preserves an existing off-chain locator and only recovers hash-verified local IDs", async () => {
  const local = "local_42_aaaaaaaaaaaaaaaa";
  const reference = keccak256(stringToHex(local));
  const other = "local_44_aaaaaaaaaaaaaaaa";
  const otherReference = keccak256(stringToHex(other));
  const commit = (epochId, arweaveTx) => event("EpochCommitted", { epochId, seriesId: 2, datasetHash: hash, configHash: hash2, arweaveTx });
  const { tables, store } = rest({ epochs: [
    { epoch_id: 42, series_id: 2, status: "computed", arweave_tx: reference },
    { epoch_id: 43, series_id: 2, status: "computed", arweave_tx: "external-archive-key" },
    { epoch_id: 44, series_id: 2, status: "computed", arweave_tx: "stored-mirror-key" },
  ] });
  await store.upsertMirror([
    ...project(commit(42, reference)), ...project(commit(43, reference)),
    ...project(commit(44, otherReference)), ...project(commit(45, reference)),
  ]);
  assert.deepEqual(tables.epochs.map((row) => [row.arweave_tx, row.arweave_tx_bytes32]), [
    [local, bytea(reference)], ["external-archive-key", bytea(reference)],
    ["stored-mirror-key", bytea(otherReference)], [undefined, bytea(reference)],
  ]);
});

test("REST replay preserves history, resolves timestamps, and projects same-block events in log order", async () => {
  const id = "75176995101815434370983898834771357630419998748470287167521104906502094468876";
  const creation = { proposalId: id, proposer: address, targets: [address], values: ["0"], signatures: [""], calldatas: ["0x1234"], voteStart: "100", voteEnd: "140", description: "Proposal" };
  const rows = [
    event("ProposalExecuted", { proposalId: id }, 102, 2),
    event("ProposalCreated", creation, 100, 0),
    event("BasketCreated", { basket: oldAddress, narrativeId: 2, name: "AI", symbol: "nAI" }, 102, 0),
    event("VoteCast", { proposalId: id, voter: oldAddress, support: 1, weight: "9007199254740999", reason: "" }, 102, 1),
    event("MarketCreated", { marketId: "1", narrativeA: 2, narrativeB: 3, baseEpoch: 10, settleEpoch: 11, baseSeriesId: 2 }, 99, 0, oldAddress),
    event("EpochCommitted", { epochId: 10, seriesId: 2, datasetHash: hash, configHash: hash, arweaveTx: hash2 }, 103, 0),
    { ...event("EpochFinalized", { epochId: 10 }, 105, 0), block_time: null },
  ].map(stored);
  const { tables, store } = rest({ chain_events: rows, indexer_state: [{ chain_id: chainId, last_block: "500" }] });
  const lookedUp = [];
  for (let run = 0; run < 2; run++) {
    const result = await indexer.replayStoredEvents(store, {
      chainId,
      pageSize: 3,
      activeContracts: { narrativeMarket: address },
      getBlockTimestamp: async (block) => {
        lookedUp.push(block);
        return 1795392006;
      },
    });
    assert.equal(result.eventsRead, 7);
  }
  assert.equal(tables.chain_events.length, 7);
  assert.equal(await store.getLastBlock(chainId), 500n);
  assert.equal(tables.governance_proposals.length, 1);
  assert.equal(tables.governance_proposals[0].proposal_id, id);
  assert.equal(tables.governance_proposals[0].status, "executed");
  assert.equal(tables.governance_proposals[0].governor_address, bytea(address));
  assert.equal(tables.governance_votes[0].weight, "9007199254740999");
  assert.equal(tables.baskets[0].factory_address, bytea(address));
  assert.equal(tables.baskets[0].basket_address, bytea(oldAddress));
  assert.equal(tables.markets, undefined);
  assert.equal(tables.epochs[0].status, "final");
  assert.equal(tables.epochs[0].finalized_at, "2026-11-23T00:00:06.000Z");
  assert.deepEqual(lookedUp, [105n]);
});

test("stored replay scopes market, grant and dispute children by deployed contract", async () => {
  const bet = { marketId: "1", bettor: address, side: 0, grossAmount: "100", netAmount: "98", feeAmount: "2" };
  const claim = { marketId: "1", bettor: address, payout: "98" };
  const grantClaim = { roundId: "1", proposalId: "1", recipient: address, amount: "98" };
  const dispute = { disputeId: "1", epochId: 35, narrativeId: 2, challenger: address, claimedI: 500, evidenceHash: hash };
  const { tables, store } = rest({
    epochs: [{ epoch_id: 35, series_id: 1, status: "final" }],
    market_bets: [{ chain_id: chainId, tx_hash: bytea(txHash(101)), log_index: 0, contract_address: bytea(address), market_id: "1" }],
    chain_events: [
      event("BetPlaced", bet, 101), event("BetPlaced", bet, 102, 0, oldAddress),
      event("Claimed", claim, 103), event("Claimed", claim, 104, 0, oldAddress),
      event("GrantClaimed", grantClaim, 105), event("GrantClaimed", grantClaim, 106, 0, oldAddress),
      event("DisputeOpened", dispute, 107), event("DisputeExpired", { disputeId: "1", epochId: 35 }, 108, 0, oldAddress),
    ].map(stored),
  });
  await indexer.replayStoredEvents(store, { chainId, activeContracts: { narrativeMarket: address, grants: address, dispute: address } });
  for (const name of ["market_bets", "market_claims", "grant_claims", "disputes"]) {
    assert.equal(tables[name].length, 1);
    assert.equal(tables[name][0].contract_address, bytea(address));
  }
  assert.equal(tables.disputes[0].status, "open");
  assert.equal(tables.chain_events.length, 8);
});

test("market settlement persists each Solidity outcome with the matching status", async () => {
  const { tables, store } = rest();
  const market = (marketId) => ({ marketId, narrativeA: 1, narrativeB: 2, baseEpoch: 10, settleEpoch: 11, baseSeriesId: 2 });
  for (const [outcome, label, status] of [[1, "side_a", "settled"], [2, "side_b", "settled"], [3, "refund", "refunded"]]) {
    await store.upsertMirror(project(event("MarketCreated", market(String(outcome)))));
    await store.upsertMirror(project(event("MarketSettled", { marketId: String(outcome), outcome, feesSent: "7" })));
    const row = tables.markets[outcome - 1];
    assert.equal(row.outcome, label);
    assert.equal(row.status, status);
  }
  await assert.rejects(async () => store.upsertMirror(project(event("MarketSettled", { marketId: "1", outcome: 0 }))), /outcome/i);
});

test("interleaved governors retain independent proposals, votes and lifecycle transitions", async () => {
  const proposal = {
    proposalId: "123", proposer: address, targets: [address], values: ["0"], signatures: [""],
    calldatas: ["0x"], voteStart: "100", voteEnd: "102", description: "Reconfigure",
  };
  const vote = { proposalId: "123", voter: address, support: 1, weight: "90", reason: "" };
  const { tables, store } = rest({
    chain_events: [
      event("ProposalCreated", proposal, 100),
      event("ProposalCreated", proposal, 101, 0, oldAddress),
      event("VoteCast", vote, 101, 1, oldAddress),
      event("ProposalQueued", { proposalId: "123", etaSeconds: "1800000000" }, 102, 0, oldAddress),
      event("VoteCast", { ...vote, weight: "60" }, 102, 1),
      event("ProposalCanceled", { proposalId: "123" }, 103),
      event("ProposalExecuted", { proposalId: "123" }, 104, 0, oldAddress),
    ].map(stored),
  });
  await indexer.replayStoredEvents(store, { chainId });
  const byGovernor = new Map(tables.governance_proposals.map((row) => [row.governor_address, row.status]));
  assert.deepEqual(byGovernor, new Map([[bytea(address), "canceled"], [bytea(oldAddress), "executed"]]));
  assert.deepEqual(tables.governance_votes.map((row) => [row.governor_address, row.weight]), [
    [bytea(oldAddress), "90"], [bytea(address), "60"],
  ]);
});

test("a changed commitment replaces a superseded local locator and keeps unchanged locator identity", async () => {
  const idA = "local_42_aaaaaaaaaaaaaaaa";
  const idB = "local_42_bbbbbbbbbbbbbbbb";
  const refA = keccak256(stringToHex(idA));
  const refB = keccak256(stringToHex(idB));
  const commit = (datasetHash, arweaveTx, source) => event("EpochCommitted", {
    epochId: 42, seriesId: 1, datasetHash, configHash: hash, arweaveTx,
  }, 100, 0, source);
  const { store, tables } = rest();
  await store.upsertMirror(project(commit(hash, refA, oldAddress)));
  assert.equal(tables.epochs[0].arweave_tx, idA);
  await store.upsertMirror(project(commit(hash2, refB, address)));
  await store.upsertMirror(project(commit(hash2, refB, address)));
  assert.equal(tables.epochs[0].arweave_tx, idB);
  assert.equal(tables.epochs[0].arweave_tx_bytes32, bytea(refB));
  assert.equal(tables.epochs[0].dataset_hash, bytea(hash2));
  await store.upsertMirror(project(commit(hash, hash2, address)));
  assert.equal(tables.epochs[0].arweave_tx, null);
});
