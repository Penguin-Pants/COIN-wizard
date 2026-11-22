import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { step4Prompt, fillStep4 } from "../src/step4suggest.mjs";
import { validate } from "../src/validate.mjs";
import { blankGame } from "../src/blank.mjs";
import { newBot } from "../src/botedit.mjs";

const load = (f) => JSON.parse(readFileSync(new URL(`../examples/${f}.game.json`, import.meta.url), "utf8"));
const errs = (g, prefix) => validate(g).errors.filter((e) => e.path.startsWith(prefix) && e.code !== "dry-run-missing").map((e) => `${e.code} ${e.path} ${e.message}`);
const withSource = (g) => { g.brief.sources = [{ id: "s1", url: "u1", status: "read" }, { id: "s2", url: "u2", status: "pending" }]; return g; };
const TEXTS = { s1: "READ TEXT about the war.", s2: "UNREAD TEXT" };
// A blank 3-faction game with a board: the starting point of a new design.
const fresh = () => { const g = withSource(blankGame(3)); g.meta.factionCount = 3; return g; };

for (const part of ["rules", "deck", "victory", "bots"]) {
  test(`${part} prompt carries the game, the read source and the answer format`, () => {
    const g = fresh(); const p = step4Prompt(part, g, TEXTS);
    assert.ok(p.includes("READ TEXT about the war.")); assert.ok(!p.includes("UNREAD TEXT"));
    for (const f of g.factions) assert.ok(p.includes(f.id), f.id);
    assert.match(p, /Return only JSON/);
  });
}
test("prompts refuse to run with no read source", () => {
  const g = blankGame(2);
  assert.throws(() => step4Prompt("deck", g, {}), /No source text/);
});
test("the deck prompt lists every effect op and its fields", () => {
  const p = step4Prompt("deck", fresh(), TEXTS);
  for (const op of ["place", "remove", "flip", "move", "shift", "track", "gain", "pay", "roll", "markerSet", "if", "choose"]) assert.ok(p.includes(`${op}:`), op);
});

test("rules: fills only empty text and adds scoring phases only when there are none", () => {
  const g = fresh(); g.rules.text.overview = "My overview.";
  const { game, report } = fillStep4("rules", g, { text: { overview: "Theirs.", setup: "Set up like this." }, scoring: { name: "Propaganda", phases: [{ name: "Victory", text: "Check victory.", steps: [] }, { name: "Resources", text: "Gain.", steps: [{ op: "nosuch" }] }] } });
  assert.equal(game.rules.text.overview, "My overview.");
  assert.equal(game.rules.text.setup, "Set up like this.");
  assert.equal(game.rules.scoring.name, "Propaganda");
  assert.deepEqual(game.rules.scoring.phases.map((p) => p.name), ["Victory", "Resources"]);
  assert.deepEqual(game.rules.scoring.phases[1].steps, [], "invalid steps are dropped, the phase text stays");
  assert.ok(report.skipped.some((s) => /overview/i.test(s)));
  assert.ok(report.dropped.some((s) => /Resources/.test(s)));
  assert.deepEqual(errs(game, "/rules"), []);
  const again = fillStep4("rules", game, { scoring: { phases: [{ name: "Other", text: "x", steps: [] }] } });
  assert.equal(again.game.rules.scoring.phases.length, 2, "existing phases are kept");
});

test("deck: adds valid Event cards, keeps a card whose steps are invalid without the steps, and adds scoring cards and piles", () => {
  const g = fresh(); const [a, b, c] = g.factions.map((f) => f.id);
  const piece = g.factions[0].pieces[0].id;
  const card = (title, steps) => ({ title, flavor: "f", order: [b, a, c], unshaded: { label: "U", text: "Good.", steps }, shaded: { label: "S", text: "Bad.", steps: [] } });
  const ev = [
    card("Valid", [{ op: "place", piece, count: 1, from: "available", to: "choose" }]),
    card("Bad steps", [{ op: "place", piece: "no-such", count: 1 }]),
    { title: "Bad order", order: [a, a], unshaded: { text: "x", steps: [] }, shaded: { text: "y", steps: [] } },
    { title: "" }
  ];
  const { game, report } = fillStep4("deck", g, { events: ev, scoringTitle: "Propaganda", scoringCards: 2 });
  const events = game.deck.cards.filter((x) => x.type === "event"), scoring = game.deck.cards.filter((x) => x.type === "scoring");
  assert.deepEqual(events.map((x) => x.title), ["Valid", "Bad steps", "Bad order"]);
  assert.deepEqual(events[1].sides[0].steps, []);
  assert.deepEqual(events[2].order, [a, b, c], "a bad faction order is replaced by the default order");
  assert.equal(events[0].sides[0].steps.length, 1);
  assert.equal(scoring.length, 2); assert.equal(scoring.filter((x) => x.final).length, 1);
  assert.equal(game.deck.preparation.piles.length, 2);
  assert.deepEqual(errs(game, "/deck"), []);
  assert.ok(report.dropped.length >= 3);
  assert.equal(report.added.length, 6, "3 Event cards, 2 scoring cards and the piles");
});
test("deck: an existing deck is kept and only new Event cards are added, without rebuilding piles", () => {
  const g = withSource(load("tan-war")); const before = structuredClone(g.deck);
  const { game, report } = fillStep4("deck", g, { events: [{ title: "New one", order: g.factions.map((f) => f.id), unshaded: { text: "a", steps: [] }, shaded: { text: "b", steps: [] } }], scoringCards: 9 });
  assert.deepEqual(game.deck.cards.slice(0, before.cards.length), before.cards);
  assert.equal(game.deck.cards.length, before.cards.length + 1);
  assert.deepEqual(game.deck.preparation, before.preparation);
  assert.ok(report.skipped.some((s) => /piles/i.test(s)));
});

