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

// Review findings on PR 23.
test("Show on another faction's bot problem opens that bot", async () => {
  const g = JSON.parse(readFileSync("examples/tan-war.game.json", "utf8")); g.bots[1].dryRuns = [];
  const app = await openApp(browser, { example: false, saved: { "data/users/u1/draft": { json: JSON.stringify(g), savedAt: "2026-11-22T10:00:00Z" } } });
  try {
    const { page } = app;
    await page.click('[data-a="resume"]'); await frames(page);
    await goStep(page, 1);
    const fp = page.locator(`details.fp:has([aria-label^="Problems for"])`);
    await fp.locator('[data-a="show-issue"]').first().click(); await frames(page);
    const name = g.factions.find((f) => f.id === g.bots[1].factionId).name;
    assert.match(await page.textContent("main"), new RegExp(`${name}`));
    assert.equal(await page.$eval('[data-a="bot-pick"][aria-selected="true"]', (e) => e.dataset.i), "1");
    assert.deepEqual(app.errors, []);
  } finally { await app.close(); }
});

test("the faction problem list updates after an edit, without a full render", async () => {
  const g = JSON.parse(readFileSync("examples/tan-war.game.json", "utf8")); g.factions[0].pieces[0].supply = 0;
  const app = await openApp(browser, { example: false, saved: { "data/users/u1/draft": { json: JSON.stringify(g), savedAt: "2026-11-22T10:00:00Z" } } });
  try {
    const { page } = app;
    await page.click('[data-a="resume"]'); await frames(page);
    await goStep(page, 1);
    const region = page.locator('[aria-label^="Problems for"]').first();
    const before = await region.locator("li").count();
    const supply = page.locator('input[data-path="/factions/0/pieces/0/supply"]');
    await supply.fill(String(load().factions[0].pieces[0].supply)); await supply.dispatchEvent("input");
    await page.waitForTimeout(900);
    const after = await page.locator('[aria-label^="Problems for"] li').count();
    assert.ok(after < before, `list shrinks after the fix: ${before} -> ${after}`);
    assert.deepEqual(app.errors, []);
  } finally { await app.close(); }
});
const load = () => JSON.parse(readFileSync("examples/tan-war.game.json", "utf8"));
