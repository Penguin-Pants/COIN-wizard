// No-code editor for conditions and values. It edits the flat model from src/exprmodel.mjs.
// Each control names the game path of the whole expression (data-x), the model path inside it (data-xm)
// and whether the root is a condition or a value (data-xk). A change rebuilds the expression from the model.
import { toCond, fromCond, toValue, fromValue, setAt, CMPS } from "../../src/exprmodel.mjs";
import { VAR_OK } from "../../src/expr.mjs";
import { varText } from "../../src/plain.mjs";
import { S, esc, getP, setP, parseLoose, pieces } from "../state.mjs";
import { touch } from "../store.mjs";
import { render } from "../shell.mjs";
import { btn } from "./fields.mjs";

const CMP_LABEL = { eq: "is", ne: "is not", gt: "more than", gte: "at least", lt: "less than", lte: "at most" };
const COND_KINDS = [["cmp", "Compare"], ["all", "All of"], ["any", "Any of"], ["anySpace", "Some space has"], ["canPlace", "Can place"], ["canDo", "Can do"], ["truthy", "Is true"], ["always", "Always"], ["never", "Never"]];
const VALUE_KINDS = [["lit", "Number or text"], ["var", "Variable"], ["count", "Pieces in a space"], ["fcount", "All pieces of a faction"], ["adj", "Pieces in adjacent spaces"], ["unmoved", "Pieces not yet moved"], ["avail", "Pieces Available"], ["favail", "Available pieces of a faction"], ["sum", "Sum"], ["diff", "Difference"], ["sumWhere", "Total over spaces where"], ["countWhere", "Number of spaces where"], ["attr", "Space attribute"]];

const opts = (list, cur) => list.map(([v, l]) => `<option value="${esc(v)}" ${String(v) === String(cur) ? "selected" : ""}>${esc(l)}</option>`).join("");
// Every control of one expression shares its data-path, so an issue on the expression lists under the editor.
const attrs = (c, mp, extra = "") => `data-x="${esc(c.path)}" data-xk="${c.root}" data-xm="${esc(mp)}" data-path="/${esc(c.path)}" ${extra}`;
const join = (mp, k) => (mp ? `${mp}.${k}` : k);
const keepAt = (list, v) => (list.some(([x]) => x === v) ? list : [...list, [v, `${v} (not valid here)`]]);
// Controls that create nodes carry the context, so a new node only offers what is valid there.
const sp = (ctx) => `data-xs="${ctx.space ? 1 : 0}" data-xf="${ctx.faction ? 1 : 0}" data-xt2="${ctx.target ? 1 : 0}" data-xst="${esc((ctx.stores ?? []).join(","))}"`;

// ---------- variable picker: only names the validator accepts
export function varOptions(ctx) {
  const g = S.game;
  const names = ["eligible", "self.resources", ...g.tracks.map((t) => `track.${t.id}`), "card.id", "card.hasEffect", "card.raisesSelf", "card.lowersEnemy", "card.lasting", "card.position", "turn.position", "scoring.nextFinal",
    // Any faction's values, and the highest or lowest among the enemies, so 3 and 4 faction bots can compare.
    ...g.factions.flatMap((f) => ["resources", "eligible", "score", "margin", "player"].map((k) => `${k}.${f.id}`)),
    ...["Margin", "Score", "Resources"].flatMap((k) => [`rivals.max${k}`, `rivals.min${k}`])];
  for (const who of [["faction", ctx.faction], ["target", ctx.target]]) if (who[1]) names.unshift(...["margin", "score", "resources", "eligible", "player", "type", "id"].map((k) => `$${who[0]}.${k}`));
  if (ctx.move) names.push("move.count");
  if (ctx.space) names.push("$space.pop", "$space.opinion", "$space.type", "$space.name", "$space.id", ...(g.rules.control ? ["$space.control"] : []));
  for (const s of ctx.stores ?? []) names.push(`var.${s}`);
  return names.filter((n) => VAR_OK.test(n)).map((n) => [n, varText(g, n)]);
}

