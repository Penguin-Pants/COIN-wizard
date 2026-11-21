import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { launch, openApp, frames } from "./harness.mjs";

let browser;
before(async () => { browser = await launch(); });
after(async () => { await browser.close(); });

async function withApp(fn, opts) {
  const app = await openApp(browser, opts);
  try { await fn(app); assert.deepEqual(app.errors, []); } finally { await app.close(); }
}
const DRAFT = "data/users/u1/draft";
const typeInto = (page, sel, v) => page.locator(sel).evaluate((e, v) => { e.value = v; e.dispatchEvent(new Event("input", { bubbles: true })); }, v);

test("New blank project asks first and Cancel keeps the work", () => withApp(async ({ page }) => {
  await page.click("#menu summary");
  await page.click('#menu [data-a="confirm-ask"][data-key="new"]'); await frames(page);
  assert.deepEqual(await page.$$eval("#menu button", (e) => e.map((x) => x.textContent)), ["Yes, replace my work", "Cancel", "Load Tan War (2 factions)", "Load Harbor Strike (3 factions)", "Load Four Valleys (4 factions)"]);
  await page.click('#menu [data-a="confirm-cancel"]'); await frames(page);
  assert.equal(await page.innerText("#title"), "Tan War");
}));

test("New blank project replaces the work and the saved draft", () => withApp(async ({ page, db }) => {
  await page.click("#menu summary");
  await page.click('#menu [data-a="confirm-ask"][data-key="new"]');
  await page.click('#menu [data-a="new-project"]'); await frames(page);
  assert.equal(await page.innerText("#title"), "Untitled COIN game");
  assert.equal(await page.innerText("#main h2"), "Describe and research the conflict");
  assert.deepEqual(await page.$$eval("#rail li:not(.fsub) .chip", (e) => e.map((x) => x.textContent)), Array(5).fill("Not started"));
  await page.waitForTimeout(1800);
  const g = JSON.parse((await db())[DRAFT].json);
  assert.equal(g.meta.title, "Untitled COIN game");
  assert.equal(g.factions.length, 2);
  assert.equal(g.actions.length, 0);
}));

test("an edit shows Saving and then Saved", () => withApp(async ({ page }) => {
  await typeInto(page, 'input[data-b="meta/title"]', "Edited");
  assert.equal(await page.innerText("#save"), "Saving...");
  await page.waitForTimeout(1800);
  assert.match(await page.innerText("#save"), /^Saved \d/);
}, { example: false }));

test("a source status update from chat does not mark the work unsaved", () => withApp(async ({ page, db }) => {
  await page.waitForTimeout(1800);
  assert.match(await page.innerText("#save"), /^Saved \d/);
  await page.evaluate((p) => { delete window.__saved[p]; }, DRAFT);
  await page.evaluate(() => window.__pushSources([{ id: "s2", status: "read", text: "x", readScope: "all", title: "T2" }]));
  await frames(page);
  assert.match(await page.locator("#main").innerText(), /read/);
  await page.waitForTimeout(1800);
  assert.equal(DRAFT in (await db()), false);
  assert.match(await page.innerText("#save"), /^Saved \d/);
}));
