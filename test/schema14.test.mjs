import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { validate } from "../src/validate.mjs";
import { migrate, LATEST } from "../src/migrate.mjs";

// Schema 1.4.0: optional sheet fields on actions (purpose, ruleRef, accompanies, maxSpaces).
const read = (rel) => JSON.parse(readFileSync(new URL(rel, import.meta.url), "utf8"));
const example = () => read("../examples/tan-war.game.json");
const act = (g, id) => g.actions.find((a) => a.id === id);
const codes = (g) => validate(g).errors.map((e) => e.code);

test("the latest version is 1.4.0 and a 1.3.0 file migrates to it unchanged otherwise", () => {
  assert.equal(LATEST, "coin-game/1.4.0");
  const old = read("./fixtures/tan-war.1.3.0.game.json");
  const m = migrate(old);
  assert.equal(m.meta.schemaVersion, "coin-game/1.4.0");
  m.meta.schemaVersion = old.meta.schemaVersion;
  assert.deepEqual(m, old);
});

test("actions accept purpose, ruleRef, accompanies and maxSpaces", () => {
  const g = example();
  Object.assign(act(g, "crown.garrison"), { purpose: "Add forces in cities.", ruleRef: "3.2.1" });
  Object.assign(act(g, "crown.martial-law"), { purpose: "Tighten control.", ruleRef: "4.2.1", accompanies: ["crown.garrison", "crown.crackdown"], maxSpaces: 1 });
  assert.deepEqual(validate(g).errors, []);
  act(g, "crown.martial-law").accompanies = "any";
  assert.deepEqual(validate(g).errors, []);
});

test("accompanies and maxSpaces belong to Special Activities only", () => {
  const g = example();
  act(g, "crown.garrison").accompanies = "any";
  act(g, "crown.sweep").maxSpaces = 2;
  const errs = validate(g).errors.filter((e) => e.code === "sa-only");
  assert.equal(errs.length, 2);
});

test("accompanies names Operations of the same faction", () => {
  const g = example();
  act(g, "crown.martial-law").accompanies = ["crown.garrison", "ira.rally", "crown.nope"];
  assert.equal(codes(g).filter((c) => c === "missing-ref").length, 2);
});

test("a linked Special Activity must accompany its Operation", () => {
  const g = example();
  act(g, "crown.martial-law").accompanies = ["crown.sweep"];
  assert.ok(validate(g).errors.some((e) => e.code === "not-accompanying" && /crown.garrison/.test(e.message)));
});

test("the schema rejects a bad maxSpaces and an unknown accompanies value", () => {
  const g = example();
  act(g, "crown.martial-law").maxSpaces = 0;
  act(g, "ira.boycott").accompanies = "all";
  assert.equal(codes(g).filter((c) => c === "schema").length >= 2, true);
});
