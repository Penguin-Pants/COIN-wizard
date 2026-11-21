import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { launch, openApp, goStep, frames, setScheme } from "./harness.mjs";

let browser;
before(async () => { browser = await launch(); });
after(async () => { await browser.close(); });

async function withApp(fn, opts) {
  const app = await openApp(browser, opts);
  try { await fn(app); assert.deepEqual(app.errors, []); } finally { await app.close(); }
}
const AXE = readFileSync("node_modules/axe-core/axe.min.js", "utf8");
const TITLES = ["Describe and research the conflict", "Define factions, pieces and actions", "Prepare the board and setup", "Complete the rules, cards and bots", "Review and finalize"];

test("axe finds no violations on any step or tab, in light and dark mode", () => withApp(async ({ page }) => {
  const found = [];
  for (const scheme of ["light", "dark"]) {
    await setScheme(page, scheme);
    for (let i = 0; i < 5; i++) {
      await goStep(page, i);
      for (const t of i === 3 ? ["rules", "deck", "victory", "bots"] : [null]) {
        if (t) { await page.click(`[data-a="tab"][data-tab="${t}"]`); await frames(page); }
        await page.evaluate(() => document.querySelectorAll("details").forEach((d) => (d.open = true)));
        await page.addScriptTag({ content: AXE });
        const v = await page.evaluate(async () => (await window.axe.run(document, { resultTypes: ["violations"] })).violations.map((x) => `${x.impact} ${x.id} x${x.nodes.length}`));
        for (const x of v) found.push(`${scheme}/${i}${t ? "/" + t : ""}: ${x}`);
      }
    }
  }
  assert.deepEqual(found, []);
}));

for (const width of [390, 768, 1280]) {
  test(`a keyboard-only designer walks all 5 steps and finalizes at ${width} px`, () => withApp(async ({ page }) => {
    await page.locator("#main h2").focus();
    for (let i = 0; i < 5; i++) {
      assert.equal(await page.innerText("#main h2"), TITLES[i]);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), true, `no sideways scroll on step ${i + 1}`);
      if (i < 4) { await page.keyboard.press("Alt+Shift+ArrowRight"); await frames(page); assert.equal(await page.evaluate(() => document.activeElement.id), "h"); }
    }
    for (let n = 0; n < 300 && (await page.evaluate(() => document.activeElement.id)) !== "confirm"; n++) await page.keyboard.press("Tab");
    await page.keyboard.press("Space"); await frames(page);
    for (let n = 0; n < 20 && (await page.evaluate(() => document.activeElement.dataset?.a)) !== "finalize"; n++) await page.keyboard.press("Tab");
    await page.keyboard.press("Enter"); await frames(page);
    assert.match(await page.innerText("#status"), /Confirmed rev 1/);
  }, { viewport: { width, height: 900 } }));
}

test("the rail collapses on a narrow screen", () => withApp(async ({ page }) => {
  const dir = await page.evaluate(() => getComputedStyle(document.querySelector("#rail")).flexDirection);
  assert.equal(dir, "row");
}, { viewport: { width: 390, height: 800 } }));

test("the skip link moves focus to the step content", () => withApp(async ({ page }) => {
  await page.keyboard.press("Tab");
  assert.equal(await page.evaluate(() => document.activeElement.className), "skip");
  await page.keyboard.press("Enter");
  assert.equal(await page.evaluate(() => document.activeElement.id), "main");
}, { example: false }));

test("focus stays on the same control after a change re-renders the step", () => withApp(async ({ page }) => {
  await goStep(page, 1);
  const type = page.locator('select[data-b="factions/0/type"]');
  await type.focus(); await type.selectOption("custom"); await frames(page);
  assert.equal(await page.evaluate(() => document.activeElement.dataset.b), "factions/0/type");
}));

test("? opens the shortcut panel and Escape closes it and returns focus", () => withApp(async ({ page }) => {
  await page.locator("#main h2").focus();
  await page.keyboard.press("Shift+Slash"); await frames(page);
  assert.equal(await page.isVisible("#help"), true);
  await page.keyboard.press("Escape");
  assert.equal(await page.isVisible("#help"), false);
  assert.equal(await page.evaluate(() => document.activeElement.id), "keys");
}));

test("a slow Claude request can be cancelled and changes nothing", () => withApp(async ({ page }) => {
  await page.click('[data-a="find-wiki"]');
  await page.waitForSelector(".busy");
  await page.click('[data-a="cancel-busy"]'); await frames(page);
  assert.equal(await page.locator(".busy").count(), 0);
  await page.waitForTimeout(900);
  assert.equal(await page.locator('[data-a="pick-wiki"]').count(), 0);
  assert.match(await page.innerText("#main"), /Cancelled\. Nothing was changed\./);
}, { replies: [["Wikipedia articles", JSON.stringify([{ title: "A", url: "https://en.wikipedia.org/wiki/A", why: "x" }]), 600]] }));
