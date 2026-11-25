// Effect step forms. One form per op, built from the catalogue in src/ops.mjs.
// Dropdowns list the game's own pieces, states, tracks and spaces. A step the catalogue cannot show
// (unknown op, unknown field or a wrong value type) opens as data with a notice, so nothing is lost.
import { OPS, fieldsOf, defaultStep } from "../../src/ops.mjs";
import { S, esc, getP, setP, parseLoose, pieces } from "../state.mjs";
import { touch } from "../store.mjs";
import { render } from "../shell.mjs";
import { btn } from "./fields.mjs";
import { defineList, moveButton, removeButton, addButton } from "./listEditor.mjs";
import { condEditor, valueEditor } from "./exprEditor.mjs";

const LABEL = {
  activate: "Activate the moved pieces", piece: "Piece", count: "How many", from: "From", to: "To", state: "State", space: "Where", spaces: "Up to spaces", filter: "Only where",
  fallbackPiece: "If none, use", attr: "Attribute", toward: "Toward", amount: "Amount", id: "Track", delta: "Change", track: "Track",
  die: "Die", store: "Store result as", marker: "Marker", value: "Value", test: "If", then: "Then", else: "Otherwise", options: "Options"
};
const OP_LABEL = { place: "Place", remove: "Remove", flip: "Flip", move: "Move", shift: "Shift opinion", track: "Change a track", gain: "Gain", pay: "Pay", roll: "Roll a die", markerSet: "Set a marker", if: "If", choose: "Choose one" };
const POOLS = [["available", "Available"], ["outOfPlay", "Out of Play"]];
const opts = (list, cur) => list.map(([v, l]) => `<option value="${esc(v)}" ${String(v) === String(cur) ? "selected" : ""}>${esc(l)}</option>`).join("");
const spaceOpts = () => S.game.board.spaces.map((s) => [s.id, s.name]);
const keep = (list, cur) => (cur === undefined || list.some(([v]) => String(v) === String(cur)) ? list : [...list, [cur, `${cur} (not found)`]]);
const ctl = (p, k, kind, extra = "") => `data-sf="${esc(p)}/${k}" data-sk="${kind}" data-path="/${esc(p)}/${k}" aria-label="${LABEL[k] ?? k}" ${extra}`;
const KEYWORDS = ["all", "any", "moved"];

// Roll results stored in this list and its parents are variables for later conditions.
const storesIn = (steps) => steps.flatMap((s) => [...(s.op === "roll" ? [s.store] : []), ...storesIn(s.then ?? []), ...storesIn(s.else ?? []), ...(s.options ?? []).flatMap((o) => storesIn(o.steps))]);

// True when every field fits its kind, so the form shows the whole step.
function fits(st) {
  if (!OPS[st.op]) return false;
  const all = fieldsOf(st.op);
  if (Object.keys(st).some((k) => k !== "op" && !(k in all))) return false;
  return Object.keys(OPS[st.op].req).every((k) => k in st) && (st.op !== "choose" || Array.isArray(st.options));
}

