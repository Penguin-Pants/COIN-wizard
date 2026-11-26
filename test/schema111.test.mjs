import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { validate } from "../src/validate.mjs";
import { migrate, LATEST } from "../src/migrate.mjs";
import { evalExpr, VAR_OK } from "../src/expr.mjs";
import { deriveState, applyPatch } from "../src/state.mjs";
import { varText, valueText } from "../src/plain.mjs";
import { toValue, fromValue, toCond } from "../src/exprmodel.mjs";
import { runCase, budgetOf } from "../src/dryrun.mjs";
import { budgetText, condText, stepText } from "../src/plain.mjs";
import { applyAction } from "../src/effects.mjs";
import { cardRefs, renameCard, deleteCard } from "../src/deck.mjs";
import { nonPlayerSheetHtml, boardSvg } from "../src/kit.mjs";
import { setupControl } from "../src/expr.mjs";
import { aidModel, toMarkdown } from "../src/botaid.mjs";
import Ajv2020 from "ajv/dist/2020.js";

// Schema 1.11.0, from the 7 GMT Non-Player sheets (docs/proposals/bot-model-gaps-2.md), added in parts.
// Part A (gap G5, owner decision 2026-11-26): whether a faction has a human player. Bots act
// differently against a player ("if Non-player Govt", "Enemy players", AA rule 8.1 Insurgent Discord).
// Default: a faction is a player unless the game has a bot for it. A dry-run patch may set players.
const read = (rel) => JSON.parse(readFileSync(new URL(rel, import.meta.url), "utf8"));
const tan = () => read("../examples/tan-war.game.json");
const harbor = () => read("../examples/harbor-strike.game.json");
const ev = (g, self, e, patch, extra = {}) => evalExpr(e, { state: applyPatch(deriveState(g, self), patch), links: g.board.links, ...extra });

test("the latest version is 1.11.0, and a frozen 1.10.0 file migrates with only its version changed", () => {
  assert.equal(LATEST, "coin-game/1.11.0");
  const old = read("./fixtures/tan-war.1.10.0.game.json");
  assert.equal(old.meta.schemaVersion, "coin-game/1.10.0");
  const m = migrate(old);
  assert.equal(m.meta.schemaVersion, "coin-game/1.11.0");
  assert.deepEqual(validate(m).errors, []);
  m.meta.schemaVersion = old.meta.schemaVersion; assert.deepEqual(m, old);
});

test("a faction is a player unless the game has a bot for it", () => {
  const g = tan(); // bots for crown and ira
  assert.equal(ev(g, "crown", { var: "player.ira" }), false);
  g.bots = g.bots.filter((b) => b.factionId !== "ira");
  assert.equal(ev(g, "crown", { var: "player.ira" }), true, "no bot: a human plays it");
  assert.equal(ev(g, "crown", { var: "player.crown" }), false);
});

test("a dry-run patch sets who is a player", () => {
  const g = tan();
  assert.equal(ev(g, "crown", { var: "player.ira" }, { players: { ira: true } }), true);
  assert.equal(ev(g, "crown", { var: "player.ira" }, { players: { ira: false } }), false);
  assert.throws(() => applyPatch(deriveState(g, "crown"), { players: { nobody: true } }), /unknown faction/i);
});

test("$faction.player and $target.player read the faction in context", () => {
  const g = harbor(), self = g.bots[0].factionId, foe = g.factions.find((f) => f.id !== self).id;
  assert.equal(ev(g, self, { var: "$faction.player" }, { players: { [foe]: true } }, { $faction: foe }), true);
  assert.equal(ev(g, self, { var: "$target.player" }, { players: { [foe]: false } }, { $target: foe }), false);
});

test("player variables validate and read as plain English", () => {
  for (const v of ["player.ira", "$faction.player", "$target.player"]) assert.match(v, VAR_OK);
  const g = tan();
  assert.equal(varText(g, "player.ira"), `${g.factions.find((f) => f.id === "ira").name} has a human player`);
  const cond = g.bots[0].nodes.find((n) => n.kind === "condition");
  cond.test = { var: "player.ira" };
  assert.deepEqual(validate(g).errors.filter((e) => e.code === "bad-var" || e.code === "missing-ref"), []);
  cond.test = { var: "player.nobody" };
  assert.ok(validate(g).errors.some((e) => e.code === "missing-ref" && /player\.nobody/.test(e.message)));
});

