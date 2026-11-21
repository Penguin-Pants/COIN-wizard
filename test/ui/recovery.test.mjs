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
const type = async (page, sel, v) => { await page.locator(sel).fill(v); await page.waitForTimeout(500); };
const TITLE = 'input[data-b="meta/title"]';

test("undo and redo work from the buttons and from the keyboard outside text fields", () => withApp(async ({ page }) => {
  await type(page, TITLE, "Edited");
  await page.click('[data-a="undo"]'); await frames(page);
  assert.equal(await page.inputValue(TITLE), "Tan War");
  await page.click('[data-a="redo"]'); await frames(page);
  assert.equal(await page.inputValue(TITLE), "Edited");
  await page.locator("#main h2").click();
  await page.keyboard.press("Control+z"); await frames(page);
  assert.equal(await page.inputValue(TITLE), "Tan War");
  await page.keyboard.press("Control+Shift+z"); await frames(page);
  assert.equal(await page.inputValue(TITLE), "Edited");
}));

test("a designer reverts a bad edit from another step without losing other work", () => withApp(async ({ page }) => {
  await type(page, TITLE, "Kept Title");
  await goStep(page, 2);
  const name = page.locator('input[data-b="board/spaces/0/name"]');
  await name.fill("Wrong Name"); await page.waitForTimeout(500);
  await page.click('[data-a="undo"]'); await frames(page);
  assert.equal(await page.inputValue('input[data-b="board/spaces/0/name"]'), "Dublin");
  assert.equal(await page.innerText("#title"), "Kept Title");
}));

test("undo across a card rename restores the old id everywhere", () => withApp(async ({ page }) => {
  await goStep(page, 3); await page.click('[data-a="tab"][data-tab="deck"]'); await frames(page);
  await page.locator('details.card[data-k="card-s1"] > summary').click(); await frames(page);
  const id = page.locator('input[data-cardid="s1"]');
  await id.fill("truce1"); await id.dispatchEvent("change"); await page.waitForTimeout(500);
  await page.click('[data-a="undo"]'); await frames(page); await page.waitForTimeout(400);
  assert.equal(await page.locator('details.card[data-k="card-s1"]').count(), 1);
  assert.equal(await page.innerText('[data-tabcount="Deck"]'), "");
}));

test("snapshots are pruned to the newest 20 after the 21st", () => withApp(async ({ page, db }) => {
  for (let i = 1; i <= 21; i++) {
    await goStep(page, 0);
    await page.locator(TITLE).fill(`Title ${i}`); await page.waitForTimeout(30);
    await goStep(page, 1);
  }
  await page.waitForTimeout(600);
  const d = await db();
  const items = d["data/users/u1/revisions-index"].items;
  assert.equal(items.length, 20);
  assert.equal(items[0].n, 2);
  assert.equal("data/users/u1/revisions/1" in d, false);
  assert.ok("data/users/u1/revisions/21" in d);
}));

test("restore then undo brings back the work from before the restore", () => withApp(async ({ page }) => {
  await type(page, TITLE, "First");
  await goStep(page, 1); await goStep(page, 0);
  await type(page, TITLE, "Second");
  await goStep(page, 4);
  await page.locator('[data-a="confirm-ask"][data-key="rev-1"]').click();
  await page.click('[data-a="rev-restore"][data-n="1"]');
  await page.waitForFunction(() => /Restored snapshot 1/.test(document.querySelector("#main").innerText));
  assert.equal(await page.innerText("#title"), "First");
  await page.click('[data-a="undo"]'); await frames(page);
  assert.equal(await page.innerText("#title"), "Second");
}));

test("compare lists the changed sections", () => withApp(async ({ page }) => {
  await type(page, TITLE, "First");
  await goStep(page, 2);
  await page.locator('input[data-b="board/spaces/0/name"]').fill("Changed"); await page.waitForTimeout(500);
  await goStep(page, 4);
  await page.click('[data-a="rev-compare"][data-n="1"]');
  await page.waitForSelector('[aria-label="Compare"]');
  const rows = await page.$$eval('[aria-label="Compare"] tbody tr', (trs) => Object.fromEntries(trs.map((tr) => [tr.cells[0].innerText, tr.cells[1].innerText])));
  assert.equal(rows["Board and setup"], "1");
  assert.equal(rows["Bots"], "same");
}));

test("a failed write retries and the header says so until it saves", () => withApp(async ({ page, db }) => {
  await page.locator(TITLE).fill("Offline edit");
  await page.waitForFunction(() => /Not saved \(unavailable\)\. Retrying in \d+ s\./.test(document.querySelector("#save").textContent), null, { timeout: 4000 });
  await page.waitForFunction(() => /^Saved /.test(document.querySelector("#save").textContent), null, { timeout: 8000 });
  assert.equal(JSON.parse((await db())["data/users/u1/draft"].json).meta.title, "Offline edit");
}, { example: false, failWrites: 2 }));
