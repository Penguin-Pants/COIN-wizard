import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { launch, openApp, goStep, frames } from "./harness.mjs";

let browser;
before(async () => { browser = await launch(); });
after(async () => { await browser.close(); });

const TITLES = [
  "Describe and research the conflict", "Define factions, pieces and actions", "Prepare the board and setup",
  "Complete the rules, cards and bots", "Review and finalize"
];

async function withApp(fn, opts) {
  const app = await openApp(browser, opts);
  try { await fn(app); assert.deepEqual(app.errors, []); } finally { await app.close(); }
}

test("the template opens with no blockers and every step renders", () => withApp(async ({ page }) => {
  assert.equal(await page.innerText("#blockers"), "No blockers");
  for (let i = 0; i < TITLES.length; i++) {
    await goStep(page, i);
    assert.equal(await page.innerText("#main h2"), TITLES[i]);
  }
}));

test("step 4 shows all four tabs", () => withApp(async ({ page }) => {
  await goStep(page, 3);
  for (const tab of ["rules", "deck", "victory", "bots"]) {
    await page.click(`[data-a="tab"][data-tab="${tab}"]`);
    await frames(page);
    assert.equal(await page.locator('[data-a="tab"][aria-selected="true"]').getAttribute("data-tab"), tab);
  }
  assert.equal(await page.locator('[data-a="bot-pick"]').count(), 2);
}));

test("sources can be added and removed", () => withApp(async ({ page }) => {
  const rows = () => page.locator("li.src").count();
  const before = await rows();
  await page.click('[data-a="list-add"][data-list="sources"]'); await frames(page);
  assert.equal(await rows(), before + 1);
  await page.locator('[data-a="list-del"][data-list="sources"]').last().click(); await frames(page);
  assert.equal(await rows(), before);
}));

test("claims can be added", () => withApp(async ({ page }) => {
  const n = () => page.locator('textarea[data-b^="brief/claims/"][data-b$="/text"]').count();
  const before = await n();
  await page.locator("summary", { hasText: "Claims" }).click();
  await page.click('[data-a="list-add"][data-list="claims"]'); await frames(page);
  await page.locator("summary", { hasText: "Claims" }).click();
  assert.equal(await n(), before + 1);
}));

test("spaces can be added, moved with the keyboard and deleted", () => withApp(async ({ page }) => {
  await goStep(page, 2);
  const names = () => page.locator('input[data-b^="board/spaces/"][data-b$="/name"]').count();
  const before = await names();
  await page.click('[data-a="list-add"][data-list="spaces"]'); await frames(page);
  assert.equal(await names(), before + 1);
  const first = page.locator("#board [data-space]").first();
  const svg0 = await page.innerHTML("#board");
  await first.focus();
  await page.keyboard.press("ArrowRight");
  assert.notEqual(await page.innerHTML("#board"), svg0);
  await page.locator('[data-a="list-del"][data-list="spaces"]').last().click(); await frames(page);
  assert.equal(await names(), before);
}));

test("a connection needs two different spaces", () => withApp(async ({ page }) => {
  await goStep(page, 2);
  await page.selectOption("#lk-to", await page.locator("#lk-from").inputValue());
  await page.click('[data-a="list-add"][data-list="links"]'); await frames(page);
  assert.match(await page.innerText("#main"), /Choose two different spaces\./);
}));

test("the Review step finalizes a clean game", () => withApp(async ({ page }) => {
  await goStep(page, 4);
  await page.check("#confirm");
  await page.click('[data-a="finalize"]'); await frames(page);
  assert.match(await page.innerText("#status"), /Confirmed rev/);
}));
