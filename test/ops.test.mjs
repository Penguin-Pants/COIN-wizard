import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { OPS, stepSchema, defaultStep } from "../src/ops.mjs";
import { validate } from "../src/validate.mjs";

const schema = JSON.parse(readFileSync(new URL("../schema/coin-game.schema.json", import.meta.url), "utf8"));
const example = () => JSON.parse(readFileSync(new URL("../examples/tan-war.game.json", import.meta.url), "utf8"));
const ALL = ["place", "remove", "flip", "move", "shift", "track", "gain", "pay", "roll", "markerSet", "if", "choose"];
// Schema and reference errors only: a new step also changes what the example's dry runs see.
const withStep = (st) => { const g = example(); g.actions[0].steps = [st]; return validate(g).errors.filter((e) => !e.code.startsWith("dry-run")); };

test("the catalogue covers all 12 ops", () => {
  assert.deepEqual(Object.keys(OPS).sort(), [...ALL].sort());
});

test("the schema step definition is generated from the catalogue", () => {
  assert.deepEqual(schema.$defs.step, stepSchema());
});

for (const op of ALL) test(`a default ${op} step passes the schema and the reference checks`, () => {
  const st = defaultStep(op, example());
  assert.equal(st.op, op);
  assert.deepEqual(withStep(st), []);
});

test("a step with a field its op does not have is a schema error", () => {
  const errs = withStep({ op: "track", id: "repression", delta: 1, piece: "crown.army" });
  assert.ok(errs.some((e) => e.code === "schema" && /piece/.test(e.message)));
});

test("a step without a required field is a schema error", () => {
  assert.ok(withStep({ op: "gain", track: "res.crown" }).some((e) => e.code === "schema"));
});

test("pay and markerSet have fixed fields", () => {
  assert.deepEqual(Object.keys(OPS.pay.req), ["track", "amount"]);
  assert.deepEqual(Object.keys(OPS.markerSet.req), ["marker", "value"]);
});

test("shift toward takes support or opposition only", () => {
  const st = { op: "shift", attr: "opinion", toward: "crown", amount: 1 };
  assert.ok(withStep(st).some((e) => e.code === "schema"));
  assert.deepEqual(withStep({ ...st, toward: "support" }), []);
});

test("a piece state that the piece does not have is a reference error", () => {
  const errs = withStep({ op: "flip", piece: "ira.volunteer", from: "underground", to: "hidden", count: 1 });
  assert.ok(errs.some((e) => e.code === "missing-ref" && /hidden/.test(e.message)));
});

test("an unknown space in a destination is a reference error", () => {
  const errs = withStep({ op: "place", piece: "crown.army", count: 1, from: "available", to: "atlantis" });
  assert.ok(errs.some((e) => e.code === "missing-ref" && /atlantis/.test(e.message)));
});
