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
