import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { validate } from "../src/validate.mjs";
import { migrate, LATEST } from "../src/migrate.mjs";

// Schema 1.5.0: bot model gaps (docs/proposals/bot-model-gaps.md). Every new field is optional.
const url = (rel) => new URL(rel, import.meta.url);
const read = (rel) => (existsSync(url(rel)) ? JSON.parse(readFileSync(url(rel), "utf8")) : { meta: {} });

test("the latest version is 1.5.0", () => {
  assert.equal(LATEST, "coin-game/1.5.0");
});

test("a frozen 1.4.0 file migrates to 1.5.0 and only its version changes", () => {
  const old = read("./fixtures/tan-war.1.4.0.game.json");
  assert.equal(old.meta.schemaVersion, "coin-game/1.4.0");
  const m = migrate(old);
  assert.equal(m.meta.schemaVersion, "coin-game/1.5.0");
  m.meta.schemaVersion = old.meta.schemaVersion;
  assert.deepEqual(m, old);
});

test("a migrated 1.4.0 file validates with zero errors", () => {
  assert.deepEqual(validate(migrate(read("./fixtures/tan-war.1.4.0.game.json"))).errors, []);
});
