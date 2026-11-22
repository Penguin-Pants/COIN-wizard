import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { validate } from "../src/validate.mjs";
import { runBot } from "../src/dryrun.mjs";
import { deriveState, applyPatch } from "../src/state.mjs";

// Schema 1.5.0 part A: botNode.linked may be a list. The first entry whose trigger holds and
// whose table finds a legal space runs (docs/proposals/bot-model-gaps.md, part A).
const example = () => JSON.parse(readFileSync(new URL("../examples/tan-war.game.json", import.meta.url), "utf8"));
const node = (g, id) => g.bots[0].nodes.find((n) => n.id === id) ?? {};
const codes = (g) => validate(g).errors.map((e) => e.code);
// A crash returns { error } so a test fails on its assertion, not on the throw.
const run = (g, patch = {}) => { try { return runBot(g, g.bots[0], applyPatch(deriveState(g, "crown"), patch)); } catch (e) { return { error: e.message }; } };

// Tan War with a second Crown Special Activity, Patrol: free, only in Dublin. Garrison tries
// Martial Law first, then Patrol.
function withList() {
  const g = example();
  g.actions.push({
    id: "crown.patrol", faction: "crown", kind: "specialActivity", name: "Patrol", plain: "Raise Repression by 1 in Dublin.",
    dependsOn: ["repression"], cost: { track: "res.crown", amount: 0, per: "use" }, timing: "after", accompanies: "any",
    targets: { op: "eq", args: [{ var: "$space.id" }, "dublin"] }, steps: [{ op: "track", id: "repression", delta: 1 }]
  });
  g.bots[0].priorityTables.push(
    { id: "cw.t.patrol", scope: "space", select: "one", steps: [{ n: 1, text: "Dublin.", filter: true }], tiebreak: [] },
    { id: "cw.t.none", scope: "space", select: "one", steps: [{ n: 1, text: "No space.", filter: false }], tiebreak: [] }
  );
  const n = node(g, "cw.garrison");
  n.linked = [n.linked, { action: "crown.patrol", timing: "after", trigger: true, table: "cw.t.patrol", skipText: "Skip Patrol if Dublin is not legal." }];
  return g;
}

test("the schema accepts a list of linked Special Activities and rejects an empty list", () => {
  const g = withList();
  assert.deepEqual(validate(g).errors, []);
  node(g, "cw.garrison").linked = [];
  assert.ok(codes(g).includes("schema"));
});

test("the first linked entry that holds and finds a space wins", () => {
  // Resources 8: Garrison pays 2, 6 is left, so Martial Law's trigger (3 or more) holds (as in cw.d3).
  const r = run(withList());
  assert.deepEqual(r.chosen, ["cork-city"]);
  assert.equal(r.linked, "crown.martial-law:cork-city");
  assert.equal(r.outcome, "operationSpecial");
});

test("a false trigger passes to the next entry", () => {
  // Resources 4: Garrison pays 2, 2 is left, so Martial Law's trigger fails. Patrol is free and Dublin is legal.
  const r = run(withList(), { resources: { crown: 4 } });
  assert.deepEqual(r.chosen, ["cork-city"]);
  assert.equal(r.linked, "crown.patrol:dublin");
  assert.equal(r.outcome, "operationSpecial");
});

test("an entry whose table finds no space passes to the next entry", () => {
  const g = withList();
  node(g, "cw.garrison").linked[0].table = "cw.t.none";
  assert.equal(run(g).linked, "crown.patrol:dublin");
});

test("when no entry runs the result is skipped and the outcome is operation", () => {
  const g = withList();
  node(g, "cw.garrison").linked[1].trigger = false;
  const r = run(g, { resources: { crown: 4 } });
  assert.equal(r.linked, "skipped");
  assert.equal(r.outcome, "operation");
});

test("each entry is checked: owner, accompanies, table and trigger", () => {
  const g = withList();
  const e = node(g, "cw.garrison").linked[1];
  g.actions.find((a) => a.id === "crown.patrol").accompanies = ["crown.sweep"];
  e.table = "cw.t.nope";
  const errs = validate(g).errors.filter((x) => x.path === "/bots/0/nodes/6/linked/1");
  assert.deepEqual(errs.map((x) => x.code).sort(), ["missing-ref", "not-accompanying"]);
  e.action = "ira.boycott";
  assert.ok(validate(g).errors.some((x) => x.code === "wrong-owner" && x.path === "/bots/0/nodes/6/linked/1"));
});

test("every entry of one list has the same timing", () => {
  const g = withList();
  g.actions.find((a) => a.id === "crown.patrol").timing = "any";
  node(g, "cw.garrison").linked[1].timing = "before";
  assert.ok(validate(g).errors.some((x) => x.code === "linked-timing" && x.path === "/bots/0/nodes/6/linked/1"));
});

test("an entry's timing must match its Special Activity", () => {
  const g = withList();
  node(g, "cw.garrison").linked[1].timing = "during";
  node(g, "cw.garrison").linked[0].timing = "during";
  assert.ok(validate(g).errors.some((x) => x.code === "timing" && x.path === "/bots/0/nodes/6/linked/1"));
});

