import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { launch, openApp, goStep, frames } from "./harness.mjs";

let browser;
before(async () => { browser = await launch(); });
after(async () => { await browser.close(); });

// Owner request: an Operation or Special Activity can be used against any enemy, so there is no "Against" box.
test("a 3-faction game adds an enemy template against every enemy, with no Against box", async () => {
  const app = await openApp(browser, { example: false });
  try {
    const { page } = app;
    await page.selectOption("#fcount", "3"); await frames(page);
    await page.click('[data-a="fcount-apply"]'); await frames(page);
    await goStep(page, 1);
    assert.equal(await page.$$eval('[id^="tgt-"]', (e) => e.length), 0, "no Against box");
    const fid = await page.$eval('[data-a="addtpl"]', (e) => e.dataset.f);
    const sel = `#tpl-${fid}-operation`;
    const opts = await page.$$eval(`${sel} option:not([disabled])`, (e) => e.map((o) => o.value));
    const enemy = ["suppress", "sweep", "strike"].find((t) => opts.includes(t));
    assert.ok(enemy, `an enemy template is offered: ${opts}`);
    await page.selectOption(sel, enemy);
    await page.click(`[data-a="addtpl"][data-f="${fid}"][data-kind="operation"]`); await frames(page);
    const text = await page.textContent("main");
    // Step 2 shows one faction at a time; the faction tabs name all three. The first tab is the one in view.
    const names = await page.$$eval('[data-a="fac-tab"]', (e) => e.map((x) => x.lastChild.textContent.trim()));
    assert.equal(names.length, 3);
    for (const n of names.slice(1)) assert.ok(text.includes(`Against ${n}`), n);
    assert.match(text, /Choose an enemy faction/);
    assert.deepEqual(app.errors, []);
  } finally { await app.close(); }
});

// Schema 1.9.0 gap 9: an option against an enemy may be for one of its piece types.
test("an enemy option can be set to one piece type of that enemy", async () => {
  const app = await openApp(browser, { example: false });
  try {
    const { page, db } = app;
    await page.selectOption("#fcount", "3"); await frames(page);
    await page.click('[data-a="fcount-apply"]'); await frames(page);
    await goStep(page, 1);
    const fid = await page.$eval('[data-a="addtpl"]', (e) => e.dataset.f);
    const sel = `#tpl-${fid}-operation`;
    const opts = await page.$$eval(`${sel} option:not([disabled])`, (e) => e.map((o) => o.value));
    await page.selectOption(sel, ["suppress", "sweep", "strike"].find((t) => opts.includes(t)));
    await page.click(`[data-a="addtpl"][data-f="${fid}"][data-kind="operation"]`); await frames(page);
    // The new action is a closed panel: open it.
    await page.locator("details[data-k^=\"act-\"]", { has: page.locator("select[data-optpiece]") }).first().locator(":scope > summary").click(); await frames(page);
    const ps = page.locator("select[data-optpiece]:visible").first();
    assert.ok(await page.locator("select[data-optpiece]").count() >= 2, "each enemy option offers a piece");
    const pid = await ps.locator("option").nth(1).getAttribute("value");
    await ps.selectOption(pid); await frames(page);
    await page.waitForTimeout(1800);
    const g = JSON.parse((await db())["data/users/u1/draft"].json);
    const opt = g.actions.flatMap((a) => a.steps).flatMap((s) => s.options ?? []).find((o) => o.piece);
    assert.equal(opt?.piece, pid);
    assert.deepEqual(app.errors, []);
  } finally { await app.close(); }
});
