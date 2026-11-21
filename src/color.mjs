// Color math for faction colors: contrast (WCAG 2), mixing and the palette used in both themes.
const hx = (h) => { h = h.replace("#", ""); return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16)); };
const toHex = (c) => "#" + c.map((v) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, "0")).join("");
export const mix = (a, b, t) => { const B = hx(b); return toHex(hx(a).map((v, i) => v * (1 - t) + B[i] * t)); };
const lum = (h) => { const [r, g, b] = hx(h).map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
export const contrast = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
export const okHex = (c) => (/^#[0-9a-f]{6}$/i.test(c) ? c : "#0b6e6e");
export const SURFACE = { light: "#ffffff", dark: "#17212a" };

// f: the faction color as chosen. t: a tint for panels. m: a mid tone for borders.
// i: ink on the tint, raised until it reaches 4.5:1. on: text on the solid color, white or dark ink.
export function palette(color, dark) {
  const f = okHex(color), bg = dark ? SURFACE.dark : SURFACE.light;
  const t = mix(f, bg, dark ? 0.78 : 0.88), m = mix(f, bg, dark ? 0.55 : 0.65);
  const to = dark ? "#ffffff" : "#000000"; let i = f, k = 0;
  while (contrast(i, t) < 4.5 && k < 20) { k++; i = mix(f, to, k * 0.05); }
  const on = contrast(f, "#ffffff") >= contrast(f, "#17222b") ? "#ffffff" : "#17222b";
  return { f, t, m, i, on };
}

// Lists the themes where the color itself has less than 3:1 against the page surface.
export function surfaceWarning(color) {
  const f = okHex(color), bad = [];
  if (contrast(f, SURFACE.light) < 3) bad.push("light");
  if (contrast(f, SURFACE.dark) < 3) bad.push("dark");
  return bad.length ? `This color has low contrast in ${bad.join(" and ")} mode. Headers stay readable. Borders and markers may fade.` : "";
}
