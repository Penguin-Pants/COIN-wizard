import { test } from "node:test";
import assert from "node:assert/strict";
import { blankGame } from "../src/blank.mjs";
import { validate } from "../src/validate.mjs";
import { LATEST } from "../src/migrate.mjs";

test("a blank project has 2 factions, no actions and no deck", () => {
  const g = blankGame();
  assert.equal(g.factions.length, 2);
  assert.equal(g.meta.factionCount, 2);
  assert.deepEqual(g.actions, []);
  assert.deepEqual(g.deck.cards, []);
  assert.deepEqual(g.bots, []);
  assert.deepEqual(g.brief.sources, []);
});

test("a blank project is a draft at the latest schema version with no progress", () => {
  const g = blankGame();
  assert.equal(g.meta.schemaVersion, LATEST);
  assert.equal(g.meta.status, "draft");
  assert.equal(g.meta.revision, 1);
  assert.deepEqual(g.meta.progress, {});
});

test("a blank project passes the schema and has design blockers", () => {
  const r = validate(blankGame());
  assert.deepEqual(r.errors.filter((e) => e.code === "schema"), []);
  assert.ok(r.errors.length > 0);
});

test("each blank project is a new object with its own id", () => {
  const a = blankGame(), b = blankGame();
  assert.notEqual(a, b);
  assert.notEqual(a.meta.gameId, b.meta.gameId);
  a.factions.push({});
  assert.equal(b.factions.length, 2);
});
