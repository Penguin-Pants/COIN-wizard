import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { launch, openApp, goStep, setScheme, frames } from "./harness.mjs";

let browser;
before(async () => { browser = await launch(); });
after(async () => { await browser.close(); });

async function withApp(fn, opts) {
  const app = await openApp(browser, opts);
  try { await fn(app); assert.deepEqual(app.errors, []); } finally { await app.close(); }
}

const vars = (page) => page.$$eval("details.fp", (els) => els.map((x) => { const s = getComputedStyle(x); return ["--f", "--t", "--i"].map((k) => s.getPropertyValue(k).trim()).join("|"); }));

test("faction colors stay fixed and the tint follows the theme", () => withApp(async ({ page }) => {
  await goStep(page, 1);
  assert.deepEqual(await vars(page), ["#2b6cc4|#e6edf8|#2967ba", "#b8520a|#f6eae2|#af4e0a"]);
  await setScheme(page, "dark");
  assert.deepEqual(await vars(page), ["#2b6cc4|#1b324c|#759fd9", "#b8520a|#3a2c23|#cd8654"]);
}));

test("a template adds a Special Activity to the right faction", () => withApp(async ({ page }) => {
  await goStep(page, 1);
  await page.selectOption("#tpl-crown-specialActivity", "pressure");
  await page.click('[data-a="addtpl"][data-f="crown"][data-kind="specialActivity"]'); await frames(page);
  const names = await page.$$eval('details.fp[data-k="fp-crown"] .lane.sa details.act > summary b', (e) => e.map((x) => x.textContent));
  assert.deepEqual(names, ["Martial Law", "Pressure"]);
}));

test("Claude suggestions keep only valid archetypes and can be accepted", () => withApp(async ({ page }) => {
  await goStep(page, 1);
  await page.click('[data-a="suggest-actions"][data-f="ira"][data-kind="specialActivity"]');
  await page.waitForSelector(".proposal li b");
  assert.deepEqual(await page.$$eval(".proposal li b", (e) => e.map((x) => x.textContent)), ["Dawn Raid", "Roadside Ambush"]);
  await page.locator('[data-a="accept-action"]').first().click(); await frames(page);
  const names = await page.$$eval('details.fp[data-k="fp-ira"] .lane.sa details.act > summary b', (e) => e.map((x) => x.textContent));
  assert.ok(names.includes("Dawn Raid"));
}));

test("an open action stays open after an edit re-renders the step", () => withApp(async ({ page }) => {
  await goStep(page, 1);
  await page.locator("details.act > summary").first().click();
  await page.locator('[data-a="list-add"][data-list="steps"]').first().click(); await frames(page);
  assert.equal(await page.locator("details.act[open]").count(), 1);
}));

test("a very light faction color shows a contrast warning", () => withApp(async ({ page }) => {
  await goStep(page, 1);
  await page.locator('input[data-b="factions/0/color"]').evaluate((e) => {
    e.value = "#fafafa"; e.dispatchEvent(new Event("input", { bubbles: true })); e.dispatchEvent(new Event("change", { bubbles: true }));
  });
  await frames(page);
  const warn = await page.$$eval(".fld small", (e) => e.map((x) => x.textContent).filter((t) => t.includes("contrast")));
  assert.equal(warn.length, 1);
  assert.match(warn[0], /low contrast in light mode/);
}));
