import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { evalExpr } from "../src/expr.mjs";
import { deriveState, applyPatch } from "../src/state.mjs";
import { runBot, selectByTable } from "../src/dryrun.mjs";
import { validate } from "../src/validate.mjs";
import { migrate, LATEST } from "../src/migrate.mjs";
import { toValue, fromValue, toCond, fromCond } from "../src/exprmodel.mjs";
import { newBot } from "../src/botedit.mjs";

const load = (f) => JSON.parse(readFileSync(new URL(`../examples/${f}.game.json`, import.meta.url), "utf8"));
const valleys = () => load("four-valleys");
const ev = (g, e, self, patch) => { const st = applyPatch(deriveState(g, self), patch); return evalExpr(e, { state: st, links: g.board.links }); };
const v = (name) => ({ var: name });
const S = { var: "$space.id" };

test("per-faction values: Resources, Eligible, victory score and margin", () => {
  const g = valleys();
  assert.equal(ev(g, v("resources.f3"), "f1", { resources: { f3: 9 } }), 9);
  assert.equal(ev(g, v("eligible.f2"), "f1", { eligible: { f2: false } }), false);
  const score = ev(g, v("score.f1"), "f1");
  assert.equal(typeof score, "number");
  assert.equal(ev(g, v("margin.f1"), "f1"), score - g.victory.perFaction.find((x) => x.factionId === "f1").threshold);
});

test("rival values look at every other faction, not only the first", () => {
  const g = valleys();
  const p = { resources: { f1: 1, f2: 3, f3: 12, f4: 7 } };
  assert.equal(ev(g, v("rivals.maxResources"), "f1", p), 12);
  assert.equal(ev(g, v("rivals.minResources"), "f1", p), 3);
  assert.equal(ev(g, v("rivals.maxResources"), "f3", p), 7);
  const margins = ["f2", "f3", "f4"].map((f) => ev(g, v(`margin.${f}`), "f1"));
  assert.equal(ev(g, v("rivals.maxMargin"), "f1"), Math.max(...margins));
});

test("factionCount counts every piece of a faction, in a space or on the whole map", () => {
  const g = valleys();
  const f3 = g.factions.find((f) => f.id === "f3");
  const onMap = g.setup.placements.filter((p) => f3.pieces.some((x) => x.id === p.piece)).reduce((s, p) => s + p.count, 0);
  assert.equal(ev(g, { op: "factionCount", args: ["f3", "*", "*"] }, "f1"), onMap);
  const sp = g.setup.placements.find((p) => p.piece.startsWith("f3."));
  assert.ok(ev(g, { op: "factionCount", args: ["f3", sp.space, "*"] }, "f1") >= sp.count);
});

test("other.resources is gone: the validator rejects it", () => {
  const g = valleys();
  g.bots[0].eventPolicy.playIf = { op: "gt", args: [v("other.resources"), 3] };
  assert.ok(validate(g).errors.some((e) => e.code === "bad-var" && /other\.resources/.test(e.message)));
});

test("migration rewrites other.resources where the acting faction is known", () => {
  const g = load("tan-war");
  g.meta.schemaVersion = "coin-game/1.2.0";
  g.bots[0].eventPolicy.playIf = { op: "gt", args: [v("other.resources"), 3] };
  g.actions[0].targets = { op: "lt", args: [v("other.resources"), 5] };
  const m = migrate(g);
  assert.equal(m.meta.schemaVersion, LATEST);
  assert.deepEqual(m.bots[0].eventPolicy.playIf.args[0], v(`resources.${g.factions.find((f) => f.id !== g.bots[0].factionId).id}`));
  assert.deepEqual(m.actions[0].targets.args[0], v(`resources.${g.factions.find((f) => f.id !== g.actions[0].faction).id}`));
});

// A bot for the Mountain Front (f3) that first picks the enemy closest to victory, then acts where that enemy has pieces.
function targetBot(g) {
  const b = g.bots.find((x) => x.factionId === "f3");
  const act = b.nodes.find((n) => n.kind === "action");
  b.priorityTables.push({ id: `${b.code.toLowerCase()}.enemy`, scope: "opponent", select: "one", steps: [{ n: 1, text: "A state faction.", filter: { op: "eq", args: [v("$faction.type"), "state"] } }, { n: 2, text: "Any enemy.", filter: true }], tiebreak: [{ letter: "a", text: "Highest victory margin.", key: v("$faction.margin"), order: "max" }] });
  act.target = `${b.code.toLowerCase()}.enemy`;
  const t = b.priorityTables.find((x) => x.id === act.table);
  t.steps = [{ n: 1, text: "A space with the target's pieces.", filter: { op: "gte", args: [{ op: "factionCount", args: [v("$target.id"), S, "*"] }, 1] } }, { n: 2, text: "Any legal space.", filter: true }];
  return { b, act };
}

