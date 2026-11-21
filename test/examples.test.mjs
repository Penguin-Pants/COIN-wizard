import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { validate } from "../src/validate.mjs";
import { buildFiles } from "../src/kit.mjs";
import { toMermaid, toMarkdown, toPolicyYaml } from "../src/botaid.mjs";
import { runDry } from "../src/botedit.mjs";

const dir = new URL("../examples/", import.meta.url);
const files = readdirSync(dir).filter((f) => f.endsWith(".game.json"));
const load = (f) => JSON.parse(readFileSync(new URL(f, dir), "utf8"));

test("the shipped examples cover 2, 3 and 4 factions", () => {
  assert.deepEqual(files.map((f) => load(f).factions.length).sort(), [2, 3, 4]);
});

for (const f of files) {
  test(`${f} validates with no errors`, () => assert.deepEqual(validate(load(f)).errors, []));
  test(`${f} runs every dry run with the expected result`, () => {
    const g = load(f);
    for (const b of g.bots) for (const d of b.dryRuns) {
      const r = runDry(g, b, d);
      assert.equal(r.error, undefined, `${b.id} ${d.id}`);
      assert.equal(r.outcome, d.expect.outcome, `${b.id} ${d.id}`);
    }
  });
  test(`${f} exports a complete kit for every faction`, () => {
    const g = load(f);
    const out = Object.fromEntries(buildFiles(g, { toMermaid, toMarkdown, toPolicyYaml }));
    const id = g.meta.gameId;
    for (const k of ["rulebook.md", "setup-sheet.md", "board.svg", "cards.html", "counters.html", "components.md"]) assert.ok(out[`kit/${id}.${k}`], k);
    for (const fc of g.factions) {
      assert.ok(out[`kit/${id}.rulebook.md`].includes(fc.name), `rulebook names ${fc.name}`);
      assert.ok(out[`kit/${id}.setup-sheet.md`].includes(fc.name), `setup sheet names ${fc.name}`);
      assert.ok(out[`kit/${id}.counters.html`].includes(`${fc.name} Eligibility marker`), `eligibility marker for ${fc.name}`);
    }
    for (const b of g.bots) assert.ok(out[`bots/${id}.${b.factionId}.aid.md`]);
  });
}

test("one example uses a custom mechanic: a new track and an action that uses it", () => {
  const g = load("harbor-strike.game.json");
  const owned = new Set(g.factions.map((f) => f.resourceTrack));
  const custom = g.tracks.filter((t) => !owned.has(t.id));
  assert.ok(custom.length >= 1);
  assert.ok(g.actions.some((a) => JSON.stringify(a.steps).includes(`"${custom[0].id}"`)));
});

test("one example has an Event-specific bot exception with a dry run for it", () => {
  const g = load("harbor-strike.game.json");
  const b = g.bots.find((x) => x.eventPolicy.overrides.length);
  assert.ok(b);
  assert.ok(b.dryRuns.some((d) => d.case === "event-override" && d.patch.card?.id === b.eventPolicy.overrides[0].cardId));
});