// ---------- defaults for a new node
function newValue(k, ctx) {
  const pc = pieces()[0]?.id ?? "";
  switch (k) {
    case "lit": return { k, value: 0 };
    case "var": return { k, name: varOptions(ctx)[0][0] };
    case "count": case "adj": case "unmoved": return { k, piece: pc, at: ctx.space ? "$space" : "*", state: "*" };
    case "fcount": return { k, faction: ctx.target ? "$target" : ctx.faction ? "$faction" : S.game.factions[0].id, at: ctx.space ? "$space" : "*", state: "*" };
    case "avail": return { k, piece: pc };
    case "favail": return { k, faction: ctx.target ? "$target" : ctx.faction ? "$faction" : S.game.factions[0].id };
    case "sum": return { k, items: [{ k: "lit", value: 0 }, { k: "lit", value: 0 }] };
    case "diff": return { k, a: { k: "lit", value: 0 }, b: { k: "lit", value: 0 } };
    case "sumWhere": return { k, cond: newCond("cmp", { ...ctx, space: true }), v: { k: "var", name: "$space.pop" } };
    case "countWhere": return { k, cond: newCond("cmp", { ...ctx, space: true }) };
    case "attr": return { k, space: S.game.board.spaces[0]?.id ?? "", name: "pop" };
    default: throw new Error(`Unknown value kind ${k}`);
  }
}
function newCond(k, ctx) {
  switch (k) {
    case "cmp": return { k, cmp: "gte", a: newValue("count", ctx), b: { k: "lit", value: 1 } };
    case "all": case "any": return { k, items: [newCond("cmp", ctx)] };
    case "anySpace": return { k, cond: newCond("cmp", { ...ctx, space: true }) };
    case "truthy": return { k, v: { k: "var", name: "eligible" } };
    case "canPlace": return { k, piece: pieces().find((p) => p.isBase)?.id ?? pieces()[0]?.id ?? "", at: ctx.space ? "$space" : "*" };
    case "canDo": return { k, action: S.game.actions[0]?.id ?? "", at: ctx.space ? "$space" : "*" };
    case "always": return { k: "bool", value: true };
    case "never": return { k: "bool", value: false };
    default: throw new Error(`Unknown condition kind ${k}`);
  }
}

// ---------- rendering
// Factions a value can name: the target and the faction in context first, then every faction by name.
const whoList = (ctx, cur) => keepAt([...(ctx.target ? [["$target", "the target"]] : []), ...(ctx.faction ? [["$faction", "that faction"]] : []), ...S.game.factions.map((f) => [f.id, f.name])], cur);
function rawBox(c, mp, expr, kind) {
  return `<span class="xraw"><small>This part cannot be shown as rows. Edit it as data.</small><textarea rows="2" ${attrs(c, mp, `data-xraw="${kind}"`)}>${esc(JSON.stringify(expr))}</textarea></span>`;
}

