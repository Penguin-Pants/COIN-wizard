import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { validate } from "../src/validate.mjs";
import { migrate, LATEST } from "../src/migrate.mjs";
import { evalExpr, VAR_OK } from "../src/expr.mjs";
import { runBot, selectByTable } from "../src/dryrun.mjs";
import { deriveState, applyPatch } from "../src/state.mjs";
import { varText } from "../src/plain.mjs";
import { applyAction } from "../src/effects.mjs";
import { aidModel, toMermaid, toMarkdown, toPolicyYaml } from "../src/botaid.mjs";
import { buildFiles } from "../src/kit.mjs";

// Schema 1.8.0, from the GMT Non-Player sheet research (docs/research/bot-patterns):
// - card.position: this faction's place in the current card's faction order (gap 2)
// - turn.position: 1st or 2nd Eligible (gap 3)
// - canPlace(piece, space): a piece is Available and has room in the space (gap 4)
// - canDo(action, space): an action is legal and affordable in the space (gap 5)
// - a step of a space table may name its own target faction (gap 10)
const read = (rel) => JSON.parse(readFileSync(new URL(rel, import.meta.url), "utf8"));
const tan = () => read("../examples/tan-war.game.json");
const valleys = () => read("../examples/four-valleys.game.json");
const S = { var: "$space.id" };
const ev = (g, self, e, patch, sid) => { const st = applyPatch(deriveState(g, self), patch); return evalExpr(e, { state: st, links: g.board.links, ...(sid ? { $space: st.spaces[sid] } : {}) }); };
const codes = (g) => validate(g).errors.map((e) => e.code);

test("a frozen 1.7.0 file migrates to the latest version with only its version changed", () => {
  const old = read("./fixtures/tan-war.1.7.0.game.json");
  assert.equal(old.meta.schemaVersion, "coin-game/1.7.0");
  const m = migrate(old);
  assert.equal(m.meta.schemaVersion, LATEST);
  assert.deepEqual(validate(m).errors, []);
  m.meta.schemaVersion = old.meta.schemaVersion; assert.deepEqual(m, old);
});

test("card.position is this faction's place in the card's faction order, 0 if not listed", () => {
  const g = tan(); // e03 (no override) order: crown, ira
  for (const [self, pos] of [["crown", 1], ["ira", 2]]) {
    const b = g.bots.find((x) => x.factionId === self);
    b.eventPolicy.playIf = { op: "eq", args: [{ var: "card.position" }, 1] };
    const r = runBot(g, b, applyPatch(deriveState(g, self), { card: { id: "e03" }, dice: [3, 3, 3, 3, 3, 3] }));
    assert.equal(r.side !== undefined, pos === 1, `${self} is ${pos} on e03`);
  }
  g.deck.cards.find((c) => c.id === "e03").order = ["crown"];
  const b = g.bots.find((x) => x.factionId === "ira");
  b.eventPolicy.playIf = { op: "eq", args: [{ var: "card.position" }, 0] };
  assert.ok(runBot(g, b, applyPatch(deriveState(g, "ira"), { card: { id: "e03" }, dice: [3, 3, 3, 3, 3, 3] })).side, "not listed is 0");
  // A dry-run patch may set it.
  b.eventPolicy.playIf = { op: "eq", args: [{ var: "card.position" }, 2] };
  assert.ok(runBot(g, b, applyPatch(deriveState(g, "ira"), { card: { id: "e03", position: 2 }, dice: [3, 3, 3, 3, 3, 3] })).side);
});

test("turn.position is 1 unless a dry run sets it to 2", () => {
  const g = tan(), t = { var: "turn.position" };
  assert.equal(ev(g, "ira", t), 1);
  assert.equal(ev(g, "ira", t, { turn: { position: 2 } }), 2);
});

test("canPlace needs an Available piece and room under its limit per space", () => {
  const g = tan(), hq = (sid) => ({ op: "canPlace", args: ["ira.hq", sid] });
  const sid = g.board.spaces[0].id;
  assert.equal(ev(g, "ira", hq(sid), { spaces: { [sid]: { pieces: { "ira.hq": {} } } } }), true);
  assert.equal(ev(g, "ira", hq(sid), { spaces: { [sid]: { pieces: { "ira.hq": { normal: 1 } } } } }), false, "max 1 per space");
  const empty = applyPatch(deriveState(g, "ira"), { spaces: { [sid]: { pieces: { "ira.hq": {} } } } });
  empty.pools["ira.hq"].available = 0;
  assert.equal(evalExpr(hq(sid), { state: empty, links: g.board.links }), false, "none Available");
  // "*": some space has room; $space works inside a table.
  assert.equal(ev(g, "ira", hq("*")), true);
  assert.equal(ev(g, "ira", { op: "canPlace", args: ["ira.hq", S] }, { spaces: { [sid]: { pieces: { "ira.hq": {} } } } }, sid), true);
});