// Part B (gap G4, owner decisions 2026-11-26): pieces Available as a value. GMT "FARC has 9+ Guerrillas
// available", "10+ Cartels pieces available". Pools hold no piece state, so avail takes only the piece.
// factionAvail adds every piece the faction owns. A dry-run patch may set pools.<piece>.available.
const avail = (p) => ({ op: "avail", args: [p] });
const favail = (f) => ({ op: "factionAvail", args: [f] });

test("avail reads the Available count of one piece type", () => {
  const g = tan(); // setup: crown.army 5 Available, 2 Out of Play; ira.volunteer 5 Available
  assert.equal(ev(g, "crown", avail("crown.army")), 5);
  assert.equal(ev(g, "crown", avail("ira.volunteer")), 5);
  delete g.setup.pools["ira.hq"];
  assert.equal(ev(g, "crown", avail("ira.hq")), 0, "a piece with no pool entry has none Available");
});

test("factionAvail adds the Available pieces of one faction, by id, $faction or $target", () => {
  const g = tan(); // crown 5 + 3 + 2; ira 5 + 3
  assert.equal(ev(g, "crown", favail("crown")), 10);
  assert.equal(ev(g, "crown", favail("ira")), 8);
  assert.equal(ev(g, "crown", favail({ var: "$target.id" }), {}, { $target: "ira" }), 8);
  assert.equal(ev(g, "crown", favail({ var: "$faction.id" }), {}, { $faction: "crown" }), 10);
});

test("a dry-run patch sets pools.<piece>.available and leaves Out of Play", () => {
  const g = tan();
  const patch = { pools: { "ira.volunteer": { available: 9 } } };
  assert.equal(ev(g, "crown", avail("ira.volunteer"), patch), 9);
  assert.equal(ev(g, "crown", favail("ira"), patch), 12);
  assert.equal(applyPatch(deriveState(g, "crown"), patch).pools["ira.volunteer"].outOfPlay, 2);
  delete g.setup.pools["ira.hq"];
  assert.equal(ev(g, "crown", avail("ira.hq"), { pools: { "ira.hq": { available: 1 } } }), 1, "a piece with no pool entry gets one");
  const base = deriveState(g, "crown");
  assert.throws(() => applyPatch(base, { pools: { nothing: { available: 1 } } }), /unknown piece/i);
  assert.throws(() => applyPatch(base, { pools: { "ira.hq": { outOfPlay: 1 } } }), /only available/i);
  for (const bad of [-1, 1.5, "3"]) assert.throws(() => applyPatch(base, { pools: { "ira.hq": { available: bad } } }), /whole number/i);
});

test("a bot decision reads avail in a dry run", () => {
  const g = tan(), bot = g.bots[0];
  bot.nodes.find((n) => n.id === "cw.low").test = { op: "lt", args: [avail("crown.army"), 1] };
  const run = (patch) => runCase(g, bot, applyPatch(deriveState(g, "crown"), patch), "fallback").path;
  assert.deepEqual(run({ pools: { "crown.army": { available: 0 } } }).slice(-1), ["cw.pass"]);
  assert.notDeepEqual(run({}).slice(-1), ["cw.pass"]);
});

test("avail and factionAvail validate, pass the schema file and name only known pieces and factions", () => {
  const g = tan(), check = new Ajv2020({ allErrors: true, strict: false }).compile(read("../schema/coin-game.schema.json"));
  const cond = g.bots[0].nodes.find((n) => n.id === "cw.low"); // never true, like the setup Resources, so the dry runs hold
  cond.test = { op: "lt", args: [{ op: "add", args: [avail("ira.volunteer"), favail("crown")] }, 0] };
  assert.deepEqual(validate(g).errors, []);
  assert.equal(check(g), true, JSON.stringify(check.errors?.slice(0, 3)));
  cond.test = { op: "gte", args: [avail("nothing"), 1] };
  assert.ok(validate(g).errors.some((e) => e.code === "missing-ref" && /nothing/.test(e.message)));
  cond.test = { op: "gte", args: [favail("nobody"), 1] };
  assert.ok(validate(g).errors.some((e) => e.code === "missing-ref" && /nobody/.test(e.message)));
});

