import template from "../examples/tan-war.game.json";
import harbor from "../examples/harbor-strike.game.json";
import valleys from "../examples/four-valleys.game.json";
import { blankGame } from "../src/blank.mjs";

export const clone = (x) => JSON.parse(JSON.stringify(x));
// Shipped examples for 2, 3 and 4 factions, by menu key.
export const EXAMPLES = { example: ["Tan War (2 factions)", template], harbor: ["Harbor Strike (3 factions)", harbor], valleys: ["Four Valleys (4 factions)", valleys] };
export const example = (k = "example") => clone(EXAMPLES[k][1]);
export const $ = (s, r = document) => r.querySelector(s);
export const esc = (s) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

export const STEPS = [
  { id: "brief", name: "Conflict" }, { id: "factions", name: "Factions" }, { id: "board", name: "Board and setup" },
  { id: "rules", name: "Rules, cards, bots" }, { id: "review", name: "Review" }
];
export const EDITOR_STEP = { Research: [0], Factions: [1], Actions: [1], Board: [2], Setup: [2], Rules: [3, "rules"], Deck: [3, "deck"], Victory: [3, "victory"], Bots: [3, "bots"], Review: [4] };

export const S = {
  dopen: {}, srcDocs: {},
  game: blankGame(), step: 0, tab: "rules", texts: {}, issues: { errors: [], warnings: [] }, proposal: null, wiki: [], msg: {}, busy: {},
  db: null, user: null, sample: null, downloads: null, uid: null, saved: "", saveErr: null, dirty: false, finalGame: null, draftOffer: null, draftSavedAt: null, confirm: null, loading: true
};

// ---------- small helpers
export const getP = (o, p) => p.split("/").reduce((a, k) => (a == null ? a : a[k]), o);
export function setP(o, p, v) { const ks = p.split("/"); const last = ks.pop(); const t = ks.reduce((a, k) => (a[k] ??= {}), o); t[last] = v; }
export const nextId = (prefix, list) => { let n = list.length + 1; while (list.some((x) => x.id === `${prefix}${n}`)) n++; return `${prefix}${n}`; };
export const pieces = () => S.game.factions.flatMap((f) => f.pieces.map((p) => ({ ...p, owner: f.id })));
export const parseLoose = (v) => { const t = String(v).trim(); if (/^-?\d+$/.test(t)) return Number(t); if (/^[{["]/.test(t)) { try { return JSON.parse(t); } catch { return t; } } if (t === "true") return true; if (t === "false") return false; return t; };
export const show = (v) => (v !== null && typeof v === "object" ? JSON.stringify(v) : String(v ?? ""));
export const time = () => new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