function valueHtml(m, mp, c, ctx) {
  const g = S.game;
  const kind = `<select class="xkind" aria-label="Value type" ${attrs(c, mp, `data-xnew="value" ${sp(ctx)}`)}>${opts(VALUE_KINDS, m.k)}${m.k === "raw" ? '<option value="raw" selected>Formula (data)</option>' : ""}</select>`;
  const f = (k) => join(mp, k);
  let body;
  switch (m.k) {
    case "lit": body = `<input class="xnum" aria-label="Value" ${attrs(c, f("value"), 'data-xt="lit"')} value="${esc(m.value)}">`; break;
    case "var": {
      const list = varOptions(ctx); if (!list.some(([n]) => n === m.name)) list.push([m.name, `${m.name} (not valid here)`]);
      body = `<select aria-label="Variable" ${attrs(c, f("name"))}>${opts(list, m.name)}</select>`; break;
    }
    case "count": case "adj": case "unmoved": {
      const pc = pieces().find((p) => p.id === m.piece);
      const at = [...(ctx.space ? [["$space", "this space"]] : []), ["*", "the map"], ...g.board.spaces.map((s) => [s.id, s.name])];
      if (!at.some(([v]) => v === m.at)) at.push([m.at, `${m.at} (not valid here)`]);
      body = `<select aria-label="Piece" ${attrs(c, f("piece"))}>${opts(pieces().map((p) => [p.id, p.name]), m.piece)}</select>
        <select aria-label="State" ${attrs(c, f("state"))}>${opts([["*", "any state"], ...(pc?.states ?? []).map((s) => [s, s])], m.state)}</select>
        ${m.k !== "adj" ? `<span>in</span><select aria-label="Where" ${attrs(c, f("at"))}>${opts(at, m.at)}</select>` : `<span>next to</span><select aria-label="Where" ${attrs(c, f("at"))}>${opts(at.filter(([v]) => v !== "*"), m.at)}</select>`}`;
      break;
    }
    case "avail": body = `<select aria-label="Piece" ${attrs(c, f("piece"))}>${opts(keepAt(pieces().map((p) => [p.id, p.name]), m.piece), m.piece)}</select>`; break;
    case "favail": body = `<select aria-label="Faction" ${attrs(c, f("faction"))}>${opts(whoList(ctx, m.faction), m.faction)}</select>`; break;
    case "fcount": {
      const who = whoList(ctx, m.faction);
      const at = [...(ctx.space ? [["$space", "this space"]] : []), ["*", "the map"], ...g.board.spaces.map((s) => [s.id, s.name])];
      const states = [...new Set(g.factions.flatMap((f) => f.pieces.flatMap((p) => p.states)))];
      body = `<select aria-label="Faction" ${attrs(c, f("faction"))}>${opts(who, m.faction)}</select><select aria-label="State" ${attrs(c, f("state"))}>${opts([["*", "any state"], ...states.map((x) => [x, x])], m.state)}</select><span>in</span><select aria-label="Where" ${attrs(c, f("at"))}>${opts(keepAt(at, m.at), m.at)}</select>`;
      break;
    }
    case "sum": body = `<span class="xg">${m.items.map((x, i) => `<span class="xrow">${i ? "<span>plus</span>" : ""}${valueHtml(x, f(`items.${i}`), c, ctx)}${m.items.length > 1 ? btn("x-del", "Remove", { cls: "link", data: attrs(c, f(`items.${i}`)) }) : ""}</span>`).join("")}${btn("x-add", "Add term", { cls: "link", data: attrs(c, f("items"), `data-xadd="value" ${sp(ctx)}`) })}</span>`; break;
    case "diff": body = `${valueHtml(m.a, f("a"), c, ctx)}<span>minus</span>${valueHtml(m.b, f("b"), c, ctx)}`; break;
    case "sumWhere": body = `${valueHtml(m.v, f("v"), c, { ...ctx, space: true })}<span>where</span>${condHtml(m.cond, f("cond"), c, { ...ctx, space: true })}`; break;
    case "countWhere": body = condHtml(m.cond, f("cond"), c, { ...ctx, space: true }); break;
    case "attr": body = `<select aria-label="Attribute" ${attrs(c, f("name"))}>${opts([["pop", "Pop"], ["opinion", "opinion"]], m.name)}</select><span>of</span><select aria-label="Space" ${attrs(c, f("space"))}>${opts(g.board.spaces.map((s) => [s.id, s.name]), m.space)}</select>`; break;
    default: body = rawBox(c, mp, m.expr, "value");
  }
  return `<span class="xv">${kind}${body}</span>`;
}

function condHtml(m, mp, c, ctx) {
  const k = m.k === "bool" ? (m.value ? "always" : "never") : m.k;
  const f = (x) => join(mp, x);
  const head = `<label class="xnot"><input type="checkbox" ${attrs(c, f("not"), 'data-xt="bool"')} ${m.not ? "checked" : ""}> not</label><select class="xkind" aria-label="Condition type" ${attrs(c, mp, `data-xnew="cond" ${sp(ctx)}`)}>${opts(COND_KINDS, k)}${m.k === "raw" ? '<option value="raw" selected>Formula (data)</option>' : ""}</select>`;
  let body;
  switch (m.k) {
    case "cmp": body = `${valueHtml(m.a, f("a"), c, ctx)}<select aria-label="Comparison" ${attrs(c, f("cmp"))}>${opts(CMPS.map((x) => [x, CMP_LABEL[x]]), m.cmp)}</select>${valueHtml(m.b, f("b"), c, ctx)}`; break;
    case "all": case "any": body = `<div class="xg">${m.items.map((x, i) => `<div class="xrow">${condHtml(x, f(`items.${i}`), c, ctx)}${m.items.length > 1 ? btn("x-del", "Remove", { cls: "link", data: attrs(c, f(`items.${i}`)) }) : ""}</div>`).join("")}${btn("x-add", "Add condition", { cls: "link", data: attrs(c, f("items"), `data-xadd="cond" ${sp(ctx)}`) })}</div>`; break;
    case "anySpace": body = condHtml(m.cond, f("cond"), c, { ...ctx, space: true }); break;
    case "truthy": body = valueHtml(m.v, f("v"), c, ctx); break;
    case "canPlace": case "canDo": {
      const at = keepAt([...(ctx.space ? [["$space", "this space"]] : []), ["*", "some space"], ...S.game.board.spaces.map((s) => [s.id, s.name])], m.at);
      const what = m.k === "canPlace" ? `<span>a</span><select aria-label="Piece" ${attrs(c, f("piece"))}>${opts(keepAt(pieces().map((p) => [p.id, p.name]), m.piece), m.piece)}</select>` : `<select aria-label="Action" ${attrs(c, f("action"))}>${opts(keepAt(S.game.actions.map((a) => [a.id, a.name]), m.action), m.action)}</select>`;
      body = `${what}<span>in</span><select aria-label="Where" ${attrs(c, f("at"))}>${opts(at, m.at)}</select>`; break;
    }
    case "bool": body = ""; break;
    default: body = rawBox(c, mp, m.expr, "cond");
  }
  return `<div class="xc">${head}${body}</div>`;
}

