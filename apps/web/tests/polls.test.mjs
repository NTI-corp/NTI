import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import test from "node:test";

registerHooks({
  resolve(specifier, context, nextResolve) {
    try {
      return nextResolve(specifier, context);
    } catch (error) {
      if (error.code !== "ERR_MODULE_NOT_FOUND") throw error;
      if (specifier.startsWith(".")) return nextResolve(`${specifier}.ts`, context);
      throw error;
    }
  },
});

const { isSameOrigin, listPolls, validateNewPoll } = await import("../lib/polls.ts");

process.env.SUPABASE_URL = "https://db.example";
process.env.SUPABASE_SERVICE_KEY = "service";

test("a poll needs a title, 2 to 6 distinct options and a sane duration", () => {
  const ok = validateNewPoll({ title: "Raise the cap?", options: [" Yes ", "No"], endsInHours: 72 });
  assert.deepEqual(ok, { value: { title: "Raise the cap?", description: "", options: ["Yes", "No"], endsInHours: 72 } });
  assert.ok("error" in validateNewPoll({ title: "ab", options: ["a", "b"], endsInHours: 1 }));
  assert.ok("error" in validateNewPoll({ title: "Valid title", options: ["only"], endsInHours: 1 }));
  assert.ok("error" in validateNewPoll({ title: "Valid title", options: ["a", "A"], endsInHours: 1 }));
  assert.ok("error" in validateNewPoll({ title: "Valid title", options: ["a", "b"], endsInHours: 0 }));
  assert.ok("error" in validateNewPoll({ title: "Valid title", options: ["a", "b"], endsInHours: 9999 }));
  assert.ok("error" in validateNewPoll({ title: "Valid title", options: Array.from({ length: 7 }, (_, i) => `o${i}`), endsInHours: 1 }));
  assert.ok("error" in validateNewPoll(null));
});

test("only requests from this site's origin may change polls", () => {
  const req = (headers) => new Request("https://nti.example/api/polls", { method: "POST", headers });
  assert.equal(isSameOrigin(req({ origin: "https://nti.example", host: "nti.example" })), true);
  assert.equal(isSameOrigin(req({ origin: "https://evil.example", host: "nti.example" })), false);
  assert.equal(isSameOrigin(req({ host: "nti.example" })), false);
  assert.equal(isSameOrigin(req({ origin: "not a url", host: "nti.example" })), false);
});

test("tallies add up stake weight per option and mark the viewer's own vote", async (t) => {
  const future = new Date(Date.now() + 3_600_000).toISOString();
  const past = new Date(Date.now() - 3_600_000).toISOString();
  t.mock.method(globalThis, "fetch", async (input) => {
    const url = new URL(input.toString());
    if (url.pathname.endsWith("/polls")) {
      return Response.json([
        { id: 2, title: "Open poll", description: "", options: ["Yes", "No"], snapshot_block: 10, created_by: "0xa", created_at: past, ends_at: future },
        { id: 1, title: "Old poll", description: "", options: ["A", "B", "C"], snapshot_block: 5, created_by: "0xa", created_at: past, ends_at: past },
      ]);
    }
    return Response.json([
      { poll_id: 2, voter: "0xaaa", option_index: 0, weight: "3000000000000000000000" },
      { poll_id: 2, voter: "0xbbb", option_index: 0, weight: "1000000000000000000000" },
      { poll_id: 2, voter: "0xccc", option_index: 1, weight: "1000000000000000000000" },
      { poll_id: 1, voter: "0xaaa", option_index: 2, weight: "250000000000000000000" },
    ]);
  });

  const polls = await listPolls("0xBBB");
  const open = polls.find((p) => p.id === 2);
  assert.equal(open.open, true);
  assert.deepEqual(open.tally.map((x) => [x.label, x.weight, x.votes]), [["Yes", 4000, 2], ["No", 1000, 1]]);
  assert.equal(open.totalWeight, 5000);
  assert.equal(open.myVote, 0);
  assert.equal(open.myWeight, 1000);

  const old = polls.find((p) => p.id === 1);
  assert.equal(old.open, false);
  assert.equal(old.myVote, null);
  assert.deepEqual(old.tally.map((x) => x.weight), [0, 0, 250]);
});
