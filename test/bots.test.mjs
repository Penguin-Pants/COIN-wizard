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