test("avail and factionAvail round-trip through the form model and read as plain English", () => {
  const g = tan();
  for (const [e, m] of [[avail("ira.volunteer"), { k: "avail", piece: "ira.volunteer" }], [favail("crown"), { k: "favail", faction: "crown" }], [favail({ var: "$target.id" }), { k: "favail", faction: "$target" }]]) {
    assert.deepEqual(toValue(e), m);
    assert.deepEqual(fromValue(m), e);
  }
  const vol = g.factions[1].pieces.find((p) => p.id === "ira.volunteer").name;
  assert.equal(valueText({ k: "avail", piece: "ira.volunteer" }, g), `Available ${vol}`);
  assert.equal(valueText({ k: "favail", faction: "crown" }, g), `Available pieces of ${g.factions[0].name}`);
  assert.equal(valueText({ k: "favail", faction: "$target" }, g), "Available pieces of the target");
});

// Part C (gap G16, owner decisions 2026-11-26): an optional budget on an action node limits what its
// Operation spends: { share: [2, 3], allBelow: 9, floor: 41 }, each part optional. Spend = Resources x
// share, rounded down, or all when Resources are below allBelow. floor caps spend at Resources - floor.
// With share and floor, the smaller spend wins. A per-use cost is checked against the budget too.
// A linked Special Activity pays from the full Resources. GMT: "for 2/3↓ of Res max, for all if
// Res < 9" (A Distant Plain Government, Coalition, Taliban), "do not fall below 41 Res" (Warlords).
const both = { tipperary: { pieces: { "ira.volunteer": { active: 1 }, "crown.army": { normal: 2 } } }, kerry: { pieces: { "ira.volunteer": { active: 1 }, "crown.army": { normal: 2 } } } };
// Crackdown costs 1 per space; its table picks up to 2 spaces. Martial Law (2 per use) follows when Resources >= 3.
const crack = (budget, res, edit = () => {}) => {
  const g = tan(), bot = g.bots[0], n = bot.nodes.find((x) => x.id === "cw.crack");
  if (budget) n.budget = budget;
  edit(g, n);
  return runCase(g, bot, applyPatch(deriveState(g, "crown"), { resources: { crown: res }, spaces: both, dice: [1, 1, 1] }), "fallback");
};
const spent = (r) => (r.path.includes("cw.crack") ? r.chosen.length : 0);

test("budgetOf: share rounds down, allBelow spends all, floor keeps Resources back, the smaller wins", () => {
  assert.equal(budgetOf({ share: [2, 3] }, 10), 6);
  assert.equal(budgetOf({ share: [2, 3], allBelow: 9 }, 8), 8);
  assert.equal(budgetOf({ share: [2, 3], allBelow: 9 }, 9), 6);
  assert.equal(budgetOf({ floor: 41 }, 45), 4);
  assert.equal(budgetOf({ floor: 41 }, 40), 0);
  assert.equal(budgetOf({ share: [2, 3], floor: 41 }, 60), 19);
  assert.equal(budgetOf({ share: [2, 3], floor: 41 }, 45), 4);
});

test("a share limits the spaces an Operation pays for", () => {
  assert.equal(spent(crack(null, 2)), 2, "no budget: 2 Resources pay for 2 spaces");
  assert.equal(spent(crack({ share: [1, 2] }, 2)), 1);
  assert.ok(crack({ share: [1, 3] }, 2).path.includes("cw.crack:empty"), "1/3 of 2 is 0: the node is empty");
  assert.equal(spent(crack({ share: [1, 3], allBelow: 3 }, 2)), 2, "below 3 Resources: spend all");
});

test("a floor keeps Resources back, and with a share the smaller spend wins", () => {
  assert.equal(spent(crack({ floor: 2 }, 3)), 1);
  assert.ok(crack({ floor: 3 }, 3).path.includes("cw.crack:empty"));
  assert.equal(spent(crack({ share: [2, 3], floor: 2 }, 3)), 1);
});

test("the linked Special Activity pays from the full Resources", () => {
  const r = crack({ share: [1, 5] }, 5); // spend 1 of 5; 4 left, so Martial Law (trigger: Resources >= 3) runs
  assert.equal(spent(r), 1);
  assert.notEqual(r.linked, "skipped");
  assert.match(r.linked, /^crown\.martial-law:/);
});

test("a per-use cost is checked against the budget", () => {
  const perUse = (g) => { g.actions.find((a) => a.id === "crown.crackdown").cost = { track: "res.crown", amount: 2, per: "use" }; };
  assert.ok(crack({ floor: 2 }, 3, perUse).path.includes("cw.crack:empty"), "spend 1 cannot pay 2");
  assert.equal(spent(crack({ floor: 1 }, 3, perUse)), 2, "spend 2 pays the one cost for both spaces");
});

