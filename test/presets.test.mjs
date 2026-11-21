import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { PRESETS, defaultTypes, addFaction, removeFaction, setFactionCount } from "../src/presets.mjs";
import { blankGame } from "../src/blank.mjs";
import { validate } from "../src/validate.mjs";
import { templatesFor } from "../src/templates.mjs";

const example = () => JSON.parse(readFileSync(new URL("../examples/tan-war.game.json", import.meta.url), "utf8"));
const schemaErrors = (g) => validate(g).errors.filter((e) => e.code === "schema");

test("four presets give pieces, a resource track and a shape-safe symbol", () => {
  assert.deepEqual(Object.keys(PRESETS).sort(), ["custom", "guerrilla", "nonviolent", "state"]);
  for (const t of Object.keys(PRESETS)) assert.ok(PRESETS[t].pieces.length >= 1, t);
  assert.ok(PRESETS.guerrilla.pieces.some((p) => p.states.length === 2));
});

test("default types for 2, 3 and 4 factions", () => {
  assert.deepEqual(defaultTypes(2), ["state", "guerrilla"]);
  assert.deepEqual(defaultTypes(3), ["state", "guerrilla", "nonviolent"]);
  assert.deepEqual(defaultTypes(4), ["state", "state", "guerrilla", "guerrilla"]);
});

for (const n of [2, 3, 4]) test(`a blank ${n}-faction game passes the schema and has its generated parts`, () => {
  const g = blankGame(n);
  assert.equal(g.factions.length, n); assert.equal(g.meta.factionCount, n);
  assert.deepEqual(schemaErrors(g), []);
  assert.equal(new Set(g.factions.map((f) => f.color)).size, n);
  assert.equal(new Set(g.factions.map((f) => f.symbol)).size, n);
  for (const f of g.factions) {
    assert.ok(g.tracks.some((t) => t.id === f.resourceTrack));
    assert.ok(g.victory.perFaction.some((v) => v.factionId === f.id));
    assert.ok(f.id in g.rules.sequence.passGain && f.id in g.setup.eligibility);
    for (const p of f.pieces) assert.equal(g.setup.pools[p.id].available, p.supply);
  }
  const codes = new Set(validate(g).errors.map((e) => e.code));
  for (const c of ["victory", "missing-setup", "supply-mismatch", "disconnected"]) assert.equal(codes.has(c), false, c);
});

test("adding a faction to Tan War keeps it schema-valid and lists what changed", () => {
  const g = example();
  const changes = addFaction(g, "nonviolent");
  assert.equal(g.factions.length, 3); assert.equal(g.meta.factionCount, 3);
  assert.ok(changes.some((c) => /card faction order/i.test(c)));
  assert.ok(g.deck.cards.every((c) => c.order.length === 3));
  assert.deepEqual(schemaErrors(g), []);
  const f = g.factions[2];
  assert.ok(templatesFor(g, f.id).some((x) => x.tpl.id === "campaign" && !x.reason));
});

test("removing a faction removes its pieces, track, actions, bot and card order entries", () => {
  const g = example();
  const changes = removeFaction(g, "ira");
  assert.equal(g.factions.length, 1);
  assert.ok(changes.length >= 5);
  assert.equal(g.setup.placements.some((p) => p.piece.startsWith("ira.")), false);
  assert.equal(Object.keys(g.setup.pools).some((k) => k.startsWith("ira.")), false);
  assert.equal(g.tracks.some((t) => t.id === "res.ira"), false);
  assert.equal(g.bots.some((b) => b.factionId === "ira"), false);
  assert.equal(g.actions.some((a) => a.faction === "ira"), false);
  assert.ok(g.deck.cards.every((c) => !c.order.includes("ira")));
});

test("setFactionCount adds default factions or removes the last ones", () => {
  const g = blankGame(2);
  setFactionCount(g, 4);
  assert.deepEqual(g.factions.map((f) => f.type), ["state", "guerrilla", "state", "guerrilla"]);
  setFactionCount(g, 3);
  assert.equal(g.factions.length, 3);
  assert.deepEqual(schemaErrors(g), []);
});

test("the faction count must match the faction list", () => {
  const g = example(); g.meta.factionCount = 3;
  assert.ok(validate(g).errors.some((e) => e.code === "faction-count"));
});

test("solo play warns when two or more factions have no bot", () => {
  const g = example(); g.bots = [];
  assert.ok(validate(g).warnings.some((w) => w.code === "solo-coverage"));
  assert.equal(validate(example()).warnings.some((w) => w.code === "solo-coverage"), false);
});
