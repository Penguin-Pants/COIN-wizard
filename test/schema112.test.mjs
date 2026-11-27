import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import Ajv2020 from "ajv/dist/2020.js";
import { validate, tableUsers } from "../src/validate.mjs";
import { migrate, LATEST } from "../src/migrate.mjs";
import { deriveState, applyPatch } from "../src/state.mjs";
import { runBot, botNodes } from "../src/dryrun.mjs";
import { addNode, setCardMode, addBotCard, deleteBotCard, addBack, deleteBack } from "../src/botedit.mjs";
import { aidModel, toMarkdown, toMermaid } from "../src/botaid.mjs";
import { nonPlayerSheetHtml } from "../src/kit.mjs";
import { graphSvg } from "../src/graphsvg.mjs";
import { seededRandom } from "../src/deck.mjs";

// Schema 1.12.0, card-driven bots (docs/proposals/card-bots.md), added in parts.
// Part A (owner decisions Q1, Q2, Q8, Q10 on 2026-11-26, turn start and empty deck on 2026-11-27):
// bot.mode "cards" and bot.deck. Each card side is a small flowchart. The exit $draw draws the next
// card and runs its face-up side; $flip runs the other side. A turn that draws every card passes.
const read = (rel) => JSON.parse(readFileSync(new URL(rel, import.meta.url), "utf8"));
const tan = () => read("../examples/tan-war.game.json");
const schemaCheck = () => new Ajv2020({ allErrors: true, strict: false }).compile(read("../schema/coin-game.schema.json"));

// The Crown bot of Tan War as a card bot. Its flowchart keeps the Eligible and Event checks; "no Event"
// draws a card. Card k1 has two sides: front A tries Crackdown, and flips to back AA below 1 Resource.
// Card k2 has one side: Garrison. Each Operation that finds no space draws the next card.
function cardGame() {
  const g = tan(), b = g.bots[0], byId = Object.fromEntries(b.nodes.map((n) => [n.id, n]));
  const { linked } = byId["cw.garrison"];
  b.mode = "cards";
  b.nodes = b.nodes.filter((n) => ["cw.start", "cw.end-none", "cw.event", "cw.end-event"].includes(n.id));
  b.nodes.find((n) => n.id === "cw.event").no = "$draw";
  b.deck = { order: "cycle", cards: [
    { id: "k1", title: "Crackdown", sides: [
      { id: "front", label: "A", start: "k1.a.low", nodes: [
        { id: "k1.a.low", kind: "condition", text: "Crown Resources below 1?", test: { op: "lt", args: [{ var: "self.resources" }, 1] }, yes: "$flip", no: "k1.a.crack" },
        { id: "k1.a.crack", kind: "action", text: "Crackdown (CW-1).", action: "crown.crackdown", table: "cw.t.crack", then: "k1.a.done", onEmpty: "$draw" },
        { id: "k1.a.done", kind: "end", text: "Operation done.", outcome: "operation" }] },
      { id: "back", label: "AA", start: "k1.b.pass", nodes: [{ id: "k1.b.pass", kind: "end", text: "Pass.", outcome: "pass" }] }] },
    { id: "k2", title: "Garrison", sides: [
      { id: "front", label: "B", start: "k2.garrison", nodes: [
        { id: "k2.garrison", kind: "action", text: "Garrison (CW-2).", action: "crown.garrison", table: "cw.t.garrison", then: "k2.done", onEmpty: "$draw", linked },
        { id: "k2.done", kind: "end", text: "Operation done.", outcome: "operation" }] }] }] };
  b.dryRuns = [];
  return g;
}
const run = (g, patch = {}) => runBot(g, g.bots[0], applyPatch(deriveState(g, g.bots[0].factionId), patch));
const codes = (g) => validate(g).errors.map((e) => e.code);

test("a frozen 1.11.0 file migrates with only its version changed", () => {
  assert.equal(LATEST, "coin-game/1.12.0");
  const old = read("./fixtures/tan-war.1.11.0.game.json");
  assert.equal(old.meta.schemaVersion, "coin-game/1.11.0");
  const m = migrate(old);
  assert.equal(m.meta.schemaVersion, LATEST);
  assert.deepEqual(validate(m).errors, []);
  m.meta.schemaVersion = old.meta.schemaVersion; assert.deepEqual(m, old);
});