test("a budget limits an action node with parts", () => {
  const parts = (g, n) => { const a = g.actions.find((x) => x.id === "crown.crackdown"); n.parts = [{ text: "Crack down.", table: n.table, steps: a.steps }]; delete n.table; };
  assert.equal(spent(crack(null, 2, parts)), 2);
  assert.equal(spent(crack({ share: [1, 2] }, 2, parts)), 1);
});

test("a budget validates against the schema file and the validator", () => {
  const check = new Ajv2020({ allErrors: true, strict: false }).compile(read("../schema/coin-game.schema.json"));
  const g = tan(), n = g.bots[0].nodes.find((x) => x.id === "cw.crack");
  n.budget = { share: [2, 3], allBelow: 9, floor: 41 };
  assert.equal(check(g), true, JSON.stringify(check.errors?.slice(0, 3)));
  assert.deepEqual(validate(g).errors.filter((e) => e.code === "bad-budget"), []);
  for (const bad of [{}, { share: [0, 3] }, { share: [2] }, { floor: -1 }, { other: 1 }]) { n.budget = bad; assert.equal(check(g), false, JSON.stringify(bad)); }
  n.budget = { share: [4, 3] };
  assert.ok(validate(g).errors.some((e) => e.code === "bad-budget" && /share/.test(e.message)));
  n.budget = { allBelow: 9 };
  assert.ok(validate(g).errors.some((e) => e.code === "bad-budget" && /allBelow/.test(e.message)));
  const cond = g.bots[0].nodes.find((x) => x.kind === "condition");
  cond.budget = { floor: 1 };
  assert.ok(validate(g).errors.some((e) => e.code === "bad-budget" && /action node/.test(e.message)));
});

test("a budget reads as plain English on the bot aid and the Non-Player sheet", () => {
  const text = "Spend at most 2/3 of Resources (round down), or all if Resources are below 9. Keep at least 41 Resources.";
  assert.equal(budgetText({ share: [2, 3], allBelow: 9, floor: 41 }), text);
  assert.equal(budgetText({ floor: 41 }), "Keep at least 41 Resources.");
  const g = tan(), bot = g.bots[0];
  bot.nodes.find((x) => x.id === "cw.crack").budget = { share: [2, 3], allBelow: 9, floor: 41 };
  assert.ok(toMarkdown(aidModel(g, bot)).includes(text));
  assert.ok(nonPlayerSheetHtml(g, bot).includes(text));
});

test("a share is fixed at the start: Resources gained during the Operation do not raise it; a floor reads the current balance", () => {
  // Part A (Kerry) gains 2 Resources; part B (Tipperary) is a new space to pay for. Codex review on PR 39.
  const gainParts = (g, n) => {
    const a = g.actions.find((x) => x.id === "crown.crackdown"), bot = g.bots[0];
    const only = (id, sid) => ({ id, scope: "space", select: "one", steps: [{ n: 1, text: "This space.", filter: { op: "eq", args: [{ var: "$space.id" }, sid] } }], tiebreak: [] });
    bot.priorityTables.push(only("tk", "kerry"), only("tt", "tipperary"));
    n.parts = [{ text: "A", table: "tk", steps: [...a.steps, { op: "gain", track: "res.crown", amount: 2 }] }, { text: "B", table: "tt", steps: a.steps }];
    delete n.table;
  };
  assert.deepEqual(crack({ share: [1, 2] }, 2, gainParts).chosen, ["kerry"], "a share of 1 pays for 1 space");
  assert.deepEqual(crack({ floor: 1 }, 2, gainParts).chosen, ["kerry", "tipperary"], "after the gain, 3 Resources keep 1 back and pay 1 more");
});

// Part D (gap G7, owner decisions 2026-11-26): Control. Optional rules.control: sides (factions that
// control together, such as COIN = US + ARVN), exclude (pieces that do not count) and types (space
// types that can be controlled; none listed: every space). A faction or side controls a space when its
// pieces there outnumber all other pieces. $space.control: the side id, the faction id or "none".
// GMT: "COIN Control", "lose no Control", "no FARC Control". The editor board preview shows Control at setup.
const valleys = () => read("../examples/four-valleys.game.json");
const ctl = (g, sid, patch = {}) => {
  const state = applyPatch(deriveState(g, g.factions[0].id), { clearPieces: g.factions.flatMap((f) => f.pieces.map((p) => p.id)), ...patch });
  return evalExpr({ var: "$space.control" }, { state, links: g.board.links, $space: state.spaces[sid] });
};
const put = (sid, pieces) => ({ spaces: { [sid]: { pieces } } });

