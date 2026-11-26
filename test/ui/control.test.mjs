import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { launch, openApp, goStep, frames } from "./harness.mjs";

// Schema 1.11.0 part D: Control rules in the Rules tab, and Control on the board preview.
let browser;
before(async () => { browser = await launch(); });
after(async () => { await browser.close(); });

async function withApp(fn, opts) {
  const app = await openApp(browser, opts);
  try { await fn(app); assert.deepEqual(app.errors, []); } finally { await app.close(); }
}
const DRAFT = "data/users/u1/draft";
const saved = async (page, db) => { await page.waitForTimeout(1800); return JSON.parse((await db())[DRAFT].json); };
const box = (page, kind, value) => page.locator(`input[data-ctl="${kind}"][value="${value}"]`).first();

test("a designer turns on Control, adds a side, limits spaces and pieces, and sees Control on the board", () => withApp(async ({ page, db }) => {
  await goStep(page, 2);
  assert.equal(await page.locator("#board text", { hasText: "Control:" }).count(), 0, "no Control rules: no labels");
  await goStep(page, 3);
  await box(page, "on", "on").check(); await frames(page);
  assert.deepEqual((await saved(page, db)).rules.control, {});
  await page.click('[data-a="ctl-side-add"]'); await frames(page);
  await box(page, "type", "city").check(); await frames(page);
  await box(page, "exclude", "crown.police").check(); await frames(page);
  const side = page.locator('input[data-ctl="side-name"]').first();
  await side.fill("Everyone"); await side.dispatchEvent("change"); await frames(page);
  assert.deepEqual((await saved(page, db)).rules.control, { sides: [{ id: "side1", name: "Everyone", factions: ["crown", "ira"] }], types: ["city"], exclude: ["crown.police"] });
  assert.equal(await page.locator("#stepissues li.error").count(), 0);
  await goStep(page, 2);
  assert.ok(await page.locator("#board text", { hasText: "Control: Everyone" }).count() > 0, "a city with pieces shows its side");
  await goStep(page, 3);
  await box(page, "on", "on").uncheck(); await frames(page);
  assert.equal("control" in (await saved(page, db)).rules, false, "turning it off removes the rules");
}));