// Default deck: k1 on top, front up. Crown has Resources, so k1 A runs Crackdown. With no Active
// Volunteer in a space with a Crown cube, Crackdown finds no space (the tan-war "no-target" dry run
// shows cw.crack:empty on the same board), so the bot draws k2: Garrison picks Cork City, as cw.garrison does.
test("$draw runs the top card's front side; an empty action draws the next card", () => {
  const g = cardGame(), r = run(g);
  assert.deepEqual(r.path, ["cw.start", "cw.event", "draw:k1", "k1.a.low", "k1.a.crack:empty", "draw:k2", "k2.garrison", "k2.done"]);
  assert.equal(r.outcome, "operationSpecial");
  assert.deepEqual(r.chosen, ["cork-city"]);
  assert.equal(r.linked, "crown.martial-law:cork-city");
});

test("$flip runs the other side of the current card", () => {
  const r = run(cardGame(), { resources: { crown: 0 } });
  assert.deepEqual(r.path, ["cw.start", "cw.event", "draw:k1", "k1.a.low", "flip:k1", "k1.b.pass"]);
  assert.equal(r.outcome, "pass");
});

test("the dry-run patch botDeck sets the top card and the flipped cards", () => {
  const g = cardGame();
  assert.deepEqual(run(g, { botDeck: { flipped: ["k1"] } }).path, ["cw.start", "cw.event", "draw:k1", "k1.b.pass"], "a flipped card shows its back");
  assert.deepEqual(run(g, { botDeck: { order: ["k2", "k1"] } }).path.slice(0, 4), ["cw.start", "cw.event", "draw:k2", "k2.garrison"]);
});

// Same board as the tan-war "fallback" dry run: no Volunteer or HQ anywhere, so every Operation is empty.
// Crown has 1 Resource, so k1 A does not flip. Both cards are drawn, then the bot passes.
test("a turn that draws every card passes", () => {
  const r = run(cardGame(), { resources: { crown: 1 }, clearPieces: ["ira.volunteer", "ira.hq"] });
  assert.deepEqual(r.path, ["cw.start", "cw.event", "draw:k1", "k1.a.low", "k1.a.crack:empty", "draw:k2", "k2.garrison:empty", "deck:empty"]);
  assert.equal(r.outcome, "pass");
});

test("a bad botDeck patch is a dry-run error", () => {
  const g = cardGame();
  assert.throws(() => run(g, { botDeck: { order: ["k1"] } }), /must list each card of the bot deck once: k1, k2/);
  assert.throws(() => run(g, { botDeck: { order: ["k1", "k1"] } }), /once/);
  assert.throws(() => run(g, { botDeck: { flipped: ["k9"] } }), /unknown bot card: k9/);
  assert.throws(() => run(g, { botDeck: { flipped: ["k2"] } }), /k2, which has one side/);
  assert.throws(() => run(g, { botDeck: { top: "k2" } }), /may set only order and flipped/);
});

test("the schema file needs a deck for a card bot and refuses one for a flowchart bot", () => {
  const check = schemaCheck();
  assert.equal(check(cardGame()), true, JSON.stringify(check.errors?.slice(0, 2)));
  let g = cardGame(); delete g.bots[0].deck;
  assert.equal(check(g), false, "mode cards needs a deck");
  g = cardGame(); delete g.bots[0].mode;
  assert.equal(check(g), false, "a deck needs mode cards");
  g = tan(); g.bots[0].nodes[0].yes = "$jump";
  assert.equal(check(g), false, "only $draw and $flip are exits");
});

test("the validator accepts the card bot and its tables are in use", () => {
  const g = cardGame();
  assert.deepEqual(validate(g).errors.filter((e) => e.code !== "dry-run-missing"), []);
  assert.equal(validate(g).warnings.some((w) => w.code === "unused-table" && /cw\.t\.(crack|garrison)/.test(w.message)), false);
  assert.ok(tableUsers(g.bots[0], "cw.t.garrison").some((n) => n.id === "k2.garrison"));
  assert.equal(botNodes(g.bots[0]).length, 10);
});