// ctx: { space: true when $space is bound, faction: in an opponent table, target: an enemy was picked, stores: roll result names }
export const condEditor = (path, expr, ctx = {}) => `<div class="xe">${condHtml(toCond(expr), "", { path, root: "cond" }, { stores: [], ...ctx })}</div>`;
export const valueEditor = (path, expr, ctx = {}) => `<div class="xe">${valueHtml(toValue(expr), "", { path, root: "value" }, { stores: [], ...ctx })}</div>`;

// ---------- editing
function edit(el, fn) {
  const path = el.dataset.x, root = el.dataset.xk;
  const m = root === "cond" ? toCond(getP(S.game, path)) : toValue(getP(S.game, path));
  const out = fn(m, el.dataset.xm) ?? m;
  setP(S.game, path, root === "cond" ? fromCond(out) : fromValue(out));
  touch(); render();
}
const getAt = (m, mp) => (mp ? mp.split(".").reduce((o, k) => o[k], m) : m);
// Replaces the node at mp. An empty mp replaces the root.
const put = (m, mp, v) => { if (!mp) return v; setAt(m, mp, v); return m; };
const ctxOf = (el) => ({ space: el.dataset.xs === "1", faction: el.dataset.xf === "1", target: el.dataset.xt2 === "1", stores: (el.dataset.xst ?? "").split(",").filter(Boolean) });

// Returns true when the change belonged to an expression editor.
export function onExprChange(el) {
  if (!el.dataset?.x) return false;
  if (el.dataset.xraw) {
    let v; try { v = JSON.parse(el.value); } catch { el.classList.add("invalid"); return true; }
    edit(el, (m, mp) => put(m, mp, el.dataset.xraw === "cond" ? toCond(v) : toValue(v)));
    return true;
  }
  if (el.dataset.xnew) {
    const kind = el.value;
    edit(el, (m, mp) => {
      const old = getAt(m, mp);
      const node = el.dataset.xnew === "cond" ? newCond(kind, ctxOf(el)) : newValue(kind, ctxOf(el));
      if (old?.not && el.dataset.xnew === "cond") node.not = true;
      return put(m, mp, node);
    });
    return true;
  }
  const t = el.dataset.xt;
  const v = t === "bool" ? el.checked : t === "lit" ? parseLoose(el.value) : el.value;
  edit(el, (m, mp) => {
    if (t === "bool" && !v) { const n = getAt(m, mp.replace(/\.?not$/, "")); delete n.not; return m; }
    return put(m, mp, v);
  });
  return true;
}

export const exprActions = {
  "x-add": (d, b) => edit(b, (m, mp) => { getAt(m, mp).push(b.dataset.xadd === "cond" ? newCond("cmp", ctxOf(b)) : { k: "lit", value: 0 }); }),
  "x-del": (d, b) => edit(b, (m, mp) => { const i = Number(mp.split(".").pop()); getAt(m, mp.replace(/\.?\d+$/, "")).splice(i, 1); })
};
