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

// Gap 9: an opponent table step may name a piece type (GMT Attack "target: (1) Shipments (2) AUC ...").
// Every piece has an owner faction (owner, 2026-11-25): the step picks that faction, and the action
// runs only a choice option made for that piece (owner answer Q1: "only that piece type").
import { runBot, selectOpponent } from "../src/dryrun.mjs";
import { aidModel } from "../src/botaid.mjs";
function pieceTarget() {
  const g = read("../examples/four-valleys.game.json"), b = g.bots.find((x) => x.factionId === "f3");
  const t = b.priorityTables.find((x) => x.id === "mf.enemy");
  t.steps = [{ n: 1, text: "Valley Militia bases.", piece: "f2.base", filter: { op: "gte", args: [{ var: "$faction.resources" }, 0] } }, { n: 2, text: "Any enemy.", filter: true }];
  const a = g.actions.find((x) => x.id === "f3.recruit");
  const tr = (fid, d) => ({ op: "track", id: g.factions.find((f) => f.id === fid).resourceTrack, delta: d });
  a.steps = [{ op: "choose", options: [
    { label: "Valley Militia", faction: "f2", steps: [tr("f2", -5)] },
    { label: "Valley Militia bases", faction: "f2", piece: "f2.base", steps: [tr("f2", -1)] },
    { label: "Republic Army", faction: "f1", steps: [tr("f1", -1)] },
    { label: "River Brigades", faction: "f4", steps: [tr("f4", -1)] }
  ] }];
  return { g, b, t, a };
}
const strikeOff = (g, b) => { const n = b.nodes.find((x) => x.id === "mf.strike"); g.actions.find((x) => x.id === "f3.strike").targets = false; return n; };

test("a piece step picks the piece's owner, reads it as $faction, and reports the piece", () => {
  const { g, b, t } = pieceTarget();
  const st = applyPatch(deriveState(g, "f3"), { dice: [1, 1, 1] });
  assert.equal(selectOpponent(g, st, t), "f2");
  strikeOff(g, b);
  const r = runBot(g, b, applyPatch(deriveState(g, "f3"), { dice: [1, 1, 1, 1] }));
  assert.ok(r.path.includes("mf.op"), r.path.join(">"));
  assert.equal(r.target, "f2");
  assert.equal(r.targetPiece, "f2.base");
});

test("against a piece target, the action runs only the option made for that piece", () => {
  const { g, b } = pieceTarget();
  strikeOff(g, b);
  const before = deriveState(g, "f3").resources.f2;
  const r = runBot(g, b, applyPatch(deriveState(g, "f3"), { dice: [1, 1, 1, 1] }));
  assert.ok(r.chosen.length > 0);
  // runBot works on a copy; check the effect directly.
  const st = applyPatch(deriveState(g, "f3"), {});
  applyAction(g, st, g.actions.find((x) => x.id === "f3.recruit"), [r.chosen[0]], { $target: "f2", $targetPiece: "f2.base" }, { pay: false });
  assert.equal(st.resources.f2, before - 1, "the piece option (-1), not the faction option (-5)");
});

test("with no option for the piece, the action has no legal space", () => {
  const { g, b, a } = pieceTarget();
  strikeOff(g, b);
  a.steps[0].options.splice(1, 1); // remove the piece option
  const r = runBot(g, b, applyPatch(deriveState(g, "f3"), { dice: [1, 1, 1, 1] }));
  assert.ok(r.path.includes("mf.op:empty"), r.path.join(">"));
});

test("piece steps and piece options are checked", () => {
  const { g, b, t, a } = pieceTarget();
  const codes = () => validate(g).errors.map((e) => e.code);
  assert.deepEqual(validate(g).errors.filter((e) => /step-target|option-piece|missing-ref/.test(e.code)), []);
  t.steps[0].piece = "nosuch"; assert.ok(codes().includes("missing-ref"));
  t.steps[0].piece = "f3.base"; assert.ok(codes().includes("step-target"), "not the bot's own piece");
  t.steps[0].piece = "f2.base";
  a.steps[0].options[1].piece = "f4.base"; assert.ok(codes().includes("option-piece"), "the piece must belong to the option's faction");
  a.steps[0].options[1].piece = "f2.base"; delete a.steps[0].options[1].faction; assert.ok(codes().includes("option-piece"), "a piece option needs a faction");
  const sp = b.priorityTables.find((x) => x.scope !== "opponent"); sp.steps[0].piece = "f2.base";
  assert.ok(codes().includes("step-target"), "a piece step works only in an opponent table");
});

test("the aid prints a piece step's target", () => {
  const { g, b } = pieceTarget();
  const rows = aidModel(g, b).tables.flatMap((x) => x.rows.map((r) => r[1]));
  assert.ok(rows.some((r) => /Target: Valley Militia Base/i.test(r) || /Target: .*Base \(Valley Militia\)/.test(r)), rows.join(" | "));
});