test("the validator checks exits, branches and node ids of card sides", () => {
  let g = tan(); g.bots[0].nodes.find((n) => n.id === "cw.event").no = "$draw";
  assert.ok(codes(g).includes("bad-exit"), "a flowchart bot cannot draw");
  g = cardGame(); g.bots[0].deck.cards[1].sides[0].nodes[0].onEmpty = "$flip";
  assert.ok(codes(g).includes("bad-exit"), "a one-sided card cannot flip");
  g = cardGame(); g.bots[0].nodes.find((n) => n.id === "cw.event").no = "$flip";
  assert.ok(codes(g).includes("bad-exit"), "the bot's own flowchart cannot flip");
  g = cardGame(); g.bots[0].deck.cards[1].sides[0].nodes[0].then = "k1.a.done";
  assert.ok(validate(g).errors.some((e) => e.code === "missing-ref" && /in another flowchart/.test(e.message)));
  g = cardGame(); g.bots[0].deck.cards[1].sides[0].nodes[1].id = "cw.end-event"; g.bots[0].deck.cards[1].sides[0].nodes[0].then = "cw.end-event";
  assert.ok(codes(g).includes("duplicate-id"));
  g = cardGame(); g.bots[0].deck.cards[0].sides.reverse();
  assert.ok(codes(g).includes("card-sides"));
  g = cardGame(); g.bots[0].deck.cards[1].id = "k1";
  assert.ok(codes(g).includes("duplicate-id"));
  g = cardGame(); g.bots[0].deck.cards[0].sides[0].start = "k2.done";
  assert.ok(validate(g).errors.some((e) => e.code === "missing-ref" && e.path === "/bots/0/deck/cards/0/sides/0/start"));
  g = cardGame(); g.bots[0].deck.cards[0].sides[0].nodes.push({ id: "k1.a.lost", kind: "end", text: "", outcome: "pass" });
  assert.ok(validate(g).errors.some((e) => e.code === "unreachable" && e.path === "/bots/0/deck/cards/0/sides/0"));
});

test("a card bot needs Pass in the rules and warns when it never draws", () => {
  let g = cardGame(); g.rules.sequence.choices = g.rules.sequence.choices.filter((c) => c !== "pass");
  assert.ok(validate(g).errors.some((e) => e.code === "pass-illegal" && e.path === "/bots/0/deck"));
  g = cardGame(); const ev = g.bots[0].nodes.find((n) => n.id === "cw.event"); ev.no = "cw.end-event";
  assert.ok(validate(g).warnings.some((w) => w.code === "no-draw"));
});

test("the editor helpers make a card bot, add and remove cards and backs, and go back to a flowchart", () => {
  const g = tan(), b = g.bots[0];
  setCardMode(b, true);
  assert.equal(b.mode, "cards");
  assert.equal(b.deck.cards.length, 1);
  assert.deepEqual(b.deck.cards[0].sides.map((sd) => [sd.id, sd.label, sd.nodes[0].kind]), [["front", "A", "end"]]);
  const k2 = addBotCard(b);
  assert.equal(k2.id, "k2");
  assert.equal(k2.sides[0].label, "B");
  addBack(b, k2);
  assert.equal(k2.sides[1].label, "BB");
  const n = addNode(b, "condition", k2.sides[0]);
  assert.ok(k2.sides[0].nodes.includes(n));
  assert.equal(botNodes(b).filter((x) => x.id === n.id).length, 1, "a new node id is free over the whole bot");
  n.yes = "$flip";
  b.dryRuns[1].patch.botDeck = { flipped: ["k2"] };
  assert.deepEqual(deleteBack(b, k2), [`${n.id}.yes`]);
  assert.equal(k2.sides.length, 1);
  assert.equal("botDeck" in b.dryRuns[1].patch, false, "a card with no back leaves botDeck.flipped");
  b.dryRuns[0].patch.botDeck = { order: ["k2", "k1"], flipped: ["k2"] };
  deleteBotCard(b, 1);
  assert.deepEqual(b.deck.cards.map((c) => c.id), ["k1"]);
  assert.deepEqual(b.dryRuns[0].patch.botDeck, { order: ["k1"] }, "the deleted card leaves the dry-run patches");
  deleteBotCard(b, 0);
  assert.equal(b.deck.cards.length, 1, "the deck keeps one card");
  b.nodes.find((x) => x.id === "cw.event").no = "$draw";
  assert.deepEqual(setCardMode(b, false), ["cw.event.no"]);
  assert.equal("mode" in b || "deck" in b, false);
});

