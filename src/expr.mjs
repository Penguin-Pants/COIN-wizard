// Expression evaluator for the coin-game expression language.
// ctx = { state, links, $space }

const num = (x) => (typeof x === "boolean" ? (x ? 1 : 0) : x);

// Values of one faction. A faction's score is its victory formula on the current board.
export function factionValue(fid, field, ctx) {
  const { state } = ctx;
  if (!(fid in state.resources)) throw new Error(`Unknown faction ${fid}`);
  switch (field) {
    case "id": return fid;
    case "name": return state.factions?.[fid]?.name ?? fid;
    case "type": return state.factions?.[fid]?.type;
    case "resources": return state.resources[fid];
    case "eligible": return !!state.eligible[fid];
    case "score": { const v = state.victory?.[fid]; if (!v) throw new Error(`Faction ${fid} has no victory rule`); return num(evalExpr(v.formula, { state, links: ctx.links })); }
    case "margin": return factionValue(fid, "score", ctx) - state.victory[fid].threshold;
    default: throw new Error(`Unknown faction value ${field}`);
  }
}
const rivals = (state) => Object.keys(state.resources).filter((f) => f !== state.self);

export function resolveVar(name, ctx) {
  const { state, $space } = ctx;
  if (name === "eligible") return !!state.eligible[state.self];
  if (name === "self.resources") return state.resources[state.self];
  let m = /^(resources|eligible|score|margin)\.(.+)$/.exec(name);
  if (m) return factionValue(m[2], m[1], ctx);
  m = /^rivals\.(max|min)(Resources|Score|Margin)$/.exec(name);
  if (m) {
    const vals = rivals(state).map((f) => factionValue(f, m[2].toLowerCase(), ctx));
    return vals.length ? Math[m[1]](...vals) : 0;
  }
  m = /^\$(faction|target)\.(.+)$/.exec(name);
  if (m) {
    const fid = ctx[`$${m[1]}`];
    if (!fid) throw new Error(`Variable ${name} used outside ${m[1] === "faction" ? "an opponent table" : "an action with a target"}`);
    return factionValue(fid, m[2], ctx);
  }
  if (name.startsWith("track.")) return state.tracks[name.slice(6)];
  if (name.startsWith("card.")) return state.card[name.slice(5)];
  if (name.startsWith("var.")) return state.vars?.[name.slice(4)];
  if (name.startsWith("$space.")) {
    if (!$space) throw new Error(`Variable ${name} used outside a space context`);
    return $space[name.slice(7)];
  }
  throw new Error(`Unknown variable: ${name}`);
}

function countPieces(state, pieceId, spaceId, stateId) {
  const ids = spaceId === "*" ? Object.keys(state.spaces) : [spaceId];
  let total = 0;
  for (const id of ids) {
    const byState = state.spaces[id]?.pieces?.[pieceId];
    if (!byState) continue;
    for (const [st, n] of Object.entries(byState)) if (stateId === "*" || stateId === st) total += n;
  }
  return total;
}

export function neighbors(links, spaceId) {
  const out = [];
  for (const l of links) {
    if (l.from === spaceId) out.push(l.to);
    else if (l.to === spaceId) out.push(l.from);
  }
  return out;
}

export function evalExpr(e, ctx) {
  if (e === null || ["number", "boolean", "string"].includes(typeof e)) return e;
  if ("var" in e) return resolveVar(e.var, ctx);
  const a = e.args;
  const ev = (x) => evalExpr(x, ctx);
  switch (e.op) {
    case "and": return a.every((x) => !!ev(x));
    case "or": return a.some((x) => !!ev(x));
    case "not": return !ev(a[0]);
    case "eq": return ev(a[0]) === ev(a[1]);
    case "ne": return ev(a[0]) !== ev(a[1]);
    case "gt": return num(ev(a[0])) > num(ev(a[1]));
    case "gte": return num(ev(a[0])) >= num(ev(a[1]));
    case "lt": return num(ev(a[0])) < num(ev(a[1]));
    case "lte": return num(ev(a[0])) <= num(ev(a[1]));
    case "add": return a.reduce((s, x) => s + num(ev(x)), 0);
    case "sub": return num(ev(a[0])) - num(ev(a[1]));
    case "mul": return a.reduce((s, x) => s * num(ev(x)), 1);
    case "min": return Math.min(...a.map((x) => num(ev(x))));
    case "max": return Math.max(...a.map((x) => num(ev(x))));
    case "count": return countPieces(ctx.state, ev(a[0]), ev(a[1]), ev(a[2]));
    case "adjCount": {
      const sid = ev(a[1]);
      return neighbors(ctx.links, sid).reduce((s, n) => s + countPieces(ctx.state, ev(a[0]), n, ev(a[2])), 0);
    }
    case "sumSpaces":
      return Object.values(ctx.state.spaces).reduce((s, sp) => s + num(evalExpr(a[0], { ...ctx, $space: sp })), 0);
    case "anySpace":
      return Object.values(ctx.state.spaces).some((sp) => !!evalExpr(a[0], { ...ctx, $space: sp }));
    case "attr": return ctx.state.spaces[ev(a[0])]?.[ev(a[1])];
    // All pieces of one faction, in a space or on the whole map ("*"), in one state or any ("*").
    case "factionCount": {
      const fid = ev(a[0]), sid = ev(a[1]), st = ev(a[2]);
      return Object.entries(ctx.state.owner ?? {}).filter(([, f]) => f === fid).reduce((s, [pid]) => s + countPieces(ctx.state, pid, sid, st), 0);
    }
    default: throw new Error(`Unknown op: ${e.op}`);
  }
}

// Collect {vars, pieces, ops} used by an expression, for reference checks.
export function scanExpr(e, out = { vars: [], pieces: [], ops: [] }) {
  if (e === null || typeof e !== "object") return out;
  if ("var" in e) { out.vars.push(e.var); return out; }
  out.ops.push(e.op);
  if (["count", "adjCount"].includes(e.op) && typeof e.args[0] === "string") out.pieces.push(e.args[0]);
  if (e.op === "factionCount" && typeof e.args[0] === "string") (out.factions ??= []).push(e.args[0]);
  for (const x of e.args) scanExpr(x, out);
  return out;
}

// Faction ids in resources.<id> and similar names are checked against the game by the validator.
export const VAR_OK = /^(eligible|self\.resources|(resources|eligible|score|margin)\.[a-z0-9._-]+|rivals\.(max|min)(Resources|Score|Margin)|\$(faction|target)\.(id|name|type|resources|eligible|score|margin)|track\.[a-z0-9._-]+|card\.(id|hasEffect|raisesSelf|lowersEnemy)|var\.[a-z0-9_]+|\$space\.(id|name|type|pop|opinion))$/;