test("canDo is true where the action is legal and its owner can pay", () => {
  const g = tan(), a = g.actions.find((x) => x.id === "ira.attack");
  const st = deriveState(g, "ira");
  const legal = (sid) => !!evalExpr(a.targets, { state: st, links: g.board.links, $space: st.spaces[sid] });
  const yes = g.board.spaces.find((s) => legal(s.id)), no = g.board.spaces.find((s) => !legal(s.id));
  assert.ok(yes && no, "the example has legal and illegal spaces for ira.attack");
  assert.equal(ev(g, "ira", { op: "canDo", args: ["ira.attack", yes.id] }), true);
  assert.equal(ev(g, "ira", { op: "canDo", args: ["ira.attack", no.id] }), false);
  assert.equal(ev(g, "ira", { op: "canDo", args: ["ira.attack", "*"] }), true);
  if (a.cost.amount > 0) assert.equal(ev(g, "ira", { op: "canDo", args: ["ira.attack", yes.id] }, { resources: { ira: a.cost.amount - 1 } }), false, "cannot pay");
});

test("the new variables and ops validate, read as plain English and reject unknown ids", () => {
  for (const n of ["card.position", "turn.position"]) { assert.match(n, VAR_OK); assert.notEqual(varText(tan(), n), n); }
  const g = tan(), b = g.bots.find((x) => x.factionId === "ira");
  const cond = b.nodes.find((n) => n.kind === "condition");
  cond.test = { op: "and", args: [{ op: "canPlace", args: ["ira.hq", "*"] }, { op: "canDo", args: ["ira.attack", "*"] }, { op: "eq", args: [{ var: "turn.position" }, 1] }, { op: "eq", args: [{ var: "card.position" }, 1] }] };
  assert.deepEqual(validate(g).errors.filter((e) => e.code !== "dry-run-mismatch"), []);
  cond.test = { op: "canPlace", args: ["nosuch", "*"] };
  assert.ok(codes(g).includes("missing-ref"));
  cond.test = { op: "canDo", args: ["nosuch", "*"] };
  assert.ok(codes(g).includes("missing-ref"));
});

// Gap 10: Kidnap "On LoCs (against Government) ... In Cartels Base Dept (against Cartels)".
function stepTargets() {
  const g = valleys(), b = g.bots.find((x) => x.factionId === "f3");
  const ids = g.board.spaces.map((s) => s.id);
  const t = { id: "f3.t.kid", scope: "space", select: "all", limit: 2, mode: "sequence", tiebreak: [], steps: [
    { n: 1, text: "Against f2, if it has 5+ Resources.", target: "f2", filter: { op: "and", args: [{ op: "eq", args: [S, ids[0]] }, { op: "gte", args: [{ var: "$target.resources" }, 5] }] } },
    { n: 2, text: "Against f4.", target: "f4", filter: { op: "eq", args: [S, ids[1]] } }
  ] };
  b.priorityTables.push(t);
  return { g, b, t, ids };
}

test("a step's target is checked: an enemy faction, only in a space table", () => {
  const { g, t } = stepTargets();
  assert.deepEqual(validate(g).errors.filter((e) => e.path.includes("f3.t.kid") || /priorityTables\/\d+\/steps/.test(e.path)), []);
  t.steps[0].target = "nosuch"; assert.ok(codes(g).includes("missing-ref"));
  t.steps[0].target = "f3"; assert.ok(codes(g).includes("step-target"), "not the bot's own faction");
  t.steps[0].target = "f2"; t.scope = "opponent"; assert.ok(codes(g).includes("step-target"), "only in a space table");
});

test("a step's filter reads that step's target, and each chosen space keeps its step's target", () => {
  const { g, t, ids } = stepTargets();
  const run = (res) => { const st = applyPatch(deriveState(g, "f3"), { resources: res }); return selectByTable(g, st, t, Object.values(st.spaces), { cost: { amount: 0 } }); };
  let sel = run({ f2: 9 });
  assert.deepEqual(sel.map((s) => s.id), [ids[0], ids[1]]);
  assert.deepEqual([...sel.targetOf.entries()], [[ids[0], "f2"], [ids[1], "f4"]]);
  sel = run({ f2: 0 });
  assert.deepEqual(sel.map((s) => s.id), [ids[1]], "f2 has too few Resources");
  assert.equal(sel.targetOf.get(ids[1]), "f4");
});

