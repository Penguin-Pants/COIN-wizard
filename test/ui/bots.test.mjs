import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { launch, openApp, goStep, frames } from "./harness.mjs";

let browser;
before(async () => { browser = await launch(); });
after(async () => { await browser.close(); });

async function withApp(fn, opts) {
  const app = await openApp(browser, opts);
  try { await fn(app); assert.deepEqual(app.errors, []); } finally { await app.close(); }
}
const botsTab = async (page) => { await goStep(page, 3); await page.click('[data-a="tab"][data-tab="bots"]'); await frames(page); };
const settle = (page) => page.waitForTimeout(350);

test("a designer builds a bot with a flowchart, a tie-break and an Event exception, and all six dry runs pass", () => withApp(async ({ page }) => {
  await botsTab(page);
  await page.click('[data-a="bot-pick"][data-i="1"]'); await frames(page);
  await page.click('[data-a="confirm-ask"][data-key="bot-bot.ira"]'); await page.click('[data-a="bot-del"]'); await frames(page);
  await page.click('[data-a="bot-new"][data-f="ira"]'); await frames(page);
  assert.equal(await page.locator(".flow svg [data-node]").count(), 7);
  // tie-break
  await page.locator("details.act > summary", { hasText: ".t1" }).click(); await frames(page);
  await page.click('[data-a="list-add"][data-list="tbreaks"]'); await frames(page);
  assert.equal(await page.locator('[data-x$="/tiebreak/1/key"]').count() > 0, true);
  // Event exception
  await page.click('[data-a="bot-addov"]'); await frames(page);
  // six dry runs: add each case, run it, use the result
  for (let i = 0; i < 6; i++) {
    await page.locator('[data-a="dry-add"]').first().click(); await frames(page);
    const k = `1/${i}`;
    await page.click(`[data-a="dry-run"][data-dry="${k}"]`); await frames(page);
    await page.click(`[data-a="dry-use"][data-dry="${k}"]`); await frames(page);
  }
  await settle(page);
  assert.equal(await page.locator('[data-a="dry-add"]').count(), 0);
  assert.equal(await page.locator("details.act summary .chip.bad").count(), 0);
  assert.equal(await page.locator("#stepissues li.error").count(), 0);
  assert.equal(await page.locator('textarea[data-sj], .xraw, textarea[data-t="j"], textarea[id^="botjson"]').count(), 0);
}));

test("Run now highlights the dry-run path in the flowchart", () => withApp(async ({ page }) => {
  await botsTab(page);
  await page.locator("details.act > summary", { hasText: "linked-sa cw.d5" }).click(); await frames(page);
  await page.locator('details.act[open] [data-a="dry-run"]').click(); await frames(page);
  assert.match(await page.innerText("#main"), /Result: operationSpecial\. Path: cw\.start > cw\.event > cw\.low > cw\.crack > cw\.end-op\. Chosen: tipperary\./);
  assert.equal(await page.locator(".flow g.node.hl").count(), 5);
}));

test("clicking a node in the flowchart opens its form, and deleting it clears the branches", () => withApp(async ({ page }) => {
  await botsTab(page);
  await page.locator('.flow g[data-node="cw.sweep"]').click(); await frames(page);
  assert.equal(await page.inputValue('input[data-nodeid]'), "cw.sweep");
  await page.click('[data-a="confirm-ask"][data-key="node-cw.sweep"]'); await page.click('[data-a="bot-delnode"]'); await frames(page);
  await settle(page);
  assert.equal(await page.locator('.flow g[data-node="cw.sweep"]').count(), 0);
  assert.ok(await page.locator("#stepissues li").count() > 0);
}));

test("a dry-run board change is made with dropdowns and inputs", () => withApp(async ({ page, db }) => {
  await botsTab(page);
  await page.locator("details.act > summary", { hasText: "no-target" }).click(); await frames(page);
  const open = page.locator("details.act[open]");
  await open.locator('select[data-dt="addspace"]').selectOption("kerry"); await frames(page);
  await page.locator('details.act[open] input[data-dk="spaces.kerry.opinion"]').fill("-1");
  await page.locator('details.act[open] input[data-dk="spaces.kerry.opinion"]').dispatchEvent("change"); await frames(page);
  await page.waitForTimeout(1800);
  const g = JSON.parse((await db())["data/users/u1/draft"].json);
  assert.equal(g.bots[0].dryRuns.find((d) => d.case === "no-target").patch.spaces.kerry.opinion, -1);
}));

// Schema 1.5.0 part A: a node's linked Special Activity may be a list, tried in order.
test("a designer adds and removes an If none Special Activity on an Operation node", () => withApp(async ({ page, db }) => {
  await botsTab(page);
  await page.locator('.flow g[data-node="cw.garrison"]').click(); await frames(page);
  assert.equal(await page.locator('[data-a="bot-linked-add"]').count(), 1, "the node form offers an If none entry");
  await page.click('[data-a="bot-linked-add"]'); await frames(page);
  assert.equal(await page.locator('select[data-b="bots/0/nodes/6/linked/1/action"]').count(), 1);
  assert.match(await page.innerText(".nodeform"), /If none, try next/);
  await page.waitForTimeout(1800);
  let g = JSON.parse((await db())["data/users/u1/draft"].json);
  const linked = g.bots[0].nodes[6].linked;
  assert.equal(Array.isArray(linked) && linked.length, 2);
  assert.equal(linked[1].timing, linked[0].timing, "a new entry copies the first entry's timing");
  await page.click('[data-a="bot-linked-del"][data-i="1"]'); await frames(page);
  await page.waitForTimeout(1800);
  g = JSON.parse((await db())["data/users/u1/draft"].json);
  assert.equal(Array.isArray(g.bots[0].nodes[6].linked), false, "one entry left: back to a single object");
  assert.equal(await page.locator("#stepissues li.error").count(), 0);
}));

