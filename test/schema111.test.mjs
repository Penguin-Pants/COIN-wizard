import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { validate } from "../src/validate.mjs";
import { migrate, LATEST } from "../src/migrate.mjs";
import { evalExpr, VAR_OK } from "../src/expr.mjs";
import { deriveState, applyPatch } from "../src/state.mjs";
import { varText, valueText } from "../src/plain.mjs";
import { toValue, fromValue } from "../src/exprmodel.mjs";
import { runCase } from "../src/dryrun.mjs";
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
