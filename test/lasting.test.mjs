import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { validate } from "../src/validate.mjs";
import * as D from "../src/dryrun.mjs";
import { deriveState, applyPatch } from "../src/state.mjs";
import { VAR_OK } from "../src/expr.mjs";
import { condText } from "../src/plain.mjs";
import { toCond } from "../src/exprmodel.mjs";

// Schema 1.5.0 part E: lasting ("momentum" or "capability") on a card side, and the variable
// card.lasting: the lasting value of the side the bot plays (override side, else the policy side).
const example = () => JSON.parse(readFileSync(new URL("../examples/tan-war.game.json", import.meta.url), "utf8"));
const side = (g, cardId, id) => g.deck.cards.find((c) => c.id === cardId).sides.find((s) => s.id === id);
const codes = (g) => validate(g).errors.map((e) => e.code);
const run = (g, bi, patch) => { try { return D.runBot(g, g.bots[bi], applyPatch(deriveState(g, g.bots[bi].factionId), patch)); } catch (e) { return { error: e.message }; } };
const isCapability = { op: "eq", args: [{ var: "card.lasting" }, "capability"] };

test("a card side accepts lasting momentum or capability and rejects other values", () => {
  const g = example();
  side(g, "e03", "unshaded").lasting = "capability";
  side(g, "e03", "shaded").lasting = "momentum";
  assert.deepEqual(validate(g).errors, []);
  side(g, "e03", "shaded").lasting = "forever";
  assert.ok(codes(g).includes("schema"));
});

test("card.lasting is a known variable with plain text", () => {
  assert.ok(VAR_OK.test("card.lasting"));
  assert.equal(condText(toCond(isCapability), example()), "the card's lasting type is capability");
});

test("card.lasting reads the side the bot plays", () => {
  const g = example();
  // Crown plays unshaded; Republic plays shaded. e03 has no override for either bot.
  side(g, "e03", "unshaded").lasting = "capability";
  assert.equal(D.cardLasting?.(g, g.bots[0], "e03"), "capability");
  assert.equal(D.cardLasting?.(g, g.bots[1], "e03"), "none");
  // An override side wins: Crown plays e07 unshaded by override; set it to shaded.
  side(g, "e07", "shaded").lasting = "momentum";
  g.bots[0].eventPolicy.overrides.find((o) => o.cardId === "e07").side = "shaded";
  assert.equal(D.cardLasting?.(g, g.bots[0], "e07"), "momentum");
  assert.equal(D.cardLasting?.(g, g.bots[0], "nope"), "none");
});

test("a dry run reads card.lasting from the deck, and a patch can set it", () => {
  const g = example();
  side(g, "e03", "unshaded").lasting = "capability";
  // Crown plays any capability card: playIf is card.lasting = capability.
  g.bots[0].eventPolicy.playIf = isCapability;
  const card = { id: "e03", hasEffect: true, raisesSelf: false, lowersEnemy: false };
  assert.equal(run(g, 0, { card }).outcome, "event");
  assert.equal(run(g, 0, { card: { ...card, lasting: "none" } }).outcome, "operationSpecial");
  assert.equal(run(g, 0, { card: { ...card, id: "e02" } }).outcome, "operationSpecial");
});
