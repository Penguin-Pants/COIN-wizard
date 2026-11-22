import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { launch, openApp, goStep, frames } from "./harness.mjs";

let browser;
before(async () => { browser = await launch(); });
after(async () => { await browser.close(); });

// Owner report: a faction shows "N to fix" but not where or what. The count includes its bot, which is
// edited in Step 4, so Step 2 must list each problem, say where it is and link to it.
test("a faction's problems are listed with where they are, and Show opens the right step", async () => {
  // Tan War with the first bot's dry runs gone: as in the owner's draft, where no bot has dry runs yet.
  const g = JSON.parse(readFileSync("examples/tan-war.game.json", "utf8")); g.bots[0].dryRuns = [];
  const app = await openApp(browser, { example: false, saved: { "data/users/u1/draft": { json: JSON.stringify(g), savedAt: "2026-11-22T10:00:00Z" } } });
  try {
    const { page } = app;
    await page.click('[data-a="resume"]'); await frames(page);
    await goStep(page, 1);
    await page.click(`[data-a="fac-tab"][data-f="${g.bots[0].factionId}"]`).catch(() => {}); await frames(page);
    const chip = await page.textContent("details.fp summary .chip.bad");
    const n = Number(chip.match(/\d+/)[0]);
    const list = page.locator('details.fp [aria-label^="Problems for"] li');
    assert.equal(await list.count(), n, "one line per problem counted");
    const first = await list.first().textContent();
    assert.match(first, /^Step 4, Rules, cards, bots \(Bots tab\): \S+ bot No dry run/);
    await list.first().locator('[data-a="show-issue"]').click(); await frames(page);
    assert.equal(await page.$eval('[aria-current="step"] .n', (e) => e.textContent), "4");
    assert.deepEqual(app.errors, []);
  } finally { await app.close(); }
});
