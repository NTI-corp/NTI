import assert from "node:assert/strict";
import test from "node:test";
import { resolveSymbolLogo, resolveTickerLogo, tickerContractFromPost } from "../lib/ticker-logo.ts";

const token = "0x1234567890123456789012345678901234567890";
const other = "0xabcdefabcdefabcdefabcdefabcdefabcdefabcd";

test("requires one ticker and one explicit contract in the same post", () => {
  assert.equal(tickerContractFromPost(`$ABC ${token}`, "ABC"), token);
  assert.equal(tickerContractFromPost("$ABC is great", "ABC"), null);
  assert.equal(tickerContractFromPost(`$ABC $DEF ${token}`, "ABC"), null);
  assert.equal(tickerContractFromPost(`$ABC ${token} ${other}`, "ABC"), null);
});

test("only uses a logo for the exact contract and ticker on Robinhood Chain", async () => {
  const request = async () => ({ ok: true, json: async () => [
    { chainId: "robinhood", baseToken: { address: other, symbol: "ABC" }, info: { imageUrl: "https://img.example/wrong.png" } },
    { chainId: "robinhood", baseToken: { address: token, symbol: "ABC" }, info: { imageUrl: "https://img.example/right.png" } },
  ] });
  assert.equal(await resolveTickerLogo("ABC", token, request), "https://img.example/right.png");
  assert.equal(await resolveTickerLogo("DEF", token, request), null);
  assert.equal(await resolveTickerLogo("ABC", null, request), null);
  assert.equal(await resolveTickerLogo("ABC", token, async () => { throw new Error("offline"); }), null);
});

test("falls back to a recognized major-asset icon, never an obscure exact-symbol impostor", async () => {
  const coinCapHit = async (url) =>
    url.includes("coincap")
      ? { ok: true, json: async () => ({}) }
      : { ok: false, json: async () => ({}) };
  assert.deepEqual(await resolveSymbolLogo("BNB", coinCapHit), {
    name: null,
    imageUrl: "https://assets.coincap.io/assets/icons/bnb@2x.png",
  });

  const gecko = async (url) => {
    if (url.includes("coincap")) return { ok: false, json: async () => ({}) };
    return {
      ok: true,
      json: async () => ({
        coins: [
          { symbol: "BNB", name: "BNB", market_cap_rank: 4, large: "https://img.example/bnb.png" },
          { symbol: "BNB", name: "Impostor", market_cap_rank: 9000, large: "https://img.example/fake.png" },
        ],
      }),
    };
  };
  assert.deepEqual(await resolveSymbolLogo("BNB", gecko), {
    name: "BNB",
    imageUrl: "https://img.example/bnb.png",
  });

  const obscure = async (url) =>
    url.includes("coincap")
      ? { ok: false, json: async () => ({}) }
      : { ok: true, json: async () => ({ coins: [{ symbol: "MOTES", market_cap_rank: 8000, large: "https://img.example/motes.png" }] }) };
  assert.equal(await resolveSymbolLogo("MOTES", obscure), null);
});
