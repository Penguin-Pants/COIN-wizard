import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { validate } from "../src/validate.mjs";
import { migrate, LATEST } from "../src/migrate.mjs";
import { deriveState, applyPatch } from "../src/state.mjs";
import { runBot } from "../src/dryrun.mjs";

// Schema 1.10.0, gap 11 (docs/research/bot-patterns): an Event override may hold a node. The bot
// runs the steps of the side it plays; the node's table picks every space a step needs, and its
// optional target table picks the enemy first. The override's plain text is the label.
const read = (rel) => JSON.parse(readFileSync(new URL(rel, import.meta.url), "utf8"));
const tan = () => read("../examples/tan-war.game.json");
const valleys = () => read("../examples/four-valleys.game.json");
const cube = { op: "add", args: [{ op: "count", args: ["crown.army", { var: "$space.id" }, "*"] }, { op: "count", args: ["crown.police", { var: "$space.id" }, "*"] }] };
const active = (id) => ({ op: "count", args: ["ira.volunteer", id, "active"] });

test("the latest version is 1.10.0, and a frozen 1.9.0 file migrates with only its version changed", () => {
  assert.equal(LATEST, "coin-game/1.10.0");
  const old = read("./fixtures/tan-war.1.9.0.game.json");
  assert.equal(old.meta.schemaVersion, "coin-game/1.9.0");
  const m = migrate(old);
  assert.equal(m.meta.schemaVersion, "coin-game/1.10.0");
  assert.deepEqual(validate(m).errors, []);
  m.meta.schemaVersion = old.meta.schemaVersion; assert.deepEqual(m, old);
});

// Crown bot, card e01 (Flying Column), unshaded: "in one space with a Crown cube, remove all Active
// Volunteers". Dublin and Cork City both qualify. The table's first step (cubes outnumber Active
// Volunteers) ranks only Cork City.
// After the Event, a check node proves the board changed: no Active Volunteer is left in Cork City.
function flyingColumn({ node = { table: "cw.t.crack" } } = {}) {
  const g = tan(), b = g.bots[0];
  const ov = b.eventPolicy.overrides.find((o) => o.cardId === "e01");
  if (node) ov.node = node; else delete ov.node;
  const ev = b.nodes.find((n) => n.kind === "event-check");
  b.nodes.push({ id: "cw.proof", kind: "condition", text: "No Active Volunteer in Cork City.", test: { op: "eq", args: [active("cork-city"), 0] }, yes: ev.yes, no: "cw.proof-no" }, { id: "cw.proof-no", kind: "end", outcome: "pass", text: "Proof failed." });
  ev.yes = "cw.proof";
  const patch = { card: { id: "e01", hasEffect: true }, clearPieces: ["crown.army", "crown.police", "ira.volunteer"], spaces: { dublin: { pieces: { "ira.volunteer": { active: 1 }, "crown.army": { "*": 1 } } }, "cork-city": { pieces: { "ira.volunteer": { active: 2 }, "crown.police": { "*": 3 } } } } };
  return { g, b, patch };
}

test("an Event override node runs the side's steps, with spaces from its table", () => {
  const { g, b, patch } = flyingColumn();
  const s = applyPatch(deriveState(g, "crown"), patch);
  assert.equal(s.spaces["cork-city"].pieces["ira.volunteer"].active, 2, "the patch sets the board");
  const r = runBot(g, b, s);
  assert.equal(r.side, "unshaded");
  assert.deepEqual(r.chosen, ["cork-city"], "the table picks the one space the side needs");
  assert.equal(r.outcome, "event", "the Event removed the Active Volunteers, so the proof holds");
  assert.equal(s.spaces["cork-city"].pieces["ira.volunteer"].active, 2, "the dry run does not change its input");
});

test("without a node, the Event changes nothing on the board, as before", () => {
  const { g, b, patch } = flyingColumn({ node: null });
  const r = runBot(g, b, applyPatch(deriveState(g, "crown"), patch));
  assert.deepEqual(r.chosen, []);
  assert.equal(r.outcome, "pass", "the Active Volunteers stay, so the proof fails");
});

test("an override node validates, and its table counts as used", () => {
  const { g, b } = flyingColumn();
  b.priorityTables.push({ id: "cw.t.ev", scope: "space", select: "one", steps: [{ n: 1, text: "Any space.", filter: true }], tiebreak: [] });
  assert.ok(validate(g).warnings.some((w) => w.code === "unused-table" && w.message.includes("cw.t.ev")));
  b.eventPolicy.overrides.find((o) => o.cardId === "e01").node = { table: "cw.t.ev" };
  const v = validate(g);
  assert.deepEqual(v.errors.filter((e) => e.path.includes("overrides")), []);
  assert.ok(!v.warnings.some((w) => w.code === "unused-table" && w.message.includes("cw.t.ev")));
});