function field(st, p, k, kind, ctx) {
  const v = st[k], g = S.game;
  const pc = pieces().find((x) => x.id === st.piece);
  switch (kind) {
    case "piece": return `<select ${ctl(p, k, kind, 'data-r="1"')}>${opts(keep(pieces().map((x) => [x.id, x.name]), v), v)}</select>`;
    case "state": return `<select ${ctl(p, k, kind)}>${opts(keep((pc?.states ?? []).map((x) => [x, x]), v), v)}</select>`;
    case "track": return `<select ${ctl(p, k, kind)}>${opts(keep(g.tracks.map((t) => [t.id, t.name]), v), v)}</select>`;
    case "pool": return `<select ${ctl(p, k, kind)}>${opts(POOLS, v)}</select>`;
    case "where": return `<select ${ctl(p, k, kind)}>${opts(keep([["$space", "this space"], ["choose", "a chosen space"], ...spaceOpts()], v), v)}</select>`;
    case "loc": return `<select ${ctl(p, k, kind)}>${opts(keep([["adjacent", "adjacent spaces"], ["$space", "this space"], ["choose", "a chosen space"], ...POOLS, ...spaceOpts()], v), v)}</select>`;
    case "attr": return `<select ${ctl(p, k, kind)}>${opts([["opinion", "opinion"]], v)}</select>`;
    case "toward": return `<select ${ctl(p, k, kind)}>${opts([["support", "Support"], ["opposition", "Opposition"]], v)}</select>`;
    case "die": return `<select ${ctl(p, k, kind)}>${opts([["d6", "one six-sided die"]], v)}</select>`;
    case "int": case "spaces": return `<input type="number" ${kind === "spaces" ? 'min="1"' : ""} ${ctl(p, k, kind)} value="${esc(v)}">`;
    case "varname": return `<input ${ctl(p, k, kind, 'pattern="[a-z0-9_]+"')} value="${esc(v)}">`;
    case "marker": return `<input ${ctl(p, k, kind, 'list="dl-marker"')} value="${esc(v)}">`;
    case "scalar": return `<input ${ctl(p, k, kind)} value="${esc(v)}">`;
    case "qty": case "amount": {
      const mode = typeof v === "number" ? "num" : KEYWORDS.includes(v) ? v : "formula";
      const modes = kind === "qty" ? [["num", "a number"], ["all", "all"], ["any", "any number"], ["moved", "the moved pieces"], ["formula", "a formula"]] : [["num", "a number"], ["formula", "a formula"]];
      return `<select data-sq="${esc(p)}/${k}" data-path="/${esc(p)}/${k}" aria-label="${LABEL[k]} mode">${opts(modes, mode)}</select>${mode === "num" ? `<input type="number" ${kind === "qty" ? 'min="0"' : ""} ${ctl(p, k, "int")} value="${esc(v)}">` : mode === "formula" ? valueEditor(`${p}/${k}`, v, ctx) : ""}`;
    }
    case "cond": return condEditor(`${p}/${k}`, v, k === "filter" ? { ...ctx, space: true } : ctx);
    // activate (1.9.0): the condition reads the destination and move.count; the moved pieces flip to "to".
    case "activate": return `<label class="mini"><span>Moved pieces become</span><select data-sf="${esc(p)}/activate/to" data-sk="state" data-path="/${esc(p)}/activate/to" aria-label="Moved pieces become">${opts(keep((pc?.states ?? []).map((x) => [x, x]), v.to), v.to)}</select></label><span class="sl">when, at the destination,</span>${condEditor(`${p}/activate/if`, v.if, { ...ctx, space: true, move: true })}`;
    case "steps": return `<ol class="steps">${stepList(v, `${p}/${k}`, ctx)}</ol>${addButton("steps", "Add effect", { cls: "link", data: `data-p="${esc(p)}/${k}"` })}`;
    case "options": return `<div class="opts">${v.map((o, i) => `<div class="opt"><label class="mini"><span>Option ${i + 1}</span><input data-sf="${esc(p)}/options/${i}/label" data-sk="text" data-path="/${esc(p)}/options/${i}/label" value="${esc(o.label)}"></label>${o.faction ? optPiece(o, `${p}/options/${i}`) : ""}${v.length > 1 ? removeButton("options", { i, label: "Remove option", data: `data-p="${esc(p)}/options"` }) : ""}<ol class="steps">${stepList(o.steps, `${p}/options/${i}/steps`, ctx)}</ol>${addButton("steps", "Add effect", { cls: "link", data: `data-p="${esc(p)}/options/${i}/steps"` })}</div>`).join("")}${addButton("options", "Add option", { cls: "link", data: `data-p="${esc(p)}/options"` })}</div>`;
    default: return `<input ${ctl(p, k, "text")} value="${esc(v)}">`;
  }
}

const BLOCK = new Set(["cond", "steps", "options", "activate"]);
function form(st, p, ctx) {
  const spec = OPS[st.op], all = fieldsOf(st.op);
  const shown = Object.keys(all).filter((k) => k in st);
  const missing = Object.keys(spec.opt).filter((k) => !(k in st));
  const one = (k) => {
    const kind = all[k], opt = k in spec.opt;
    const x = opt ? btn("step-unset", "Remove", { cls: "link", data: `data-p="${esc(p)}" data-k="${k}"` }) : "";
    return BLOCK.has(kind) ? `<div class="sblock"><span class="sl">${LABEL[k] ?? k}</span>${x}${field(st, p, k, kind, ctx)}</div>` : `<label class="mini"><span>${LABEL[k] ?? k}${x}</span><span class="row">${field(st, p, k, kind, ctx)}</span></label>`;
  };
  const inline = shown.filter((k) => !BLOCK.has(all[k])).map(one).join("");
  const blocks = shown.filter((k) => BLOCK.has(all[k])).map(one).join("");
  const add = missing.length ? `<select data-saddopt="${esc(p)}" data-path="/${esc(p)}" aria-label="Add an optional field"><option value="">Add a detail...</option>${missing.map((k) => `<option value="${k}">${LABEL[k] ?? k}</option>`).join("")}</select>` : "";
  return `<div class="sfields">${inline}${add}</div>${blocks}`;
}

// ctx: { space: true when the steps resolve in a space (actions) }
export function stepList(steps, path, ctx = {}) {
  const c = { ...ctx, stores: [...(ctx.stores ?? []), ...storesIn(steps)] };
  return steps.map((st, si) => {
    const p = `${path}/${si}`;
    const ok = fits(st);
    const body = ok ? form(st, p, c) : `<label class="mini wide"><span>This step cannot be shown as a form. Edit it as data.</span><textarea rows="3" data-sj="${esc(p)}" data-path="/${esc(p)}">${esc(JSON.stringify(st, null, 1))}</textarea></label>`;
    return `<li class="step"><div class="shead"><b>${si + 1}.</b> <select data-sop="${esc(p)}" data-path="/${esc(p)}/op" aria-label="Step ${si + 1} effect">${opts(Object.keys(OPS).map((o) => [o, OP_LABEL[o]]), st.op)}</select><span class="mv">${moveButton("steps", "up", si, { data: `data-p="${esc(path)}"` })}${moveButton("steps", "down", si, { data: `data-p="${esc(path)}"` })}${removeButton("steps", { i: si, data: `data-p="${esc(path)}"` })}</span></div>${body}</li>`;
  }).join("");
}