// Bot aid (src/botaid.mjs): a list prints in order, each entry after "If none".
import { aidModel, toPolicyYaml } from "../src/botaid.mjs";
const aidStep = (g, nodeId) => {
  let m; try { m = aidModel(g, g.bots[0]); } catch { return ""; }
  const lead = (node(g, nodeId).text ?? "").split(" ")[0];
  return m.steps.map((s) => s.text).find((t) => t.startsWith(lead)) ?? "";
};

test("the bot aid lists each linked Special Activity in order with If none", () => {
  const t = aidStep(withList(), "cw.garrison");
  assert.match(t, /Special Activities may follow, after the Operation\. Try them in order; the first one that can be used runs\./);
  assert.match(t, /1\. Martial Law \(cost 2 Resources per use\)\. Skip Martial Law if Resources are below 3 or no space qualifies\. Choose its space with table CW-\d\./);
  assert.match(t, /2\. If none: Patrol \(cost free\)\. Skip Patrol if Dublin is not legal\. Choose its space with table CW-\d\./);
});

test("a single linked Special Activity keeps its bot aid text", () => {
  assert.match(aidStep(example(), "cw.garrison"), /Before you end: Special Activity Martial Law \(cost 2 Resources per use\) may follow, after the Operation\./);
});

test("the policy file lists every linked Special Activity", () => {
  assert.match(toPolicyYaml(withList(), withList().bots[0]), /id: crown\.patrol\n\s+name: Patrol/);
});

// Non-Player sheet (src/kit.mjs, nonPlayerSheetHtml): Special Activity boxes in list order, with
// "if none" arrows between them.
import { buildFiles } from "../src/kit.mjs";
import { toMermaid, toMarkdown } from "../src/botaid.mjs";
const np = (g) => { try { return Object.fromEntries(buildFiles(g, { toMermaid, toMarkdown, toPolicyYaml }))[`kit/${g.meta.gameId}.crown.nonplayer.html`] ?? ""; } catch { return ""; } };
const boxOf = (html, cls, name) => { const i = html.indexOf(`<h3>${name}`, html.indexOf(`class="col ${cls}"`)); return i < 0 ? "" : html.slice(i, html.indexOf("</section>", i)); };
const label = (g, id) => `CW-${g.bots[0].priorityTables.findIndex((t) => t.id === id) + 1}`;

test("the Operation box names each linked Special Activity, the next ones after if none", () => {
  const g = withList(), html = np(g);
  const op = boxOf(html, "ops", "Garrison");
  assert.match(op, new RegExp(`<b>then</b> → Martial Law \\(${label(g, "cw.t.law")}\\)</p><p class="arr"><b>if none</b> → Patrol \\(${label(g, "cw.t.patrol")}\\)`));
});

test("Special Activity boxes print in list order with an if none arrow to the next", () => {
  const g = withList(), html = np(g);
  const sas = html.slice(html.indexOf('class="col sas"'));
  assert.ok(sas.indexOf("<h3>Martial Law") >= 0 && sas.indexOf("<h3>Martial Law") < sas.indexOf("<h3>Patrol"), "Martial Law before Patrol");
  // Only Garrison tries Patrol next; Crackdown also links Martial Law but stops there (Codex review of PR 11).
  const ml = boxOf(html, "sas", "Martial Law");
  assert.match(ml, new RegExp(`<p class="arr"><b>if none</b> \\(after Garrison \\(${label(g, "cw.t.garrison")}\\)\\) → Patrol \\(${label(g, "cw.t.patrol")}\\)</p>`));
  assert.match(ml, new RegExp(`<p class="arr"><b>if none</b> \\(after Crackdown \\(${label(g, "cw.t.crack")}\\)\\) → no Special Activity</p>`));
  assert.doesNotMatch(boxOf(html, "sas", "Patrol"), /<b>if none<\/b>/);
  assert.match(boxOf(html, "sas", "Patrol"), /Skip Patrol if Dublin is not legal\./);
});

// A table used only by a later list entry still counts as used by that node, so it may read $target.
import * as V from "../src/validate.mjs";
test("a table used by a later linked entry belongs to that node", () => {
  const g = JSON.parse(readFileSync(new URL("../examples/four-valleys.game.json", import.meta.url), "utf8"));
  const b = g.bots[0], n = b.nodes.find((x) => x.id === "ra.op");
  b.priorityTables.push({ id: "ra.t.pressure2", scope: "space", select: "one", steps: [{ n: 1, text: "Any space of the target.", filter: { op: "gte", args: [{ op: "factionCount", args: [{ var: "$target.id" }, { var: "$space.id" }, "*"] }, 1] } }], tiebreak: [] });
  n.linked = [n.linked, { ...structuredClone(n.linked), table: "ra.t.pressure2" }];
  assert.deepEqual((V.tableUsers?.(b, "ra.t.pressure2") ?? []).map((x) => x.id), ["ra.op"]);
  assert.deepEqual(validate(g).errors, []);
});

test("a Special Activity box used by one list only prints a plain if none arrow", () => {
  const g = withList();
  delete node(g, "cw.crack").linked;
  const ml = boxOf(np(g), "sas", "Martial Law");
  assert.match(ml, new RegExp(`<p class="arr"><b>if none</b> → Patrol \\(${label(g, "cw.t.patrol")}\\)</p>`));
  assert.doesNotMatch(ml, /\(after /);
});
