import { test } from "node:test";
import assert from "node:assert/strict";
import { palette, contrast, surfaceWarning, SURFACE } from "../src/color.mjs";

// Colors a designer might pick, from very light to very dark and saturated.
const COLORS = ["#2b6cc4", "#b8520a", "#2f8a4e", "#7a4fb5", "#fafafa", "#ffff00", "#00ffff", "#ff0000", "#000000", "#777777", "#1a1a40", "#f4a6c0"];

for (const dark of [false, true]) {
  test(`ink on the faction tint holds 4.5:1 in ${dark ? "dark" : "light"} mode`, () => {
    for (const c of COLORS) { const p = palette(c, dark); assert.ok(contrast(p.i, p.t) >= 4.5, `${c}: ${contrast(p.i, p.t).toFixed(2)}`); }
  });
  test(`text on the solid faction color holds 3:1 in ${dark ? "dark" : "light"} mode`, () => {
    for (const c of COLORS) { const p = palette(c, dark); assert.ok(contrast(p.on, p.f) >= 3, `${c}: ${contrast(p.on, p.f).toFixed(2)}`); }
  });
}

test("the surface warning appears exactly when a color is below 3:1 against a theme surface", () => {
  for (const c of COLORS) {
    const low = contrast(c, SURFACE.light) < 3 || contrast(c, SURFACE.dark) < 3;
    assert.equal(Boolean(surfaceWarning(c)), low, c);
  }
  assert.match(surfaceWarning("#fafafa"), /light mode/);
  assert.match(surfaceWarning("#000000"), /dark mode/);
});
