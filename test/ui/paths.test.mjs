import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { launch, openApp, goStep, frames } from "./harness.mjs";

let browser;
before(async () => { browser = await launch(); });
after(async () => { await browser.close(); });

// Runs in the page. Returns one message per bound field with a wrong or missing data-path.
function scan() {
  const bad = [];
  const need = (el, want, what) => {
    const got = el.getAttribute("data-path");
    if (got !== want) bad.push(`${what}: want ${want}, got ${got}`);
  };
  document.querySelectorAll("#main [data-b]").forEach((el) => need(el, "/" + el.dataset.b, "data-b " + el.dataset.b));
  document.querySelectorAll("#main [data-sf]").forEach((el) => need(el, "/" + el.dataset.sf, "data-sf " + el.dataset.sf));
  document.querySelectorAll("#main [data-sq]").forEach((el) => need(el, "/" + el.dataset.sq, "data-sq " + el.dataset.sq));
  document.querySelectorAll("#main [data-sop]").forEach((el) => need(el, "/" + el.dataset.sop + "/op", "data-sop " + el.dataset.sop));
  document.querySelectorAll("#main [data-x]").forEach((el) => need(el, "/" + el.dataset.x, "data-x " + el.dataset.x));
  document.querySelectorAll("#main [data-sj], #main [data-saddopt]").forEach((el) => need(el, "/" + (el.dataset.sj ?? el.dataset.saddopt), "step " + (el.dataset.sj ?? el.dataset.saddopt)));
  document.querySelectorAll("#main [data-pc]").forEach((el) => need(el, "/setup/placements", "data-pc " + el.dataset.pc));
  document.querySelectorAll("#main [data-track]").forEach((el) => {
    if (!/^\/tracks\/\d+\/start$/.test(el.getAttribute("data-path") ?? "")) bad.push("data-track " + el.dataset.track + ": " + el.getAttribute("data-path"));
  });
  return { bad, count: document.querySelectorAll("#main [data-b], #main [data-sf], #main [data-x], #main [data-sop], #main [data-pc], #main [data-track]").length };
}

async function withApp(fn) {
  const app = await openApp(browser);
  try { await fn(app); assert.deepEqual(app.errors, []); } finally { await app.close(); }
}

test("every bound field in steps 1 to 3 and review has a matching data-path", () => withApp(async ({ page }) => {
  let total = 0;
  for (const i of [0, 1, 2, 4]) {
    await goStep(page, i);
    const r = await page.evaluate(scan);
    assert.deepEqual(r.bad, [], `step ${i}`);
    total += r.count;
  }
  assert.ok(total > 10, "scan found fields");
}));

test("every bound field in the 4 rules tabs has a matching data-path", () => withApp(async ({ page }) => {
  await goStep(page, 3);
  let total = 0;
  for (const tab of ["rules", "deck", "victory", "bots"]) {
    await page.click(`[data-a="tab"][data-tab="${tab}"]`); await frames(page);
    const r = await page.evaluate(scan);
    assert.deepEqual(r.bad, [], `tab ${tab}`);
    total += r.count;
  }
  assert.ok(total > 10, "scan found fields");
}));

test("faction sub rows and list-built fields have a data-path", () => withApp(async ({ page }) => {
  await goStep(page, 1);
  await page.locator("details.act > summary").first().click();
  await page.locator('[data-a="list-add"][data-list="steps"]').first().click(); await frames(page);
  assert.ok(await page.locator('details.act[open] [data-sop]').count() > 0, "step fields rendered");
  const r = await page.evaluate(scan);
  assert.deepEqual(r.bad, []);
}));