test("the aid and the print kit show a step's target", () => {
  const { g, b } = stepTargets();
  b.nodes.find((n) => n.kind === "action" && n.table).table = "f3.t.kid";
  const m = aidModel(g, b);
  const rows = m.tables.at(-1).rows.map((r) => r[1]);
  assert.match(rows[0], /Target: Valley Militia/);
  const html = Object.fromEntries(buildFiles(g, { toMermaid, toMarkdown, toPolicyYaml }))[`kit/${g.meta.gameId}.f3.nonplayer.html`] ?? "";
  assert.match(html, /Target: River Brigades/);
});

test("a chosen space runs the action against its step's target", () => {
  const { g, b, t, ids } = stepTargets();
  // f3.strike: one choice option per enemy; each lowers that enemy's Resources by 1.
  const a = g.actions.find((x) => x.id === "f3.strike");
  const track = (fid) => g.factions.find((f) => f.id === fid).resourceTrack;
  a.steps = [{ op: "choose", options: ["f2", "f4"].map((fid) => ({ label: fid, faction: fid, steps: [{ op: "track", id: track(fid), delta: -1 }] })) }];
  a.targets = true; a.maxSpaces = 2;
  const node = b.nodes.find((n) => n.id === "mf.strike"); node.table = t.id; delete node.linked;
  const st = applyPatch(deriveState(g, "f3"), { resources: { f2: 9, f4: 9 } });
  const r = runBot(g, b, st);
  assert.deepEqual(r.chosen, [ids[0], ids[1]]);
  assert.deepEqual(r.targets, { [ids[0]]: "f2", [ids[1]]: "f4" });
  // The effect runs once per space, against that space's target.
  const s2 = applyPatch(deriveState(g, "f3"), { resources: { f2: 9, f4: 9 } });
  applyAction(g, s2, a, [ids[0], ids[1]], {}, { targetOf: new Map([[ids[0], "f2"], [ids[1], "f2"]]) });
  assert.deepEqual([s2.resources.f2, s2.resources.f4], [7, 9]);
});

// Codex review on #27.
// An action with one option per enemy: option f2 is never legal, option f4 is legal in ids[1] only.
function optionAction() {
  const { g, b, t, ids } = stepTargets();
  const a = g.actions.find((x) => x.id === "f3.strike");
  const track = (fid) => g.factions.find((f) => f.id === fid).resourceTrack;
  a.targets = true; a.maxSpaces = 2;
  a.steps = [{ op: "choose", options: [
    { label: "f2", faction: "f2", legal: false, steps: [{ op: "track", id: track("f2"), delta: -1 }] },
    { label: "f4", faction: "f4", legal: { op: "eq", args: [S, ids[1]] }, steps: [{ op: "track", id: track("f4"), delta: -1 }] }
  ] }];
  const node = b.nodes.find((n) => n.id === "mf.strike"); node.table = t.id; delete node.linked;
  return { g, b, t, ids, a, node };
}

test("a step's spaces are the spaces legal against its own target, not the node's", () => {
  const { g, b, ids } = optionAction();
  const r = runBot(g, b, applyPatch(deriveState(g, "f3"), { resources: { f2: 9 }, dice: [1, 1, 1] }));
  assert.ok(r.path.includes("mf.strike"), `Strike runs: ${r.path.join(">")}`);
  assert.deepEqual(r.chosen, [ids[1]], "row 2 (against f4) finds its space although option f2 is never legal");
  assert.deepEqual(r.targets, { [ids[1]]: "f4" });
});

