import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { launch, openApp, goStep, frames } from "./harness.mjs";

let browser;
before(async () => { browser = await launch(); });
after(async () => { await browser.close(); });

async function withApp(fn, opts) {
  const app = await openApp(browser, opts);
  try { await fn(app); assert.deepEqual(app.errors, []); } finally { await app.close(); }
}
const deckTab = async (page) => { await goStep(page, 3); await page.click('[data-a="tab"][data-tab="deck"]'); await frames(page); };
const deckBadge = (page) => page.innerText('[data-tabcount="Deck"]');

test("a designer builds a full deck from empty with no JSON", () => withApp(async ({ page }) => {
  await deckTab(page);
  assert.notEqual(await deckBadge(page), "");
  for (let i = 0; i < 4; i++) { await page.click('[data-a="card-add"][data-type="event"]'); await frames(page); }
  for (let i = 0; i < 2; i++) { await page.click('[data-a="card-add"][data-type="scoring"]'); await frames(page); }
  await page.locator('input[data-b="deck/cards/5/final"]').check(); await frames(page);
  await page.selectOption("#pilecount", "2");
  await page.click('[data-a="piles-build"]'); await frames(page);
  await page.waitForTimeout(400);
  assert.equal(await deckBadge(page), "");
  assert.equal(await page.locator(".strip li").count(), 6);
  assert.equal(await page.locator(".strip li").last().innerText(), "s02");
  assert.equal(await page.locator('textarea[data-sj], .xraw, textarea[data-t="j"]').count(), 0);
}, { example: false }));

test("Build piles explains a mismatch instead of breaking the deck", () => withApp(async ({ page }) => {
  await deckTab(page);
  await page.selectOption("#pilecount", "3");
  await page.click('[data-a="piles-build"]'); await frames(page);
  assert.match(await page.innerText("#main"), /3 piles need 3 scoring cards\. The deck has 2\./);
  assert.equal(await deckBadge(page), "");
}));

test("deleting a card lists its references first and removes them", () => withApp(async ({ page }) => {
  await deckTab(page);
  await page.locator('details.card[data-k="card-e07"] > summary').click(); await frames(page);
  await page.click('[data-a="confirm-ask"][data-key="del-e07"]'); await frames(page);
  assert.match(await page.innerText("#main .note"), /Pile p2 events; Bot \S+ Event exception/);
  await page.click('[data-a="card-delete"][data-id="e07"]'); await frames(page);
  assert.match(await page.innerText("#main"), /Deleted e07\. Removed 2 references\. Still to fix: Bot \S+ dry run/);
  assert.equal(await page.locator('details.card[data-k="card-e07"]').count(), 0);
}));

test("renaming a card id keeps the deck valid", () => withApp(async ({ page }) => {
  await deckTab(page);
  await page.locator('details.card[data-k="card-s1"] > summary').click(); await frames(page);
  const id = page.locator('input[data-cardid="s1"]');
  await id.fill("truce1"); await id.dispatchEvent("change"); await frames(page);
  await page.waitForTimeout(400);
  assert.match(await page.innerText("#main"), /Renamed s1 to truce1\./);
  assert.equal(await deckBadge(page), "");
}));