test("an opponent table picks the enemy and the space table acts against it", () => {
  const g = valleys(); const { b } = targetBot(g);
  const base = deriveState(g, "f3");
  const r = runBot(g, b, applyPatch(base, { card: { id: "e01", hasEffect: false }, dice: [3, 3] }));
  assert.ok(["f1", "f2"].includes(r.target), `target ${r.target}`);
  assert.ok(r.chosen.length >= 1);
});

test("a space table reads $target: it picks a space where the target has pieces", () => {
  const g = valleys();
  const st = deriveState(g, "f3");
  const table = { id: "t", scope: "space", select: "one", steps: [{ n: 1, text: "", filter: { op: "gte", args: [{ op: "factionCount", args: [v("$target.id"), S, "*"] }, 1] } }], tiebreak: [{ letter: "a", text: "", key: { op: "factionCount", args: [v("$target.id"), S, "*"] }, order: "max" }] };
  for (const target of ["f1", "f2"]) {
    st.dice = [1];
    const [sp] = selectByTable(g, st, table, Object.values(st.spaces), { cost: { per: "space", amount: 0 } }, { $target: target });
    assert.ok(evalExpr({ op: "factionCount", args: [target, sp.id, "*"] }, { state: st, links: g.board.links }) >= 1, `${target} in ${sp.id}`);
  }
});

test("an opponent tie with no explicit die is an error, and a die breaks it", () => {
  const g = valleys(); const { b } = targetBot(g);
  b.priorityTables.find((t) => t.scope === "opponent").tiebreak = [];
  const base = deriveState(g, "f3");
  assert.throws(() => runBot(g, b, applyPatch(base, { card: { id: "e01", hasEffect: false } })), /die/);
  const r = runBot(g, b, applyPatch(base, { card: { id: "e01", hasEffect: false }, dice: [6, 6] }));
  assert.ok(["f1", "f2"].includes(r.target));
});

test("dry runs compare the expected target", () => {
  const g = valleys(); const { b } = targetBot(g);
  const d = b.dryRuns.find((x) => x.case === "no-target") ?? b.dryRuns[0];
  const r = runBot(g, b, applyPatch(deriveState(g, "f3"), d.patch));
  d.expect = { outcome: r.outcome, path: r.path, ...(r.chosen.length ? { chosen: r.chosen } : {}), ...(r.target ? { target: r.target === "f1" ? "f2" : "f1" } : {}) };
  if (r.target) assert.ok(validate(g).errors.some((e) => e.code === "dry-run-mismatch" && /target/.test(e.message)));
});

test("validator: a node target must be an opponent table, and $target needs a node target", () => {
  const g = valleys(); const { act } = targetBot(g);
  act.target = act.table;
  const errs = validate(g).errors;
  assert.ok(errs.some((e) => e.code === "bad-target"), JSON.stringify(errs.slice(0, 3)));
  const h = valleys(); const t = targetBot(h); delete t.act.target;
  assert.ok(validate(h).errors.some((e) => e.code === "bad-var" && /\$target/.test(e.message)));
});

test("validator: $faction only in opponent tables, faction ids must exist", () => {
  const g = valleys();
  g.bots[0].eventPolicy.playIf = { op: "gt", args: [v("$faction.margin"), 0] };
  assert.ok(validate(g).errors.some((e) => e.code === "bad-var" && /\$faction/.test(e.message)));
  const h = valleys();
  h.bots[0].eventPolicy.playIf = { op: "gt", args: [v("resources.nobody"), 0] };
  assert.ok(validate(h).errors.some((e) => e.code === "missing-ref" && /nobody/.test(e.message)));
});

test("the expression model shows faction counts and per-faction values without the JSON fallback", () => {
  const e = { op: "gte", args: [{ op: "factionCount", args: [v("$target.id"), S, "*"] }, 2] };
  assert.equal(toCond(e).a.k, "fcount"); assert.deepEqual(fromCond(toCond(e)), e);
  const f = { op: "factionCount", args: ["f2", "*", "active"] };
  assert.deepEqual(toValue(f), { k: "fcount", faction: "f2", at: "*", state: "active" }); assert.deepEqual(fromValue(toValue(f)), f);
});

test("bot codes are unique, also for factions with the same initials", () => {
  const g = valleys();
  g.factions[0].name = "Republic Army"; g.factions[3].name = "Rebel Army";
  g.bots = [newBot(g, "f1")];
  g.bots.push(newBot(g, "f4"));
  assert.notEqual(g.bots[0].code, g.bots[1].code);
  assert.notEqual(g.bots[0].start.split(".")[0], g.bots[1].start.split(".")[0], "node ids differ too");
  g.bots[1].code = g.bots[0].code;
  assert.ok(validate(g).errors.some((e) => e.code === "duplicate-code"));
});
