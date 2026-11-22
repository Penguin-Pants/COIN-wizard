import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { launch, openApp, goStep, frames } from "./harness.mjs";

let browser;
before(async () => { browser = await launch(); });
after(async () => { await browser.close(); });

const sources = [{ id: "s1", status: "read", title: "Source", text: "Text about the war." }];
const CARD = JSON.stringify({ events: [{ title: "Flying column", flavor: "A raid at dawn.", order: ["ira", "crown"], unshaded: { label: "Raid fails", text: "Nothing.", steps: [] }, shaded: { label: "Raid", text: "Nothing.", steps: [] } }], scoringCards: 2 });

async function withApp(fn, opts) {
  const app = await openApp(browser, opts);
  try { await fn(app); assert.deepEqual(app.errors, []); } finally { await app.close(); }
}
const tab = async (page, t) => { await page.click(`[data-a="tab"][data-tab="${t}"]`); await frames(page); };
const PREV = `[aria-label="Claude's suggestion"]`;
const titles = (page) => page.$$eval("details.card summary b", (e) => e.map((x) => x.textContent));

test("each Step 4 tab has its own Claude button", () => withApp(async ({ page }) => {
  await goStep(page, 3);
  for (const t of ["rules", "deck", "victory", "bots"]) {
    await tab(page, t);
    assert.equal(await page.$$eval(`[data-a="step4-suggest"][data-part="${t}"]`, (e) => e.length), 1, t);
  }
}, { sources }));

test("Suggest Event cards previews the new card and adds it on Apply, keeping the deck", () => withApp(async ({ page }) => {
  await goStep(page, 3); await tab(page, "deck");
  const before = await titles(page);
  await page.click('[data-a="step4-suggest"][data-part="deck"]');
  await page.waitForSelector(PREV);
  assert.match(await page.textContent(PREV), /Flying column/);
  assert.match(await page.textContent(PREV), /Scoring cards and piles: kept yours/);
  assert.deepEqual(await titles(page), before, "nothing changes before Apply");
  await page.click('[data-a="step4-accept"]'); await frames(page);
  assert.deepEqual(await titles(page), [...before, "Flying column"]);
}, { sources, replies: [["Write Event cards", CARD]] }));

test("a tab with nothing left to fill cannot apply", () => withApp(async ({ page }) => {
  await goStep(page, 3); await tab(page, "bots");
  await page.click('[data-a="step4-suggest"][data-part="bots"]');
  await page.waitForSelector(PREV);
  assert.equal(await page.isDisabled('[data-a="step4-accept"]'), true);
}, { sources, replies: [["Write a solo bot", JSON.stringify({ bots: [{ factionId: "crown", objective: "x" }] })]] }));

test("the Step 4 buttons are off with no read source", () => withApp(async ({ page }) => {
  await goStep(page, 3);
  assert.equal(await page.isDisabled('[data-a="step4-suggest"]'), true);
}, { sources: [] }));
