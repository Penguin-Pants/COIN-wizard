import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { migrate, LATEST } from "../src/migrate.mjs";
import { validate } from "../src/validate.mjs";

const read = (rel) => JSON.parse(readFileSync(new URL(rel, import.meta.url), "utf8"));
const old = () => read("./fixtures/tan-war.1.0.0.game.json");
const current = () => read("../examples/tan-war.game.json");
const codes = (g) => validate(g).errors.map((e) => e.code);
// Past Tan War files stored dry-run results from before an Operation changed the board for its
// linked Special Activity (known issue 1). Those four results are now flagged; nothing else is.
const STALE = ["/bots/0/dryRuns/2", "/bots/0/dryRuns/3", "/bots/1/dryRuns/3", "/bots/1/dryRuns/4"];
const validOld = (g) => {
  const errs = validate(g).errors;
  assert.deepEqual(errs.map((e) => e.path), STALE, JSON.stringify(errs));
  assert.ok(errs.every((e) => e.code.startsWith("dry-run")));
};
const STEPS = ["brief", "factions", "board", "rules", "review"];

test("the shipped example is on the latest schema version", () => {
  assert.equal(current().meta.schemaVersion, LATEST);
  assert.equal(validate(current()).ok, true);
});

test("a 1.0.0 game is rejected until it is migrated", () => {
  assert.ok(codes(old()).includes("schema"));
});

test("migrate lifts a 1.0.0 game to the latest version and only its stale dry runs fail", () => {
  const m = migrate(old());
  assert.equal(m.meta.schemaVersion, LATEST);
  validOld(m);
});

test("migrate does not change its input", () => {
  const g = old(), copy = structuredClone(g);
  migrate(g);
  assert.deepEqual(g, copy);
});

// Values that a migration step changes on purpose are left out of the comparison.
const noToward = (g) => JSON.parse(JSON.stringify(g, (k, v) => (k === "toward" ? undefined : v)));

test("migrate keeps every existing value", () => {
  const m = migrate(old());
  delete m.meta.progress;
  for (const f of m.factions) delete f.preset;
  m.meta.schemaVersion = "coin-game/1.0.0";
  assert.deepEqual(noToward(m), noToward(old()));
});

test("shift toward a faction becomes a side of the opinion axis", () => {
  const towards = (g) => { const out = []; const w = (s) => (s ?? []).forEach((x) => { if (x.op === "shift") out.push(x.toward); w(x.then); w(x.else); (x.options ?? []).forEach((o) => w(o.steps)); }); g.actions.forEach((a) => w(a.steps)); g.deck.cards.forEach((c) => (c.sides ?? []).forEach((s) => w(s.steps))); return out; };
  const before = towards(old()), after = towards(migrate(old()));
  assert.ok(before.includes("crown") && before.includes("republic"));
  assert.deepEqual(after, before.map((t) => (t === "crown" ? "support" : "opposition")));
});

test("a 1.2.0 draft migrates to the latest version and only its stale dry runs fail", () => {
  const g = migrate(read("./fixtures/tan-war.1.2.0.game.json"));
  assert.equal(g.meta.schemaVersion, LATEST);
  validOld(g);
});

test("a 1.1.0 draft migrates to the latest version and only its stale dry runs fail", () => {
  const g = migrate(read("./fixtures/tan-war.1.1.0.game.json"));
  assert.equal(g.meta.schemaVersion, LATEST);
  validOld(g);
});

test("a draft starts with empty step progress", () => {
  assert.deepEqual(migrate(old()).meta.progress, {});
});

test("a final game keeps every step done", () => {
  const g = old(); g.meta.status = "final";
  assert.deepEqual(Object.keys(migrate(g).meta.progress), STEPS);
  for (const s of STEPS) assert.deepEqual(migrate(g).meta.progress[s], { visited: true, touched: true, done: true });
});

test("each faction records its preset from its type", () => {
  const m = migrate(old());
  assert.deepEqual(m.factions.map((f) => f.preset), old().factions.map((f) => f.type));
});

test("migrating a latest game returns an equal copy", () => {
  const a = migrate(old()), b = migrate(a);
  assert.deepEqual(b, a);
  assert.notEqual(b, a);
});

test("an unknown version throws and names it", () => {
  const g = old(); g.meta.schemaVersion = "coin-game/9.0.0";
  assert.throws(() => migrate(g), /9\.0\.0/);
});

test("a document with no version throws", () => {
  assert.throws(() => migrate({}), /schemaVersion/);
  assert.throws(() => migrate(null), /schemaVersion/);
});

test("the schema accepts a claim check and rejects an unknown verdict", () => {
  const g = current();
  g.brief.claims[0].check = { verdict: "supported", reason: "Matches source s1.", checkedAt: "2026-11-20T10:00:00Z" };
  assert.equal(validate(g).ok, true, JSON.stringify(validate(g).errors));
  g.brief.claims[0].check.verdict = "maybe";
  assert.ok(codes(g).includes("schema"));
});

test("the schema accepts step progress and rejects an unknown step", () => {
  const g = current();
  g.meta.progress = { brief: { visited: true, touched: true, done: false } };
  assert.equal(validate(g).ok, true, JSON.stringify(validate(g).errors));
  g.meta.progress = { elsewhere: { visited: true } };
  assert.ok(codes(g).includes("schema"));
});

test("the schema accepts a bot layout and rejects a node without y", () => {
  const g = current(), id = g.bots[0].nodes[0].id;
  g.bots[0].layout = { [id]: { x: 10, y: 20 } };
  assert.equal(validate(g).ok, true, JSON.stringify(validate(g).errors));
  g.bots[0].layout = { [id]: { x: 10 } };
  assert.ok(codes(g).includes("schema"));
});

test("the schema rejects an unknown faction preset", () => {
  const g = current();
  g.factions[0].preset = "state";
  assert.equal(validate(g).ok, true, JSON.stringify(validate(g).errors));
  g.factions[0].preset = "rebels";
  assert.ok(codes(g).includes("schema"));
});
