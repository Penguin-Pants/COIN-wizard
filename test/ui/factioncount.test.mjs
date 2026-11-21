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
const setCount = async (page, n) => {
  await goStep(page, 0);
  await page.selectOption("#fcount", String(n)); await frames(page);
  assert.match(await page.innerText(".proposal"), new RegExp(`Change to ${n} factions`));
  await page.click('[data-a="fcount-apply"]'); await frames(page);
};
const visitAll = async (page) => { for (let i = 0; i < 5; i++) await goStep(page, i); };

test("a designer creates a 2, 3 and 4 faction game from empty", () => withApp(async ({ page }) => {
  assert.equal(await page.locator("#rail li.fsub").count(), 2);
  await setCount(page, 3);
  assert.equal(await page.locator("#rail li.fsub").count(), 3);
  await goStep(page, 1);
  assert.equal(await page.locator('[data-a="fac-tab"]').count(), 3);
  assert.equal(await page.locator("details.fp").count(), 1);
  await visitAll(page);
  await setCount(page, 4);
  assert.equal(await page.locator("#rail li.fsub").count(), 4);
  await visitAll(page);
  await setCount(page, 2);
  assert.equal(await page.locator("#rail li.fsub").count(), 2);
  await goStep(page, 1);
  assert.equal(await page.locator('[data-a="fac-tab"]').count(), 0);
}, { example: false }));

test("the count preview lists what changes and Cancel changes nothing", () => withApp(async ({ page }) => {
  await page.selectOption("#fcount", "3"); await frames(page);
  const text = await page.innerText(".proposal");
  assert.match(text, /Adds Movement \(nonviolent\)/);
  assert.match(text, /card faction order of 10 cards/);
  await page.click('[data-a="fcount-cancel"]'); await frames(page);
  assert.equal(await page.locator("#rail li.fsub").count(), 2);
}));

test("a faction row in the rail opens that faction's tab", () => withApp(async ({ page }) => {
  await page.click("#menu summary");
  await page.click('#menu [data-a="confirm-ask"][data-key="valleys"]'); await page.click('#menu [data-a="load-example"][data-ex="valleys"]'); await frames(page);
  await page.locator("#rail li.fsub button").nth(2).click(); await frames(page);
  assert.match(await page.innerText('[data-a="fac-tab"][aria-selected="true"]'), /Mountain Front/);
  await page.waitForTimeout(400);
  assert.equal(await page.innerText("#blockers"), "No blockers");
}, { example: false }));
