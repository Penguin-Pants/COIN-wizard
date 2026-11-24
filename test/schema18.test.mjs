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

test("the latest version is 1.8.0, and a frozen 1.7.0 file migrates with only its version changed", () => {
  assert.equal(LATEST, "coin-game/1.8.0");
  const old = read("./fixtures/tan-war.1.7.0.game.json");
  assert.equal(old.meta.schemaVersion, "coin-game/1.7.0");
  const m = migrate(old);
  assert.equal(m.meta.schemaVersion, "coin-game/1.8.0");
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
