import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as B from "../src/boardsuggest.mjs";
import { blankGame } from "../src/blank.mjs";
import { validate } from "../src/validate.mjs";

// fillBoard: Claude's board suggestion fills only empty fields (owner decision, 2026-11-22).
// Placeholder spaces ("Space N", "New space N", with no pieces and no references) count as empty.
const load = (f) => JSON.parse(readFileSync(new URL(`../examples/${f}.game.json`, import.meta.url), "utf8"));
const errors = (g) => validate(g).errors.filter((i) => /^\/(board|setup|tracks)/.test(i.path)).map((i) => i.message);
const fill = (g, r) => { try { return B.fillBoard(g, r); } catch (e) { return { error: e.message, game: g, report: {} }; } };
const names = (g) => g.board.spaces.map((s) => s.name);

function answer(g, extra = {}) {
  const p = g.factions[0].pieces[0], q = g.factions[1].pieces[0];
  return {
    spaces: [
      { name: "Harare", type: "city", pop: 3, opinion: 1 },
      { name: "Mashonaland", type: "province", pop: 2, opinion: -1 },
      { name: "Border", type: "sanctuary", pop: 0, opinion: 0 }
    ],
    links: [{ from: "Harare", to: "Mashonaland" }, { from: "Mashonaland", to: "Border" }],
    placements: [{ space: "Harare", piece: p.id, state: p.states[0], count: 2 }, { space: "Border", piece: q.id, state: q.states[0], count: 1 }],
    outOfPlay: { [q.id]: 1 },
    tracks: Object.fromEntries(g.tracks.map((t) => [t.id, 9])),
    eligibility: { [g.factions[1].id]: false },
    ...extra
  };
}

test("a blank project: placeholders are replaced and every default field is filled", () => {
  const g = blankGame(2), r = fill(g, answer(g));
  assert.equal(r.error, undefined);
  assert.deepEqual(names(r.game), ["Harare", "Mashonaland", "Border"]);
  assert.equal(r.game.board.links.length, 2);
  assert.equal(r.game.setup.placements.length, 2);
  for (const t of g.tracks) assert.equal(r.game.setup.tracks[t.id], 9, `track ${t.id}`);
  assert.equal(r.game.setup.eligibility[g.factions[1].id], false);
  assert.equal(r.report.removed?.length, g.board.spaces.length);
  assert.deepEqual(errors(r.game), []);
});

test("a space the designer named or edited is kept as it is; Claude only adds new spaces", () => {
  const g = blankGame(2);
  Object.assign(g.board.spaces[0], { name: "Harare", type: "city" }); g.board.spaces[0].attrs.pop = 1;
  const r = fill(g, answer(g));
  assert.equal(r.game.board.spaces.find((s) => s.name === "Harare")?.attrs.pop, 1, "kept pop, not Claude's 3");
  assert.equal(r.game.board.spaces[0].id, g.board.spaces[0].id, "kept id");
  assert.deepEqual(names(r.game), ["Harare", "Mashonaland", "Border"]);
  assert.deepEqual(errors(r.game), []);
});

test("a full board is never reduced: Tan War keeps every space, piece, track and eligibility value", () => {
  const g = load("tan-war"), r = fill(g, answer(g, { spaces: [{ name: "Dublin", type: "province", pop: 0 }, { name: "Ulster border", type: "province", pop: 1, opinion: 0 }], links: [{ from: "Dublin", to: "Ulster border" }], placements: [{ space: "Ulster border", piece: "ira.volunteer", state: "underground", count: 3 }], eligibility: { crown: false } }));
  assert.equal(r.error, undefined);
  for (const s of g.board.spaces) assert.deepEqual(r.game.board.spaces.find((x) => x.id === s.id), s, `space ${s.id} unchanged`);
  assert.deepEqual(names(r.game).slice(-1), ["Ulster border"]);
  assert.equal(r.game.board.links.length, g.board.links.length + 1);
  assert.deepEqual(r.game.setup.placements, g.setup.placements, "Volunteers were already placed");
  assert.deepEqual(r.game.setup.pools, g.setup.pools);
  assert.deepEqual(r.game.setup.tracks, g.setup.tracks, "track starts were set by the designer");
  // Starting Eligible is the default, so it counts as empty and takes Claude's value.
  assert.equal(r.game.setup.eligibility.crown, false);
  assert.ok(r.report.skipped?.length > 0, "the report lists what was kept");
  assert.deepEqual(errors(r.game), []);
});

test("a placeholder with pieces on it, or named elsewhere, is kept", () => {
  const g = blankGame(2), p = g.factions[0].pieces[0];
  g.setup.placements.push({ space: "space2", piece: p.id, state: p.states[0], count: 1 });
  g.setup.pools[p.id].available -= 1;
  g.victory.finalScoring = "Control of space3 wins ties.";
  g.actions.push({ id: "x.a", faction: g.factions[0].id, kind: "operation", name: "A", plain: "", dependsOn: [], cost: { track: g.tracks[0].id, amount: 0, per: "use" }, targets: { op: "eq", args: [{ var: "$space.id" }, "space3"] }, steps: [] });
  const r = fill(g, answer(g));
  assert.equal(r.error, undefined);
  assert.ok(names(r.game).includes("Space 2"), "has pieces");
  assert.ok(names(r.game).includes("Space 3"), "named by an action");
  assert.deepEqual(r.game.setup.placements.filter((x) => x.piece === p.id), [{ space: "space2", piece: p.id, state: p.states[0], count: 1 }], "the piece already had a placement");
});

test("the prompt lists the spaces the designer set, so new spaces link to them, and leaves placeholders out", () => {
  const g = blankGame(2);
  g.board.spaces[0].name = "Harare";
  g.brief.sources = [{ id: "s1", url: "u", status: "read" }];
  const p = B.boardPrompt(g, { s1: "text" });
  assert.match(p, /Spaces the designer already set \(keep these names exactly and link new spaces to them\): Harare\./);
  assert.doesNotMatch(p, /Space 2/);
});

// Codex review of PR 19: a placeholder named by its displayed name elsewhere is kept too.
test("a placeholder named by its displayed name in rules or victory text is kept", () => {
  const g = blankGame(2);
  g.victory.finalScoring = "Control of Space 3 wins ties.";
  const r = fill(g, answer(g));
  assert.equal(r.error, undefined);
  assert.ok(names(r.game).includes("Space 3"));
  assert.ok(!names(r.game).includes("Space 30"), "sanity");
  assert.ok(!names(r.game).includes("Space 2"), "unreferenced placeholders are still replaced");
});
