import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { validate } from "../src/validate.mjs";
import { buildFiles } from "../src/kit.mjs";
import { toMermaid, toMarkdown, toPolicyYaml } from "../src/botaid.mjs";

// Schema 1.5.0: optional spaceText on a Special Activity, printed on the faction sheet in place of
// "max N spaces" (GMT: "among 3 spaces", "1 space to 1 space"). Owner decision: approved for 1.5.0.
const example = () => JSON.parse(readFileSync(new URL("../examples/tan-war.game.json", import.meta.url), "utf8"));
const act = (g, id) => g.actions.find((a) => a.id === id);
const sheet = (g) => { try { return Object.fromEntries(buildFiles(g, { toMermaid, toMarkdown, toPolicyYaml }))[`kit/${g.meta.gameId}.crown.aid.html`] ?? ""; } catch { return ""; } };
const saBox = (html, name) => { const i = html.indexOf(`<h3>${name}`); return i < 0 ? "" : html.slice(i, html.indexOf("</section>", i)); };

test("a Special Activity accepts spaceText; an empty one is a schema error", () => {
  const g = example();
  act(g, "crown.martial-law").spaceText = "among 3 spaces";
  assert.deepEqual(validate(g).errors, []);
  act(g, "crown.martial-law").spaceText = "";
  assert.ok(validate(g).errors.some((e) => e.code === "schema"));
});

test("spaceText belongs to Special Activities only", () => {
  const g = example();
  act(g, "crown.garrison").spaceText = "1 space to 1 space";
  assert.ok(validate(g).errors.some((e) => e.code === "sa-only" && e.path.endsWith("/spaceText")));
});

test("the faction sheet prints spaceText in place of max N spaces", () => {
  const g = example();
  assert.match(saBox(sheet(g), "Martial Law"), /max 1 space/);
  act(g, "crown.martial-law").spaceText = "among 3 spaces";
  const box = saBox(sheet(g), "Martial Law");
  assert.match(box, /among 3 spaces/);
  assert.doesNotMatch(box, /max 1 space/);
});
