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
    const units = await page.$$eval(".card, .aidsec, .box", (els) => els.map((e) => getComputedStyle(e).breakInside));
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
  // The faction sheet is two pages: the GMT-style front and a reference back.
  test(`${g.meta.gameId}: every faction sheet prints front and back at Letter and A4 and never splits a section`, async () => {
    for (const f of g.factions) {
      const r = await check(out[`kit/${g.meta.gameId}.${f.id}.aid.html`]);
      assert.equal(r.boxes.length, 2);
      for (const b of r.boxes) { assert.ok(b.w <= 190 * MM + 1); assert.ok(b.h <= 259 * MM + 1, `${f.id} page height ${b.h / MM} mm`); }
      assert.deepEqual(r.counts, { Letter: 2, A4: 2 }, f.id);
      assert.ok(r.units.every((x) => x === "avoid"));
    }
  });
  // The Non-Player sheet is one page, as the GMT Non-Player sheets are.
  test(`${g.meta.gameId}: every Non-Player sheet prints on one page at Letter and A4`, async () => {
    for (const b of g.bots) {
      const html = out[`kit/${g.meta.gameId}.${b.factionId}.nonplayer.html`] ?? "";
      const r = await check(html);
      assert.equal(r.boxes.length, 1, b.factionId);
      assert.ok(r.boxes[0].w <= 190 * MM + 1, `${b.factionId} width ${r.boxes[0].w / MM} mm`);
      assert.ok(r.boxes[0].h <= 259 * MM + 1, `${b.factionId} height ${r.boxes[0].h / MM} mm`);
      assert.deepEqual(r.counts, { Letter: 1, A4: 1 }, b.factionId);
    }
  });
  // The Sequence of Play sheet and the Card and Spaces list are one page each, as the GMT sheets are.
  test(`${g.meta.gameId}: the Sequence of Play sheet and the Card and Spaces list print on one page each at Letter and A4`, async () => {
    for (const name of ["sequence", "lists"]) {
      const r = await check(out[`kit/${g.meta.gameId}.${name}.html`] ?? "");
      assert.equal(r.boxes.length, 1, name);
      assert.ok(r.boxes[0].w <= 190 * MM + 1, `${name} width ${r.boxes[0].w / MM} mm`);
      assert.ok(r.boxes[0].h <= 259 * MM + 1, `${name} height ${r.boxes[0].h / MM} mm`);
      assert.deepEqual(r.counts, { Letter: 1, A4: 1 }, name);
    }
  });
}

// The Event card flow reads left to right in rows: 1st Eligible box, arrow, 2nd Eligible box, then Adjust Eligibility.
test("the Sequence of Play flow keeps its columns: 1st choice, arrow, 2nd options, Adjust Eligibility", async () => {
  const [g, out] = kits[0];
  const page = await browser.newPage();
  try {
    await page.setContent(out[`kit/${g.meta.gameId}.sequence.html`]); await page.emulateMedia({ media: "print" });
    const xs = await page.$$eval(".sop1, .flow > .to, .sop2, .adj", (els) => els.map((e) => [e.className, Math.round(e.getBoundingClientRect().left), Math.round(e.getBoundingClientRect().right)]));
    const col = (c) => xs.filter((x) => x[0].split(" ").includes(c));
    for (const c of ["sop1", "to", "sop2"]) assert.equal(new Set(col(c).map((x) => x[1])).size, 1, `${c} boxes share one column`);
    assert.ok(col("sop1")[0][2] <= col("to")[0][1] && col("to")[0][2] <= col("sop2")[0][1] && col("sop2")[0][2] <= col("adj")[0][1], JSON.stringify(xs));
  } finally { await page.close(); }
});

// Known issue 4: the print test sheet is one page at Letter and A4, and its items print at true size.
test("the print test sheet is one page at Letter and A4 with true-size ruler, card and counter", async () => {
  const [g, out] = kits[0];
  const html = out[`kit/${g.meta.gameId}.print-test.html`];
  assert.ok(html, "print test sheet exists");
  const r = await check(html);
  assert.deepEqual(r.counts, { Letter: 1, A4: 1 });
  const page = await browser.newPage();
  try {
    await page.setContent(html); await page.emulateMedia({ media: "print" });
    const mm = (sel) => page.$eval(sel, (e) => { const b = e.getBoundingClientRect(); return [b.width, b.height]; }).then(([w, h]) => [w / MM, h / MM].map((x) => Math.round(x * 10) / 10));
    assert.equal((await mm(".ruler"))[0], 50);
    assert.deepEqual(await mm(".card-size"), [63, 88]);
    assert.deepEqual(await mm(".counter-size"), [15, 15]);
  } finally { await page.close(); }
});
