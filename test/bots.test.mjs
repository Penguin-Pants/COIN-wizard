import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { newBot, addNode, deleteNode, graphInfo, missingCases, newDryRun, runDry, toExpect } from "../src/botedit.mjs";
import { layout, graphSvg } from "../src/graphsvg.mjs";
import { validate } from "../src/validate.mjs";

const example = () => JSON.parse(readFileSync(new URL("../examples/tan-war.game.json", import.meta.url), "utf8"));
const botErrors = (g, bi) => validate(g).errors.filter((e) => e.path.startsWith(`/bots/${bi}`));

test("a new bot is a complete graph that only lacks its dry runs", () => {
  const g = example();
  g.bots[1] = newBot(g, "ira");
  assert.equal(g.bots[1].factionId, "ira");
  const codes = [...new Set(botErrors(g, 1).map((e) => e.code))];
  assert.deepEqual(codes, ["dry-run-missing"]);
  assert.equal(missingCases(g.bots[1]).length, 6);
});

test("adding a node gives a fresh id and the kind's fields", () => {
  const b = example().bots[0];
  const n = addNode(b, "condition");
  assert.equal(b.nodes.at(-1), n);
  assert.ok(n.id.startsWith("cw.") && !example().bots[0].nodes.some((x) => x.id === n.id));
  assert.equal(n.kind, "condition"); assert.ok("test" in n);
});

test("deleting a node clears every branch that pointed at it and reports them", () => {
  const b = example().bots[0];
  const cleared = deleteNode(b, "cw.pass");
  assert.ok(cleared.length >= 2);
  assert.equal(JSON.stringify(b.nodes).includes('"cw.pass"'), false);
});

test("graphInfo finds unreachable nodes and cycles", () => {
  const b = example().bots[0];
  assert.deepEqual(graphInfo(b), { unreachable: [], cycles: [] });
  addNode(b, "end");
  assert.equal(graphInfo(b).unreachable.length, 1);
  b.nodes.find((n) => n.id === "cw.sweep").then = "cw.start";
  assert.ok(graphInfo(b).cycles.includes("cw.start"));
});

test("Run now and Use result as expected make a dry run pass", () => {
  const g = example();
  g.bots[1] = newBot(g, "ira");
  for (const c of missingCases(g.bots[1])) {
    const d = newDryRun(g.bots[1], c);
    g.bots[1].dryRuns.push(d);
    d.expect = toExpect(runDry(g, g.bots[1], d));
  }
  assert.deepEqual(botErrors(g, 1), []);
});

test("runDry reports the path, chosen spaces and outcome", () => {
  const g = example();
  const r = runDry(g, g.bots[0], g.bots[0].dryRuns.find((d) => d.case === "linked-sa"));
  assert.equal(r.outcome, "operationSpecial");
  assert.deepEqual(r.chosen, ["tipperary"]);
  assert.ok(r.path.includes("cw.crack"));
});

test("the layout places every node with no overlaps, for every bot", () => {
  for (const b of example().bots.concat([newBot(example(), "crown")])) {
    const { boxes } = layout(b);
    assert.equal(Object.keys(boxes).length, b.nodes.length);
    const list = Object.values(boxes);
    for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) {
      const a = list[i], c = list[j];
      const apart = a.x + a.w <= c.x || c.x + c.w <= a.x || a.y + a.h <= c.y || c.y + c.h <= a.y;
      assert.ok(apart, `${b.id}: boxes ${i} and ${j} overlap`);
    }
  }
});

