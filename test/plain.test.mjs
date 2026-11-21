import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { stepText, stepsText, condText, fingerprint, isStale } from "../src/plain.mjs";
import { OPS, defaultStep } from "../src/ops.mjs";
import { toCond } from "../src/exprmodel.mjs";

const g = JSON.parse(readFileSync(new URL("../examples/tan-war.game.json", import.meta.url), "utf8"));
const allSteps = () => { const out = []; const w = (s) => s.forEach((x) => { out.push(x); w(x.then ?? []); w(x.else ?? []); (x.options ?? []).forEach((o) => w(o.steps)); }); g.actions.forEach((a) => w(a.steps)); g.deck.cards.forEach((c) => (c.sides ?? []).forEach((s) => w(s.steps))); g.rules.scoring.phases.forEach((p) => w(p.steps)); return out; };
const clean = (t) => assert.ok(/^[A-Z].*\.$/.test(t) && !/undefined|null|\[object|\$space|NaN/.test(t), t);

for (const op of Object.keys(OPS)) test(`a default ${op} step prints one clean sentence`, () => clean(stepText(defaultStep(op, g), g)));

test("every step in the example prints a clean sentence", () => { for (const s of allSteps()) clean(stepText(s, g)); });

test("sentences use the game's own names", () => {
  assert.equal(stepText({ op: "place", piece: "crown.army", count: 2, from: "available", to: "$space" }, g), "Place 2 Army from Available in this space.");
  assert.equal(stepText({ op: "flip", piece: "ira.volunteer", from: "underground", to: "active", count: "all" }, g), "Flip all Volunteer from Underground to Active.");
  assert.equal(stepText({ op: "shift", attr: "opinion", toward: "opposition", amount: 1, space: "dublin" }, g), "Shift opinion 1 step toward Opposition in Dublin.");
  assert.equal(stepText({ op: "pay", track: "res.ira", amount: 2 }, g), "Pay 2 Republic Resources.");
});

test("a condition reads as a sentence part", () => {
  const c = toCond({ op: "and", args: [{ op: "gte", args: [{ op: "count", args: ["crown.army", { var: "$space.id" }, "*"] }, 2] }, { op: "eq", args: [{ var: "$space.type" }, "city"] }] });
  assert.equal(condText(c, g), "Army in this space is at least 2 and space type is city");
});

test("stepsText joins one sentence per step", () => {
  const steps = g.actions[0].steps;
  assert.equal(stepsText(steps, g), steps.map((s) => stepText(s, g)).join(" "));
});

test("text is stale only when the steps changed after it was written", () => {
  const a = { steps: [{ op: "track", id: "repression", delta: 1 }] };
  assert.equal(isStale(a), false);
  a.plainOf = fingerprint(a.steps);
  assert.equal(isStale(a), false);
  a.steps[0].delta = 2;
  assert.equal(isStale(a), true);
});
