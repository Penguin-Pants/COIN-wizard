import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { createHash } from "node:crypto";
import Ajv2020 from "ajv/dist/2020.js";
import { deriveState, applyPatch } from "../src/state.mjs";
import { runBot, runScoring } from "../src/dryrun.mjs";

// An engine importer sees only the schema file and the game file.
const schemaText = readFileSync(new URL("../schema/coin-game.schema.json", import.meta.url), "utf8");
const schema = JSON.parse(schemaText);
const check = new Ajv2020({ allErrors: true, strict: false }).compile(schema);
const dir = new URL("../examples/", import.meta.url);
const games = readdirSync(dir).filter((f) => f.endsWith(".game.json")).map((f) => [f, JSON.parse(readFileSync(new URL(f, dir), "utf8"))]);

test("the schema is frozen at coin-game/1.8.0", () => {
  assert.equal(schema.properties.meta.properties.schemaVersion.const, "coin-game/1.8.0");
  // Line endings are normalized: Git for Windows checks files out with CRLF by default.
  const hash = createHash("sha256").update(schemaText.replace(/\r\n/g, "\n")).digest("hex");
  assert.equal(hash, "c9d030f2e517ea5153b3a4fd6fe7406f0dd151f18e1b09048da51106c76c6ed0", "The frozen schema changed. Add a new version with a migrate step instead.");
});

for (const [f, g] of games) {
  test(`${f} imports: it validates against the schema file alone`, () => {
    assert.equal(check(g), true, JSON.stringify(check.errors?.slice(0, 3)));
    assert.equal(g.meta.schemaVersion, "coin-game/1.8.0");
  });
  test(`${f} imports: every dry run gives its expected result`, () => {
    for (const b of g.bots) for (const d of b.dryRuns) {
      // Case "scoring" runs the scoring phases that bot.scoring names; every other case the graph.
      const r = (d.case === "scoring" ? runScoring : runBot)(g, b, applyPatch(deriveState(g, b.factionId), d.patch));
      assert.equal(r.outcome, d.expect.outcome, `${b.id} ${d.id}`);
      if (d.expect.path) assert.deepEqual(r.path, d.expect.path, `${b.id} ${d.id} path`);
      if (d.expect.chosen) assert.deepEqual(r.chosen, d.expect.chosen, `${b.id} ${d.id} chosen`);
      if (d.expect.target) assert.equal(r.target, d.expect.target, `${b.id} ${d.id} target`);
      if (d.expect.linked) assert.equal(r.linked, d.expect.linked, `${b.id} ${d.id} linked`);
    }
  });
}
