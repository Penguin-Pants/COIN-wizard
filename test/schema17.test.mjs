import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { validate } from "../src/validate.mjs";
import { migrate, LATEST } from "../src/migrate.mjs";
import { runBot } from "../src/dryrun.mjs";
import { deriveState, applyPatch } from "../src/state.mjs";
import { newBot } from "../src/botedit.mjs";
import { aidModel, toMermaid, toMarkdown, toPolicyYaml } from "../src/botaid.mjs";
import { buildFiles } from "../src/kit.mjs";

// Schema 1.7.0: a priority table may use mode "sequence" (the GMT reading): work down the numbered
// rows in order, each as far as possible, until the limit. Mode "first" (the default, as before 1.7.0):
// only the first row with a match applies.
const read = (rel) => JSON.parse(readFileSync(new URL(rel, import.meta.url), "utf8"));
const example = () => read("../examples/tan-war.game.json");
const cnt = (p) => ({ op: "count", args: [p, { var: "$space.id" }, "*"] });

// Garrison (legal: the 3 Cities; cost 2 per space) with a table that picks up to 3 spaces:
// row 1, a City with 2+ Police (Belfast only); row 2, any City.
function withTable(mode) {
  const g = example(), b = g.bots[0];
  b.priorityTables.push({ id: "cw.t.seq", scope: "space", select: "all", limit: 3, ...(mode ? { mode } : {}), steps: [{ n: 1, text: "City with 2+ Police.", filter: { op: "gte", args: [cnt("crown.police"), 2] } }, { n: 2, text: "Any City.", filter: true }], tiebreak: [] });
  b.nodes.find((n) => n.id === "cw.garrison").table = "cw.t.seq";
  return g;
}
const chosen = (g, patch = {}) => { try { return runBot(g, g.bots[0], applyPatch(deriveState(g, "crown"), patch)).chosen; } catch (e) { return [e.message]; } };

test("the latest version is 1.7.0, and a frozen 1.6.0 file migrates with only its version changed", () => {
  assert.equal(LATEST, "coin-game/1.7.0");
  const old = read("./fixtures/tan-war.1.6.0.game.json");
  assert.equal(old.meta.schemaVersion, "coin-game/1.6.0");
  const m = migrate(old);
  assert.equal(m.meta.schemaVersion, "coin-game/1.7.0");
  m.meta.schemaVersion = old.meta.schemaVersion; assert.deepEqual(m, old);
});

test("a table accepts mode first or sequence and rejects any other", () => {
  const g = withTable("sequence");
  assert.deepEqual(validate(g).errors.filter((e) => e.code === "schema"), []);
  g.bots[0].priorityTables.at(-1).mode = "all";
  assert.ok(validate(g).errors.some((e) => e.code === "schema"));
});

test("no mode means first: only the first row with a match applies", () => {
  assert.deepEqual(chosen(withTable()), ["belfast"]);
  assert.deepEqual(chosen(withTable("first")), ["belfast"]);
});

test("sequence works down the rows in order, each as far as possible, until the limit", () => {
  assert.deepEqual(chosen(withTable("sequence")), ["belfast", "cork-city", "dublin"]);
  // Resources 4 pay for 2 spaces at 2 each.
  assert.deepEqual(chosen(withTable("sequence"), { resources: { crown: 4 } }), ["belfast", "cork-city"]);
});

test("a new bot's tables use sequence mode", () => {
  const g = example();
  assert.ok(newBot(g, "ira").priorityTables.every((t) => t.scope === "opponent" || t.mode === "sequence"));
});

test("the bot aid and the Non-Player sheet say how a sequence table is read", () => {
  const g = withTable("sequence");
  const t = (() => { try { return aidModel(g, g.bots[0]).tables.at(-1); } catch { return {}; } })();
  assert.match(t.how ?? "", /Work down the steps in order/);
  const html = (() => { try { return Object.fromEntries(buildFiles(g, { toMermaid, toMarkdown, toPolicyYaml }))["kit/tan-war.crown.nonplayer.html"] ?? ""; } catch { return ""; } })();
  assert.match(html, /Work down ❶ to ❷ in order, each as far as possible\./);
  const f = withTable();
  assert.match(toMarkdown(aidModel(f, f.bots[0])) ?? "", /The first step with a match wins\./);
});