// ---------- editing
function optDefault(st, k) {
  const pc = pieces().find((x) => x.id === st.piece);
  switch (fieldsOf(st.op)[k]) {
    case "state": return pc?.states[0];
    case "piece": return pieces().find((x) => x.id !== st.piece)?.id ?? pieces()[0]?.id;
    case "where": return "$space";
    case "spaces": return 1;
    case "cond": return true;
    case "steps": return [defaultStep("track", S.game)];
    // A new activation: the piece's last state (such as "active") when 3 or more moved.
    case "activate": return { if: { op: "gte", args: [{ var: "move.count" }, 3] }, to: pc?.states.at(-1) };
    default: return undefined;
  }
}
// An option against an enemy may be for one of its piece types (1.9.0); "any piece" removes the field.
const optPiece = (o, op) => { const f = S.game.factions.find((x) => x.id === o.faction); return f ? `<label class="mini"><span>Piece</span><select data-optpiece="${esc(op)}" data-path="/${esc(op)}/piece" aria-label="Option piece"><option value="">any piece</option>${f.pieces.map((pc) => `<option value="${esc(pc.id)}" ${o.piece === pc.id ? "selected" : ""}>${esc(pc.name)}</option>`).join("")}</select></label>` : ""; };
const parse = (kind, v) => (kind === "int" || kind === "spaces" ? (v === "" ? 0 : Number(v)) : kind === "scalar" ? parseLoose(v) : v);

// Returns true when the change belonged to a step form.
export function onStepChange(el) {
  const d = el.dataset ?? {};
  if (d.optpiece) { const o = getP(S.game, d.optpiece); if (el.value) o.piece = el.value; else delete o.piece; touch(); render(); return true; }
  if (d.sf) {
    setP(S.game, d.sf, parse(d.sk, el.value));
    if (d.sk === "piece") { // states belong to a piece: keep only states the new piece has
      const st = getP(S.game, d.sf.slice(0, d.sf.lastIndexOf("/")));
      const pc = pieces().find((x) => x.id === st.piece);
      for (const k of ["state", ...(st.op === "flip" ? ["from", "to"] : [])]) if (st[k] !== undefined && !pc?.states.includes(st[k])) st[k] = pc?.states[k === "to" ? Math.min(1, pc.states.length - 1) : 0];
    }
    touch(); if (d.r || d.sk === "piece") render(); return true;
  }
  if (d.sq) {
    const st = getP(S.game, d.sq.slice(0, d.sq.lastIndexOf("/")));
    // A new formula counts pieces on the whole map, which is valid in every context.
    const pc = st.piece ?? pieces()[0]?.id;
    setP(S.game, d.sq, el.value === "num" ? 1 : el.value === "formula" ? { op: "count", args: [pc, "*", "*"] } : el.value);
    touch(); render(); return true;
  }
  if (d.sop) {
    const parent = getP(S.game, d.sop.slice(0, d.sop.lastIndexOf("/")));
    const i = Number(d.sop.slice(d.sop.lastIndexOf("/") + 1));
    parent[i] = defaultStep(el.value, S.game);
    touch(); render(); return true;
  }
  if (d.saddopt) {
    if (!el.value) return true;
    const st = getP(S.game, d.saddopt);
    st[el.value] = optDefault(st, el.value);
    touch(); render(); return true;
  }
  if (d.sj) {
    try { setP(S.game, d.sj, JSON.parse(el.value)); touch(); render(); } catch { el.classList.add("invalid"); }
    return true;
  }
  return false;
}

function swap(arr, i, j) { [arr[i], arr[j]] = [arr[j], arr[i]]; }
// Action steps and choose options need at least one step. Card sides and scoring phases may be empty.
const minOne = (p) => /^actions\/\d+\/steps$|\/options\/\d+\/steps$|\/then$/.test(p);
defineList("steps", {
  add: (d) => { getP(S.game, d.p).push(defaultStep("track", S.game)); touch(); render(); },
  remove: (d) => { const arr = getP(S.game, d.p); if (arr.length > 1 || !minOne(d.p)) arr.splice(Number(d.i), 1); touch(); render(); },
  up: (d) => { const arr = getP(S.game, d.p), i = Number(d.i); if (i > 0) swap(arr, i - 1, i); touch(); render(); },
  down: (d) => { const arr = getP(S.game, d.p), i = Number(d.i); if (i < arr.length - 1) swap(arr, i, i + 1); touch(); render(); }
});
defineList("options", {
  add: (d) => { const arr = getP(S.game, d.p); arr.push({ label: `Option ${arr.length + 1}`, steps: [defaultStep("track", S.game)] }); touch(); render(); },
  remove: (d) => { const arr = getP(S.game, d.p); if (arr.length > 1) arr.splice(Number(d.i), 1); touch(); render(); }
});
export const stepActions = {
  "step-unset": (d) => { delete getP(S.game, d.p)[d.k]; touch(); render(); }
};
