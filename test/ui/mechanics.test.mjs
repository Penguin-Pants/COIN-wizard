import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { launch, openApp, goStep, frames } from "./harness.mjs";

let browser;
before(async () => { browser = await launch(); });
after(async () => { await browser.close(); });

async function withApp(fn, opts) {
  const app = await openApp(browser, opts);
  try { await fn(app); assert.deepEqual(app.errors, []); } finally { await app.close(); }
}
const DRAFT = "data/users/u1/draft";
const saved = async (page, db) => { await page.waitForTimeout(1800); return JSON.parse((await db())[DRAFT].json); };
const pick = (loc, v) => loc.selectOption(v).then(() => loc.page().waitForTimeout(50));
const openAction = async (page, id) => { await page.locator(`details.act[data-k="act-${id}"] > summary`).click(); await frames(page); };
const JSON_FIELDS = "textarea[data-sj], .xraw, textarea[data-t=\"j\"]";

test("no action, card or victory field needs JSON for the example", () => withApp(async ({ page }) => {
  await goStep(page, 1);
  assert.ok(await page.locator("[data-sop]").count() > 10);
  assert.equal(await page.locator(JSON_FIELDS).count(), 0);
  await goStep(page, 3);
  for (const tab of ["rules", "deck", "victory"]) {
    await page.click(`[data-a="tab"][data-tab="${tab}"]`); await frames(page);
    assert.equal(await page.locator(JSON_FIELDS).count(), 0, tab);
  }
  assert.equal(await page.locator('[data-x^="victory/perFaction/"]').count() > 0, true);
}));

test("a comparator change in a legal-space row rewrites the expression", () => withApp(async ({ page, db }) => {
  await goStep(page, 1); await openAction(page, "crown.sweep");
  await pick(page.locator('select[data-x="actions/1/targets"][data-xm="cmp"]'), "gt");
  const g = await saved(page, db);
  assert.equal(g.actions[1].targets.op, "gt");
  assert.equal(await page.locator(".fieldissue, #stepissues li").count(), 0);
}));

test("changing a step's effect gives a complete step of the new kind", () => withApp(async ({ page, db }) => {
  await goStep(page, 1); await openAction(page, "crown.garrison");
  // Step 2 (Police): the Army of step 1 still reach the Martial Law dry runs.
  await pick(page.locator('select[data-sop="actions/0/steps/1"]'), "pay");
  assert.equal(await page.locator('select[data-sf="actions/0/steps/1/track"]').count(), 1);
  const g = await saved(page, db);
  assert.deepEqual(g.actions[0].steps[1], { op: "pay", track: "res.crown", amount: 1 });
  assert.equal(await page.innerText("#blockers"), "No blockers");
}));

test("an optional detail can be added and removed", () => withApp(async ({ page }) => {
  await goStep(page, 1); await openAction(page, "crown.garrison");
  await pick(page.locator('select[data-saddopt="actions/0/steps/0"]'), "filter");
  assert.equal(await page.locator('[data-x="actions/0/steps/0/filter"]').count() > 0, true);
  await page.click('[data-a="step-unset"][data-p="actions/0/steps/0"][data-k="filter"]'); await frames(page);
  assert.equal(await page.locator('[data-x="actions/0/steps/0/filter"]').count(), 0);
}));

test("Draft text fills the action text and a later step change marks it stale", () => withApp(async ({ page, db }) => {
  await goStep(page, 1); await openAction(page, "crown.garrison");
  await page.click('[data-a="draft-plain"][data-p="actions/0"]'); await frames(page);
  assert.equal(await page.inputValue('textarea[data-b="actions/0/plain"]'), "Place 2 Army from Available in this space. Place 1 Police from Available in this space.");
  assert.equal(await page.locator("text=Effects changed after this text").count(), 0);
  await page.locator('input[data-sf="actions/0/steps/0/count"]').fill("3");
  await page.locator('input[data-sf="actions/0/steps/0/count"]').dispatchEvent("change"); await frames(page);
  await goStep(page, 1);
  assert.equal(await page.locator("text=Effects changed after this text").count(), 1);
  const g = await saved(page, db);
  assert.equal(typeof g.actions[0].plainOf, "string");
}));

test("a shape the rows cannot show opens as data and stays editable", () => {
  const g = JSON.parse(readFileSync("examples/tan-war.game.json", "utf8"));
  g.actions[0].targets = { op: "gte", args: [{ op: "mul", args: [2, { var: "$space.pop" }] }, 2] };
  const opts = { example: false, saved: { [DRAFT]: { json: JSON.stringify(g), savedAt: "2026-11-20T10:00:00Z" } } };
  return withApp(async ({ page, db }) => {
    await page.click('[data-a="resume"]'); await frames(page);
    await goStep(page, 1); await openAction(page, "crown.garrison");
    const raw = page.locator('textarea[data-x="actions/0/targets"][data-xraw="value"]');
    assert.equal(await raw.count(), 1);
    await raw.fill('{"op":"mul","args":[3,{"var":"$space.pop"}]}'); await raw.dispatchEvent("change");
    const out = await saved(page, db);
    assert.deepEqual(out.actions[0].targets, { op: "gte", args: [{ op: "mul", args: [3, { var: "$space.pop" }] }, 2] });
  }, opts);
});
