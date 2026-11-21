import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { launch } from "./harness.mjs";
import { buildFiles } from "../../src/kit.mjs";
import { toMermaid, toMarkdown, toPolicyYaml } from "../../src/botaid.mjs";

let browser;
before(async () => { browser = await launch(); });
after(async () => { await browser.close(); });

const MM = 96 / 25.4; // CSS pixels per millimeter
const kits = ["tan-war", "harbor-strike", "four-valleys"].map((id) => {
  const g = JSON.parse(readFileSync(`examples/${id}.game.json`, "utf8"));
  return [g, Object.fromEntries(buildFiles(g, { toMermaid, toMarkdown, toPolicyYaml }))];
});
const pdfPages = (buf) => (buf.toString("latin1").match(/\/Type\s*\/Page[^s]/g) ?? []).length;

async function check(html) {
  const page = await browser.newPage();
  try {
    await page.setContent(html); await page.emulateMedia({ media: "print" });
    const boxes = await page.$$eval(".page", (els) => els.map((e) => e.getBoundingClientRect()).map((r) => ({ w: r.width, h: r.height })));
    const counts = {};
    for (const format of ["Letter", "A4"]) counts[format] = pdfPages(await page.pdf({ format, preferCSSPageSize: false }));
    const units = await page.$$eval(".card, .aidsec", (els) => els.map((e) => getComputedStyle(e).breakInside));
    return { boxes, counts, units };
  } finally { await page.close(); }
}

for (const [g, out] of kits) {
  test(`${g.meta.gameId}: card sheets print 6 cards a page at Letter and A4`, async () => {
    const r = await check(out[`kit/${g.meta.gameId}.cards.html`]);
    assert.equal(r.boxes.length, Math.ceil(g.deck.cards.length / 6));
    for (const b of r.boxes) { assert.ok(b.w <= 190 * MM + 1, `width ${b.w / MM} mm`); assert.ok(b.h <= 259 * MM + 1, `height ${b.h / MM} mm`); }
    assert.deepEqual(r.counts, { Letter: r.boxes.length, A4: r.boxes.length });
    assert.ok(r.units.every((x) => x === "avoid"));
  });
  test(`${g.meta.gameId}: every faction aid fits one page at Letter and A4 and never splits a section`, async () => {
    for (const f of g.factions) {
      const r = await check(out[`kit/${g.meta.gameId}.${f.id}.aid.html`]);
      assert.equal(r.boxes.length, 1);
      assert.ok(r.boxes[0].w <= 190 * MM + 1);
      assert.deepEqual(r.counts, { Letter: 1, A4: 1 }, f.id);
      assert.ok(r.units.every((x) => x === "avoid"));
    }
  });
}
