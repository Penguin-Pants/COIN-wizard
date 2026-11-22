import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { FRAME, voronoi, frameOf, mapPrompt, applyMapPositions } from "../src/mapplace.mjs";
import { boardSvg } from "../src/kit.mjs";

const load = (f) => JSON.parse(readFileSync(new URL(`../examples/${f}.game.json`, import.meta.url), "utf8"));
const area = (p) => Math.abs(p.reduce((s, [x, y], i) => { const [u, v] = p[(i + 1) % p.length]; return s + x * v - u * y; }, 0)) / 2;
const inside = (p, [x, y]) => p.reduce((c, [a, b], i) => { const [u, v] = p[(i + 1) % p.length]; return ((b > y) !== (v > y) && x < ((u - a) * (y - b)) / (v - b) + a) ? !c : c; }, false);

test("region cells tile the frame and each holds its own space", () => {
  const sites = { a: { x: 100, y: 100 }, b: { x: 500, y: 120 }, c: { x: 300, y: 400 }, d: { x: 320, y: 220 } };
  const cells = voronoi(sites, { x: 0, y: 0, w: 640, h: 480 });
  assert.deepEqual(Object.keys(cells).sort(), ["a", "b", "c", "d"]);
  for (const [id, p] of Object.entries(sites)) assert.ok(inside(cells[id], [p.x, p.y]), id);
  const total = Object.values(cells).reduce((s, c) => s + area(c), 0);
  assert.ok(Math.abs(total - 640 * 480) < 1, `area ${total}`);
});

test("a map image fits the frame without cropping, centered", () => {
  assert.deepEqual(frameOf(1280, 480), { x: 0, y: 120, scale: 0.5 });
  assert.deepEqual(frameOf(480, 480), { x: 80, y: 0, scale: 1 });
});

test("the map prompt names every space and asks for positions on the image", () => {
  const g = load("tan-war"); const p = mapPrompt(g);
  for (const s of g.board.spaces) { assert.ok(p.includes(s.id), s.id); assert.ok(p.includes(s.name), s.name); }
  assert.match(p, /Return only JSON/);
  assert.match(p, /x from 0 \(left edge\) to 1 \(right edge\)/);
});

test("Claude's map positions land on the image, and every space not found is reported and kept", () => {
  const g = load("tan-war"); const [s0, s1, s2] = g.board.spaces;
  const r = { positions: { [s0.id]: { x: 0, y: 0 }, [s1.id]: { x: 1, y: 0.5 }, [s2.id]: { x: 7, y: "a" }, nowhere: { x: 0.5, y: 0.5 } }, notes: "Borders of 1921." };
  const { game, report } = applyMapPositions(g, r, { w: 1280, h: 480 });
  assert.deepEqual(game.board.presentation.positions[s0.id], { x: 0, y: 120 });
  assert.deepEqual(game.board.presentation.positions[s1.id], { x: 640, y: 240 });
  assert.deepEqual(game.board.presentation.positions[s2.id], g.board.presentation.positions[s2.id]);
  assert.deepEqual(report.placed, [s0.id, s1.id]);
  assert.ok(report.missing.includes(s2.id) && report.missing.length === g.board.spaces.length - 2);
  assert.ok(report.dropped.some((d) => /nowhere/.test(d)));
  assert.equal(report.notes, "Borders of 1921.");
  assert.notEqual(game, g);
});

test("the board draws provinces as region shapes and cities as markers on top", () => {
  const g = load("tan-war"); const svg = boardSvg(g, { fixed: true });
  const provinces = g.board.spaces.filter((s) => !["city", "line"].includes(s.type)).length;
  assert.equal((svg.match(/<polygon /g) ?? []).length, provinces);
  const cities = g.board.spaces.filter((s) => s.type === "city").length;
  assert.equal((svg.match(/<circle /g) ?? []).length, cities);
  assert.ok(svg.lastIndexOf("<polygon") < svg.indexOf("<circle"), "cities are drawn over the regions");
  for (const s of g.board.spaces) assert.ok(svg.includes(`data-space="${s.id}"`), s.id);
});

test("with a map image the printed board keeps the editor frame, so spaces stay on their places", () => {
  const g = load("tan-war"); g.board.presentation.background = { href: "data:image/png;base64,AAAA", opacity: 0.5 };
  const svg = boardSvg(g);
  assert.match(svg, new RegExp(`viewBox="0 0 ${FRAME.w} ${FRAME.h}"`));
  assert.match(svg, /preserveAspectRatio="xMidYMid meet"/);
});