test("Control: more pieces than all others; no rules means none", () => {
  const g = tan();
  assert.equal(ctl(g, "kerry", put("kerry", { "crown.army": { normal: 2 }, "ira.volunteer": { active: 1 } })), "none", "no rules.control");
  g.rules.control = {};
  assert.equal(ctl(g, "kerry", put("kerry", { "crown.army": { normal: 2 }, "ira.volunteer": { active: 1 } })), "crown");
  assert.equal(ctl(g, "kerry", put("kerry", { "crown.army": { normal: 1 }, "ira.volunteer": { underground: 1 } })), "none", "a tie is no Control");
  assert.equal(ctl(g, "kerry", put("kerry", { "ira.volunteer": { underground: 1, active: 1 }, "ira.hq": { normal: 1 } })), "ira");
  assert.equal(ctl(g, "kerry"), "none", "an empty space");
});

test("Control by sides: the side's pieces together outnumber all others", () => {
  const g = valleys();
  g.rules.control = { sides: [{ id: "coin", name: "COIN", factions: ["f1", "f2"] }] };
  const p = put("space2", { "f1.troops": { [g.factions[0].pieces[0].states[0]]: 1 }, "f2.police": { [g.factions[1].pieces[1].states[0]]: 1 }, "f3.guerrilla": { [g.factions[2].pieces[0].states[0]]: 1 } });
  assert.equal(ctl(g, "space2", p), "coin");
  delete g.rules.control.sides;
  assert.equal(ctl(g, "space2", p), "none", "alone, no faction has more than all others");
});

test("Control: excluded pieces do not count; only the listed space types can be controlled", () => {
  const g = tan(), p = put("kerry", { "crown.army": { normal: 2 }, "ira.volunteer": { active: 1 } });
  g.rules.control = { exclude: ["crown.army"] };
  assert.equal(ctl(g, "kerry", p), "ira");
  g.rules.control = { types: ["city"] };
  assert.equal(ctl(g, "kerry", p), "none", "a province is not a listed type");
  assert.equal(ctl(g, "dublin", put("dublin", { "crown.army": { normal: 2 } })), "crown");
});

test("$space.control works in tables and victory sums, and a dry-run patch changes it", () => {
  const g = tan();
  g.rules.control = { types: ["city", "province"] };
  const crownPop = { op: "sumSpaces", args: [{ op: "mul", args: [{ op: "eq", args: [{ var: "$space.control" }, "crown"] }, { var: "$space.pop" }] }] };
  const kerry = g.board.spaces.find((s) => s.id === "kerry").attrs.pop;
  const st = (patch) => applyPatch(deriveState(g, "crown"), { clearPieces: ["crown.army", "crown.police", "crown.barracks", "ira.volunteer", "ira.hq"], ...patch });
  assert.equal(evalExpr(crownPop, { state: st(put("kerry", { "crown.army": { normal: 1 } })), links: g.board.links }), kerry);
  assert.equal(evalExpr(crownPop, { state: st({}), links: g.board.links }), 0);
});

