import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { validate } from "../src/validate.mjs";
import { migrate, LATEST } from "../src/migrate.mjs";
import { evalExpr, VAR_OK } from "../src/expr.mjs";
import { deriveState, applyPatch } from "../src/state.mjs";
import { varText } from "../src/plain.mjs";

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
