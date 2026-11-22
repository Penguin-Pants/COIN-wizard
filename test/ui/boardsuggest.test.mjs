import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { launch, openApp, goStep, frames } from "./harness.mjs";

let browser;
before(async () => { browser = await launch(); });
after(async () => { await browser.close(); });

const ANSWER = JSON.stringify({
  spaces: [
    { name: "Dublin", type: "city", pop: 3, opinion: 1 },
    { name: "Midlands", type: "province", pop: 1, opinion: 0 },
    { name: "Border", type: "province", pop: 1, opinion: -1 }
  ],
  links: [{ from: "Dublin", to: "Midlands" }, { from: "Midlands", to: "Border" }, { from: "Border", to: "Atlantis" }],
  placements: [{ space: "Border", piece: "ira.volunteer", state: "underground", count: 4 }],
  outOfPlay: {}, tracks: {}, eligibility: { crown: true, ira: false },
  notes: "Rural strength in the border area."
});
const sources = [{ id: "s1", status: "read", title: "Source", text: "Text about the war in the border counties." }];

async function withApp(fn, opts) {
  const app = await openApp(browser, opts);
  try { await fn(app); assert.deepEqual(app.errors, []); } finally { await app.close(); }
}

test("Claude's board suggestion shows a preview, then fills the step on Apply", () => withApp(async ({ page }) => {
  await goStep(page, 2);
  await page.click('[data-a="suggest-board"]');
  await page.waitForSelector('[aria-label="Suggested board"]');
  const prev = await page.textContent('[aria-label="Suggested board"]');
  assert.match(prev, /3 spaces, 2 legal connections, 4 starting pieces/);
  assert.match(prev, /Parts of the answer not used \(1\)/);
  const before = await page.$$eval('input[data-path^="/board/spaces/"][data-path$="/name"]', (e) => e.map((x) => x.value));
  assert.ok(before.length > 3, "nothing changes before Apply");
  await page.click('[data-a="board-accept"]'); await frames(page);
  assert.deepEqual(await page.$$eval('input[data-path^="/board/spaces/"][data-path$="/name"]', (e) => e.map((x) => x.value)), ["Dublin", "Midlands", "Border"]);
  assert.equal(await page.inputValue('[data-pc="border|ira.volunteer|underground"]'), "4");
  assert.equal(await page.$$eval("ul.links li", (e) => e.length), 2);
}, { sources, replies: [["suggest the map and the starting setup", ANSWER]] }));

test("a suggestion is discarded when pieces change before Apply", () => withApp(async ({ page }) => {
  await goStep(page, 2);
  await page.click('[data-a="suggest-board"]');
  await page.waitForSelector('[aria-label="Suggested board"]');
  await goStep(page, 1);
  const supply = page.locator('input[data-path$="/supply"]').first();
  await supply.fill(String(Number(await supply.inputValue()) + 1)); await supply.dispatchEvent("change"); await frames(page);
  await goStep(page, 2);
  await page.click('[data-a="board-accept"]'); await frames(page);
  assert.match(await page.textContent("main"), /changed after this suggestion, so it was discarded/);
  assert.equal(await page.$$eval('input[data-path^="/board/spaces/"][data-path$="/name"]', (e) => e.length) > 3, true);
}, { sources, replies: [["suggest the map and the starting setup", ANSWER]] }));

test("the board suggestion button is off when no source is read", () => withApp(async ({ page }) => {
  await goStep(page, 2);
  assert.equal(await page.isDisabled('[data-a="suggest-board"]'), true);
}, { sources: [] }));
