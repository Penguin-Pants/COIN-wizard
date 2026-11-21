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

// Non-Player sheet: one page in the layout of the GMT Non-Player sheets (examples/non-player-bot-sheets/).
// Event? box top left, condition diamonds down the left, Operation boxes in the middle, Special
// Activity boxes on the right, Event Instructions at the bottom. Built from the bot data only.
const np = (g, b) => files(g)[`kit/${g.meta.gameId}.${b.factionId}.nonplayer.html`] ?? "";
const opBox = (html, name) => { const i = html.indexOf(`<h3>${name}`, html.indexOf('class="col ops"')); return i < 0 ? "" : html.slice(i, html.indexOf("</section>", i)); };
const saBox = (html, name) => { const i = html.indexOf(`<h3>${name}`, html.indexOf('class="col sas"')); return i < 0 ? "" : html.slice(i, html.indexOf("</section>", i)); };

test("the kit has a one-page Non-Player sheet per bot and keeps the bot aids", () => {
  for (const id of ["tan-war", "harbor-strike", "four-valleys"]) {
    const g = JSON.parse(readFileSync(new URL(`../examples/${id}.game.json`, import.meta.url), "utf8")), out = files(g);
    for (const b of g.bots) {
      const html = np(g, b);
      assert.ok(html, `${id} ${b.factionId} Non-Player sheet`);
      assert.equal((html.match(/class="page/g) ?? []).length, 1);
      assert.match(html, new RegExp(`<h1>Non-Player ${g.factions.find((f) => f.id === b.factionId).name}</h1>`));
      for (const ext of ["aid.md", "aid.html", "flow.svg", "policy.yaml"]) assert.ok(out[`bots/${id}.${b.factionId}.${ext}`], ext);
    }
  }
});

test("the Event? box sits top left and states when to play the Event and which side", () => {
  const g = example(), b = g.bots[1], html = np(g, b);
  const at = html.indexOf('class="box evt"');
  assert.ok(at > 0 && at < html.indexOf('class="dia"') && at < html.indexOf('class="col ops"'));
  const evt = html.slice(at, html.indexOf("</section>", at));
  assert.match(evt, /<h3>Event\?<\/h3>/);
  assert.match(evt, /Play the shaded side if/);
  assert.match(evt, /the card has an effect for this faction/);
  // A condition that runs before the Event check (here: Eligible?) reads first, inside the Event? box.
  assert.match(evt, /<p class="gate">Is Republic Eligible\? <b>Yes<\/b> → Event\? <b>No<\/b> → No action<\/p>[\s\S]*Play the shaded side/);
});

test("condition diamonds run down the left in flowchart order with Yes and No arrows", () => {
  const g = example(), html = np(g, g.bots[1]);
  const qs = [...html.matchAll(/<div class="dia"><p class="q">([^<]*)<\/p>/g)].map((m) => m[1]);
  assert.deepEqual(qs, ["Republic Resources below 1?", "Fewer than 7 Volunteers on the map?"]);
  const q = html.indexOf('<p class="q">Fewer than 7 Volunteers');
  const d = html.slice(q, html.indexOf("</div>", q));
  assert.match(d, /<b>Yes<\/b> → Rally/);
  assert.match(d, /<b>No<\/b> → Attack/);
});

test("an Operation box numbers its priorities and shades its lettered tie-breaks", () => {
  const g = example(), op = opBox(np(g, g.bots[1]), "Rally");
  assert.ok(op.indexOf("❶ Space at Opposition") > 0 && op.indexOf("❷ Space with an HQ.") > op.indexOf("❶") && op.indexOf("❸ Any legal space.") > op.indexOf("❷"));
  const tb = op.slice(op.indexOf('<div class="tb">'));
  assert.ok(op.includes('<div class="tb">'), "tie-breaks are shaded");
  assert.ok(tb.indexOf("ⓐ Highest Pop.") > 0 && tb.indexOf("ⓑ Fewest Crown cubes.") > tb.indexOf("ⓐ"));
  assert.match(op, /<span class="tag">max 1<\/span>/);
});

test("an if-none arrow points to the node that runs when no space is legal", () => {
  const g = example(), html = np(g, g.bots[1]);
  assert.match(opBox(html, "Rally"), /<b>if none<\/b> → Attack/);
  assert.match(opBox(html, "Attack"), /<b>if none<\/b> → March/);
  assert.match(opBox(html, "March"), /<b>if none<\/b> → Pass/);
});

test("a then or with arrow leads to one Special Activity box with its priorities and skip text", () => {
  const g = example(), b = g.bots[0];
  let html = np(g, b);
  assert.match(opBox(html, "Crackdown"), /<b>then<\/b> → Martial Law/);
  assert.match(opBox(html, "Garrison"), /<b>then<\/b> → Martial Law/);
  assert.doesNotMatch(opBox(html, "Sweep"), /→ Martial Law/);
  const sas = html.slice(html.indexOf('class="col sas"'));
  assert.equal((sas.match(/<h3>Martial Law/g) ?? []).length, 1, "one box for the same linked Special Activity");
  const sa = saBox(html, "Martial Law");
  assert.match(sa, /❶ /);
  assert.match(sa, /Skip Martial Law if Resources are below 3 or no space qualifies\./);
  b.nodes.find((n) => n.id === "cw.crack").linked.timing = "during";
  html = np(g, b);
  assert.match(opBox(html, "Crackdown"), /<b>with<\/b> → Martial Law/);
});

test("Event Instructions list every override with its card title and plain text", () => {
  const g = example(), b = g.bots[1], html = np(g, b);
  const at = html.indexOf('class="evi"');
  assert.ok(at > html.indexOf('class="col sas"'), "at the bottom");
  const evi = html.slice(at);
  assert.match(evi, /<h2>Event Instructions<\/h2>/);
  for (const o of b.eventPolicy.overrides) {
    const title = g.deck.cards.find((c) => c.id === o.cardId).title;
    assert.ok(evi.includes(`<b>${title}:</b> ${o.plain}`), o.cardId);
  }
});

test("an Operation that picks an enemy first prints its Target priorities", () => {
  const g = JSON.parse(readFileSync(new URL("../examples/harbor-strike.game.json", import.meta.url), "utf8"));
  const b = g.bots[0], op = opBox(np(g, b), "Deploy");
  const t = b.priorityTables.find((x) => x.id === b.nodes.find((n) => n.target).target);
  assert.ok(op.indexOf("<b>Target:</b>") > 0 && op.indexOf(`❶ ${t.steps[0].text}`) > op.indexOf("<b>Target:</b>"));
});

// Codex review of PR 4: the printed max follows the action's maxSpaces, the sheet defines the bot's
// terms (measures), and each tie-break states which value wins.
test("a Special Activity box prints the smaller of the table limit and the action's maxSpaces", () => {
  const g = example(), t = g.bots[0].priorityTables.find((x) => x.id === "cw.t.law");
  t.select = "all"; t.limit = 2;
  assert.equal(g.actions.find((a) => a.id === "crown.martial-law").maxSpaces, 1);
  assert.match(saBox(np(g, g.bots[0]), "Martial Law"), /<span class="tag">max 1<\/span>/);
});

test("the Non-Player sheet defines every term the bot uses", () => {
  const g = example(), b = g.bots[0], html = np(g, b);
  const terms = html.slice(html.indexOf('class="terms"'));
  assert.ok(html.includes('class="terms"'), "terms section");
  for (const m of b.measures) assert.ok(terms.includes(`<b>${m.name}:</b> ${m.plain}`), m.id);
});

test("each tie-break states whether the highest or the lowest value wins", () => {
  const g = example(), b = g.bots[1], t = b.priorityTables.find((x) => x.id === "ib.t.rally");
  t.tiebreak[1].text = "Crown cubes."; t.tiebreak[1].order = "min";
  const op = opBox(np(g, b), "Rally");
  assert.match(op, /ⓐ Highest Pop\. \(highest wins\)/);
  assert.match(op, /ⓑ Crown cubes\. \(lowest wins\)/);
});

// Codex review of PR 4, round 2: arrows name the table of the box they lead to, and a table that
// selects several spaces breaks its last ties by space name, not by the die (pick in src/dryrun.mjs).
test("an arrow to a Special Activity names the table of the box it leads to", () => {
  const g = example(), b = g.bots[0];
  b.priorityTables.push({ ...structuredClone(b.priorityTables.find((t) => t.id === "cw.t.law")), id: "cw.t.law2" });
  b.nodes.find((n) => n.id === "cw.garrison").linked.table = "cw.t.law2";
  const html = np(g, b), labels = Object.fromEntries(b.priorityTables.map((t, i) => [t.id, `CW-${i + 1}`]));
  assert.match(opBox(html, "Crackdown"), new RegExp(`<b>then</b> → Martial Law \\(${labels["cw.t.law"]}\\)`));
  assert.match(opBox(html, "Garrison"), new RegExp(`<b>then</b> → Martial Law \\(${labels["cw.t.law2"]}\\)`));
});

test("a box that selects several spaces says leftover ties go by space name", () => {
  const g = example(), html = np(g, g.bots[0]);
  assert.match(opBox(html, "Crackdown"), /Still tied: take spaces in alphabetical order of name\./);
  assert.doesNotMatch(opBox(html, "Garrison"), /alphabetical/);
  assert.match(html, /<p class="foot">Ties after the lettered tie-breaks, when one space or faction is chosen:/);
});
