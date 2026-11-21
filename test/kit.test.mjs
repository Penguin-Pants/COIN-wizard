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

// The player faction sheet mirrors the printed GMT faction sheets in examples/player-faction-sheets/
// (Andean Abyss, A Distant Plain, Colonial Twilight). Front page: an Operations column and a Special
// Activities column of boxes, then a Victory box for every faction with this faction's row marked.
// Op boxes: Purpose, Location, Cost, Procedure and a "+ ... ?" pairing tag. Special Activity boxes:
// Purpose, Accompanying Op, Location, Cost, Procedure and a "max N space" tag. The back page holds
// what the front sheet does not show.
const sheet = (g, f) => files(g)[`kit/${g.meta.gameId}.${f.id}.aid.html`];
const front = (html) => html.slice(0, html.indexOf('class="page back"'));
const box = (html, name) => { const i = html.indexOf(`<h3>${name}`); return html.slice(i, html.indexOf("</section>", i)); };

test("the faction sheet front has an Operations column, a Special Activities column and a Victory box", () => {
  const g = example();
  for (const f of g.factions) {
    const fr = front(sheet(g, f));
    const h2 = [...fr.matchAll(/<h2>([^<]*)<\/h2>/g)].map((m) => m[1]);
    assert.deepEqual(h2, [f.type === "state" ? "COIN Operations" : "Insurgent Operations", "Special Activities"], f.id);
    assert.ok(fr.indexOf('class="col ops"') < fr.indexOf('class="col sas"'));
    assert.ok(fr.indexOf("<h3>Victory (8)") > fr.indexOf('class="col sas"'), "Victory closes the Special Activities column");
    const vic = box(fr, "Victory");
    for (const x of g.factions) assert.ok(vic.includes(`<b>${x.name}:</b>`), `${f.id} victory lists ${x.name}`);
    assert.match(vic, new RegExp(`<p class="mine"><b>${f.name}:</b>`));
    assert.ok(vic.includes(g.victory.finalScoring));
  }
});

test("an Operation box reads Purpose, Location, Cost, Procedure and shows its rule section and pairing", () => {
  const g = example(), f = g.factions[0];
  const op = box(front(sheet(g, f)), "Garrison");
  assert.match(op, /<h3>Garrison <small>\(5\.1\.1\)<\/small>/);
  assert.match(op, /<span class="tag">\+ any Special Activity\?<\/span>/);
  const at = ["<b>Purpose:</b>", "<b>Location:</b>", "<b>Cost:</b>", "<b>Procedure:</b>"].map((x) => op.indexOf(x));
  assert.ok(at.every((x, i) => x > 0 && (i === 0 || x > at[i - 1])), `fields ${at}`);
});

test("a legal-space filter of true reads Any space", () => {
  const g = example(), f = g.factions[0];
  g.actions.find((a) => a.id === "crown.martial-law").targets = true;
  assert.match(box(front(sheet(g, f)), "Martial Law"), /<b>Location:<\/b> Any space\./);
});

test("a Special Activity box shows Accompanying Op and its space limit", () => {
  const g = example(), f = g.factions[0];
  const sa = box(front(sheet(g, f)), "Martial Law");
  assert.match(sa, /<span class="tag">max 1 space<\/span>/);
  const at = ["<b>Purpose:</b>", "<b>Accompanying Op:</b> Any.", "<b>Location:</b>", "<b>Procedure:</b>"].map((x) => sa.indexOf(x));
  assert.ok(at.every((x, i) => x > 0 && (i === 0 || x > at[i - 1])), `fields ${at}`);
});

test("a pairing list names the Operations, and Operations name the Special Activities that go with them", () => {
  const g = example(), f = g.factions[0];
  g.actions.find((a) => a.id === "crown.martial-law").accompanies = ["crown.garrison", "crown.crackdown"];
  // A second Special Activity that goes with Sweep only. All Special Activities with an Operation: "any".
  g.actions.push({ ...structuredClone(g.actions.find((a) => a.id === "crown.martial-law")), id: "crown.raid", name: "Raid", accompanies: ["crown.sweep"] });
  f.specialActivities.push("crown.raid");
  const fr = front(sheet(g, f));
  assert.match(box(fr, "Martial Law"), /<b>Accompanying Op:<\/b> Garrison or Crackdown\./);
  assert.match(box(fr, "Garrison"), /<span class="tag">\+ Martial Law\?<\/span>/);
  assert.match(box(fr, "Sweep"), /<span class="tag">\+ Raid\?<\/span>/);
  g.actions.find((a) => a.id === "crown.raid").accompanies = "any";
  assert.match(box(front(sheet(g, f)), "Garrison"), /<span class="tag">\+ any Special Activity\?<\/span>/);
});

test("the faction sheet back holds forces, the sequence of play and scoring", () => {
  const g = example(), f = g.factions[0], html = sheet(g, f);
  const back = html.slice(html.indexOf('class="page back"'));
  const h2 = [...back.matchAll(/<h2>([^<]*)<\/h2>/g)].map((m) => m[1]);
  assert.deepEqual(h2, ["Forces", "Sequence of play", `At each ${g.rules.scoring.name} card`]);
});

test("the rulebook prints each action's rule section", async () => {
  const { rulebookMd } = await import("../src/kit.mjs");
  const r = rulebookMd(example());
  assert.match(r, /### 5\.1 Crown/);
  assert.match(r, /\*\*Garrison\*\* \(5\.1\.1, Operation/);
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

test("a markerSet step in a scoring phase also prints its marker", async () => {
  const { spaceMarkers } = await import("../src/kit.mjs");
  const g = example();
  g.rules.scoring.phases[0].steps.push({ op: "markerSet", marker: "truce", value: true, space: "dublin" });
  assert.deepEqual(spaceMarkers(g).map((m) => m.id).sort(), ["curfew", "truce"]);
});

test("no pairing tag prints while any Special Activity of the faction leaves its pairing unstated", () => {
  const g = example(), f = g.factions[0];
  g.actions.find((a) => a.id === "crown.martial-law").accompanies = ["crown.garrison"];
  const raid = { ...structuredClone(g.actions.find((a) => a.id === "crown.martial-law")), id: "crown.raid", name: "Raid" };
  delete raid.accompanies;
  g.actions.push(raid); f.specialActivities.push("crown.raid");
  const fr = front(sheet(g, f));
  assert.doesNotMatch(box(fr, "Sweep"), /class="tag"/);
  assert.doesNotMatch(box(fr, "Garrison"), /class="tag"/);
});
