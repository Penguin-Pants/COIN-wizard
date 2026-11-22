import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { validate } from "../src/validate.mjs";
import { runBot } from "../src/dryrun.mjs";
import { deriveState, applyPatch } from "../src/state.mjs";

// Schema 1.5.0 part C: parts [{ text, table, steps }] on an action node. Rules: docs/SCHEMA.md,
// "Action node parts" 1 to 8 (owner-confirmed).
const example = () => JSON.parse(readFileSync(new URL("../examples/tan-war.game.json", import.meta.url), "utf8"));
const node = (g, id) => g.bots[0].nodes.find((n) => n.id === id) ?? {};
const errs = (g) => validate(g).errors;
const run = (g, patch = {}) => { try { return runBot(g, g.bots[0], applyPatch(deriveState(g, "crown"), patch)); } catch (e) { return { error: e.message }; } };
const cnt = (piece) => ({ op: "count", args: [piece, { var: "$space.id" }, "*"] });

// Garrison (legal: the 3 Cities; cost 2 per space) in two parts:
// 1. Place 1 Police in the 2 Cities with the fewest Police.
// 2. Place 2 Army in 1 City with 2 or more Police: fewest Army, then a Barracks.
function withParts() {
  const g = example(), b = g.bots[0];
  b.priorityTables.push(
    { id: "cw.t.p1", scope: "space", select: "all", limit: 2, steps: [{ n: 1, text: "Any City.", filter: true }], tiebreak: [{ letter: "a", text: "Fewest Police.", key: cnt("crown.police"), order: "min" }] },
    { id: "cw.t.p2", scope: "space", select: "one", steps: [{ n: 1, text: "2 or more Police.", filter: { op: "gte", args: [cnt("crown.police"), 2] } }], tiebreak: [{ letter: "a", text: "Fewest Army.", key: cnt("crown.army"), order: "min" }, { letter: "b", text: "Has a Barracks.", key: cnt("crown.barracks"), order: "max" }] },
    { id: "cw.t.none", scope: "space", select: "one", steps: [{ n: 1, text: "No space.", filter: false }], tiebreak: [] }
  );
  const n = node(g, "cw.garrison");
  delete n.table;
  n.parts = [
    { text: "Place 1 Police in the 2 Cities with the fewest Police.", table: "cw.t.p1", steps: [{ op: "place", piece: "crown.police", count: 1, from: "available", to: "$space" }] },
    { text: "Place 2 Army in a City with 2 or more Police.", table: "cw.t.p2", steps: [{ op: "place", piece: "crown.army", count: 2, from: "available", to: "$space" }] }
  ];
  return g;
}

test("the schema accepts parts on an action node and rejects an empty list", () => {
  // The stored Garrison dry runs (cw.d3, cw.d4, cw.d7) expect the old single table; leave them out.
  const g = withParts(), structural = () => errs(g).filter((e) => !e.code.startsWith("dry-run"));
  assert.deepEqual(structural(), []);
  node(g, "cw.garrison").parts = [];
  assert.ok(errs(g).some((e) => e.code === "schema"));
});

test("parts run in order, each with its own table and steps; a space is listed once", () => {
  // Part 1: Police Dublin 1, Cork City 1, Belfast 2; tie by name: Cork City, Dublin (pays 4, 4 left).
  // Part 2: all 3 Cities have 2 Police now; fewest Army: Belfast 1, Cork City 1; Barracks: Cork City.
  // Martial Law (Resources 4 >= 3): only Cork City has 2+ Army (3) and opinion below Support.
  const r = run(withParts());
  assert.deepEqual(r.path, ["cw.start", "cw.event", "cw.low", "cw.crack:empty", "cw.garrison", "cw.end-op"]);
  assert.deepEqual(r.chosen, ["cork-city", "dublin"]);
  assert.equal(r.linked, "crown.martial-law:cork-city");
});

