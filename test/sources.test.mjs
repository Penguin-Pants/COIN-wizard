import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { CHUNK, chunkText, pickChunks, claimPrompt, parseCheck, handoffText, statusLabel, overviewDiff } from "../src/sources.mjs";
import { validate } from "../src/validate.mjs";

const example = () => JSON.parse(readFileSync(new URL("../examples/tan-war.game.json", import.meta.url), "utf8"));

test("chunks cover the whole text, overlap a little and keep their source and position", () => {
  const text = "x".repeat(CHUNK * 2 + 500);
  const cs = chunkText("s1", text);
  assert.equal(cs.length, 3);
  assert.equal(cs[0].start, 0); assert.equal(cs.at(-1).end, text.length);
  for (let i = 1; i < cs.length; i++) assert.ok(cs[i].start < cs[i - 1].end, "overlap");
  for (const c of cs) { assert.equal(c.sourceId, "s1"); assert.equal(c.text, text.slice(c.start, c.end)); assert.ok(c.text.length <= CHUNK); }
});

test("a chunk ends at a sentence break when one is near", () => {
  const text = "A".repeat(CHUNK - 50) + ". " + "B".repeat(400);
  assert.equal(chunkText("s1", text)[0].text.endsWith(". "), true);
});

test("pickChunks prefers the passage that shares the claim's words", () => {
  const cs = [...chunkText("s1", "The harvest failed in the north. ".repeat(500)), ...chunkText("s2", "Soloheadbeg ambush began the war in January 1919. ".repeat(10))];
  const best = pickChunks({ text: "The war began with the Soloheadbeg ambush in 1919.", sourceIds: ["s1", "s2"] }, cs, 1);
  assert.equal(best[0].sourceId, "s2");
});

test("the claim prompt holds the claim, the passages and the answer format", () => {
  const p = claimPrompt({ text: "Claim X" }, [{ sourceId: "s1", start: 0, end: 5, text: "hello" }]);
  assert.match(p, /Claim X/); assert.match(p, /SOURCE s1 \(characters 0 to 5\)/); assert.match(p, /"verdict":"supported\|partial\|unsupported"/);
});

test("parseCheck keeps a known verdict, a short reason and the passage", () => {
  const c = parseCheck({ verdict: "unsupported", reason: "The source says 1920.", sourceId: "s1", start: 0, end: 10 }, "2026-11-20T10:00:00Z");
  assert.deepEqual(c, { verdict: "unsupported", reason: "The source says 1920.", checkedAt: "2026-11-20T10:00:00Z", passage: { sourceId: "s1", start: 0, end: 10 } });
  assert.equal(parseCheck({ verdict: "maybe" }), null);
});

test("an unsupported claim warns and does not block", () => {
  const g = example();
  g.brief.claims[0].check = { verdict: "unsupported", reason: "x" };
  const r = validate(g);
  assert.ok(r.warnings.some((w) => w.code === "unsupported-claim"));
  assert.equal(r.ok, true);
});

test("a historical claim that cites only unread sources warns", () => {
  const g = example();
  g.brief.claims[0].sourceIds = ["s2"];
  assert.ok(validate(g).warnings.some((w) => w.code === "unread-source"));
});

test("the handoff lists each URL, the return format and the size limit", () => {
  const t = handoffText([{ id: "s2", url: "https://example.org/a" }, { id: "s3", url: "https://example.org/b" }]);
  assert.match(t, /s2: https:\/\/example\.org\/a/); assert.match(t, /s3: https:\/\/example\.org\/b/);
  assert.match(t, /256 KiB/); assert.match(t, /"status":"read"/); assert.match(t, /"status":"failed"/);
});

test("source status reads as waiting, received or failed", () => {
  assert.deepEqual(["pending", "read", "failed"].map(statusLabel), ["waiting", "received", "failed"]);
});

test("the overview diff lists added and removed items and a changed period", () => {
  const d = overviewDiff({ period: "1919 to 1921", actors: ["IRA", "RIC"], places: [], turningPoints: [] }, { period: "1919 to 1922", actors: ["IRA", "British Army"], places: ["Cork"], turningPoints: [] });
  assert.deepEqual(d.period, { from: "1919 to 1921", to: "1919 to 1922" });
  assert.deepEqual(d.actors, { add: ["British Army"], remove: ["RIC"] });
  assert.deepEqual(d.places, { add: ["Cork"], remove: [] });
});
