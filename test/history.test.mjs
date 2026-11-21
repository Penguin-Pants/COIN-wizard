import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { diff, applyPatch, invert, compareGames, SECTIONS } from "../src/history.mjs";
import { renameCard } from "../src/deck.mjs";
import { addFaction } from "../src/presets.mjs";

const example = () => JSON.parse(readFileSync(new URL("../examples/tan-war.game.json", import.meta.url), "utf8"));

test("no change gives an empty patch", () => assert.deepEqual(diff(example(), example()), []));

test("a patch is small: one changed value is one entry", () => {
  const a = example(), b = example(); b.factions[0].name = "Kingdom";
  assert.deepEqual(diff(a, b), [{ path: ["factions", 0, "name"], from: "Crown", to: "Kingdom" }]);
});

test("apply and invert restore both directions, including added and removed keys", () => {
  const a = example(), b = example();
  b.meta.title = "X"; delete b.meta.credits; b.meta.extra = 1; b.actions.pop(); b.board.spaces[0].attrs.pop = 9;
  const p = diff(a, b);
  assert.deepEqual(applyPatch(structuredClone(a), p), b);
  assert.deepEqual(applyPatch(structuredClone(b), invert(p)), a);
});

test("undo across a card rename restores every reference", () => {
  const a = example(), b = renameCard(a, "s1", "truce1");
  const back = applyPatch(structuredClone(b), invert(diff(a, b)));
  assert.deepEqual(back, a);
});

test("undo across adding a faction", () => {
  const a = example(), b = structuredClone(a); addFaction(b, "nonviolent");
  assert.deepEqual(applyPatch(structuredClone(b), invert(diff(a, b))), a);
});

test("compare names each changed section and counts its changes", () => {
  const a = example(), b = example();
  b.brief.overview.period = "x"; b.factions[1].color = "#000000"; b.deck.cards[0].title = "T"; b.deck.cards[1].title = "U";
  const c = Object.fromEntries(compareGames(a, b).map((s) => [s.id, s.changes]));
  assert.deepEqual(SECTIONS.map((s) => s.id), ["overview", "factions", "board", "rules", "deck", "victory", "bots"]);
  assert.equal(c.overview, 1); assert.equal(c.factions, 1); assert.equal(c.deck, 2); assert.equal(c.board, 0); assert.equal(c.bots, 0);
});