test("after a before-timed Special Activity, each space is checked again against its own target", () => {
  const { g, b, ids, a, node } = optionAction();
  // Option f2 is always legal. Option f4 is legal in ids[1] only while f4 has 5+ Resources.
  // The linked activity takes 9 from f4 first.
  a.steps[0].options[0].legal = true;
  a.steps[0].options[1].legal = { op: "and", args: [{ op: "eq", args: [S, ids[1]] }, { op: "gte", args: [{ var: "resources.f4" }, 5] }] };
  const sa = g.actions.find((x) => x.id === "f3.ambush");
  sa.targets = true; sa.steps = [{ op: "track", id: g.factions.find((f) => f.id === "f4").resourceTrack, delta: -9 }]; sa.cost = { ...sa.cost, amount: 0 };
  const any = { id: "f3.t.any", scope: "space", select: "one", tiebreak: [], steps: [{ n: 1, text: "Any.", filter: true }] };
  b.priorityTables.push(any);
  node.linked = { action: "f3.ambush", timing: "before", trigger: true, table: any.id };
  const r = runBot(g, b, applyPatch(deriveState(g, "f3"), { resources: { f2: 9, f4: 9 }, dice: [1, 1, 1] }));
  assert.ok(r.path.includes("mf.strike"), `Strike runs: ${r.path.join(">")}`);
  assert.deepEqual(r.chosen, [ids[0]], "row 1 (against f2) keeps its space; row 2's space is no longer legal against f4");
});

test("canDo reads another faction's action as that faction", () => {
  const g = tan(), a = g.actions.find((x) => x.id === "ira.attack");
  a.targets = { op: "gte", args: [{ var: "self.resources" }, 5] };
  const q = { op: "canDo", args: ["ira.attack", "*"] };
  const p = { resources: { ira: 10, crown: 0 } };
  assert.equal(ev(g, "ira", q, p), true);
  assert.equal(ev(g, "crown", q, p), true, "the same board gives the same answer from Crown");
});

test("with parts and a before-timed Special Activity, the precheck reads each step's own target", () => {
  const { g, b, t, ids, node } = optionAction();
  // One part with the step-target table; a before-timed linked activity that changes nothing.
  const a = g.actions.find((x) => x.id === "f3.strike");
  node.parts = [{ text: "Strike.", table: t.id, steps: a.steps }]; delete node.table;
  const sa = g.actions.find((x) => x.id === "f3.ambush");
  sa.targets = true; sa.steps = []; sa.cost = { ...sa.cost, amount: 0 };
  const any = { id: "f3.t.any", scope: "space", select: "one", tiebreak: [], steps: [{ n: 1, text: "Any.", filter: true }] };
  b.priorityTables.push(any);
  node.linked = { action: "f3.ambush", timing: "before", trigger: true, table: any.id };
  // Option f2 is always legal here. Row 1 reads $target.resources (f2 has 9), so the precheck must bind f2.
  a.steps[0].options[0].legal = true;
  const r = runBot(g, b, applyPatch(deriveState(g, "f3"), { resources: { f2: 9 }, dice: [1, 1, 1] }));
  assert.ok(r.path.includes("mf.strike"), `Strike runs: ${r.path.join(">")}`);
  assert.ok(r.chosen.includes(ids[0]));
});

test("in parts, a step's spaces are the spaces legal against its own target", () => {
  const asParts = (o) => { const a = o.g.actions.find((x) => x.id === "f3.strike"); o.node.parts = [{ text: "Strike.", table: o.t.id, steps: a.steps }]; delete o.node.table; return o; };
  // Option f2 never legal, f4 legal in ids[1]: row 2 (against f4) finds ids[1].
  let o = asParts(optionAction());
  let r = runBot(o.g, o.b, applyPatch(deriveState(o.g, "f3"), { resources: { f2: 9 }, dice: [1, 1, 1] }));
  assert.ok(r.path.includes("mf.strike"), `Strike runs: ${r.path.join(">")}`);
  assert.deepEqual(r.chosen, [o.ids[1]]);
  assert.deepEqual(r.targets, { [o.ids[1]]: "f4" }, "parts report their step targets too");
  // Reversed: f2 always legal, f4 never. Row 2 must not act against f4.
  o = optionAction();
  o.a.steps[0].options[0].legal = true; o.a.steps[0].options[1].legal = false;
  asParts(o);
  r = runBot(o.g, o.b, applyPatch(deriveState(o.g, "f3"), { resources: { f2: 9 }, dice: [1, 1, 1] }));
  assert.deepEqual(r.chosen, [o.ids[0]], "row 1 against f2 only");
});