test("Control rules validate: sides, exclude and types, and $space.control needs rules", () => {
  const check = new Ajv2020({ allErrors: true, strict: false }).compile(read("../schema/coin-game.schema.json"));
  const g = valleys();
  g.rules.control = { sides: [{ id: "coin", name: "COIN", factions: ["f1", "f2"] }], exclude: ["f1.base"], types: ["city", "province"] };
  assert.equal(check(g), true, JSON.stringify(check.errors?.slice(0, 3)));
  assert.deepEqual(validate(g).errors.filter((e) => e.code === "bad-control"), []);
  for (const bad of [{ sides: [{ id: "x", name: "X", factions: ["f1"] }] }, { types: [] }, { other: 1 }, { types: ["sea"] }]) { g.rules.control = bad; assert.equal(check(g), false, JSON.stringify(bad)); }
  const errs = (c) => { g.rules.control = c; return validate(g).errors.filter((e) => e.code === "bad-control").map((e) => e.message).join(" | "); };
  assert.match(errs({ sides: [{ id: "coin", name: "COIN", factions: ["f1", "nobody"] }] }), /nobody/);
  assert.match(errs({ sides: [{ id: "a", name: "A", factions: ["f1", "f2"] }, { id: "b", name: "B", factions: ["f2", "f3"] }] }), /f2/);
  assert.match(errs({ sides: [{ id: "f3", name: "F3", factions: ["f1", "f2"] }] }), /f3/);
  assert.match(errs({ sides: [{ id: "none", name: "None", factions: ["f1", "f2"] }] }), /none/);
  assert.match(errs({ exclude: ["nothing"] }), /nothing/);
  // Codex review on PR 40: two sides with one id would count as one alliance.
  assert.match(errs({ sides: [{ id: "a", name: "A", factions: ["f1", "f2"] }, { id: "a", name: "A2", factions: ["f3", "f4"] }] }), /two sides/i);
  const tg = tan(), cond = tg.bots[0].nodes.find((n) => n.id === "cw.low");
  cond.test = { op: "anySpace", args: [{ op: "eq", args: [{ var: "$space.control" }, "crown"] }] };
  assert.ok(validate(tg).errors.some((e) => e.code === "bad-control" && /rules\.control/.test(e.message)), "no Control rules");
  tg.rules.control = {};
  assert.deepEqual(validate(tg).errors.filter((e) => e.code === "bad-control"), []);
  cond.test = { op: "anySpace", args: [{ op: "eq", args: [{ var: "$space.control" }, "coin"] }] };
  assert.ok(validate(tg).errors.some((e) => e.code === "bad-control" && /coin/.test(e.message)), "an unknown controller");
});

test("Control reads as plain English, and the editor board preview shows it at setup", () => {
  const g = valleys();
  g.rules.control = { sides: [{ id: "coin", name: "COIN", factions: ["f1", "f2"] }] };
  assert.equal(varText(g, "$space.control"), "the controller of this space");
  const said = (op, who) => condText(toCond({ op, args: [{ var: "$space.control" }, who] }), g);
  assert.equal(said("eq", "coin"), "COIN controls this space");
  assert.equal(said("ne", "coin"), "COIN does not control this space");
  assert.equal(said("eq", "f3"), `${g.factions[2].name} controls this space`);
  assert.equal(said("eq", "none"), "no one controls this space");
  assert.equal(said("ne", "none"), "someone controls this space");
  const t = tan();
  t.rules.control = {};
  const owned = Object.entries(setupControl(t)).filter(([, c]) => c !== "none");
  assert.ok(owned.length > 0, "Tan War setup has controlled spaces");
  const [sid, who] = owned[0], name = t.factions.find((f) => f.id === who).name;
  assert.ok(boardSvg(t, { fixed: true, control: true }).includes(`Control: ${name}`), `${sid} shows its controller`);
  assert.ok(!boardSvg(t).includes("Control:"), "the printed board shows no Control");
  delete t.rules.control;
  assert.ok(!boardSvg(t, { fixed: true, control: true }).includes("Control:"), "no rules: no labels");
});

// Part E (gap G1 and G22, owner decisions 2026-11-26): keep-back. Optional keep on move, remove and flip:
// { count, if, prefer }. In each space the pieces leave, the step leaves at least count pieces of its type
// (a flip: in its from state). count is an expression; if (read on that space) limits the rule to some
// spaces; prefer: the state the kept pieces should be in. It limits the count, not the legal spaces.
// New variable inPlay.<card> (a lasting card in play) and dry-run patch inPlay: [card ids].
// GMT: "Leave min 1(2) Guerrilla at each Taliban Base (Underground first)", "without exposing last 1(2)
// Underground Guerrilla at Base"; 1(2) is 2 with Find Fix Finish in play.
const vol = "ira.volunteer";
const board = (g, spaces) => applyPatch(deriveState(g, "ira"), { clearPieces: [vol, "ira.hq", "crown.army", "crown.police", "crown.barracks"], spaces });
const run = (g, st, step, at) => applyAction(g, st, { cost: { amount: 0 }, steps: [step] }, [at], {}, { pay: false });
const here = (st, sid, pid = vol) => st.spaces[sid].pieces[pid] ?? {};
const total = (by) => Object.values(by).reduce((a, b) => a + b, 0);

test("keep on a move leaves pieces in the space they leave", () => {
  const g = tan(), st = board(g, { tipperary: { pieces: { [vol]: { underground: 2, active: 1 } } } });
  run(g, st, { op: "move", piece: vol, count: "all", from: "$space", to: "kerry", keep: { count: 1 } }, "tipperary");
  assert.equal(total(here(st, "tipperary")), 1);
  assert.equal(total(here(st, "kerry")), 2);
});

