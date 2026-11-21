import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { newCardId, addCard, duplicateCard, cardRefs, deleteCard, renameCard, buildPiles, sampleDeck } from "../src/deck.mjs";
import { blankGame } from "../src/blank.mjs";
import { validate } from "../src/validate.mjs";

const example = () => JSON.parse(readFileSync(new URL("../examples/tan-war.game.json", import.meta.url), "utf8"));
const deckErrors = (g) => validate(g).errors.filter((e) => e.path.startsWith("/deck") || /deck|final-card|adjacent-scoring|card-/.test(e.code));

test("new card ids are stable, typed and never reuse an id in the deck", () => {
  const g = example();
  assert.equal(newCardId(g, "event"), "e09");
  assert.equal(newCardId(g, "scoring"), "s3");
  g.deck.cards = g.deck.cards.filter((c) => c.id !== "e02");
  assert.equal(newCardId(g, "event"), "e09");
});

test("an added Event card has both sides and every faction in its order", () => {
  const g = example();
  const c = addCard(g, "event");
  assert.equal(g.deck.cards.at(-1), c);
  assert.deepEqual(c.sides.map((s) => s.id), ["unshaded", "shaded"]);
  assert.deepEqual(c.order, g.factions.map((f) => f.id));
});

test("a duplicate gets a new id and sits after the original", () => {
  const g = example();
  const d = duplicateCard(g, "e01");
  const i = g.deck.cards.findIndex((c) => c.id === "e01");
  assert.equal(g.deck.cards[i + 1], d);
  assert.notEqual(d.id, "e01");
  assert.equal(d.title, "Flying Column (copy)");
});

test("card references list piles, bot overrides and dry runs", () => {
  const where = cardRefs(example(), "e07").map((r) => r.path);
  assert.ok(where.includes("/deck/preparation/piles/1/events"));
  assert.ok(where.some((p) => /\/bots\/\d+\/eventPolicy\/overrides\/\d+/.test(p)));
  assert.ok(where.some((p) => /\/bots\/\d+\/dryRuns\/\d+\/patch\/card/.test(p)));
});

test("deleting a card removes it from piles and overrides and reports what it changed", () => {
  const g = example();
  const changed = deleteCard(g, "e07");
  assert.ok(changed.length >= 2);
  assert.equal(g.deck.cards.some((c) => c.id === "e07"), false);
  assert.equal(JSON.stringify(g.deck.preparation).includes("e07"), false);
  assert.equal(g.bots.some((b) => b.eventPolicy.overrides.some((o) => o.cardId === "e07")), false);
});

test("renaming a card changes card references only", () => {
  const g = renameCard(example(), "s1", "truce1");
  assert.ok(g.deck.cards.some((c) => c.id === "truce1"));
  assert.equal(g.deck.preparation.piles[0].scoring, "truce1");
  assert.ok(g.brief.sources.some((s) => s.id === "s1"), "source s1 keeps its id");
  const h = renameCard(example(), "e07", "e77");
  assert.ok(h.bots.some((b) => b.eventPolicy.overrides.some((o) => o.cardId === "e77")));
  assert.ok(h.bots.some((b) => b.dryRuns.some((d) => d.patch?.card?.id === "e77")));
  assert.deepEqual(deckErrors(h), []);
});

test("buildPiles makes a valid deck from cards in any order", () => {
  const g = blankGame();
  for (let i = 0; i < 8; i++) addCard(g, "event");
  addCard(g, "scoring"); const fin = addCard(g, "scoring"); fin.final = true;
  buildPiles(g, 2);
  assert.equal(g.deck.preparation.piles.length, 2);
  assert.equal(g.deck.preparation.piles[1].scoring, fin.id);
  assert.deepEqual(deckErrors(g), []);
});

test("buildPiles refuses a pile count that does not match the scoring cards", () => {
  const g = example();
  assert.throws(() => buildPiles(g, 3), /3 piles need 3 scoring cards/);
});

test("a sample deck holds every card once and ends with the final card", () => {
  const g = example();
  const d = sampleDeck(g, 7);
  assert.equal(d.length, g.deck.cards.length);
  assert.equal(new Set(d).size, d.length);
  assert.equal(d.at(-1), g.deck.cards.find((c) => c.final).id);
  assert.deepEqual(sampleDeck(g, 7), d, "same seed, same deck");
});

// One case per deck rule in the validator.
const codes = (g) => validate(g).errors.map((e) => e.code);
test("deck rule: a card missing from the piles", () => { const g = example(); g.deck.preparation.piles[0].events.pop(); assert.ok(codes(g).includes("deck-composition")); });
test("deck rule: no Event cards", () => { const g = blankGame(); assert.ok(codes(g).includes("deck-composition")); });
test("deck rule: two final cards", () => { const g = example(); g.deck.cards.forEach((c) => { if (c.type === "scoring") c.final = true; }); assert.ok(codes(g).includes("final-card")); });
test("deck rule: final card not last", () => { const g = example(); g.deck.preparation.piles[1].scoringPlacement.fromPosition = 3; assert.ok(codes(g).includes("final-card")); });
test("deck rule: placement outside the pile", () => { const g = example(); g.deck.preparation.piles[0].scoringPlacement.toPosition = 9; assert.ok(codes(g).includes("bad-placement")); });
test("deck rule: an Event card with one side", () => { const g = example(); g.deck.cards[0].sides.pop(); assert.ok(codes(g).includes("card-sides")); });
test("deck rule: a card order that misses a faction", () => { const g = example(); g.deck.cards[0].order.pop(); assert.ok(codes(g).includes("card-order")); });