test("the bot aid, the Mermaid chart, the flowchart and the Non-Player sheet name the exits in words", () => {
  const g = cardGame(), b = g.bots[0], md = toMarkdown(aidModel(g, b));
  assert.match(md, /If not: draw the next bot card\./);
  assert.match(md, /## Bot cards/);
  assert.match(md, /### Crackdown, side A\n1\. Crown Resources below 1\? Yes: flip this bot card\. No: go to step 2\./);
  assert.match(md, /### Crackdown, side AA\n1\. Pass\. END, Pass and gain 2 Resources\./);
  assert.match(toMermaid(b), /x_draw\(\["Draw the next bot card"\]\)/);
  assert.match(graphSvg(b, {}), /Draw the next bot card/);
  assert.match(nonPlayerSheetHtml(g, b), /Draw the next bot card/);
  assert.equal(/## Bot cards/.test(toMarkdown(aidModel(tan(), tan().bots[0]))), false, "a flowchart bot has no card section");
});

// Codex review on PR 46 (four findings, each reproduced before the fix).
test("adding a bot card puts it at the bottom of every dry-run order", () => {
  const g = cardGame(), b = g.bots[0];
  b.dryRuns = [{ id: "d1", case: "ineligible", patch: { eligible: { crown: false }, botDeck: { order: ["k2", "k1"] } }, expect: { outcome: "none" } }];
  addBotCard(b);
  assert.deepEqual(b.dryRuns[0].patch.botDeck.order, ["k2", "k1", "k3"]);
  assert.equal(run(g, b.dryRuns[0].patch).outcome, "none");
});

test("the Non-Player sheet prints an action whose then branch draws a card", () => {
  const g = cardGame(), b = g.bots[0];
  b.nodes.push({ id: "cw.op", kind: "action", text: "Sweep", action: "crown.sweep", table: "cw.t.sweep", then: "$draw", onEmpty: "$draw" });
  b.nodes.find((n) => n.id === "cw.event").no = "cw.op";
  assert.match(nonPlayerSheetHtml(g, b), /after<\/b> → Draw the next bot card/);
});

test("the Non-Player sheet prints an Event table that only a bot card uses", () => {
  const g = cardGame(), b = g.bots[0];
  b.eventPolicy.overrides[0].node = { table: "cw.t.crack" };
  const row = b.priorityTables.find((t) => t.id === "cw.t.crack").steps[0].text;
  assert.ok(nonPlayerSheetHtml(g, b).includes(row.replace(/&/g, "&amp;").replace(/</g, "&lt;")), "the rows print under the Event line");
});

test("a card whose two sides flip back and forth is a loop", () => {
  const g = cardGame(), back = g.bots[0].deck.cards[0].sides[1];
  back.nodes = [{ id: "k1.b.low", kind: "condition", text: "", test: { op: "lt", args: [{ var: "self.resources" }, 1] }, yes: "$flip", no: "k1.b.pass" }, { id: "k1.b.pass", kind: "end", text: "Pass.", outcome: "pass" }];
  back.start = "k1.b.low";
  assert.ok(validate(g).errors.some((e) => e.code === "cycle" && e.path === "/bots/0/deck/cards/0"));
  assert.equal(validate(cardGame()).errors.some((e) => e.code === "cycle"), false, "one flip that ends is not a loop");
});

// Codex review on PR 46, second pass (two findings, each reproduced before the fix).
test("removing the bot deck drops the dry-run deck patches, so a new deck starts clean", () => {
  const g = tan(), b = g.bots[0];
  setCardMode(b, true);
  b.dryRuns[0].patch.botDeck = { order: ["k1"] };
  setCardMode(b, false);
  assert.equal("botDeck" in b.dryRuns[0].patch, false);
  setCardMode(b, true);
  assert.equal("botDeck" in b.dryRuns[0].patch, false);
});

test("a two-sided card with a missing start is an error, not a validator crash", () => {
  const g = cardGame(); g.bots[0].deck.cards[0].sides[0].start = "nope";
  assert.ok(validate(g).errors.some((e) => e.code === "missing-ref" && e.path === "/bots/0/deck/cards/0/sides/0/start"));
});

// Part B (owner decisions Q3 and Q9, 2026-11-26; seed default, Operation only and node flag, 2026-11-27):
// the Activation Number of a card side. Before each space after the first, the Operation rolls 1d6 from
// the dry run's seed (default 1); a roll at or under the number ends it. Linked Special Activities do not roll.
// Board: Dublin and Cork City each hold an Active Volunteer and a Crown Police cube, so Crackdown
// (table CW-1, all, limit 2) ranks both: Dublin, then Cork City.
const twoCrack = { spaces: { dublin: { pieces: { "ira.volunteer": { active: 1 }, "crown.police": { normal: 1 } } }, "cork-city": { pieces: { "ira.volunteer": { active: 1 }, "crown.police": { normal: 1 } } } } };
const withAN = (an, extra = {}) => { const g = cardGame(); Object.assign(g.bots[0].deck.cards[0].sides[0], { activation: an }); Object.assign(g.bots[0].deck.cards[0].sides[0].nodes[1], extra); return g; };
const d6 = (seed, n) => { const r = seededRandom(seed); return Array.from({ length: n }, () => 1 + Math.floor(r() * 6)); };

test("no Activation Number: the Operation takes spaces up to its table's limit and rolls nothing", () => {
  const r = run(cardGame(), twoCrack);
  assert.deepEqual(r.chosen, ["dublin", "cork-city"]);
  assert.equal(r.rolls, undefined);
});

test("an Activation Number of 6 always ends the Operation after its first space; 0 never does", () => {
  const six = run(withAN(6), twoCrack);
  assert.deepEqual(six.chosen, ["dublin"], "every roll is at or under 6");
  assert.equal(six.rolls.length, 1, "one roll, before the second space");
  const zero = run(withAN(0), twoCrack);
  assert.deepEqual(zero.chosen, ["dublin", "cork-city"], "no roll is at or under 0");
  assert.equal(zero.rolls.length, 1, "no roll after the last space");
});

test("the dry-run seed sets the rolls, and no seed means seed 1", () => {
  const [first] = d6(1, 1);
  assert.deepEqual(run(withAN(3), twoCrack).rolls, [first]);
  assert.deepEqual(run(withAN(3), { ...twoCrack, seed: 1 }).rolls, [first], "seed 1 is the default");
  // A seed whose first roll stops at 3 and one whose first roll goes on.
  const stop = [...Array(50).keys()].find((sd) => d6(sd, 1)[0] <= 3), go = [...Array(50).keys()].find((sd) => d6(sd, 1)[0] > 3);
  assert.deepEqual(run(withAN(3), { ...twoCrack, seed: stop }).chosen, ["dublin"]);
  assert.deepEqual(run(withAN(3), { ...twoCrack, seed: go }).chosen, ["dublin", "cork-city"]);
  assert.throws(() => run(cardGame(), { seed: -1 }), /seed must be a whole number, 0 or more/);
});

// Tan War's Repression track runs 0 to 5. Seed 1 rolls a 4 first: at or under 5, above 0.
test("the Activation Number can be a formula, such as a track value", () => {
  assert.equal(d6(1, 1)[0], 4);
  const g = withAN({ var: "track.repression" });
  const at = (v) => run(g, { ...twoCrack, tracks: { repression: v } }).chosen.length;
  assert.equal(at(5), 1);
  assert.equal(at(0), 2);
});

test("an action node that skips the roll takes spaces up to its table's limit", () => {
  const r = run(withAN(6, { noActivation: true }), twoCrack);
  assert.deepEqual(r.chosen, ["dublin", "cork-city"]);
  assert.equal(r.rolls, undefined);
});

test("the validator checks the Activation Number and where a node can skip the roll", () => {
  assert.deepEqual(validate(withAN(3)).errors.filter((e) => e.code !== "dry-run-missing"), []);
  let g = withAN({ var: "nope" });
  assert.ok(validate(g).errors.some((e) => e.path === "/bots/0/deck/cards/0/sides/0/activation"));
  g = cardGame(); g.bots[0].deck.cards[0].sides[0].nodes[1].noActivation = true;
  assert.ok(validate(g).errors.some((e) => e.code === "bad-activation" && /has no Activation Number/.test(e.message)));
  g = withAN(3); g.bots[0].deck.cards[0].sides[0].nodes[0].noActivation = true;
  assert.ok(validate(g).errors.some((e) => e.code === "bad-activation" && /only an action node/.test(e.message)));
});

test("the Activation Number caps an action node with parts over its new spaces", () => {
  const mk = (an) => {
    const g = withAN(an), n = g.bots[0].deck.cards[0].sides[0].nodes[1];
    n.parts = [{ text: "Crackdown.", table: n.table, steps: structuredClone(g.actions.find((a) => a.id === "crown.crackdown").steps) }];
    delete n.table;
    return g;
  };
  assert.deepEqual(run(mk(6), twoCrack).chosen, ["dublin"]);
  assert.deepEqual(run(mk(0), twoCrack).chosen, ["dublin", "cork-city"]);
});

test("the bot aid prints the Activation Number of a side and the nodes that skip the roll", () => {
  const g = withAN({ var: "track.repression" }, { noActivation: true }), md = toMarkdown(aidModel(g, g.bots[0]));
  assert.match(md, /### Crackdown, side A\nActivation Number: Repression\. Before each space after the first, roll 1d6\./);
  assert.match(md, /Crackdown \(cost [^)]*\)\. Do not roll for the Activation Number\./);
  assert.equal(/Activation Number/.test(toMarkdown(aidModel(cardGame(), cardGame().bots[0]))), false);
});