test("keep.prefer keeps pieces in that state; without it the step takes its usual order", () => {
  const g = tan(), step = { op: "move", piece: vol, count: "all", from: "$space", to: "kerry", keep: { count: 1 } };
  let st = board(g, { tipperary: { pieces: { [vol]: { underground: 1, active: 1 } } } });
  run(g, st, step, "tipperary");
  assert.deepEqual(here(st, "tipperary"), { active: 1 }, "Underground moves first by default");
  st = board(g, { tipperary: { pieces: { [vol]: { underground: 1, active: 1 } } } });
  run(g, st, { ...step, keep: { count: 1, prefer: "underground" } }, "tipperary");
  assert.deepEqual(here(st, "tipperary"), { underground: 1 }, "Underground first: the kept one is Underground");
});

test("keep.if limits the rule to some spaces, and keep applies to each adjacent source", () => {
  const g = tan(), hasHq = { op: "gte", args: [{ op: "count", args: ["ira.hq", { var: "$space.id" }, "*"] }, 1] };
  const step = { op: "move", piece: vol, count: "all", from: "adjacent", to: "$space", keep: { count: 1, if: hasHq } };
  const st = board(g, { limerick: { pieces: { [vol]: { underground: 2 }, "ira.hq": { normal: 1 } } }, "cork-county": { pieces: { [vol]: { underground: 2 } } } });
  run(g, st, step, "kerry");
  assert.equal(total(here(st, "limerick")), 1, "a space with an HQ keeps 1");
  assert.equal(total(here(st, "cork-county")), 0, "no HQ: no keep");
  assert.equal(total(here(st, "kerry")), 3);
});

test("keep on remove and on flip", () => {
  const g = tan();
  let st = board(g, { kerry: { pieces: { "crown.army": { normal: 3 } } } });
  run(g, st, { op: "remove", piece: "crown.army", count: "all", to: "available", keep: { count: 1 } }, "kerry");
  assert.equal(total(here(st, "kerry", "crown.army")), 1);
  st = board(g, { kerry: { pieces: { [vol]: { underground: 3 } } } });
  run(g, st, { op: "flip", piece: vol, from: "underground", to: "active", count: "all", keep: { count: 1 } }, "kerry");
  assert.deepEqual(here(st, "kerry"), { underground: 1, active: 2 }, "without exposing the last Underground");
  st = board(g, { kerry: { pieces: { [vol]: { underground: 1, active: 2 } } } });
  run(g, st, { op: "flip", piece: vol, from: "underground", to: "active", count: "all", keep: { count: 1 } }, "kerry");
  assert.deepEqual(here(st, "kerry"), { underground: 1, active: 2 }, "a flip keeps pieces in its from state");
});

test("inPlay.<card> reads a lasting card in play; keep.count reads it (1, or 2 with the card)", () => {
  const g = tan(), card = g.deck.cards.find((c) => c.type === "event");
  card.sides[0].lasting = "capability";
  const inPlay = { var: `inPlay.${card.id}` };
  assert.equal(evalExpr(inPlay, { state: deriveState(g, "ira"), links: g.board.links }), false);
  assert.equal(evalExpr(inPlay, { state: applyPatch(deriveState(g, "ira"), { inPlay: [card.id] }), links: g.board.links }), true);
  assert.throws(() => applyPatch(deriveState(g, "ira"), { inPlay: ["nothing"] }), /unknown card/i);
  const step = { op: "move", piece: vol, count: "all", from: "$space", to: "kerry", keep: { count: { op: "add", args: [1, inPlay] } } };
  for (const [patch, kept] of [[{}, 1], [{ inPlay: [card.id] }, 2]]) {
    const st = applyPatch(board(g, { tipperary: { pieces: { [vol]: { underground: 3 } } } }), patch);
    run(g, st, step, "tipperary");
    assert.equal(total(here(st, "tipperary")), kept);
  }
});

