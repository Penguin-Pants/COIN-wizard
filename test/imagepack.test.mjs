import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { CHUNK, packGame, unpackGame, chunks } from "../src/imagepack.mjs";

const load = () => JSON.parse(readFileSync(new URL("../examples/tan-war.game.json", import.meta.url), "utf8"));
const bigImage = "data:image/jpeg;base64," + "A".repeat(3 * CHUNK + 17);

test("a saved game keeps a map image out of its JSON, so the draft stays under the database limit", () => {
  const g = load(); g.board.presentation.background = { href: bigImage, opacity: 0.5 };
  const { json, images } = packGame(g);
  assert.ok(json.length < 150000, `json ${json.length}`);
  assert.ok(!json.includes("AAAA"));
  const [key] = Object.keys(images);
  assert.equal(images[key], bigImage);
  assert.equal(g.board.presentation.background.href, bigImage, "the game in memory is not changed");
});

test("packing the same image twice gives the same key, and a game with no image has none", () => {
  const g = load(); g.board.presentation.background = { href: bigImage };
  assert.deepEqual(Object.keys(packGame(g).images), Object.keys(packGame(structuredClone(g)).images));
  assert.deepEqual(packGame(load()).images, {});
});

test("an image splits into chunks under the limit that join back exactly", () => {
  const c = chunks(bigImage);
  assert.equal(c.length, 4); assert.ok(c.every((x) => x.length <= CHUNK)); assert.equal(c.join(""), bigImage);
});

test("unpacking loads the image back", async () => {
  const g = load(); g.board.presentation.background = { href: bigImage, opacity: 0.5 };
  const { json, images } = packGame(g);
  const { game, missing } = await unpackGame(json, async (k) => images[k]);
  assert.deepEqual(game, g); assert.deepEqual(missing, []);
});

test("a lost image opens the game without the image and says so", async () => {
  const g = load(); g.board.presentation.background = { href: bigImage, opacity: 0.5 };
  const { json } = packGame(g);
  const { game, missing } = await unpackGame(json, async () => null);
  assert.equal(game.board.presentation.background, null); assert.equal(missing.length, 1);
});

test("a web address background is saved as it is", () => {
  const g = load(); g.board.presentation.background = { href: "https://example.org/map.png" };
  const { json, images } = packGame(g);
  assert.deepEqual(images, {}); assert.ok(json.includes("https://example.org/map.png"));
});

test("a failed image read is passed on, so the saved game keeps its image reference", async () => {
  const g = load(); g.board.presentation.background = { href: bigImage, opacity: 0.5 };
  const { json } = packGame(g);
  await assert.rejects(unpackGame(json, async () => { throw Object.assign(new Error("offline"), { code: "unavailable" }); }), /offline/);
});
