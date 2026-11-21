import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { buildFiles } from "../src/kit.mjs";
import { toMermaid, toMarkdown, toPolicyYaml } from "../src/botaid.mjs";

const example = () => JSON.parse(readFileSync(new URL("../examples/tan-war.game.json", import.meta.url), "utf8"));
const files = (g) => Object.fromEntries(buildFiles(g, { toMermaid, toMarkdown, toPolicyYaml }));

test("a draft export marks every file DRAFT", () => {
  const out = files(example());
  for (const [p, t] of Object.entries(out)) {
    if (p.endsWith(".game.json")) assert.match(t, /"status": "draft"/, p);
    else assert.match(t, /DRAFT|"draft": true/, p);
  }
});

test("a confirmed export carries no DRAFT mark", () => {
  const g = example(); g.meta.status = "final"; g.meta.confirmedAt = "2026-11-20T10:00:00Z";
  for (const [p, t] of Object.entries(files(g))) assert.doesNotMatch(t, /DRAFT|"draft": true/, p);
});

test("the kit has a faction aid per faction and a rendered flowchart per bot", () => {
  const g = example(), out = files(g);
  for (const f of g.factions) {
    const aid = out[`kit/${g.meta.gameId}.${f.id}.aid.html`];
    for (const id of f.operations) assert.ok(aid.includes(g.actions.find((a) => a.id === id).name));
  }
  for (const b of g.bots) assert.match(out[`bots/${g.meta.gameId}.${b.factionId}.flow.svg`], /^<svg[^>]*role="img"/);
});

test("printed pieces use one shape per faction, so they read in grayscale", () => {
  const c = files(example())["kit/tan-war.counters.html"];
  assert.ok(c.includes("<rect") && c.includes("<circle"));
});

test("parity: an edit reaches game.json, the rulebook, the setup sheet and the bot policy", () => {
  const g = example();
  g.factions[0].name = "Kingdom Forces";
  g.actions.find((a) => a.id === "crown.garrison").name = "Fortify Towns";
  const out = files(g), id = g.meta.gameId;
  for (const p of [`${id}.game.json`, `kit/${id}.rulebook.md`, `kit/${id}.setup-sheet.md`, `bots/${id}.crown.policy.yaml`]) assert.ok(out[p].includes("Kingdom Forces"), p);
  for (const p of [`${id}.game.json`, `kit/${id}.rulebook.md`, `bots/${id}.crown.policy.yaml`, `kit/${id}.crown.aid.html`]) assert.ok(out[p].includes("Fortify Towns"), p);
});

test("a board background image is drawn under the spaces", () => {
  const g = example(); g.board.presentation.background = { href: "data:image/png;base64,AAAA", opacity: 0.5 };
  const svg = files(g)["kit/tan-war.board.svg"];
  assert.ok(svg.indexOf("<image") > 0 && svg.indexOf("<image") < svg.indexOf("<line"));
});

// Known issue 3. Compared with a printed GMT faction aid (Colonial Twilight, FLN sheet,
// examples/player-aid-sheets/Colonial_Twilight_FLN_Faction_Sheet.jpg): Operations, then Special
// Activities, then Victory for every faction with the final-scoring rule. Each action reads
// Location, Cost, Procedure. Sections that sheet does not show come after Victory.
test("the faction aid follows the section order of a printed GMT faction aid", () => {
  const g = example(), out = files(g);
  for (const f of g.factions) {
    const aid = out[`kit/${g.meta.gameId}.${f.id}.aid.html`];
    const h2 = [...aid.matchAll(/<h2>([^<]*)<\/h2>/g)].map((m) => m[1]);
    assert.deepEqual(h2, ["3.0 Operations", "4.0 Special Activities", "7.0 Victory", "Forces", "Sequence of play", `At each ${g.rules.scoring.name} card`], f.id);
    const op = aid.slice(aid.indexOf("<h3>"));
    const at = ["<b>Location:</b>", "<b>Cost:</b>", "<b>Procedure:</b>"].map((x) => op.indexOf(x));
    assert.ok(at.every((x, i) => x > 0 && (i === 0 || x > at[i - 1])), `${f.id} action fields ${at}`);
    const vic = aid.slice(aid.indexOf("7.0 Victory"), aid.indexOf("<h2>Forces"));
    for (const x of g.factions) assert.ok(vic.includes(`<b>${x.name}:</b>`), `${f.id} victory lists ${x.name}`);
    assert.ok(vic.includes(g.victory.finalScoring));
  }
});

// Known issue 4: a one-page print test sheet with true-size items, to check a print on paper.
test("the kit has a print test sheet with a 50 mm ruler, a card and a counter at true size", () => {
  const g = example(), out = files(g);
  const t = out[`kit/${g.meta.gameId}.print-test.html`];
  assert.ok(t, "print test sheet exists");
  assert.match(t, /class="ruler"[^>]*width="50mm"/);
  assert.match(t, /class="card-size"[^>]*style="width:63mm;height:88mm"/);
  assert.match(t, /class="counter-size"[^>]*style="width:15mm;height:15mm"/);
  assert.match(t, /100 %/);
  assert.match(t, /Letter/); assert.match(t, /A4/);
});
