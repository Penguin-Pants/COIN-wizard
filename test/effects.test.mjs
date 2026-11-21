import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { deriveState } from "../src/state.mjs";
import { applyAction } from "../src/effects.mjs";

const game = () => JSON.parse(readFileSync(new URL("../examples/tan-war.game.json", import.meta.url), "utf8"));
const act = (g, id) => g.actions.find((a) => a.id === id);
const run = (g, s, id, spaces, steps) => applyAction(g, s, steps ? { ...act(g, id), steps } : act(g, id), spaces);

test("an Operation pays its cost per space and places from Available", () => {
  const g = game(), s = deriveState(g, "crown");
  run(g, s, "crown.garrison", ["cork-city"]);
  assert.equal(s.resources.crown, 6);
  assert.equal(s.tracks["res.crown"], 6);
  assert.deepEqual(s.spaces["cork-city"].pieces["crown.army"], { normal: 3 });
  assert.equal(s.pools["crown.army"].available, 3);
});

test("place stops when the pool is empty", () => {
  const g = game(), s = deriveState(g, "crown");
  s.pools["crown.army"].available = 1;
  run(g, s, "crown.garrison", ["kerry"]);
  assert.deepEqual(s.spaces.kerry.pieces["crown.army"], { normal: 1 });
});

test("remove uses the fallback piece and an if step reads the new board", () => {
  const g = game(), s = deriveState(g, "ira");
  s.dice = [1];
  run(g, s, "ira.attack", ["kerry"]);
  assert.equal(s.spaces.kerry.pieces["crown.police"]?.normal ?? 0, 0, "no Army in Kerry: one Police is removed");
  assert.deepEqual(s.spaces.kerry.pieces["ira.volunteer"], { active: 1 });
  assert.equal(s.vars.r, 1);
});

test("a roll with no die left is an error", () => {
  const g = game(), s = deriveState(g, "ira");
  assert.throws(() => run(g, s, "ira.attack", ["kerry"]), /die/);
});

test("move from adjacent takes all it can for count any, and flip moved flips only those", () => {
  const g = game(), s = deriveState(g, "ira");
  run(g, s, "ira.march", ["cork-city"]);
  assert.deepEqual(s.spaces["cork-city"].pieces["ira.volunteer"], { underground: 1, active: 3 }, "3 move in from County Cork; Crown cubes there flip the 3 moved");
  assert.deepEqual(s.spaces["cork-county"].pieces["ira.volunteer"], {});
});

test("choose takes the first option", () => {
  const g = game(), s = deriveState(g, "ira");
  run(g, s, "ira.rally", ["tipperary"]);
  assert.deepEqual(s.spaces.tipperary.pieces["ira.volunteer"], { underground: 4 }, "Recruit: 2 Volunteers with an HQ");
});

test("shift and track stay inside their ranges", () => {
  const g = game(), s = deriveState(g, "crown");
  s.tracks.repression = 5;
  run(g, s, "crown.martial-law", ["dublin"]);
  assert.equal(s.spaces.dublin.opinion, 1);
  assert.equal(s.tracks.repression, 5);
  assert.equal(s.resources.crown, 6);
});

test("pay changes nothing when the track holds too little", () => {
  const g = game(), s = deriveState(g, "ira");
  run(g, s, "ira.boycott", ["kerry"], [{ op: "pay", track: "res.ira", amount: 9 }]);
  assert.equal(s.resources.ira, 2, "only the cost of 1 is paid");
});

test("a step that needs a player to pick a space is an error", () => {
  const g = game(), s = deriveState(g, "crown");
  assert.throws(() => run(g, s, "crown.garrison", ["dublin"], [{ op: "place", piece: "crown.army", count: 1, from: "available", to: "choose" }]), /choose/);
});

// Known issue 2: an example uses markerSet. Tan War Martial Law puts a Curfew marker on its space.
test("Tan War Martial Law sets a Curfew marker that starts from setup", async () => {
  const { stepText } = await import("../src/plain.mjs");
  const { rulebookMd, countersHtml, checklistMd } = await import("../src/kit.mjs");
  const g = game();
  const law = act(g, "crown.martial-law");
  const step = law.steps.find((x) => x.op === "markerSet");
  assert.ok(step, "Martial Law has a markerSet step");
  assert.deepEqual(step, { op: "markerSet", marker: "curfew", value: true, space: "$space" });
  assert.equal(stepText(step, g), "Set curfew to true in this space.");
  assert.match(law.plain, /Curfew marker/);
  const s = deriveState(g, "crown");
  assert.equal(s.spaces.limerick.curfew, false, "markers start from setup.spaceAttributes");
  run(g, s, "crown.martial-law", ["limerick"]);
  assert.equal(s.spaces.limerick.curfew, true);
  assert.equal(s.spaces.kerry.curfew, false);
  assert.match(rulebookMd(g), /Curfew marker/);
  assert.match(countersHtml(g), /Curfew marker \(8, one per space\)/);
  assert.match(checklistMd(g), /\| Curfew marker \| 8 \|/);
});

// Review findings (Codex, PR 1).
test("flip moved flips only pieces that moved in, not pieces already there", () => {
  const g = game(), s = deriveState(g, "ira");
  s.spaces["cork-county"].pieces["ira.volunteer"] = { active: 3 };
  run(g, s, "ira.march", ["cork-city"]);
  assert.deepEqual(s.spaces["cork-city"].pieces["ira.volunteer"], { underground: 1, active: 3 });
});

test("remove uses the fallback piece only when the primary piece is absent", () => {
  const g = game(), s = deriveState(g, "ira");
  s.spaces.kerry.pieces["crown.army"] = { normal: 1 };
  s.spaces.kerry.pieces["crown.police"] = { normal: 2 };
  run(g, s, "ira.attack", ["kerry"], [{ op: "remove", piece: "crown.army", count: 2, to: "available", fallbackPiece: "crown.police" }]);
  assert.equal(s.spaces.kerry.pieces["crown.army"]?.normal ?? 0, 0);
  assert.deepEqual(s.spaces.kerry.pieces["crown.police"], { normal: 2 }, "Army was there, so no Police is removed");
});
