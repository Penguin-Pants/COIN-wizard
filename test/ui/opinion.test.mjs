import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { launch, openApp, goStep, frames } from "./harness.mjs";

// Schema 1.9.0 gap 6: a game has 3 or 5 opinion levels.
let browser;
before(async () => { browser = await launch(); });
after(async () => { await browser.close(); });
async function withApp(fn, opts) {
  const app = await openApp(browser, opts);
  try { await fn(app); assert.deepEqual(app.errors, []); } finally { await app.close(); }
}
const draft = async (db) => JSON.parse((await db())["data/users/u1/draft"].json);

test("a designer switches to 5 opinion levels, sets Active Support, and back to 3", () => withApp(async ({ page, db }) => {
  await goStep(page, 2);
  await page.locator("select#oplevels").selectOption("5"); await frames(page);
  const op = page.locator('select[data-b$="/opinion"]').first();
  assert.equal(await op.locator("option").count(), 5);
  await op.selectOption("2"); await frames(page);
  await page.waitForTimeout(1800);
  let g = await draft(db);
  assert.equal(g.board.opinionLevels, 5);
  assert.equal(g.setup.spaceAttributes[g.board.spaces[0].id].opinion, 2);
  // Back to 3: Active Support becomes Support, and the field goes (3 is the default).
  await page.locator("select#oplevels").selectOption("3"); await frames(page);
  await page.waitForTimeout(1800);
  g = await draft(db);
  assert.equal("opinionLevels" in g.board, false);
  assert.equal(g.setup.spaceAttributes[g.board.spaces[0].id].opinion, 1);
  assert.equal(await page.locator('select[data-b$="/opinion"]').first().locator("option").count(), 3);
}));