test("the validator rejects a bad override node", () => {
  const codes = (mut) => { const { g, b } = flyingColumn(); mut(b, b.eventPolicy.overrides.find((o) => o.cardId === "e01")); return validate(g).errors.filter((e) => e.path.includes("overrides")).map((e) => e.code); };
  assert.deepEqual(codes((b, o) => { o.directive = "ignore"; delete o.when; }), ["override"], "a never-play override runs no node");
  assert.deepEqual(codes((b, o) => { o.node.table = "nope"; }), ["missing-ref"]);
  assert.deepEqual(codes((b, o) => { o.node.extra = 1; }), ["schema"]);
  assert.deepEqual(codes((b, o) => { o.node.target = "cw.t.crack"; }), ["bad-target"], "a target table picks an enemy");
  assert.deepEqual(codes((b, o) => { b.priorityTables.push({ id: "cw.t.foe", scope: "opponent", select: "one", steps: [{ n: 1, text: "Any enemy.", filter: true }], tiebreak: [] }); o.node.table = "cw.t.foe"; }), ["bad-target"], "a space table picks the spaces");
});

test("the targets text needs no warning when a node expresses the choice", () => {
  const { g, b } = flyingColumn({ node: null });
  const ov = b.eventPolicy.overrides.find((o) => o.cardId === "e01");
  ov.targets = "The space with the most Active Volunteers.";
  const solo = () => validate(g).warnings.filter((w) => w.code === "solo" && w.path.includes("overrides"));
  assert.equal(solo().length, 1);
  ov.node = { table: "cw.t.crack" };
  assert.equal(solo().length, 0);
});

// Four Valleys, bot f1: a card side with one option per enemy. The target table picks the enemy
// (ra.enemy: not on the state side, then the highest margin, then a die), and the side runs that
// enemy's option.
test("an override node with a target runs the side's option for the picked enemy", () => {
  const g = valleys(), b = g.bots[0], card = g.deck.cards.find((c) => c.type === "event");
  const enemies = g.factions.filter((f) => f.id !== b.factionId);
  card.sides[0].steps = [{ op: "choose", options: enemies.map((f) => ({ label: f.id, faction: f.id, steps: [{ op: "gain", track: f.resourceTrack, amount: 5 }] })) }];
  b.priorityTables.push({ id: "ra.any", scope: "space", select: "one", steps: [{ n: 1, text: "Any space.", filter: true }], tiebreak: [] });
  b.eventPolicy.overrides = [{ cardId: card.id, directive: "force", plain: "Hit the leading enemy.", node: { table: "ra.any", target: "ra.enemy" } }];
  assert.deepEqual(validate(g).errors.filter((e) => e.path.includes("overrides")), []);
  const s = deriveState(g, b.factionId), before = { ...s.resources };
  // Proof node: exactly one enemy gained 5.
  const ev = b.nodes.find((n) => n.kind === "event-check");
  const r = runBot(g, b, applyPatch(s, { card: { id: card.id, hasEffect: true }, dice: [1, 1, 1] }));
  assert.ok(enemies.some((f) => f.id === r.target), `target ${r.target} is an enemy`);
  for (const f of enemies) {
    const gained = { op: "eq", args: [{ var: `resources.${f.id}` }, Math.min(before[f.id] + 5, g.tracks.find((t) => t.id === f.resourceTrack).max)] };
    const h = structuredClone(g), hb = h.bots[0], he = hb.nodes.find((n) => n.id === ev.id);
    hb.nodes.push({ id: "ra.proof", kind: "condition", text: "Proof.", test: gained, yes: he.yes, no: "ra.pass" });
    he.yes = "ra.proof";
    assert.equal(runBot(h, hb, applyPatch(s, { card: { id: card.id, hasEffect: true }, dice: [1, 1, 1] })).outcome, f.id === r.target ? "event" : "pass", `${f.id} gains only if it is the target`);
  }
});

// Print kit: the override's plain text stays the label; the line adds the table label (bot code
// and table number, as on the Operation boxes), so a player finds the priorities on the sheet.
import { buildFiles } from "../src/kit.mjs";
import { toMermaid, toMarkdown, toPolicyYaml, tableLabels } from "../src/botaid.mjs";
test("the Non-Player sheet prints an override node's table label after its text", () => {
  const { g, b } = flyingColumn();
  const html = Object.fromEntries(buildFiles(g, { toMermaid, toMarkdown, toPolicyYaml }))[`kit/${g.meta.gameId}.crown.nonplayer.html`];
  const evi = html.slice(html.indexOf('class="evi"'));
  const ov = b.eventPolicy.overrides.find((o) => o.cardId === "e01");
  assert.ok(evi.includes(`${ov.plain} (play the unshaded side) <i>Priorities: ${tableLabels(b)["cw.t.crack"]}.</i>`));
  const other = b.eventPolicy.overrides.find((o) => o.cardId !== "e01");
  assert.ok(evi.includes(`${other.plain} (play the ${other.side} side)</p>`), "an override without a node prints as before");
});

test("the bot aid names the override node's table in the Event exceptions", () => {
  const { g, b } = flyingColumn();
  const md = Object.fromEntries(buildFiles(g, { toMermaid, toMarkdown, toPolicyYaml }))[`bots/${g.meta.gameId}.crown.aid.md`];
  assert.ok(md, "the aid exists");
  assert.match(md, new RegExp(`Priorities: Table ${tableLabels(b)["cw.t.crack"]}\\.`));
});
