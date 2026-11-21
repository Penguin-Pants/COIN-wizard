import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { launch, openApp, frames } from "./harness.mjs";

let browser;
before(async () => { browser = await launch(); });
after(async () => { await browser.close(); });

async function withApp(fn, opts) {
  const app = await openApp(browser, opts);
  try { await fn(app); assert.deepEqual(app.errors, []); } finally { await app.close(); }
}
const settle = (page) => page.waitForTimeout(400);
const FALSE = ['CLAIM CHECK', JSON.stringify({ verdict: "unsupported", reason: "The source gives a different date.", sourceId: "s1", start: 0, end: 19 })];

test("a multi-URL run with one inaccessible URL keeps the others usable and offers Retry", () => withApp(async ({ page, db }) => {
  await settle(page);
  await page.click('[data-a="list-add"][data-list="sources"]'); await frames(page);
  const url = page.locator('input[data-b="brief/sources/2/url"]');
  await url.fill("https://example.org/report"); await url.dispatchEvent("change"); await frames(page);
  assert.match(await page.innerText("#main"), /1 waiting, 1 received, 1 failed\./);
  assert.match(await page.inputValue("#handoff"), /- s3: https:\/\/example\.org\/report/);
  await page.click('[data-a="src-retry"][data-i="1"]'); await frames(page);
  assert.match(await page.innerText("#main"), /2 waiting, 1 received, 0 failed\./);
  assert.equal((await db())["sources/s2"].status, "pending");
}));

test("handoff round trip: chat writes the text and the source shows received", () => withApp(async ({ page }) => {
  await settle(page);
  await page.evaluate(() => window.__pushSources([{ id: "s2", status: "read", text: "Returned text", readScope: "All of it", title: "T2" }]));
  await frames(page);
  assert.match(await page.innerText("li.src >> nth=1"), /received/);
  assert.match(await page.innerText("li.src >> nth=1"), /13 characters stored/);
  assert.match(await page.innerText("#main"), /0 waiting, 2 received, 0 failed\./);
}));

test("a claim check on a false claim shows unsupported, warns and does not block", () => withApp(async ({ page }) => {
  await settle(page);
  await page.locator('details[data-k="claims"] > summary').click(); await frames(page);
  await page.click('[data-a="claims-check"]');
  await page.waitForFunction(() => !document.querySelector('[data-a="claims-check"]')?.disabled);
  await frames(page); await settle(page);
  assert.ok(await page.locator('details[data-k="claims"] .chip.bad', { hasText: "unsupported" }).count() >= 1);
  assert.match(await page.innerText('details[data-k="claims"] > summary'), /\d+ unsupported/);
  assert.equal(await page.innerText("#blockers"), "No blockers");
  assert.ok(await page.locator("#stepissues li.warning", { hasText: "not supported by its sources" }).count() >= 1);
}, { replies: [FALSE] }));

test("every claim shows its support status", () => withApp(async ({ page }) => {
  await page.locator('details[data-k="claims"] > summary').click(); await frames(page);
  const rows = await page.locator('details[data-k="claims"] tbody tr').count();
  const marked = await page.locator('details[data-k="claims"] tbody tr').evaluateAll((trs) => trs.filter((tr) => /not checked|design|supported|partial/.test(tr.innerText)).length);
  assert.equal(marked, rows);
}));

test("a redraft shows a diff and applies only the ticked changes", () => withApp(async ({ page }) => {
  await settle(page);
  await page.click('[data-a="draft-overview"]');
  await page.waitForSelector('[data-a="accept-diff"]');
  assert.match(await page.innerText(".proposal"), /use "1919 to 1922"/);
  await page.locator('[data-ovadd="actors"][value="Cumann na mBan"]').uncheck();
  await page.click('[data-a="accept-diff"]'); await frames(page);
  assert.equal(await page.inputValue('input[data-b="brief/overview/period"]'), "1919 to 1922");
  const actors = await page.inputValue('textarea[data-b="brief/overview/actors"]');
  assert.match(actors, /Volunteers of 1919/); assert.doesNotMatch(actors, /Cumann na mBan/);
}, { replies: [["Using ONLY the sources below", JSON.stringify({ period: "1919 to 1922", actors: ["Volunteers of 1919", "Cumann na mBan"], places: [], turningPoints: [], claims: [] })]] }));
