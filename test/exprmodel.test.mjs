import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { toCond, fromCond, toValue, fromValue, collectExprs, hasRaw, setAt } from "../src/exprmodel.mjs";
import { TEMPLATES, instantiate } from "../src/templates.mjs";

const example = () => JSON.parse(readFileSync(new URL("../examples/tan-war.game.json", import.meta.url), "utf8"));
const templateGame = () => {
  const g = example();
  for (const f of g.factions) for (const t of TEMPLATES) { const a = instantiate(g, f.id, t.id); if (a) g.actions.push(a); }
  return g;
};
const S = { var: "$space.id" };
const cnt = (p) => ({ op: "count", args: [p, S, "*"] });

test("collectExprs finds every expression in the example, bots included", () => {
  const found = collectExprs(example());
  assert.ok(found.length > 60);
  assert.ok(found.some((x) => x.path.startsWith("/bots/")));
  assert.ok(found.some((x) => x.path.startsWith("/victory/")));
  assert.ok(found.some((x) => x.path.endsWith("/targets")));
});

for (const [name, game] of [["the example", example], ["every template", templateGame]]) {
  test(`every condition and value in ${name} survives a round trip`, () => {
    for (const { path, expr, as } of collectExprs(game())) {
      const back = as === "cond" ? fromCond(toCond(expr)) : fromValue(toValue(expr));
      assert.deepEqual(back, expr, path);
    }
  });
  test(`no expression in ${name} needs the JSON fallback`, () => {
    for (const { path, expr, as } of collectExprs(game())) assert.equal(hasRaw(as === "cond" ? toCond(expr) : toValue(expr)), false, path);
  });
}

test("a shape the model cannot show falls back to raw and round trips", () => {
  const e = { op: "mul", args: [2, { op: "min", args: [1, 3] }] };
  assert.equal(toValue(e).k, "raw");
  assert.deepEqual(fromValue(toValue(e)), e);
  const c = { op: "not", args: [{ op: "not", args: [true] }] };
  assert.equal(hasRaw(toCond(c)), true);
  assert.deepEqual(fromCond(toCond(c)), c);
});

test("a comparison row reads as measure, comparator and value", () => {
  const m = toCond({ op: "gte", args: [cnt("crown.army"), 2] });
  assert.deepEqual(m, { k: "cmp", cmp: "gte", a: { k: "count", piece: "crown.army", at: "$space", state: "*" }, b: { k: "lit", value: 2 } });
});

test("AND and OR groups hold rows and NOT wraps any row", () => {
  const e = { op: "not", args: [{ op: "or", args: [{ op: "eq", args: [{ var: "$space.type" }, "city"] }, { var: "eligible" }] }] };
  const m = toCond(e);
  assert.equal(m.k, "any"); assert.equal(m.not, true); assert.equal(m.items.length, 2);
  assert.equal(m.items[1].k, "truthy");
  assert.deepEqual(fromCond(m), e);
});

test("victory sums read as a sum over spaces where a condition holds", () => {
  const e = { op: "sumSpaces", args: [{ op: "mul", args: [{ op: "eq", args: [{ var: "$space.opinion" }, 1] }, { var: "$space.pop" }] }] };
  const m = toValue(e);
  assert.equal(m.k, "sumWhere"); assert.equal(m.cond.k, "cmp"); assert.deepEqual(m.v, { k: "var", name: "$space.pop" });
});

test("setAt edits one field and the expression follows", () => {
  const m = toCond({ op: "and", args: [{ op: "gte", args: [cnt("crown.army"), 1] }] });
  setAt(m, "items.0.b", { k: "lit", value: 3 });
  setAt(m, "items.0.a.piece", "crown.police");
  setAt(m, "not", true);
  assert.deepEqual(fromCond(m), { op: "not", args: [{ op: "and", args: [{ op: "gte", args: [cnt("crown.police"), 3] }] }] });
});
