import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { launch, openApp, goStep, frames } from "./harness.mjs";
import { read } from "../zipread.mjs";

let browser;
before(async () => { browser = await launch(); });
after(async () => { await browser.close(); });

async function withApp(fn, opts) {
  const app = await openApp(browser, opts);
  try { await fn(app); assert.deepEqual(app.errors, []); } finally { await app.close(); }
}
const kit = async (page) => {
  await goStep(page, 4);
  await page.click('[data-a="dl-zip"]');
  await page.waitForFunction(() => Array.isArray(window.__dlBytes));
  const files = read(Uint8Array.from(await page.evaluate(() => window.__dlBytes)));
  return { names: files.map((f) => f.name), text: Object.fromEntries(files.map((f) => [f.name, new TextDecoder().decode(f.data)])), file: await page.evaluate(() => window.__dl.at(-1)) };
};

for (const [key, n, id] of [["example", 2, "tan-war"], ["harbor", 3, "harbor-strike"], ["valleys", 4, "four-valleys"]]) {
  test(`a ${n}-faction game finalizes and exports a complete kit`, () => withApp(async ({ page }) => {
    await page.click("#menu summary");
    await page.click(`#menu [data-a="confirm-ask"][data-key="${key}"]`); await page.click(`#menu [data-a="load-example"][data-ex="${key}"]`); await frames(page);
    await page.waitForTimeout(400);
    assert.equal(await page.innerText("#blockers"), "No blockers");
    await goStep(page, 4);
    await page.check("#confirm"); await page.click('[data-a="finalize"]'); await frames(page);
    const k = await kit(page);
    assert.equal(k.file, `${id}.rev1.zip`);
    const factions = JSON.parse(k.text[`${id}.game.json`]).factions;
    assert.equal(factions.length, n);
    for (const f of factions) assert.ok(k.names.includes(`kit/${id}.${f.id}.aid.html`));
    for (const x of ["rulebook.md", "setup-sheet.md", "board.svg", "cards.html", "counters.html"]) assert.ok(k.names.includes(`kit/${id}.${x}`), x);
    assert.equal(Object.values(k.text).some((t) => /DRAFT/.test(t)), false, "a confirmed kit has no DRAFT mark");
  }, { example: false }));
}

test("a rule edited in the wizard reaches every export file", () => withApp(async ({ page }) => {
  await goStep(page, 3);
  const pass = page.locator('input[data-b="rules/sequence/passGain/crown"]');
  await pass.fill("7"); await page.waitForTimeout(400);
  await goStep(page, 1);
  const name = page.locator('input[data-b="factions/0/name"]');
  await name.fill("Kingdom"); await name.dispatchEvent("change"); await page.waitForTimeout(400);
  const k = await kit(page);
  assert.equal(JSON.parse(k.text["tan-war.game.json"]).rules.sequence.passGain.crown, 7);
  assert.match(k.text["kit/tan-war.rulebook.md"], /Kingdom gains 7 Resources/);
  assert.match(k.text["kit/tan-war.crown.aid.html"], /Pass: gain 7/);
  assert.match(k.text["kit/tan-war.setup-sheet.md"], /Kingdom/);
  assert.match(k.text["bots/tan-war.crown.policy.yaml"], /name: Kingdom/);
  assert.match(k.file, /^tan-war\.DRAFT\.rev1\.zip$/);
}));