// Schema 1.5.0 part D: a bot may choose spaces in scoring phases, with an optional "scoring" dry run.
test("a designer adds a scoring choice and a scoring dry run that passes", () => withApp(async ({ page, db }) => {
  await botsTab(page);
  assert.equal(await page.locator('[data-a="bot-addscoring"]').count(), 1, "the bot offers a scoring choice");
  await page.click('[data-a="bot-addscoring"]'); await frames(page);
  assert.equal(await page.locator('select[data-b="bots/0/scoring/0/phaseId"]').count(), 1);
  await page.locator('select[data-b="bots/0/scoring/0/phaseId"]').selectOption("calm"); await frames(page);
  await page.click('[data-a="dry-add"][data-case="scoring"]'); await frames(page);
  const k = `0/${7}`;
  await page.click(`[data-a="dry-run"][data-dry="${k}"]`); await frames(page);
  assert.match(await page.innerText("#main"), /Result: none\. Path: calm\./);
  await page.click(`[data-a="dry-use"][data-dry="${k}"]`); await frames(page);
  await page.waitForTimeout(1800);
  const g = JSON.parse((await db())["data/users/u1/draft"].json);
  assert.deepEqual(g.bots[0].scoring.map((x) => x.phaseId), ["calm"]);
  assert.deepEqual(g.bots[0].dryRuns.at(-1).expect, { outcome: "none", path: ["calm"] });
  assert.equal(await page.locator("#stepissues li.error").count(), 0);
  await page.click('[data-a="bot-delscoring"][data-i="0"]'); await frames(page);
  await page.waitForTimeout(1800);
  assert.equal("scoring" in JSON.parse((await db())["data/users/u1/draft"].json).bots[0], false);
}));

// Schema 1.5.0 part C: an Operation node split into numbered parts, each with its table and effects.
test("a designer splits an Operation node into parts and joins it back", () => withApp(async ({ page, db }) => {
  await botsTab(page);
  await page.locator('.flow g[data-node="cw.garrison"]').click(); await frames(page);
  assert.equal(await page.locator('[data-a="bot-parts-add"]').count(), 1, "the node form offers parts");
  await page.click('[data-a="bot-parts-add"]'); await frames(page);
  assert.equal(await page.locator('select[data-b="bots/0/nodes/6/parts/0/table"]').count(), 1);
  assert.equal(await page.locator('select[data-b="bots/0/nodes/6/table"]').count(), 0, "no node table with parts");
  await page.click('[data-a="bot-parts-add"]'); await frames(page);
  await page.locator('input[data-b="bots/0/nodes/6/parts/1/text"]').fill("Place 1 Police.");
  await page.locator('input[data-b="bots/0/nodes/6/parts/1/text"]').dispatchEvent("change"); await frames(page);
  await page.waitForTimeout(1800);
  let n = JSON.parse((await db())["data/users/u1/draft"].json).bots[0].nodes[6];
  assert.equal(n.parts.length, 2);
  assert.equal("table" in n, false);
  assert.equal(n.parts[0].steps.length, 2, "the first part starts with the Operation's effects");
  assert.equal(n.parts[1].text, "Place 1 Police.");
  await page.click('[data-a="bot-parts-del"][data-i="1"]'); await frames(page);
  await page.click('[data-a="bot-parts-del"][data-i="0"]'); await frames(page);
  await page.waitForTimeout(1800);
  n = JSON.parse((await db())["data/users/u1/draft"].json).bots[0].nodes[6];
  assert.equal("parts" in n, false);
  assert.equal(n.table, "cw.t.garrison", "the last part's table goes back to the node");
}));

// Codex review of PR 14: part effects of a node with a target may read the target, so their editors offer it.
test("the part effect editor offers the target when the node picks an enemy", () => withApp(async ({ page }) => {
  await botsTab(page);
  await page.click('[data-a="bot-addenemy"]'); await frames(page);
  await page.locator('.flow g[data-node="cw.garrison"]').click(); await frames(page);
  await page.locator('select[data-b="bots/0/nodes/6/target"]').selectOption({ index: 1 }); await frames(page);
  await page.click('[data-a="bot-parts-add"]'); await frames(page);
  await page.locator('select[data-sq="bots/0/nodes/6/parts/0/steps/0/count"]').selectOption("formula"); await frames(page);
  const flags = await page.locator('[data-path="/bots/0/nodes/6/parts/0/steps/0/count"][data-xt2]').evaluateAll((els) => els.map((e) => e.dataset.xt2));
  assert.ok(flags.length > 0, "the count formula has an expression editor");
  assert.ok(flags.every((x) => x === "1"), JSON.stringify(flags));
}));