test("keep and inPlay validate, and read as plain English", () => {
  const check = new Ajv2020({ allErrors: true, strict: false }).compile(read("../schema/coin-game.schema.json"));
  const g = tan(), card = g.deck.cards.find((c) => c.type === "event"), a = g.actions.find((x) => x.id === "ira.march");
  card.sides[0].lasting = "capability";
  const step = { op: "move", piece: vol, count: "all", from: "adjacent", to: "$space", keep: { count: { op: "add", args: [1, { var: `inPlay.${card.id}` }] }, if: { op: "gte", args: [{ var: "$space.pop" }, 1] }, prefer: "underground" } };
  a.steps = [step];
  assert.equal(check(g), true, JSON.stringify(check.errors?.slice(0, 3)));
  assert.deepEqual(validate(g).errors.filter((e) => e.path.startsWith("/actions")), []);
  for (const bad of [{ count: 1, other: 1 }, { if: true }]) { a.steps = [{ ...step, keep: bad }]; assert.equal(check(g), false, JSON.stringify(bad)); }
  a.steps = [{ op: "place", piece: vol, count: 1, from: "available", to: "$space", keep: { count: 1 } }];
  assert.equal(check(g), false, "place has no keep");
  a.steps = [{ ...step, keep: { count: 1, prefer: "asleep" } }];
  assert.ok(validate(g).errors.some((e) => /asleep/.test(e.message)));
  a.steps = [{ ...step, keep: { count: { var: "inPlay.nothing" } } }];
  assert.ok(validate(g).errors.some((e) => e.code === "missing-ref" && /nothing/.test(e.message)));
  a.steps = [step];
  const vn = g.factions[1].pieces[0].name;
  assert.match(stepText(step, g), new RegExp(`Leave at least 1 plus ${card.title} is in play ${vn} in each space they leave where Pop is at least 1, underground first\\.`));
  assert.match(stepText({ op: "flip", piece: vol, from: "underground", to: "active", count: "all", keep: { count: 1 } }, g), new RegExp(`Leave at least 1 underground ${vn} there\\.`));
  assert.equal(varText(g, `inPlay.${card.id}`), `${card.title} is in play`);
});

test("keep.prefer holds when the count is the moved pieces (Codex review on PR 41)", () => {
  const g = tan(), keep = { count: 1, prefer: "underground" };
  for (const second of [{ op: "move", piece: vol, count: "moved", from: "$space", to: "limerick", keep }, { op: "remove", piece: vol, count: "moved", to: "available", keep }]) {
    const st = board(g, { tipperary: { pieces: { [vol]: { active: 1, underground: 1 } } } });
    applyAction(g, st, { cost: { amount: 0 }, steps: [{ op: "move", piece: vol, count: "all", from: "tipperary", to: "$space" }, second] }, ["kerry"], {}, { pay: false });
    assert.deepEqual(here(st, "kerry"), { underground: 1 }, `${second.op}: the kept piece is Underground`);
  }
});

test("renaming or deleting a card updates inPlay references (Codex review on PR 41)", () => {
  const g = tan(), card = g.deck.cards.find((c) => c.type === "event"), a = g.actions.find((x) => x.id === "ira.march");
  card.sides[0].lasting = "capability";
  a.steps = [{ op: "move", piece: vol, count: "all", from: "adjacent", to: "$space", keep: { count: { op: "add", args: [1, { var: `inPlay.${card.id}` }] } } }];
  g.bots[0].dryRuns[0].patch.inPlay = [card.id];
  const refs = cardRefs(g, card.id).map((r) => r.path);
  assert.ok(refs.some((p) => p.startsWith("/actions/")), "the expression is a reference");
  assert.ok(refs.includes("/bots/0/dryRuns/0/patch/inPlay"), "the dry-run patch is a reference");
  const r = renameCard(g, card.id, "e99");
  assert.deepEqual(r.actions.find((x) => x.id === "ira.march").steps[0].keep.count.args[1], { var: "inPlay.e99" });
  assert.deepEqual(r.bots[0].dryRuns[0].patch.inPlay, ["e99"]);
  const d = structuredClone(g), out = deleteCard(d, card.id);
  assert.equal("inPlay" in d.bots[0].dryRuns[0].patch, false, "delete removes the card from the patch");
  assert.ok(out.some((x) => x.path.startsWith("/actions/") && !x.fixed), "an expression is reported, not fixed");
});

test("keep.prefer applies only where keep.if holds (Codex review on PR 41)", () => {
  const g = tan(), keep = { count: 1, if: false, prefer: "underground" };
  for (const step of [{ op: "move", piece: vol, count: 1, from: "$space", to: "kerry", keep }, { op: "remove", piece: vol, count: 1, to: "available", keep }]) {
    const st = board(g, { tipperary: { pieces: { [vol]: { underground: 1, active: 1 } } } });
    run(g, st, step, "tipperary");
    assert.deepEqual(here(st, "tipperary"), { active: 1 }, `${step.op}: no keep here, so Underground goes first as usual`);
  }
});
