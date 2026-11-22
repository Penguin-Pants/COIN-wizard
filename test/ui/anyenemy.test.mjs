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
