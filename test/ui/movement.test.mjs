import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { launch, openApp, goStep, frames } from "./harness.mjs";

// Schema 1.9.0 gap 8: a move step may activate the moved pieces when a condition holds at the destination.
let browser;
before(async () => { browser = await launch(); });
after(async () => { await browser.close(); });

test("a designer adds an activation to a move step", async () => {
  const app = await openApp(browser);
  try {
    const { page, db } = app;
    await goStep(page, 1);
    // Two factions show as panels: open the IRA panel if it is closed.
    const fp = page.locator('details.fp[data-k="fp-ira"]');
    if (!(await fp.evaluate((d) => d.open))) { await fp.locator(":scope > summary").click(); await frames(page); }
    const act = page.locator('details[data-k="act-ira.march"]');
    await act.locator(":scope > summary").click(); await frames(page);
    const add = act.locator("select[data-saddopt]").filter({ has: page.locator('option[value="activate"]') }).first();
    await add.selectOption("activate"); await frames(page);
    assert.equal(await act.locator('select[aria-label="Moved pieces become"]').count(), 1);
    await page.waitForTimeout(1800);
    const g = JSON.parse((await db())["data/users/u1/draft"].json);
    const find = (list) => { for (const s of list) { if (s.op === "move" && s.activate) return s; const r = find([...(s.then ?? []), ...(s.else ?? []), ...(s.options ?? []).flatMap((o) => o.steps)]); if (r) return r; } };
    const mv = find(g.actions.find((a) => a.id === "ira.march").steps);
    assert.deepEqual(mv.activate, { if: { op: "gte", args: [{ var: "move.count" }, 3] }, to: "active" });
    assert.deepEqual(app.errors, []);
  } finally { await app.close(); }
});

// Schema 1.11.0 part E: a move step may keep pieces back in each space they leave.
test("a designer adds a keep-back to a move step, with a space condition and a kept state", async () => {
  const app = await openApp(browser);
  try {
    const { page, db } = app;
    await goStep(page, 1);
    const fp = page.locator('details.fp[data-k="fp-ira"]');
    if (!(await fp.evaluate((d) => d.open))) { await fp.locator(":scope > summary").click(); await frames(page); }
    const act = page.locator('details[data-k="act-ira.march"]');
    await act.locator(":scope > summary").click(); await frames(page);
    const add = act.locator("select[data-saddopt]").filter({ has: page.locator('option[value="keep"]') }).first();
    await add.selectOption("keep"); await frames(page);
    await act.locator('select[data-keepprefer]').first().selectOption("underground"); await frames(page);
    await act.locator('[data-a="keep-if"]').first().click(); await frames(page);
    await page.waitForTimeout(1800);
    const g = JSON.parse((await db())["data/users/u1/draft"].json);
    const find = (list) => { for (const s of list) { if (s.keep) return s; const r = find([...(s.then ?? []), ...(s.else ?? []), ...(s.options ?? []).flatMap((o) => o.steps)]); if (r) return r; } };
    const mv = find(g.actions.find((a) => a.id === "ira.march").steps);
    assert.equal(mv.op, "move");
    assert.deepEqual(mv.keep, { count: 1, prefer: "underground", if: true });
    assert.match(await act.innerText(), /Leave at least/);
    assert.equal(await page.locator("#stepissues li.error").count(), 0);
    assert.deepEqual(app.errors, []);
  } finally { await app.close(); }
});
