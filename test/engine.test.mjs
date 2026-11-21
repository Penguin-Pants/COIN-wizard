import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { createHash } from "node:crypto";
import Ajv2020 from "ajv/dist/2020.js";
import { deriveState, applyPatch } from "../src/state.mjs";
import { runBot } from "../src/dryrun.mjs";

// An engine importer sees only the schema file and the game file.
const schemaText = readFileSync(new URL("../schema/coin-game.schema.json", import.meta.url), "utf8");
const schema = JSON.parse(schemaText);
const check = new Ajv2020({ allErrors: true, strict: false }).compile(schema);
const dir = new URL("../examples/", import.meta.url);
const games = readdirSync(dir).filter((f) => f.endsWith(".game.json")).map((f) => [f, JSON.parse(readFileSync(new URL(f, dir), "utf8"))]);

test("the schema is frozen at coin-game/1.4.0", () => {
  assert.equal(schema.properties.meta.properties.schemaVersion.const, "coin-game/1.4.0");
  const hash = createHash("sha256").update(schemaText).digest("hex");
  assert.equal(hash, "4fdcd9596b04825a624e9147af25beb95fa8f92775279b7905108fa50c22c576", "The frozen schema changed. Add a new version with a migrate step instead.");
});

for (const [f, g] of games) {
  test(`${f} imports: it validates against the schema file alone`, () => {
    assert.equal(check(g), true, JSON.stringify(check.errors?.slice(0, 3)));
    assert.equal(g.meta.schemaVersion, "coin-game/1.4.0");
  });
  test(`${f} imports: every dry run gives its expected result`, () => {
    for (const b of g.bots) for (const d of b.dryRuns) {
      const r = runBot(g, b, applyPatch(deriveState(g, b.factionId), d.patch));
      assert.equal(r.outcome, d.expect.outcome, `${b.id} ${d.id}`);
      if (d.expect.path) assert.deepEqual(r.path, d.expect.path, `${b.id} ${d.id} path`);
      if (d.expect.chosen) assert.deepEqual(r.chosen, d.expect.chosen, `${b.id} ${d.id} chosen`);
      if (d.expect.target) assert.equal(r.target, d.expect.target, `${b.id} ${d.id} target`);
      if (d.expect.linked) assert.equal(r.linked, d.expect.linked, `${b.id} ${d.id} linked`);
    }
  });
}
