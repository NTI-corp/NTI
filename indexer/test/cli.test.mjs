import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createServer } from "node:http";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { encodeAbiParameters, encodeEventTopics, parseAbiParameters } from "viem";
import { ALL_NTI_EVENTS_ABI } from "../dist/index.js";

const factory = "0x1e486b30e893c556c9655d75fd670f26de7f1988";
const vault = "0x" + "aa".repeat(20);
const other = "0x" + "bb".repeat(20);
const txHash = "0x" + "12".repeat(32);
const entry = fileURLToPath(new URL("../dist/index.js", import.meta.url));

async function fixture(t) {
  let rpcChainId = 46630;
  const rpcCalls = [];
  const restCalls = [];
  const server = createServer(async (request, response) => {
    let body = "";
    for await (const data of request) body += data;
    response.setHeader("Content-Type", "application/json");
    if (request.url.startsWith("/rest/")) {
      restCalls.push({ path: request.url, method: request.method, body: body ? JSON.parse(body) : null });
      response.end("[]");
      return;
    }
    const { method, params, id } = JSON.parse(body);
    rpcCalls.push({ method, params });
    let result;
    switch (method) {
      case "eth_chainId":
        result = "0x" + rpcChainId.toString(16);
        break;
      case "eth_blockNumber":
        result = "0x96"; // safe head 100 with the configured 50-block buffer
        break;
      case "eth_call":
        result = encodeAbiParameters(parseAbiParameters("address[]"), [[vault]]);
        break;
      case "eth_getLogs":
        result = [params[0].address].flat().includes(vault) ? [{
          address: vault,
          blockNumber: "0x64",
          blockHash: txHash,
          logIndex: "0x0",
          transactionIndex: "0x0",
          transactionHash: txHash,
          removed: false,
          topics: encodeEventTopics({ abi: ALL_NTI_EVENTS_ABI, eventName: "Deposited", args: { account: other } }),
          data: encodeAbiParameters(parseAbiParameters("uint256, uint256, uint256"), [10n, 9n, 8n]),
        }] : [];
        break;
      default:
        response.end(JSON.stringify({ jsonrpc: "2.0", id, error: { code: -32601, message: method } }));
        return;
    }
    response.end(JSON.stringify({ jsonrpc: "2.0", id, result }));
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(() => server.close());
  const url = `http://127.0.0.1:${server.address().port}`;
  async function run(args, override = {}) {
    const env = {
      ...process.env, CHAIN_ID: "46630", INDEXER_RPC_URL: url, SUPABASE_URL: url,
      SUPABASE_SERVICE_KEY: "test", INDEXER_START_BLOCK: "100", INDEXER_REORG_BUFFER:"50",
    };
    delete env.INDEXER_ADDRESSES;
    const child = spawn(process.execPath, [entry, ...args], { env: { ...env, ...override }, stdio: ["ignore", "pipe", "pipe"] });
    let output = "";
    child.stdout.on("data", (data) => output += data);
    child.stderr.on("data", (data) => output += data);
    const code = await new Promise((resolve, reject) => child.on("error", reject).on("close", resolve));
    return { code, output };
  }
  return { run, rpcCalls, restCalls, changeRpcChain: (value) => { rpcChainId = value; } };
}

test("bounded factory backfill includes an older vault at the finalized boundary", async (t) => {
  const { run, rpcCalls, restCalls } = await fixture(t);
  const { code, output } = await run(["--backfill", "100", "100"], { INDEXER_ADDRESSES: factory });
  assert.equal(code, 0, output);
  assert.equal(rpcCalls.find((call) => call.method === "eth_call")?.params[1], "0x64");
  assert.equal(restCalls.length, 1);
  assert.match(restCalls[0].path, /^\/rest\/v1\/chain_events\?/);
  assert.deepEqual(restCalls[0].body.map((row) => row.event_name), ["Deposited"]);
  assert.equal(restCalls[0].body[0].contract_address, "\\x" + vault.slice(2));
  rpcCalls.length = 0;
  restCalls.length = 0;
  const scoped = await run(["--backfill", "100", "100"], { INDEXER_ADDRESSES: other });
  assert.equal(scoped.code, 0, scoped.output);
  assert.ok(rpcCalls.every((call) => call.method !== "eth_call"));
  assert.equal(restCalls.length, 0);
});

test("invalid repair config and partial polling scope fail before any REST access", async (t) => {
  const { run, rpcCalls, restCalls } = await fixture(t);
  for (const [args, env, message] of [
    [["--backfill", "100", "100"], { CHAIN_ID: "46631" }, /CHAIN_ID/],
    [["--backfill", "100", "100"], { INDEXER_ADDRESSES: "" }, /INDEXER_ADDRESSES/],
    [["--backfill", "100", "100"], { INDEXER_ADDRESSES: factory + ",broken" }, /INDEXER_ADDRESSES/],
    [["--once"], { INDEXER_ADDRESSES: other }, /checkpoint|backfill/i],
  ]) {
    const { code, output } = await run(args, env);
    assert.equal(code, 1, output);
    assert.match(output, message);
  }
  assert.equal(restCalls.length, 0);
  assert.equal(rpcCalls.length, 0);
});

test("both repair commands reject an RPC serving a different chain before accessing Supabase", async (t) => {
  const { run, restCalls, changeRpcChain } = await fixture(t);
  changeRpcChain(4663);
  for (const args of [["--backfill", "100", "100"], ["--replay-stored"]]) {
    const { code, output } = await run(args);
    assert.equal(code, 1, output);
    assert.match(output, /RPC.*chain.*4663.*46630/i);
  }
  assert.equal(restCalls.length, 0);
});
