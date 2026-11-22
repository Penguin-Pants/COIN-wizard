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

// Bot aid: the fixed "no choices" sentence is replaced when the bot has scoring entries.
import { aidModel, toMermaid, toMarkdown, toPolicyYaml } from "../src/botaid.mjs";
import { buildFiles } from "../src/kit.mjs";
const aidScoring = (g, bi) => { try { return aidModel(g, g.bots[bi]).scoring; } catch { return ""; } };
const np = (g, f) => { try { return Object.fromEntries(buildFiles(g, { toMermaid, toMarkdown, toPolicyYaml }))[`kit/${g.meta.gameId}.${f}.nonplayer.html`] ?? ""; } catch { return ""; } };

test("the bot aid states each scoring choice and its table", () => {
  const g = withScoring();
  const label = `IB-${g.bots[1].priorityTables.findIndex((t) => t.id === "ib.t.agitate") + 1}`;
  assert.equal(aidScoring(g, 1), `In the Agitate phase: Agitate in Cities first. Choose each space with table ${label}. Every other phase is automatic.`);
  assert.equal(aidScoring(g, 0), "The bot makes no choices in a scoring round. Every phase is automatic.");
});

test("the Non-Player sheet prints a box for each scoring phase the bot chooses in", () => {
  const g = withScoring(), html = np(g, "ira");
  const i = html.indexOf("<h2>Truce Talks card</h2>");
  assert.ok(i > html.indexOf('class="col sas"'), "the scoring boxes sit in the right column");
  const box = html.slice(html.indexOf("<h3>Agitate", i), html.indexOf("</section>", html.indexOf("<h3>Agitate", i)));
  assert.match(box, /<p>Agitate in Cities first\.<\/p>/);
  assert.match(box, /<p class="pr">❶ City\.<\/p>/);
  assert.equal(np(example(), "ira").includes("Truce Talks card</h2>"), false);
});

// Codex review of PR 13.
test("a move from a chosen source picks only among spaces its filter allows", () => {
  // Filter: Dublin only. Without the filter the City table would pick Belfast (name order).
  const g = withScoring();
  g.rules.scoring.phases.find((p) => p.id === "agitate").steps = [{ op: "move", piece: "ira.volunteer", count: 1, from: "choose", to: "limerick", filter: { op: "eq", args: [{ var: "$space.id" }, "dublin"] } }];
  assert.deepEqual(score(g).chosen, ["dublin"]);
});

test("a move from adjacent spaces to a chosen space reads adjacency from that space", () => {
  // The City table picks Belfast; Dublin (1 Volunteer) is linked to it.
  const g = withScoring();
  g.rules.scoring.phases.find((p) => p.id === "agitate").steps = [
    { op: "move", piece: "ira.volunteer", count: 1, from: "adjacent", to: "choose" },
    { op: "markerSet", marker: "curfew", value: true, space: "choose", filter: { op: "gte", args: [{ op: "count", args: ["ira.volunteer", { var: "$space.id" }, "*"] }, 1] } }
  ];
  const r = score(g);
  assert.equal(r.error, undefined);
  // Step 2: Cities with a Volunteer after the move are Belfast and Cork City; name order gives Belfast.
  assert.deepEqual(r.chosen, ["belfast", "belfast"]);
});

test("a space table used by a scoring choice may not read $target", () => {
  const g = JSON.parse(readFileSync(new URL("../examples/four-valleys.game.json", import.meta.url), "utf8"));
  const b = g.bots[0], t = b.priorityTables.find((x) => JSON.stringify(x).includes("$target"));
  assert.ok(t, "Four Valleys has a space table that reads $target");
  b.scoring = [{ phaseId: g.rules.scoring.phases[0].id, table: t.id }];
  const i = b.priorityTables.indexOf(t);
  assert.ok(validate(g).errors.some((e) => e.path.startsWith(`/bots/0/priorityTables/${i}`)), JSON.stringify(validate(g).errors.slice(0, 2)));
});

test("a chosen move that finds no space moves nothing, so a later moved count is 0", () => {
  // Step 1 moves 1 Volunteer Dublin -> Belfast. Step 2 finds no source (filter false), so it moves
  // nothing. Step 3 removes the moved Volunteers in Belfast: none. Step 4 then picks a City with a
  // Volunteer: Belfast (1, name order before Cork City). If step 3 removed it, Cork City would be picked.
  const g = withScoring();
  g.rules.scoring.phases.find((p) => p.id === "agitate").steps = [
    { op: "move", piece: "ira.volunteer", count: 1, from: "dublin", to: "belfast" },
    { op: "move", piece: "ira.volunteer", count: 1, from: "choose", to: "limerick", filter: false },
    { op: "remove", piece: "ira.volunteer", count: "moved", to: "available", space: "belfast" },
    { op: "markerSet", marker: "curfew", value: true, space: "choose", filter: { op: "gte", args: [{ op: "count", args: ["ira.volunteer", { var: "$space.id" }, "*"] }, 1] } }
  ];
  assert.deepEqual(score(g).chosen, ["belfast"]);
});

test("a move from a chosen source to a pool binds the source as the space", () => {
  // The City table picks Belfast (name order). count reads $space: Volunteers in that space (0 in Belfast
  // at setup, so use a filter for Dublin, which has 1). Without the binding, $space is undefined and it throws.
  const g = withScoring();
  g.rules.scoring.phases.find((p) => p.id === "agitate").steps = [
    { op: "move", piece: "ira.volunteer", from: "choose", to: "available", filter: { op: "eq", args: [{ var: "$space.id" }, "dublin"] }, count: { op: "count", args: ["ira.volunteer", { var: "$space.id" }, "*"] } },
    { op: "markerSet", marker: "curfew", value: true, space: "choose", filter: { op: "gte", args: [{ op: "count", args: ["ira.volunteer", { var: "$space.id" }, "*"] }, 1] } }
  ];
  const r = score(g);
  assert.equal(r.error, undefined);
  // Dublin's 1 Volunteer goes to Available; the Cities with a Volunteer are then only Cork City.
  assert.deepEqual(r.chosen, ["dublin", "cork-city"]);
});