test("a space dropped after a before-timed Special Activity is not in the reported targets", () => {
  const { g, b, ids, a, node } = optionAction();
  a.steps[0].options[0].legal = true;
  a.steps[0].options[1].legal = { op: "and", args: [{ op: "eq", args: [S, ids[1]] }, { op: "gte", args: [{ var: "resources.f4" }, 5] }] };
  const sa = g.actions.find((x) => x.id === "f3.ambush");
  sa.targets = true; sa.steps = [{ op: "track", id: g.factions.find((f) => f.id === "f4").resourceTrack, delta: -9 }]; sa.cost = { ...sa.cost, amount: 0 };
  const any = { id: "f3.t.any", scope: "space", select: "one", tiebreak: [], steps: [{ n: 1, text: "Any.", filter: true }] };
  b.priorityTables.push(any);
  node.linked = { action: "f3.ambush", timing: "before", trigger: true, table: any.id };
  const r = runBot(g, b, applyPatch(deriveState(g, "f3"), { resources: { f2: 9, f4: 9 }, dice: [1, 1, 1] }));
  assert.deepEqual(r.chosen, [ids[0]]);
  assert.deepEqual(r.targets, { [ids[0]]: "f2" }, "only the spaces the Operation runs in");
});

test("canDo reads card.position as the action's faction", () => {
  const g = tan(), a = g.actions.find((x) => x.id === "ira.attack");
  a.targets = { op: "eq", args: [{ var: "card.position" }, 2] }; // e03: Crown first, IRA second
  const q = { op: "canDo", args: ["ira.attack", "*"] };
  for (const self of ["ira", "crown"]) {
    const b = g.bots.find((x) => x.factionId === self);
    b.eventPolicy.playIf = q; b.eventPolicy.overrides = [];
    const r = runBot(g, b, applyPatch(deriveState(g, self), { card: { id: "e03" }, dice: [3, 3, 3, 3, 3, 3] }));
    assert.ok(r.side !== undefined, `${self}: IRA is second on e03, so ira.attack is possible`);
  }
});

test("canDo reads card.lasting as the action's faction", () => {
  const g = tan(), a = g.actions.find((x) => x.id === "ira.attack");
  // IRA's bot plays the shaded side of e03; give only that side a momentum effect.
  const ib = g.bots.find((x) => x.factionId === "ira"); ib.eventPolicy.side = "shaded"; ib.eventPolicy.overrides = [];
  const card = g.deck.cards.find((c) => c.id === "e03");
  for (const sd of card.sides) sd.lasting = sd.id === "shaded" ? "momentum" : "none";
  a.targets = { op: "eq", args: [{ var: "card.lasting" }, "momentum"] };
  const cb = g.bots.find((x) => x.factionId === "crown"); cb.eventPolicy.side = "unshaded"; cb.eventPolicy.overrides = [];
  cb.eventPolicy.playIf = { op: "canDo", args: ["ira.attack", "*"] };
  const r = runBot(g, cb, applyPatch(deriveState(g, "crown"), { card: { id: "e03" }, dice: [3, 3, 3, 3, 3, 3] }));
  assert.ok(r.side !== undefined, "IRA plays the shaded side, which is momentum");
});

test("a table tie-break may read $target when every step that uses it has a target", () => {
  const { g, t } = stepTargets();
  t.tiebreak = [{ letter: "a", text: "Most target pieces.", key: { op: "factionCount", args: [{ var: "$target.id" }, S, "*"] }, order: "max" }];
  assert.deepEqual(validate(g).errors.filter((e) => e.code === "bad-var"), []);
  delete t.steps[1].target; // step 2 now uses the table tie-break with no target
  assert.ok(validate(g).errors.some((e) => e.code === "bad-var"));
});

test("a later action node without step targets clears the earlier node's targets", () => {
  const { g, b, ids, node } = optionAction();
  // After Strike (with step targets), go to a second action node whose table has no targets.
  const any = { id: "f3.t.any2", scope: "space", select: "one", tiebreak: [], steps: [{ n: 1, text: "Space 3.", filter: { op: "eq", args: [S, ids[2]] } }] };
  b.priorityTables.push(any);
  const a2 = g.actions.find((x) => x.id === "f3.strike");
  g.actions.push({ ...structuredClone(a2), id: "f3.strike2", steps: [], targets: true });
  b.nodes.push({ id: "mf.strike2", kind: "action", text: "Again.", action: "f3.strike2", table: any.id, then: node.then, onEmpty: node.then });
  node.then = "mf.strike2";
  const r = runBot(g, b, applyPatch(deriveState(g, "f3"), { resources: { f2: 9 }, dice: [1, 1, 1] }));
  assert.ok(r.path.includes("mf.strike2"), r.path.join(">"));
  assert.deepEqual(r.chosen, [ids[2]]);
  assert.equal(r.targets, undefined, "no targets for the second node's spaces");
});
