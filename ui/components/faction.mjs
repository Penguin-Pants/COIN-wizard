import { S, esc } from "../state.mjs";
import { palette, surfaceWarning } from "../../src/color.mjs";

// ---------- faction colors (user chosen, fixed in both themes)
export const SHAPES = ["sq", "circ", "hex", "oct"];
const isDark = () => !!window.matchMedia?.("(prefers-color-scheme: dark)").matches;
export const fvars = (color) => { const p = palette(color, isDark()); return `--f:${p.f};--t:${p.t};--m:${p.m};--i:${p.i};--on:${p.on}`; };
export const colorWarn = surfaceWarning;
export const fidx = (id) => Math.max(0, S.game.factions.findIndex((x) => x.id === id));
export const fbadge = (f, i) => `<span class="badge s-${SHAPES[i % 4]}" aria-hidden="true">${esc(f.symbol)}</span>`;
export const fdot = (f) => `<span class="fdot s-${SHAPES[fidx(f.id) % 4]}" style="${fvars(f.color)}" aria-hidden="true"></span>`;
export const isOpen = (k, def) => (k in S.dopen ? S.dopen[k] : def);
export function factionIssues(f) {
  const g = S.game, fi = fidx(f.id);
  const acts = new Set(g.actions.map((a, j) => (a.faction === f.id ? j : -1)).filter((j) => j >= 0));
  const bots = new Set(g.bots.map((b, k) => (b.factionId === f.id ? k : -1)).filter((k) => k >= 0));
  return S.issues.errors.filter((e) => { const m = /^\/(factions|actions|bots)\/(\d+)/.exec(e.path); if (!m) return false; const n = +m[2]; return m[1] === "factions" ? n === fi : m[1] === "actions" ? acts.has(n) : bots.has(n); }).length;
}
