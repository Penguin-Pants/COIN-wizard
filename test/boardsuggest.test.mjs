import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { boardPrompt, applyBoard } from "../src/boardsuggest.mjs";
import { validate } from "../src/validate.mjs";

const load = (f) => JSON.parse(readFileSync(new URL(`../examples/${f}.game.json`, import.meta.url), "utf8"));
const errors = (g) => validate(g).errors.filter((i) => /^\/(board|setup|tracks)/.test(i.path)).map((i) => i.message);
const piecesOf = (g) => g.factions.flatMap((f) => f.pieces);

// A suggestion as Claude returns it: spaces and links by name, pieces by id.
function suggestion(g) {
  const ps = piecesOf(g);
  return {
    spaces: [
      { name: g.board.spaces[0].name.toUpperCase(), type: "city", pop: 3, opinion: 1 },
      { name: "Mashonaland East", type: "province", pop: 2, opinion: -1 },
      { name: "Mozambique border", type: "sanctuary", pop: 0, opinion: 0 },
      { name: "Mashonaland East", type: "province", pop: 1 },
      { name: "Bad type", type: "castle", pop: 99, opinion: 7 }
    ],
    links: [
      { from: g.board.spaces[0].name, to: "Mashonaland East" },
      { from: "Mashonaland East", to: "Mozambique border" },
      { from: "Mozambique border", to: "Bad type" },
      { from: "Mashonaland East", to: g.board.spaces[0].name },
      { from: "Nowhere", to: "Mashonaland East" },
      { from: "Bad type", to: "Bad type" }
    ],
    placements: [
      { space: "Mashonaland East", piece: ps[0].id, state: ps[0].states[0], count: 2 },
      { space: "Mozambique border", piece: ps[1].id, state: "no-such-state", count: 1 },
      { space: "Mashonaland East", piece: "no-such-piece", state: "x", count: 3 },
      { space: "Nowhere", piece: ps[0].id, state: ps[0].states[0], count: 1 },
      { space: "Bad type", piece: ps[0].id, state: ps[0].states[0], count: 9999 }
    ],
    outOfPlay: { [ps[1].id]: 1 },
    tracks: { [g.tracks[0].id]: g.tracks[0].max + 50 },
    eligibility: { [g.factions[0].id]: false }
  };
}

test("prompt names the pieces, tracks and space types and carries only read source text", () => {
  const g = load("four-valleys");
  g.brief.sources = [{ id: "s1", url: "u1", status: "read" }, { id: "s2", url: "u2", status: "pending" }];
  const p = boardPrompt(g, { s1: "READ TEXT about valleys.", s2: "UNREAD TEXT" });
  for (const x of piecesOf(g)) assert.ok(p.includes(x.id), `piece ${x.id}`);
  for (const t of g.tracks) assert.ok(p.includes(t.id), `track ${t.id}`);
  assert.ok(p.includes("sanctuary"));
  assert.ok(p.includes("READ TEXT about valleys."));
  assert.ok(!p.includes("UNREAD TEXT"));
});

test("prompt refuses to run with no read source", () => {
  const g = load("tan-war"); g.brief.sources = [{ id: "s1", url: "u", status: "pending" }];
  assert.throws(() => boardPrompt(g, { s1: "x" }), /No source text/);
});

