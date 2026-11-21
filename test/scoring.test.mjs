import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { validate } from "../src/validate.mjs";
import * as D from "../src/dryrun.mjs";
import { deriveState, applyPatch } from "../src/state.mjs";

// Schema 1.5.0 part D: bot.scoring [{ phaseId, table, text }]. In that phase every step that needs a
// space ("spaces" with "filter", or a "choose" space) picks with the bot's table: up to the step's
// "spaces" (1 for "choose"), capped by the table. Owner decisions in docs/proposals/bot-model-gaps.md.
const example = () => JSON.parse(readFileSync(new URL("../examples/tan-war.game.json", import.meta.url), "utf8"));
const codes = (g) => validate(g).errors.map((e) => e.code);
const AGITATE = { op: "shift", attr: "opinion", toward: "opposition", amount: 1, spaces: 2, filter: { op: "gt", args: [{ var: "$space.opinion" }, -1] } };
const CITY = { op: "eq", args: [{ var: "$space.type" }, "city"] };

// Tan War with a Republic Agitate phase after Calm, and a Republic table for it.
function withScoring() {
  const g = example();
  const at = g.rules.scoring.phases.findIndex((p) => p.id === "calm") + 1;
  g.rules.scoring.phases.splice(at, 0, { id: "agitate", name: "Agitate", text: "The Republic shifts 2 spaces toward Opposition.", steps: [structuredClone(AGITATE)] });
  g.bots[1].priorityTables.push({ id: "ib.t.agitate", scope: "space", select: "all", limit: 3, steps: [{ n: 1, text: "City.", filter: CITY }], tiebreak: [] });
  g.bots[1].scoring = [{ phaseId: "agitate", table: "ib.t.agitate", text: "Agitate in Cities first." }];
  return g;
}
const score = (g, patch = {}) => { try { return D.runScoring(g, g.bots[1], applyPatch(deriveState(g, "ira"), patch)); } catch (e) { return { error: e.message }; } };

test("the schema accepts bot.scoring and a scoring dry run, and rejects a scoring entry with no table", () => {
  const g = withScoring();
  g.bots[1].dryRuns.push({ id: "ib.d7", case: "scoring", patch: {}, expect: { outcome: "none", path: ["agitate"], chosen: ["belfast", "cork-city"] } });
  assert.deepEqual(validate(g).errors, []);
  delete g.bots[1].scoring[0].table;
  assert.ok(codes(g).includes("schema"));
});

test("a scoring phase step picks its spaces with the bot's table, capped by the step's spaces", () => {
  // Legal: opinion above -1 (Dublin, Belfast, Cork City, Kerry, Limerick, West). Step 1 keeps the Cities.
  // No tie-breaks: name order. Limit min(table 3, step 2) = 2.
  const r = score(withScoring());
  assert.deepEqual(r.chosen, ["belfast", "cork-city"]);
  assert.deepEqual(r.path, ["agitate"]);
  assert.equal(r.outcome, "none");
});

test("a select one table picks one space and breaks the tie with the die", () => {
  const g = withScoring();
  Object.assign(g.bots[1].priorityTables.at(-1), { select: "one" });
  delete g.bots[1].priorityTables.at(-1).limit;
  // 3 Cities tie: Belfast, Cork City, Dublin. Die 5: faces 5-6 go to the third.
  assert.deepEqual(score(g, { dice: [5] }).chosen, ["dublin"]);
});

test("a choose space picks one space with the table", () => {
  const g = withScoring();
  g.rules.scoring.phases.find((p) => p.id === "agitate").steps = [{ op: "markerSet", marker: "curfew", value: true, space: "choose" }];
  assert.deepEqual(score(g).chosen, ["belfast"]);
});

test("a later choice step sees the board the earlier one changed", () => {
  // Step 2 picks a space at Opposition (-1). Before step 1 no City is at -1; after it Cork City is.
  const g = withScoring();
  g.rules.scoring.phases.find((p) => p.id === "agitate").steps.push({ op: "markerSet", marker: "curfew", value: true, space: "choose", filter: { op: "eq", args: [{ var: "$space.opinion" }, -1] } });
  assert.deepEqual(score(g).chosen, ["belfast", "cork-city", "cork-city"]);
});

test("a bot with no scoring entry runs no phase", () => {
  const g = withScoring();
  delete g.bots[1].scoring;
  const r = score(g);
  assert.deepEqual([r.path, r.chosen, r.outcome], [[], [], "none"]);
});

test("the validator checks the phase, the table and that one bot names a phase", () => {
  const g = withScoring();
  g.bots[1].scoring.push({ phaseId: "nope", table: "ib.t.nope" });
  const errs = validate(g).errors.filter((e) => e.path === "/bots/1/scoring/1").map((e) => e.code).sort();
  assert.deepEqual(errs, ["missing-ref", "missing-ref"]);
  g.bots[1].scoring.pop();
  g.bots[0].scoring = [{ phaseId: "agitate", table: "cw.t.law" }];
  assert.ok(validate(g).errors.some((e) => e.code === "scoring-phase" && e.path === "/bots/1/scoring/0"));
});

test("a scoring table must pick spaces", () => {
  const g = withScoring();
  g.bots[1].priorityTables.push({ id: "ib.enemy", scope: "opponent", select: "one", steps: [{ n: 1, text: "Any.", filter: true }], tiebreak: [] });
  g.bots[1].scoring[0].table = "ib.enemy";
  assert.ok(validate(g).errors.some((e) => e.code === "bad-target" && e.path === "/bots/1/scoring/0"));
});

test("a scoring dry run that does not match is an error", () => {
  const g = withScoring();
  g.bots[1].dryRuns.push({ id: "ib.d7", case: "scoring", patch: {}, expect: { outcome: "none", chosen: ["dublin"] } });
  assert.ok(validate(g).errors.some((e) => e.code === "dry-run-mismatch" && e.path === "/bots/1/dryRuns/6"));
});
