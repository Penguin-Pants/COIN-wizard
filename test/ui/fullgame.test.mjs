import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { launch, openApp, goStep, frames } from "./harness.mjs";
import { read } from "../zipread.mjs";

let browser;
before(async () => { browser = await launch(); });
after(async () => { await browser.close(); });

const settle = (page) => page.waitForTimeout(350);
const blockers = (page) => page.innerText("#blockers");

// Picks the first template the faction can use, in one lane, and adds it.
async function addTemplate(page, fid, kind) {
  const sel = page.locator(`#tpl-${fid.replace(".", "\\.")}-${kind}`);
  const first = await sel.evaluate((s) => [...s.options].find((o) => !o.disabled)?.value);
  await sel.selectOption(first);
  await page.click(`[data-a="addtpl"][data-f="${fid}"][data-kind="${kind}"]`); await frames(page);
}

for (const n of [3, 4]) {
  test(`a designer builds a ${n}-faction game from an empty screen through export, by clicking only`, async () => {
    const app = await openApp(browser, { example: false, viewport: { width: 1280, height: 1000 } });
    const { page } = app;
    try {
      // Step 1: faction count.
      await page.selectOption("#fcount", String(n)); await frames(page);
      await page.click('[data-a="fcount-apply"]'); await frames(page);
      const fids = await page.$$eval("#rail li.fsub button", (bs) => bs.map((b) => b.dataset.f));
      assert.equal(fids.length, n);
      // Step 2: one Operation and one Special Activity per faction, from templates.
      await goStep(page, 1);
      for (const fid of fids) {
        await page.click(`[data-a="fac-tab"][data-f="${fid}"]`); await frames(page);
        await addTemplate(page, fid, "operation");
        await addTemplate(page, fid, "specialActivity");
      }
      // Step 4: deck.
      await goStep(page, 3); await page.click('[data-a="tab"][data-tab="deck"]'); await frames(page);
      for (let i = 0; i < 6; i++) { await page.click('[data-a="card-add"][data-type="event"]'); await frames(page); }
      for (let i = 0; i < 2; i++) { await page.click('[data-a="card-add"][data-type="scoring"]'); await frames(page); }
      await page.locator('input[data-b="deck/cards/7/final"]').check(); await frames(page);
      await page.selectOption("#pilecount", "2"); await page.click('[data-a="piles-build"]'); await frames(page);
      // Step 4: a bot for every faction, each picking its enemy first, with all six dry runs.
      await page.click('[data-a="tab"][data-tab="bots"]'); await frames(page);
      for (let b = 0; b < n; b++) {
        await page.locator('[data-a="bot-new"]').first().click(); await frames(page);
        await page.locator('[data-a="bot-addenemy"]').click(); await frames(page);
        const act = await page.locator(".flow g.k-action").first().getAttribute("data-node");
        await page.locator(`.flow g[data-node="${act}"]`).click(); await frames(page);
        const target = page.locator('select[data-b$="/target"]');
        await target.selectOption({ index: 1 }); await frames(page);
        for (let i = 0; i < 6; i++) {
          await page.locator('[data-a="dry-add"]').first().click(); await frames(page);
          await page.click(`[data-a="dry-run"][data-dry="${b}/${i}"]`); await frames(page);
          if (await page.locator(`[data-a="dry-use"][data-dry="${b}/${i}"]`).count() === 0) {
            // A tie needs a die roll: give one and run again.
            const dice = page.locator(`details.act[open] input[data-dk="dice"]`).last();
            await dice.fill("3, 3, 3"); await dice.dispatchEvent("change"); await frames(page);
            await page.click(`[data-a="dry-run"][data-dry="${b}/${i}"]`); await frames(page);
          }
          await page.click(`[data-a="dry-use"][data-dry="${b}/${i}"]`); await frames(page);
        }
      }
      await settle(page);
      assert.equal(await blockers(page), "No blockers", await page.innerText("#rail"));
      // Step 5: finalize and export.
      await goStep(page, 4);
      await page.check("#confirm"); await page.click('[data-a="finalize"]'); await frames(page);
      await page.click('[data-a="dl-zip"]');
      await page.waitForFunction(() => Array.isArray(window.__dlBytes));
      const files = read(Uint8Array.from(await page.evaluate(() => window.__dlBytes)));
      const names = files.map((f) => f.name);
      const game = JSON.parse(new TextDecoder().decode(files.find((f) => f.name.endsWith(".game.json")).data));
      assert.equal(game.factions.length, n);
      assert.equal(game.bots.length, n);
      assert.ok(game.bots.every((b) => b.nodes.some((x) => x.target)), "every bot picks its enemy");
      for (const f of game.factions) assert.ok(names.some((x) => x.endsWith(`.${f.id}.aid.html`)), f.id);
      assert.deepEqual(app.errors, []);
    } finally { await app.close(); }
  });
}
