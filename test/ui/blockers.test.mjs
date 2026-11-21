import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { launch, openApp, goStep } from "./harness.mjs";

let browser;
before(async () => { browser = await launch(); });
after(async () => { await browser.close(); });

async function withApp(fn, opts) {
  const app = await openApp(browser, opts);
  try { await fn(app); assert.deepEqual(app.errors, []); } finally { await app.close(); }
}
const CONFLICT = 'textarea[data-b="brief/conflict"]';
const clearConflict = async (page) => {
  await page.locator(CONFLICT).evaluate((e) => { e.value = ""; e.dispatchEvent(new Event("input", { bubbles: true })); });
  await page.waitForTimeout(400);
};

test("a blocker shows next to the field that causes it", () => withApp(async ({ page }) => {
  await clearConflict(page);
  const marker = page.locator("label.fld:has(" + CONFLICT + ") .fieldissue.error");
  assert.equal(await marker.count(), 1);
  assert.match(await marker.innerText(), /fewer than 1 characters/);
  assert.equal(await page.locator(CONFLICT).getAttribute("aria-invalid"), "true");
  assert.equal(await page.locator(CONFLICT).getAttribute("aria-describedby"), await marker.getAttribute("id"));
}));

test("a fixed blocker leaves the field while the designer types", () => withApp(async ({ page }) => {
  await clearConflict(page);
  await page.locator(CONFLICT).evaluate((e) => { e.value = "A war"; e.dispatchEvent(new Event("input", { bubbles: true })); });
  await page.waitForTimeout(400);
  assert.equal(await page.locator(".fieldissue").count(), 0);
  assert.equal(await page.locator(CONFLICT).getAttribute("aria-invalid"), null);
  assert.equal(await page.evaluate((s) => document.activeElement === document.querySelector(s), CONFLICT), false);
}));

test("an issue with no field stays in the step list", () => withApp(async ({ page }) => {
  await goStep(page, 2);
  await page.locator('[data-a="list-add"][data-list="spaces"]').click(); await page.waitForTimeout(400);
  const li = page.locator('#stepissues li', { hasText: "cannot be reached" });
  assert.ok(await li.count() > 0);
}));

test("Show in the Review list opens the step and focuses the field", () => withApp(async ({ page }) => {
  await clearConflict(page);
  await goStep(page, 4);
  await page.locator('#main ul.issues [data-a="show-issue"][data-ipath="/brief/conflict"]').click();
  assert.equal(await page.innerText("#main h2"), "Describe and research the conflict");
  assert.equal(await page.evaluate((s) => document.activeElement === document.querySelector(s), CONFLICT), true);
}));