for (const ex of ["tan-war", "harbor-strike", "four-valleys"]) {
  test(`applied suggestion leaves a valid board and setup (${ex})`, () => {
    const g = load(ex);
    const { game, report } = applyBoard(g, suggestion(g));
    assert.deepEqual(errors(game), []);
    assert.equal(game.board.spaces.length, 4, "duplicate name dropped");
    // A matching name keeps its id, so actions and cards that name it still work.
    assert.equal(game.board.spaces[0].id, g.board.spaces[0].id);
    assert.deepEqual(report.kept, [g.board.spaces[0].id]);
    assert.equal(report.added.length, 3);
    assert.equal(report.removed.length, g.board.spaces.length - 1);
    const bad = game.board.spaces.find((s) => s.name === "Bad type");
    assert.equal(bad.type, "province"); assert.ok(bad.attrs.pop <= 9);
    assert.equal(game.setup.spaceAttributes[bad.id].opinion, 0);
    assert.equal(game.board.links.length, 3, "unknown, self and duplicate links dropped");
    for (const p of piecesOf(game)) {
      const on = game.setup.placements.filter((x) => x.piece === p.id).reduce((s, x) => s + x.count, 0);
      const pool = game.setup.pools[p.id];
      assert.equal(on + pool.available + pool.outOfPlay, p.supply, `supply ${p.id}`);
    }
    assert.equal(game.tracks[0].start, g.tracks[0].max);
    assert.equal(game.setup.tracks[g.tracks[0].id], g.tracks[0].max);
    assert.equal(game.setup.eligibility[g.factions[0].id], false);
    assert.ok(report.dropped.length >= 5, "each dropped item is reported");
    assert.notEqual(game, g, "input game is not changed");
    assert.equal(g.board.spaces[0].type, load(ex).board.spaces[0].type);
  });
}

test("a suggestion with fewer than 2 usable spaces is refused", () => {
  const g = load("tan-war");
  assert.throws(() => applyBoard(g, { spaces: [{ name: "Only" }] }), /at least 2 spaces/);
});

// Review findings on PR 18.
const two = (extra = {}) => ({ spaces: [{ name: "Alpha" }, { name: "Beta" }], links: [{ from: "Alpha", to: "Beta" }], ...extra });

test("per-space limits hold across states and entries, and the excess stays in the pool", () => {
  const g = load("tan-war");
  const b = piecesOf(g).find((p) => p.maxPerSpace === 1);
  const { game, report } = applyBoard(g, two({ placements: [{ space: "Alpha", piece: b.id, state: b.states[0], count: 2 }, { space: "Alpha", piece: b.id, state: b.states.at(-1), count: 1 }] }));
  assert.deepEqual(errors(game), []);
  assert.equal(game.setup.placements.filter((x) => x.piece === b.id).reduce((s, x) => s + x.count, 0), 1);
  assert.ok(report.dropped.some((d) => /limit of 1/.test(d)));
  assert.ok(boardPrompt({ ...g, brief: { ...g.brief, sources: [{ id: "s1", url: "u", status: "read" }] } }, { s1: "t" }).includes(`max ${b.maxPerSpace} per space`));
});

test("a suggestion whose links leave a space unreachable is refused", () => {
  assert.throws(() => applyBoard(load("tan-war"), { spaces: [{ name: "Alpha" }, { name: "Beta" }], links: [] }), /cannot be reached.*Beta/);
});

test("a new space never takes the id of a space it removes", () => {
  const g = load("tan-war"); const old = g.board.spaces[0]; old.name = "Galway";
  const { game, report } = applyBoard(g, two({ spaces: [{ name: "Dublin" }, { name: "Beta" }], links: [{ from: "Dublin", to: "Beta" }] }));
  assert.ok(report.removed.includes(old.id));
  assert.ok(!game.board.spaces.some((s) => s.id === old.id));
});

test("the prompt anchors the setup to the chosen time period", () => {
  const g = load("tan-war"); g.brief.sources = [{ id: "s1", url: "u", status: "read" }]; g.brief.overview.period = "July 1921";
  assert.match(boardPrompt(g, { s1: "t" }), /Start of the game: July 1921/);
});

test("a suggestion made for other factions, pieces or tracks cannot be applied", async () => {
  const { boardBase } = await import("../src/boardsuggest.mjs");
  const g = load("tan-war"); const base = boardBase(g);
  assert.equal(boardBase(structuredClone(g)), base);
  g.factions[0].pieces[0].supply += 1;
  assert.notEqual(boardBase(g), base);
  const h = load("tan-war"); h.tracks[0].max += 1;
  assert.notEqual(boardBase(h), base);
});
