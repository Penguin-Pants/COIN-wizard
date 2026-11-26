// Converts expression trees to a flat model the forms can edit, and back.
// fromCond(toCond(e)) and fromValue(toValue(e)) return e unchanged for every shape.
// A shape the model cannot show becomes { k: "raw", expr } and keeps the tree as it is.
//
// Condition model:
//   { k: "all" | "any", items: [cond] }       and, or
//   { k: "cmp", cmp, a: value, b: value }     eq ne gt gte lt lte
//   { k: "anySpace", cond }                    some space meets cond
//   { k: "canPlace", piece, at }               a piece is Available and has room (1.8.0). at: "$space", "*" or a space id.
//   { k: "canDo", action, at }                 an action is legal and affordable (1.8.0). at: as for canPlace.
//   { k: "truthy", v: value }                  a value used as a condition, such as eligible
//   { k: "bool", value }                       always true or always false
//   { k: "raw", expr }
//   Any condition can carry not: true.
// Value model:
//   { k: "lit", value }                        number or text
//   { k: "var", name }
//   { k: "count" | "adj" | "unmoved", piece, at, state }   at: "$space", "*" or a space id. state: "*" or a state.
//                                              unmoved (1.9.0): pieces that have not moved in this Operation.
//   { k: "fcount", faction, at, state }        all pieces of a faction. faction: an id, "$target" or "$faction".
//   { k: "avail", piece }                      pieces Available (1.11.0)
//   { k: "favail", faction }                   Available pieces of a faction (1.11.0). faction: as for fcount.
//   { k: "sum", items: [value] }               add
//   { k: "diff", a, b }                        sub
//   { k: "sumWhere", cond, v }                 sum of v over spaces where cond holds
//   { k: "countWhere", cond }                  number of spaces where cond holds
//   { k: "attr", space, name }
//   { k: "raw", expr }

export const CMPS = ["eq", "ne", "gt", "gte", "lt", "lte"];
const COND_OPS = new Set(["and", "or", "not", "anySpace", "canPlace", "canDo", ...CMPS]);

export const isExpr = (v) => v !== null && typeof v === "object" && !Array.isArray(v) &&
  (("var" in v && Object.keys(v).length === 1 && typeof v.var === "string") || (typeof v.op === "string" && Array.isArray(v.args) && Object.keys(v).length === 2));
const isCondExpr = (e) => typeof e === "boolean" || (isExpr(e) && COND_OPS.has(e.op));
const lit = (x) => x === null || ["number", "string"].includes(typeof x);

// ---------- conditions
export function toCond(e) {
  if (typeof e === "boolean") return { k: "bool", value: e };
  if (!isExpr(e)) return { k: "raw", expr: e };
  if ("var" in e) return { k: "truthy", v: toValue(e) };
  const a = e.args;
  if (e.op === "not" && a.length === 1) {
    const inner = toCond(a[0]);
    return inner.not || inner.k === "raw" || inner.k === "bool" ? { k: "raw", expr: e } : { ...inner, not: true };
  }
  if ((e.op === "and" || e.op === "or") && a.length >= 1) return { k: e.op === "and" ? "all" : "any", items: a.map(toCond) };
  if (CMPS.includes(e.op) && a.length === 2) return { k: "cmp", cmp: e.op, a: toValue(a[0]), b: toValue(a[1]) };
  if (e.op === "anySpace" && a.length === 1) return { k: "anySpace", cond: toCond(a[0]) };
  if ((e.op === "canPlace" || e.op === "canDo") && a.length === 2 && typeof a[0] === "string" && AT(a[1]) !== null) return e.op === "canPlace" ? { k: "canPlace", piece: a[0], at: AT(a[1]) } : { k: "canDo", action: a[0], at: AT(a[1]) };
  return { k: "raw", expr: e };
}

export function fromCond(m) {
  const { not, ...c } = m;
  let e;
  switch (c.k) {
    case "bool": e = c.value; break;
    case "truthy": e = fromValue(c.v); break;
    case "all": case "any": e = { op: c.k === "all" ? "and" : "or", args: c.items.map(fromCond) }; break;
    case "cmp": e = { op: c.cmp, args: [fromValue(c.a), fromValue(c.b)] }; break;
    case "anySpace": e = { op: "anySpace", args: [fromCond(c.cond)] }; break;
    case "canPlace": e = { op: "canPlace", args: [c.piece, atExpr(c.at)] }; break;
    case "canDo": e = { op: "canDo", args: [c.action, atExpr(c.at)] }; break;
    case "raw": e = c.expr; break;
    default: throw new Error(`Unknown condition kind ${c.k}`);
  }
  return not ? { op: "not", args: [e] } : e;
}

// ---------- values
const AT = (x) => (isExpr(x) && x.var === "$space.id" ? "$space" : typeof x === "string" ? x : null);
const FAC = (x) => (typeof x === "string" ? x : isExpr(x) && (x.var === "$target.id" || x.var === "$faction.id") ? x.var.slice(0, -3) : null);

