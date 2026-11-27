import assert from "node:assert/strict";
import test from "node:test";
import { resolveTickerLogo, tickerContractFromPost } from "../lib/ticker-logo.ts";

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