test("cost per space: each distinct space is paid once, and a part can only add what is left", () => {
  // Resources 2: part 1 can pay 1 new space: Cork City (0 left). Part 2 may use paid spaces only:
  // Cork City has 2 Police. Martial Law's trigger (3 or more) fails.
  const r = run(withParts(), { resources: { crown: 2 } });
  assert.deepEqual(r.chosen, ["cork-city"]);
  assert.equal(r.linked, "skipped");
});

test("cost per use is paid once over all parts", () => {
  // Cost 3 per use: 8 - 3 = 5 left, so a trigger of 5 or more holds. Paid per space it would be 2.
  const g = withParts();
  g.actions.find((a) => a.id === "crown.garrison").cost = { track: "res.crown", amount: 3, per: "use" };
  node(g, "cw.garrison").linked.trigger = { op: "gte", args: [{ var: "self.resources" }, 5] };
  assert.equal(run(g).linked, "crown.martial-law:cork-city");
});

test("the node is empty only when every part is empty", () => {
  const g = withParts();
  node(g, "cw.garrison").parts[0].table = "cw.t.none";
  // Part 2 alone: before any Police is placed only Belfast has 2 Police.
  assert.deepEqual(run(g).chosen, ["belfast"]);
  node(g, "cw.garrison").parts[1].table = "cw.t.none";
  const r = run(g);
  assert.ok(r.path?.includes("cw.garrison:empty"), JSON.stringify(r));
  assert.ok(!r.path.includes("cw.garrison"));
});

test("timing before: the Special Activity runs first, with no cost set aside", () => {
  // Resources 4, Cork City 2 Army: Martial Law (trigger 4 >= 3) runs first at Cork City and pays 2.
  // Then part 1 can pay 1 new space (2 left): Cork City. Part 2: paid Cork City has 2 Police.
  const g = withParts();
  g.actions.find((a) => a.id === "crown.martial-law").timing = "any";
  node(g, "cw.garrison").linked.timing = "before";
  const r = run(g, { resources: { crown: 4 }, spaces: { "cork-city": { pieces: { "crown.army": { normal: 2 } } } } });
  assert.equal(r.linked, "crown.martial-law:cork-city");
  assert.deepEqual(r.chosen, ["cork-city"]);
});

test("timing before: when no part can pick, the node is empty and the Special Activity does not run", () => {
  const g = withParts();
  g.actions.find((a) => a.id === "crown.martial-law").timing = "any";
  const n = node(g, "cw.garrison");
  n.linked.timing = "before";
  n.parts.forEach((p) => { p.table = "cw.t.none"; });
  const r = run(g, { spaces: { "cork-city": { pieces: { "crown.army": { normal: 2 } } } } });
  assert.ok(r.path?.includes("cw.garrison:empty"), JSON.stringify(r));
  assert.notEqual(r.linked, "crown.martial-law:cork-city");
});

test("the validator checks parts: no own table, known space tables, and the steps", () => {
  const g = withParts(), n = node(g, "cw.garrison");
  n.table = "cw.t.garrison";
  assert.ok(errs(g).some((e) => e.code === "parts-table" && e.path === "/bots/0/nodes/6"));
  delete n.table;
  n.parts[0].table = "cw.t.nope";
  n.parts[1].steps[0].piece = "crown.nope";
  const at = (i) => errs(g).filter((e) => e.path.startsWith(`/bots/0/nodes/6/parts/${i}`)).map((e) => e.code);
  assert.deepEqual(at(0), ["missing-ref"]);
  assert.ok(at(1).includes("missing-ref"));
});

test("a part table must pick spaces", () => {
  const g = withParts();
  g.bots[0].priorityTables.push({ id: "cw.enemy", scope: "opponent", select: "one", steps: [{ n: 1, text: "Any.", filter: true }], tiebreak: [] });
  node(g, "cw.garrison").parts[0].table = "cw.enemy";
  assert.ok(errs(g).some((e) => e.code === "bad-target" && e.path === "/bots/0/nodes/6/parts/0"));
});
