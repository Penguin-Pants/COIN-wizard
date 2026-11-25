import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { validate } from "../src/validate.mjs";
import { migrate, LATEST } from "../src/migrate.mjs";
import { evalExpr, VAR_OK } from "../src/expr.mjs";
import { deriveState, applyPatch } from "../src/state.mjs";
import { varText } from "../src/plain.mjs";

// Schema 1.9.0, from the GMT Non-Player sheet research (docs/research/bot-patterns), gaps 6 to 9.
// Gap 7: scoring.nextFinal, true when the next scoring card is the last one
// (FARC March 1: "Unless next Propaganda final, onto all unSabotaged LoCs").
const read = (rel) => JSON.parse(readFileSync(new URL(rel, import.meta.url), "utf8"));
const tan = () => read("../examples/tan-war.game.json");
const ev = (g, e, patch) => evalExpr(e, { state: applyPatch(deriveState(g, "ira"), patch), links: g.board.links });

test("the latest version is 1.9.0, and a frozen 1.8.0 file migrates with only its version changed", () => {
  assert.equal(LATEST, "coin-game/1.9.0");
  const old = read("./fixtures/tan-war.1.8.0.game.json");
  assert.equal(old.meta.schemaVersion, "coin-game/1.8.0");
  const m = migrate(old);
  assert.equal(m.meta.schemaVersion, "coin-game/1.9.0");
  assert.deepEqual(validate(m).errors, []);
  m.meta.schemaVersion = old.meta.schemaVersion; assert.deepEqual(m, old);
});

test("scoring.nextFinal is false unless a dry run sets it", () => {
  const g = tan(), v = { var: "scoring.nextFinal" };
  assert.equal(ev(g, v), false);
  assert.equal(ev(g, v, { scoring: { nextFinal: true } }), true);
});

test("scoring.nextFinal validates and reads as plain English", () => {
  assert.match("scoring.nextFinal", VAR_OK);
  const g = tan();
  assert.notEqual(varText(g, "scoring.nextFinal"), "scoring.nextFinal");
  const cond = g.bots[1].nodes.find((n) => n.kind === "condition");
  cond.test = { op: "not", args: [{ var: "scoring.nextFinal" }] };
  assert.deepEqual(validate(g).errors.filter((e) => e.code === "bad-var"), []);
});

// Gap 6: a game has 3 opinion levels (Support, Neutral, Opposition; the default) or 5 (Active and
// Passive Support and Opposition, -2 to 2), as each game's rules say (owner, 2026-11-25).
import { opinionLevels, opinionNames } from "../src/opinion.mjs";
import { applyAction } from "../src/effects.mjs";
import { victoryFor } from "../src/presets.mjs";
import { buildFiles } from "../src/kit.mjs";
import { toMermaid, toMarkdown, toPolicyYaml } from "../src/botaid.mjs";
const five = () => { const g = tan(); g.board.opinionLevels = 5; return g; };
const sid = (g) => g.board.spaces[0].id;

test("a game has 3 opinion levels unless the board says 5", () => {
  assert.equal(opinionLevels(tan()), 3);
  assert.equal(opinionLevels(five()), 5);
  assert.deepEqual(opinionNames(tan()).map(([v]) => v), [1, 0, -1]);
  assert.deepEqual(opinionNames(five()), [[2, "Active Support"], [1, "Passive Support"], [0, "Neutral"], [-1, "Passive Opposition"], [-2, "Active Opposition"]]);
  const g = tan(); g.board.opinionLevels = 4;
  assert.ok(validate(g).errors.some((e) => e.code === "schema"));
});

test("starting opinion must be on the game's scale", () => {
  const g3 = tan(); g3.setup.spaceAttributes[sid(g3)].opinion = 2;
  assert.ok(validate(g3).errors.some((e) => e.code === "range"));
  const g5 = five(); g5.setup.spaceAttributes[sid(g5)].opinion = 2;
  assert.deepEqual(validate(g5).errors.filter((e) => e.code === "range"), []);
  g5.setup.spaceAttributes[sid(g5)].opinion = 3;
  assert.ok(validate(g5).errors.some((e) => e.code === "range"));
});