test("the SVG names every node and highlights a dry-run path", () => {
  const b = example().bots[0];
  const svg = graphSvg(b, { highlight: ["cw.start", "cw.end-none"] });
  assert.match(svg, /^<svg[^>]*role="img"/);
  for (const n of b.nodes) assert.ok(svg.includes(`data-node="${n.id}"`), n.id);
  assert.equal((svg.match(/class="node hl/g) ?? []).length, 2);
});

test("solo rule: a condition node with only text needs a test", () => {
  const g = example();
  delete g.bots[0].nodes[0].test;
  assert.ok(validate(g).errors.some((e) => e.code === "incomplete-node"));
});

test("solo rule: an Event exception that names targets in text only is flagged", () => {
  const g = example();
  g.bots[0].eventPolicy.overrides.find((o) => o.cardId === "e07").targets = "City with the fewest Army.";
  const w = validate(g).warnings.filter((x) => x.code === "solo");
  assert.ok(w.some((x) => /e07/.test(x.message)));
});

test("solo rule: an action node without a priority table is an error", () => {
  const g = example();
  delete g.bots[0].nodes.find((n) => n.kind === "action").table;
  assert.ok(validate(g).errors.some((e) => e.code === "solo"));
});

// Known issue 1. Expected values come from the Tan War rules, not from a run:
// Crackdown has no target (no Active Volunteer). Garrison IB rule CW-2 step 1 picks Cork City (Pop 2, Neutral).
// Garrison pays 2 Resources (8 to 6) and places 2 Army there (1 to 3 Army).
// Martial Law (Resources 6, trigger 3 or more): legal spaces have 2 or more Army and opinion below Support.
// Before Garrison only Limerick is legal (step 2). After Garrison Cork City is legal and wins step 1 (Pop 2, Neutral).
test("a linked Special Activity sees the board after its Operation", () => {
  const g = example();
  const d = { id: "x", case: "linked-sa", patch: { spaces: { limerick: { pieces: { "crown.army": { normal: 2 } } } } }, expect: { outcome: "none" } };
  const r = runDry(g, g.bots[0], d);
  assert.equal(r.error, undefined);
  assert.deepEqual(r.chosen, ["cork-city"]);
  assert.equal(r.linked, "crown.martial-law:cork-city");
  assert.equal(r.outcome, "operationSpecial");
});

test("a linked Special Activity with timing before sees the board before its Operation", () => {
  const g = example();
  const node = g.bots[0].nodes.find((n) => n.id === "cw.garrison");
  node.linked.timing = "before";
  g.actions.find((a) => a.id === "crown.martial-law").timing = "before";
  // Same board as cw.d7: before Garrison only Limerick has 2 Army.
  const d = { id: "x", case: "linked-sa", patch: { spaces: { limerick: { pieces: { "crown.army": { normal: 2 } } } } }, expect: { outcome: "none" } };
  const r = runDry(g, g.bots[0], d);
  assert.equal(r.linked, "crown.martial-law:limerick");
});

test("a before-timed Special Activity is skipped when it would leave too little for the Operation", () => {
  const g = example();
  g.bots[0].nodes.find((n) => n.id === "cw.garrison").linked.timing = "before";
  g.bots[0].nodes.find((n) => n.id === "cw.garrison").linked.trigger = true;
  const d = { id: "x", case: "linked-sa", patch: { resources: { crown: 3 }, spaces: { limerick: { pieces: { "crown.army": { normal: 2 } } } } }, expect: { outcome: "none" } };
  const r = runDry(g, g.bots[0], d);
  assert.deepEqual(r.chosen, ["cork-city"]);
  assert.equal(r.linked, "skipped", "Martial Law (2) plus Garrison (2) is more than 3 Resources");
});

// Follow-up 1 (rule chosen by the owner): after a before-timed Special Activity, the Operation
// drops chosen spaces that are no longer legal and refunds their cost.
test("a before-timed Special Activity that makes a chosen space illegal drops it and refunds its cost", () => {
  const g = example();
  const garrison = g.actions.find((a) => a.id === "crown.garrison");
  garrison.targets = { op: "and", args: [garrison.targets, { op: "lt", args: [{ var: "$space.opinion" }, 1] }] };
  const bot = g.bots[0];
  const node = bot.nodes.find((n) => n.id === "cw.garrison");
  node.linked.timing = "before"; node.linked.trigger = true;
  // A check after the Operation: Resources 8 - 2 (Garrison) - 2 (Martial Law) + 2 (refund) = 6.
  node.then = "cw.chk";
  bot.nodes.push({ id: "cw.chk", kind: "condition", text: "Resources 6 or more?", test: { op: "gte", args: [{ var: "self.resources" }, 6] }, yes: "cw.end-op", no: "cw.pass" });
  const d = { id: "x", case: "linked-sa", patch: { spaces: { "cork-city": { pieces: { "crown.army": { normal: 2 } } } } }, expect: { outcome: "none" } };
  const r = runDry(g, bot, d);
  assert.equal(r.error, undefined);
  assert.equal(r.linked, "crown.martial-law:cork-city");
  assert.deepEqual(r.chosen, [], "Cork City is at Support after Martial Law, so Garrison drops it");
  assert.deepEqual(r.path.slice(-2), ["cw.chk", "cw.end-op"], "the Garrison cost is refunded");
});

// Setup shared by the before-timing review tests: Garrison linked to Martial Law with timing before.
function beforeSetup({ targetsExtra, cost, trigger = true }) {
  const g = example();
  const garrison = g.actions.find((a) => a.id === "crown.garrison");
  garrison.targets = { op: "and", args: [garrison.targets, targetsExtra] };
  if (cost) garrison.cost = cost;
  const bot = g.bots[0];
  const node = bot.nodes.find((n) => n.id === "cw.garrison");
  node.linked.timing = "before"; node.linked.trigger = trigger;
  node.then = "cw.chk";
  bot.nodes.push({ id: "cw.chk", kind: "condition", text: "Resources 6 or more?", test: { op: "gte", args: [{ var: "self.resources" }, 6] }, yes: "cw.end-op", no: "cw.pass" });
  return { g, bot };
}
const corkArmy = { id: "x", case: "linked-sa", patch: { spaces: { "cork-city": { pieces: { "crown.army": { normal: 2 } } } } }, expect: { outcome: "none" } };

test("a per-use Operation cost is refunded when every chosen space is dropped", () => {
  const { g, bot } = beforeSetup({ targetsExtra: { op: "lt", args: [{ var: "$space.opinion" }, 1] }, cost: { track: "res.crown", amount: 2, per: "use" } });
  const r = runDry(g, bot, corkArmy);
  assert.deepEqual(r.chosen, []);
  assert.deepEqual(r.path.slice(-2), ["cw.chk", "cw.end-op"], "8 - 2 - 2 + 2 = 6");
});

test("the legality recheck after a before-timed Special Activity ignores the Operation's own reserved cost", () => {
  const { g, bot } = beforeSetup({ targetsExtra: { op: "gte", args: [{ var: "self.resources" }, 8] }, trigger: false });
  const r = runDry(g, bot, corkArmy);
  assert.deepEqual(r.chosen, ["cork-city"]);
});
