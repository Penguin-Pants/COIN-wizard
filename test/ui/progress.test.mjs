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
const chips = (page) => page.$$eval("#rail li:not(.fsub) .chip", (e) => e.map((x) => x.textContent));
const typeInto = (page, sel, v) => page.locator(sel).evaluate((e, v) => { e.value = v; e.dispatchEvent(new Event("input", { bubbles: true })); }, v);

test("a new user sees Not started on every step", () => withApp(async ({ page }) => {
  assert.equal(await page.innerText("#title"), "Untitled COIN game");
  assert.deepEqual(await chips(page), Array(5).fill("Not started"));
  assert.equal(await page.locator("#rail li.fsub .chip").count(), 0);
}, { example: false }));

test("an edit starts a step and Next after the edit marks it done", () => withApp(async ({ page }) => {
  await typeInto(page, 'input[data-b="meta/title"]', "My game"); await page.waitForTimeout(400);
  assert.equal((await chips(page))[0], "In progress");
  await page.click("#next"); await frames(page);
  assert.equal((await chips(page))[0], "Done");
  await goStep(page, 0);
  assert.equal(await page.innerText("#stepdone"), "Step done");
}, { example: false }));

test("Next without an edit does not mark a step done", () => withApp(async ({ page }) => {
  await page.click("#next"); await frames(page);
  assert.equal((await chips(page))[0], "Not started");
}, { example: false }));

test("a step with blockers shows Needs fix and cannot be marked done", () => withApp(async ({ page }) => {
  await goStep(page, 2);
  await page.locator('[data-a="list-add"][data-list="spaces"]').click(); await page.waitForTimeout(400);
  assert.match((await chips(page))[2], /^Needs fix \(\d+\)$/);
  assert.equal(await page.locator('[data-a="mark-done"]').isDisabled(), true);
  assert.match(await page.innerText("#stepdone"), /Fix the \d+ blockers? in this step first\./);
}, { example: false }));

test("Mark step done works on a clean step and saves with the draft", () => withApp(async ({ page, db }) => {
  await goStep(page, 1);
  await page.click('[data-a="mark-done"]'); await frames(page);
  assert.equal((await chips(page))[1], "Done");
  await page.waitForTimeout(1800);
  const saved = JSON.parse((await db())["data/users/u1/draft"].json);
  assert.deepEqual(saved.meta.progress.factions, { visited: true, touched: true, done: true });
}));