test("victory: fills only rules still at the preset default and keeps a valid formula", () => {
  const g = fresh(); const [v0, v1] = g.victory.perFaction; v1.plain = "Mine."; v1.threshold = 3;
  const { game, report } = fillStep4("victory", g, { perFaction: [
    { factionId: v0.factionId, plain: "Control 6 Pop.", threshold: 6, formula: { op: "add", args: [1, 2] } },
    { factionId: v1.factionId, plain: "Theirs.", threshold: 9, formula: 1 },
    { factionId: g.factions[2].id, plain: "Bad formula.", threshold: 4, formula: { op: "nosuch", args: [] } },
    { factionId: "nobody", plain: "x", threshold: 1, formula: 1 }
  ], checkAt: "At each scoring card.", tieBreaks: ["Higher margin"] });
  const v = (id) => game.victory.perFaction.find((x) => x.factionId === id);
  assert.equal(v(v0.factionId).plain, "Control 6 Pop."); assert.equal(v(v0.factionId).threshold, 6);
  assert.equal(v(v1.factionId).plain, "Mine.");
  assert.deepEqual(v(g.factions[2].id), g.victory.perFaction[2], "a rule with an invalid formula is not used");
  assert.equal(game.victory.checkAt, "At each scoring card.");
  assert.deepEqual(game.victory.tieBreaks, ["Higher margin"]);
  assert.ok(report.dropped.some((s) => /nobody/.test(s)));
  assert.ok(report.dropped.some((s) => /formula/i.test(s)));
  assert.deepEqual(errs(game, "/victory"), []);
});

test("bots: adds a working bot for each faction without one, using only what validates", () => {
  const g = fresh(); const [a, b, c] = g.factions.map((f) => f.id);
  g.bots.push(newBot(g, c));
  const { game, report } = fillStep4("bots", g, { bots: [
    { factionId: a, objective: "Hold the cities.", eventPlain: "Play an Event that helps.", priorities: [{ text: "Spaces with an enemy piece.", filter: { op: "gt", args: [{ var: "$space.pop" }, 0] } }], tiebreak: { text: "Most Pop.", key: { var: "$space.pop" }, order: "max" } },
    { factionId: b, objective: "Spread.", priorities: [{ text: "Broken.", filter: { op: "nosuch", args: [] } }] },
    { factionId: c, objective: "Should not replace." },
    { factionId: "nobody", objective: "x" }
  ] });
  const bot = (id) => game.bots.find((x) => x.factionId === id);
  assert.equal(game.bots.length, 3);
  assert.equal(bot(a).objective, "Hold the cities.");
  assert.equal(bot(a).priorityTables[0].steps[0].text, "Spaces with an enemy piece.");
  assert.equal(bot(a).priorityTables[0].tiebreak[0].text, "Most Pop.");
  assert.equal(bot(b).objective, "Spread.");
  assert.equal(bot(b).priorityTables[0].steps[0].text, "Any legal space.", "invalid priorities fall back to the default table");
  assert.deepEqual(bot(c), g.bots[0]);
  assert.ok(report.skipped.some((s) => s.includes(g.factions[2].name)));
  assert.ok(report.dropped.some((s) => /nobody/.test(s)));
  // A blank game has no Operations yet: that is the only problem left, and the report says so.
  assert.deepEqual(errs(game, "/bots").filter((e) => !/Action not found/.test(e)), []);
  assert.ok(report.skipped.some((s) => /no Operation yet/.test(s)));
});

// Review findings on PR 20.
test("a game the schema rejects is refused, because the checks of each item would not run", () => {
  const g = fresh(); g.meta.title = 5;
  assert.throws(() => fillStep4("victory", g, { perFaction: [] }), /Fix the problems/);
});
test("the prompt describes sumSpaces as the evaluator runs it", () => {
  const p = step4Prompt("victory", fresh(), TEXTS);
  assert.ok(!p.includes("sumSpaces [condition, value]"));
  assert.match(p, /sumSpaces \[value\]/);
  assert.match(p, /"op":"mul","args":\[condition, \{"var":"\$space.pop"\}\]/);
});
test("a bot's Event rule text is used only with a matching side and condition that validate", () => {
  const g = fresh(); const [a, b] = g.factions.map((f) => f.id);
  const { game, report } = fillStep4("bots", g, { bots: [
    { factionId: a, eventPlain: "Play the shaded side if it raises your score.", eventSide: "shaded", playIf: { var: "card.raisesSelf" } },
    { factionId: b, eventPlain: "Only odd cards.", eventSide: "shaded", playIf: { op: "nosuch", args: [] } }
  ] });
  const bot = (id) => game.bots.find((x) => x.factionId === id);
  assert.deepEqual([bot(a).eventPolicy.side, bot(a).eventPolicy.playIf, bot(a).eventPolicy.plain], ["shaded", { var: "card.raisesSelf" }, "Play the shaded side if it raises your score."]);
  assert.deepEqual(bot(b).eventPolicy, newBot(g, b).eventPolicy, "text, side and condition stay at the default together");
  assert.ok(report.dropped.some((s) => /Event rule/.test(s)));
});
test("an untouched default victory rule still counts as default after its piece is renamed", () => {
  const g = fresh(); const f = g.factions.find((x) => x.type !== "state" && x.pieces.some((p) => p.isBase));
  f.pieces.find((p) => p.isBase).name = "Camp";
  const { game } = fillStep4("victory", g, { perFaction: [{ factionId: f.id, plain: "New rule.", threshold: 7, formula: 1 }] });
  assert.equal(game.victory.perFaction.find((v) => v.factionId === f.id).plain, "New rule.");
});