export function toValue(e) {
  if (lit(e)) return { k: "lit", value: e };
  if (!isExpr(e)) return { k: "raw", expr: e };
  if ("var" in e) return { k: "var", name: e.var };
  const a = e.args;
  if ((e.op === "count" || e.op === "adjCount" || e.op === "unmoved") && a.length === 3 && typeof a[0] === "string" && AT(a[1]) !== null && typeof a[2] === "string") {
    return { k: e.op === "count" ? "count" : e.op === "unmoved" ? "unmoved" : "adj", piece: a[0], at: AT(a[1]), state: a[2] };
  }
  if (e.op === "factionCount" && a.length === 3 && FAC(a[0]) !== null && AT(a[1]) !== null && typeof a[2] === "string") return { k: "fcount", faction: FAC(a[0]), at: AT(a[1]), state: a[2] };
  if (e.op === "avail" && a.length === 1 && typeof a[0] === "string") return { k: "avail", piece: a[0] };
  if (e.op === "factionAvail" && a.length === 1 && FAC(a[0]) !== null) return { k: "favail", faction: FAC(a[0]) };
  if (e.op === "add" && a.length >= 1) return { k: "sum", items: a.map(toValue) };
  if (e.op === "sub" && a.length === 2) return { k: "diff", a: toValue(a[0]), b: toValue(a[1]) };
  if (e.op === "sumSpaces" && a.length === 1) {
    const x = a[0];
    if (isExpr(x) && x.op === "mul" && x.args.length === 2 && isCondExpr(x.args[0]) && !isCondExpr(x.args[1])) return { k: "sumWhere", cond: toCond(x.args[0]), v: toValue(x.args[1]) };
    if (isCondExpr(x)) return { k: "countWhere", cond: toCond(x) };
  }
  if (e.op === "attr" && a.length === 2 && a.every((x) => typeof x === "string")) return { k: "attr", space: a[0], name: a[1] };
  return { k: "raw", expr: e };
}

const atExpr = (at) => (at === "$space" ? { var: "$space.id" } : at);
const facExpr = (f) => (f.startsWith("$") ? { var: `${f}.id` } : f);
export function fromValue(m) {
  switch (m.k) {
    case "lit": return m.value;
    case "var": return { var: m.name };
    case "count": case "adj": case "unmoved": return { op: m.k === "count" ? "count" : m.k === "unmoved" ? "unmoved" : "adjCount", args: [m.piece, atExpr(m.at), m.state] };
    case "fcount": return { op: "factionCount", args: [facExpr(m.faction), atExpr(m.at), m.state] };
    case "avail": return { op: "avail", args: [m.piece] };
    case "favail": return { op: "factionAvail", args: [facExpr(m.faction)] };
    case "sum": return { op: "add", args: m.items.map(fromValue) };
    case "diff": return { op: "sub", args: [fromValue(m.a), fromValue(m.b)] };
    case "sumWhere": return { op: "sumSpaces", args: [{ op: "mul", args: [fromCond(m.cond), fromValue(m.v)] }] };
    case "countWhere": return { op: "sumSpaces", args: [fromCond(m.cond)] };
    case "attr": return { op: "attr", args: [m.space, m.name] };
    case "raw": return m.expr;
    default: throw new Error(`Unknown value kind ${m.k}`);
  }
}

// True when any node of the model is a raw fallback.
export const hasRaw = (m) => m !== null && typeof m === "object" && (m.k === "raw" || Object.values(m).some((v) => (Array.isArray(v) ? v.some(hasRaw) : hasRaw(v))));

// Sets one field of a model by a dotted path, such as "items.0.b". An empty path is not allowed.
export function setAt(m, path, value) {
  const ks = String(path).split(".");
  const last = ks.pop();
  const t = ks.reduce((o, k) => o[k], m);
  t[last] = value;
}

// Every expression in a game, with the form that edits it.
const COND_KEYS = new Set(["targets", "test", "filter", "playIf", "when", "trigger"]);
const VALUE_KEYS = new Set(["count", "amount", "formula", "key"]);
export function collectExprs(game) {
  const out = [];
  const walk = (v, path) => {
    if (Array.isArray(v)) { v.forEach((x, i) => walk(x, `${path}/${i}`)); return; }
    if (v === null || typeof v !== "object") return;
    for (const [k, x] of Object.entries(v)) {
      const p = `${path}/${k}`;
      if (COND_KEYS.has(k) && (isExpr(x) || typeof x === "boolean")) out.push({ path: p, expr: x, as: "cond" });
      else if (VALUE_KEYS.has(k) && isExpr(x)) out.push({ path: p, expr: x, as: "value" });
      else if (k === "expr" && (isExpr(x) || typeof x === "boolean")) out.push({ path: p, expr: x, as: isCondExpr(x) ? "cond" : "value" });
      else walk(x, p);
    }
  };
  walk(game, "");
  return out;
}