test("shift moves one level at a time and stops at the game's ends", () => {
  const shift = (g, from, toward, amount) => {
    const st = applyPatch(deriveState(g, "ira"), { spaces: { [sid(g)]: { opinion: from } } });
    applyAction(g, st, { cost: { amount: 0 }, steps: [{ op: "shift", attr: "opinion", toward, amount }] }, [sid(g)]);
    return st.spaces[sid(g)].opinion;
  };
  assert.equal(shift(tan(), 1, "support", 1), 1, "3 levels: Support is the end");
  assert.equal(shift(five(), 1, "support", 1), 2, "5 levels: Passive to Active Support");
  assert.equal(shift(five(), 1, "support", 3), 2);
  assert.equal(shift(five(), 0, "opposition", 2), -2);
});

test("with 5 levels, preset victory counts Active spaces twice, as GMT Total Support does", () => {
  const g = five(), f = g.factions.find((x) => x.type === "state") ?? g.factions[0];
  const v = victoryFor(f, g);
  const ids = g.board.spaces.map((s) => s.id), pop = (i) => g.board.spaces[i].attrs.pop;
  const st = applyPatch(deriveState(g, f.id), { spaces: Object.fromEntries(ids.map((id, i) => [id, { opinion: i === 0 ? 2 : i === 1 ? 1 : 0 }])) });
  assert.equal(evalExpr(v.formula, { state: st, links: g.board.links }), 2 * pop(0) + pop(1));
  // 3 levels: unchanged, Pop of spaces at Support.
  const g3 = tan(), f3 = g3.factions.find((x) => x.id === f.id);
  assert.deepEqual(victoryFor(f3, g3).formula, victoryFor(f3).formula);
});

test("the print kit names all 5 levels", () => {
  const g = five(); g.setup.spaceAttributes[sid(g)].opinion = -2;
  const files = Object.fromEntries(buildFiles(g, { toMermaid, toMarkdown, toPolicyYaml }));
  assert.match(Object.values(files).filter((x) => typeof x === "string").join(""), /Active Opposition/);
});

import { setOpinionLevels } from "../src/presets.mjs";
test("changing the levels updates preset victory rules the designer did not edit, and moves opinion to the scale", () => {
  const g = tan(), sp = sid(g);
  // tan-war rules are the designer's own: they stay.
  const before = structuredClone(g.victory.perFaction);
  // Give faction 0 its preset default, as a new game has.
  const f = g.factions[0];
  g.victory.perFaction[0] = victoryFor(f, g);
  setOpinionLevels(g, 5);
  assert.equal(g.board.opinionLevels, 5);
  assert.deepEqual(g.victory.perFaction[0], victoryFor(f, g), "the default follows the levels");
  assert.deepEqual(g.victory.perFaction.slice(1), before.slice(1), "edited rules stay");
  g.setup.spaceAttributes[sp].opinion = -2;
  setOpinionLevels(g, 3);
  assert.equal("opinionLevels" in g.board, false);
  assert.equal(g.setup.spaceAttributes[sp].opinion, -1);
  assert.deepEqual(g.victory.perFaction[0], victoryFor(f, g));
});

// Codex review on #30.
import { boardBase } from "../src/boardsuggest.mjs";
import { blankGame } from "../src/blank.mjs";
import { addFaction } from "../src/presets.mjs";
test("a board suggestion made before the levels changed no longer applies", () => {
  const g = tan(), base = boardBase(g);
  setOpinionLevels(g, 5);
  assert.notEqual(boardBase(g), base);
});

test("an unedited preset victory rule follows the levels after its base piece is renamed", () => {
  const g = blankGame(2);
  const f = g.factions.find((x) => x.pieces.some((p) => p.isBase) && /Opposition/.test(g.victory.perFaction.find((v) => v.factionId === x.id)?.plain ?? ""));
  assert.ok(f, "a blank game has an opposition faction with a base");
  f.pieces.find((p) => p.isBase).name = "Safe House";
  setOpinionLevels(g, 5);
  assert.deepEqual(g.victory.perFaction.find((v) => v.factionId === f.id).formula, victoryFor(f, g).formula);
});

test("changing the levels works with a faction that has no pieces", () => {
  const g = blankGame(2);
  g.factions[0].type = "custom"; g.factions[0].pieces = [];
  const v = g.victory.perFaction.find((x) => x.factionId === g.factions[0].id);
  Object.assign(v, { plain: "Own track.", formula: 3 });
  const keep = structuredClone(v);
  setOpinionLevels(g, 5);
  assert.equal(g.board.opinionLevels, 5);
  assert.deepEqual(g.victory.perFaction.find((x) => x.factionId === g.factions[0].id), keep, "its rule is kept");
});
