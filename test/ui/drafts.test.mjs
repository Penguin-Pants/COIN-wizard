import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { launch, openApp, goStep, frames } from "./harness.mjs";

let browser;
before(async () => { browser = await launch(); });
after(async () => { await browser.close(); });

const DRAFT_PATH = "data/users/u1/draft";
const AT = "2026-11-19T10:00:00Z";
const draftGame = () => { const g = JSON.parse(readFileSync("examples/tan-war.game.json", "utf8")); g.meta.title = "Saved Draft Title"; return g; };
const withDraft = () => ({ example: false, saved: { [DRAFT_PATH]: { json: JSON.stringify(draftGame()), savedAt: AT } } });

async function withApp(fn, opts) {
  const app = await openApp(browser, opts);
  try { await fn(app); assert.deepEqual(app.errors, []); } finally { await app.close(); }
}
const offerButtons = (page) => page.$$eval(".offer button", (e) => e.map((x) => x.textContent));

test("a saved draft shows a banner that can be dismissed", () => withApp(async ({ page, db }) => {
  assert.deepEqual(await offerButtons(page), ["Resume draft", "Delete draft", "Dismiss"]);
  await page.click('.offer [data-a="confirm-ask"]'); await frames(page);
  assert.deepEqual(await offerButtons(page), ["Resume draft", "Yes, delete it", "Cancel", "Dismiss"]);
  await page.click('[data-a="confirm-cancel"]'); await frames(page);
  await page.click('[data-a="dismiss-offer"]'); await frames(page);
  assert.equal(await page.locator(".offer").count(), 0);
  assert.deepEqual((await db())["data/users/u1/prefs"], { dismissedDraftAt: AT });
}, withDraft()));

test("Resume loads the saved draft", () => withApp(async ({ page }) => {
  await page.click('[data-a="resume"]'); await frames(page);
  assert.equal(await page.innerText("#title"), "Saved Draft Title");
  assert.equal(await page.locator(".offer").count(), 0);
}, withDraft()));

test("deleting the draft from the banner removes it", () => withApp(async ({ page, db }) => {
  await page.click('.offer [data-a="confirm-ask"]'); await page.click('.offer [data-a="confirm-delete"]'); await frames(page);
  assert.equal(DRAFT_PATH in (await db()), false);
  assert.equal(await page.locator(".offer").count(), 0);
}, withDraft()));

test("a pending autosave cannot bring back a deleted draft", () => withApp(async ({ page, db }) => {
  await page.fill('input[data-b="meta/title"]', "Edited");
  await goStep(page, 4);
  assert.deepEqual(await page.$$eval("section.panel h3", (e) => e.map((x) => x.textContent)), ["Confirm", "Revisions", "Saved copies", "Export"]);
  await page.click('[data-a="confirm-ask"][data-key="draft"]');
  await page.click('[data-a="confirm-delete"]'); await frames(page);
  await page.waitForTimeout(2000);
  assert.equal(DRAFT_PATH in (await db()), false);
  assert.match(await page.innerText(".note"), /Saved draft deleted/);
}, withDraft()));

test("an edit is autosaved as a draft", () => withApp(async ({ page, db }) => {
  await page.fill('input[data-b="meta/title"]', "Autosaved Title");
  await page.waitForFunction((p) => p in window.__saved, DRAFT_PATH, { timeout: 5000 });
  assert.equal(JSON.parse((await db())[DRAFT_PATH].json).meta.title, "Autosaved Title");
}));

const oldGame = () => { const g = JSON.parse(readFileSync("test/fixtures/tan-war.1.0.0.game.json", "utf8")); g.meta.title = "Old Draft Title"; return g; };

test("a draft from schema 1.0.0 resumes and validates after migration", () => withApp(async ({ page }) => {
  await page.click('[data-a="resume"]'); await frames(page);
  assert.equal(await page.innerText("#title"), "Old Draft Title");
  assert.equal(await page.innerText("#blockers"), "No blockers");
}, { saved: { [DRAFT_PATH]: { json: JSON.stringify(oldGame()), savedAt: AT } } }));

test("a draft from a newer schema stays in the banner with a message", () => withApp(async ({ page }) => {
  await page.click('[data-a="resume"]'); await frames(page);
  assert.match(await page.innerText(".offer .err"), /Unknown schema version coin-game\/9\.0\.0/);
  assert.equal(await page.locator(".offer").count(), 1);
}, { saved: { [DRAFT_PATH]: { json: JSON.stringify({ ...draftGame(), meta: { ...draftGame().meta, schemaVersion: "coin-game/9.0.0" } }), savedAt: AT } } }));

test("a 1.0.0 project file opens after migration", () => withApp(async ({ page }) => {
  await goStep(page, 4);
  await page.setInputFiles("#openfile", { name: "old.project.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(oldGame())) });
  await page.waitForFunction(() => document.querySelector("#title").textContent === "Old Draft Title");
  assert.match(await page.innerText("#main"), /Project opened\./);
  assert.equal(await page.locator("#main p.okmsg", { hasText: "Project opened." }).count(), 1);
  assert.equal(await page.innerText("#blockers"), "No blockers");
}));
