import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { launch, openApp, goStep, frames } from "./harness.mjs";

let browser;
before(async () => { browser = await launch(); });
after(async () => { await browser.close(); });

// A 2 x 1 pixel SVG map: wide, so it sits in the middle band of the 640 x 480 board.
const MAP = { name: "ireland-1921.svg", mimeType: "image/svg+xml", buffer: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="200" height="100"><rect width="200" height="100" fill="#8a8"/></svg>') };
const ANSWER = JSON.stringify({ positions: { dublin: { x: 0.5, y: 0.5 }, "cork-city": { x: 0, y: 1 }, atlantis: { x: 0.2, y: 0.2 } }, notes: "Counties in 1921." });

async function withApp(fn, opts) {
  const app = await openApp(browser, opts);
  try { await fn(app); assert.deepEqual(app.errors, []); } finally { await app.close(); }
}
const pos = (page, id) => page.evaluate((i) => { const g = document.querySelector(`#board [data-space="${i}"]`); const s = g.querySelector("circle,rect,polygon"); const b = s.getBBox(); return { x: Math.round(b.x + b.width / 2), y: Math.round(b.y + b.height / 2) }; }, id);

test("Claude places spaces on an uploaded map, and Apply puts the map under the board", () => withApp(async ({ page, db }) => {
  await goStep(page, 2);
  await page.setInputFiles("#mapfiles", MAP);
  await page.waitForSelector("ol.maps img");
  await page.click('[data-a="map-place"]');
  await page.waitForSelector('[aria-label="Suggested map positions"]');
  const prev = await page.textContent('[aria-label="Suggested map positions"]');
  assert.match(prev, /moves 2 of \d+ spaces/); assert.match(prev, /Counties in 1921/); assert.match(prev, /unknown space atlantis/);
  assert.deepEqual(await page.evaluate(() => window.__sampleImages.at(-1)), 1, "the map is sent to Claude");
  await page.click('[data-a="map-accept"]'); await frames(page);
  assert.deepEqual(await pos(page, "dublin"), { x: 320, y: 240 });
  assert.equal(await page.$$eval("#board svg image", (e) => e[0].getAttribute("preserveAspectRatio")), "xMidYMid meet");
  // The saved draft keeps the map apart from the game JSON.
  await page.waitForFunction(() => Object.keys(window.__saved).some((k) => k.includes("/images/")), null, { timeout: 5000 });
  const saved = await db(); const draft = Object.entries(saved).find(([k]) => k.endsWith("/draft"))[1];
  assert.ok(draft.json.includes("db-image:")); assert.ok(!draft.json.includes("data:image/jpeg"));
}, { replies: [["Find each space below on the map", ANSWER]] }));

test("a saved map comes back with the resumed draft", () => withApp(async ({ page }) => {
  await goStep(page, 2);
  await page.setInputFiles("#mapfiles", MAP); await page.waitForSelector("ol.maps img");
  await page.click('[data-a="map-place"]'); await page.waitForSelector('[aria-label="Suggested map positions"]');
  await page.click('[data-a="map-accept"]'); await frames(page);
  await page.waitForFunction(() => { const d = Object.entries(window.__saved).find(([k]) => k.endsWith("/draft")); return d && d[1].json.includes("db-image:"); }, null, { timeout: 5000 });
  const saved = await page.evaluate(() => window.__saved);
  const again = await openApp(browser, { saved, example: false });
  try {
    await again.page.click('[data-a="resume"]'); await frames(again.page);
    await goStep(again.page, 2);
    assert.match(await again.page.$eval("#board svg image", (e) => e.getAttribute("href")), /^data:image\/jpeg/);
    assert.deepEqual(again.errors, []);
  } finally { await again.close(); }
}, { replies: [["Find each space below on the map", ANSWER]] }));

test("the map button explains why it is off", () => withApp(async ({ page }) => {
  await goStep(page, 2);
  assert.equal(await page.isDisabled('[data-a="map-place"]'), true);
  assert.match(await page.textContent("main"), /Upload a map first/);
}));
test("a view that cannot send images keeps the map button off", () => withApp(async ({ page }) => {
  await goStep(page, 2);
  await page.setInputFiles("#mapfiles", MAP); await page.waitForSelector("ol.maps img");
  assert.equal(await page.isDisabled('[data-a="map-place"]'), true);
  assert.match(await page.textContent("main"), /cannot send images/);
}, { sampleImages: false }));
