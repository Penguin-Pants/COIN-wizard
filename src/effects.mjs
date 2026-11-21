// Apply an action's cost and effect steps to a dry-run state, so later nodes and the
// linked Special Activity see the changed board. Bot rules for choices inside steps:
// - "choose" takes the first option. Count "any" means as many as can move or flip.
// - "move" from "adjacent" takes pieces from linked spaces in name order.
// - A roll uses the next die of the dry run (error when none is left).
// - A step that needs a player to pick a space ("choose", or "spaces" with "filter") is an error.
import { evalExpr, neighbors } from "./expr.mjs";

const clamp = (v, lo, hi) => Math.min(hi ?? Infinity, Math.max(lo ?? -Infinity, v));

function setTrack(game, state, id, value) {
  const t = game.tracks.find((x) => x.id === id);
  const v = clamp(value, t?.min, t?.max);
  state.tracks[id] = v;
  for (const f of game.factions) if (f.resourceTrack === id) state.resources[f.id] = v;
}
const trackValue = (game, state, id) => {
  const f = game.factions.find((x) => x.resourceTrack === id);
  return f ? state.resources[f.id] : state.tracks[id] ?? 0;
};

function noChoice(step, field) {
  throw new Error(`Effect step "${step.op}" needs a player to choose (${field}). A dry run cannot choose for the bot.`);
}

// The one space a step works on.
function spaceOf(step, ctx, field) {
  const w = step[field] ?? "$space";
  if (step.spaces !== undefined || step.filter !== undefined) noChoice(step, "spaces");
  if (w === "choose") noChoice(step, field);
  const id = w === "$space" ? ctx.$space?.id : w;
  const sp = ctx.state.spaces[id];
  if (!sp) throw new Error(`Effect step "${step.op}" names unknown space ${id}`);
  return sp;
}

const statesOf = (game, pid) => game.factions.flatMap((f) => f.pieces).find((p) => p.id === pid)?.states ?? [];
const onSpace = (sp, pid, st) => Object.entries(sp.pieces[pid] ?? {}).filter(([s]) => st === undefined || s === st).reduce((n, [, c]) => n + c, 0);

// How many: a number, "all" or "any" (as many as there are), "moved", or a formula.
function qty(q, ctx, max) {
  if (q === "all" || q === "any") return max;
  if (q === "moved") return Math.min(max, ctx.moved ?? 0);
  const n = typeof q === "number" ? q : Number(evalExpr(q, ctx));
  return Math.max(0, Math.min(max, n));
}

function addPieces(sp, pid, st, n) {
  if (n <= 0) return;
  sp.pieces[pid] ??= {};
  sp.pieces[pid][st] = (sp.pieces[pid][st] ?? 0) + n;
}
// Takes up to n pieces from a space, in the piece's state order. Returns [[state, count], ...].
function takePieces(game, sp, pid, st, n) {
  const out = [];
  for (const s of st === undefined ? statesOf(game, pid) : [st]) {
    const have = sp.pieces[pid]?.[s] ?? 0;
    const k = Math.min(have, n);
    if (!k) continue;
    sp.pieces[pid][s] = have - k;
    if (!sp.pieces[pid][s]) delete sp.pieces[pid][s];
    out.push([s, k]); n -= k;
    if (!n) break;
  }
  return out;
}
const poolOf = (state, pid) => (state.pools[pid] ??= { available: 0, outOfPlay: 0 });
const isPool = (w) => w === "available" || w === "outOfPlay";

function runSteps(game, steps, ctx) {
  for (const s of steps) runStep(game, s, ctx);
}

function runStep(game, s, ctx) {
  const { state } = ctx;
  switch (s.op) {
    case "place": {
      const sp = spaceOf(s, ctx, "to");
      const pool = poolOf(state, s.piece);
      const n = qty(s.count, ctx, pool[s.from]);
      pool[s.from] -= n;
      addPieces(sp, s.piece, s.state ?? statesOf(game, s.piece)[0], n);
      return;
    }
    case "remove": {
      const sp = spaceOf(s, ctx, "space");
      const want = qty(s.count, ctx, onSpace(sp, s.piece, s.state) + (s.fallbackPiece ? onSpace(sp, s.fallbackPiece) : 0));
      let left = want;
      for (const pid of [s.piece, s.fallbackPiece].filter(Boolean)) {
        const got = takePieces(game, sp, pid, pid === s.piece ? s.state : undefined, left);
        const k = got.reduce((t, [, c]) => t + c, 0);
        poolOf(state, pid)[s.to] += k; left -= k;
        if (!left) break;
      }
      return;
    }
    case "flip": {
      const sp = spaceOf(s, ctx, "space");
      const n = qty(s.count, ctx, onSpace(sp, s.piece, s.from));
      takePieces(game, sp, s.piece, s.from, n);
      addPieces(sp, s.piece, s.to, n);
      return;
    }
    case "move": {
      if (s.to === "choose" || s.from === "choose") noChoice(s, "move");
      const dest = isPool(s.to) ? null : spaceOf({ ...s, filter: undefined }, ctx, "to");
      const sources = s.from === "adjacent"
        ? neighbors(game.board.links, ctx.$space.id).map((id) => state.spaces[id]).sort((a, b) => a.name.localeCompare(b.name))
        : isPool(s.from) ? [] : [spaceOf({ ...s, filter: undefined }, ctx, "from")];
      const ok = (sp) => s.filter === undefined || !!evalExpr(s.filter, { ...ctx, $space: sp });
      const can = isPool(s.from) ? poolOf(state, s.piece)[s.from] : sources.filter(ok).reduce((t, sp) => t + onSpace(sp, s.piece, s.state), 0);
      let left = qty(s.count, ctx, can), moved = 0;
      const put = (st, k) => { if (dest) addPieces(dest, s.piece, st, k); else poolOf(state, s.piece)[s.to] += k; moved += k; };
      if (isPool(s.from)) { poolOf(state, s.piece)[s.from] -= left; put(s.state ?? statesOf(game, s.piece)[0], left); left = 0; }
      for (const sp of sources.filter(ok)) {
        if (!left) break;
        for (const [st, k] of takePieces(game, sp, s.piece, s.state, left)) { put(st, k); left -= k; }
      }
      ctx.moved = moved;
      return;
    }
    case "shift": {
      const sp = spaceOf(s, ctx, "space");
      sp[s.attr] = clamp((sp[s.attr] ?? 0) + (s.toward === "support" ? s.amount : -s.amount), -1, 1);
      return;
    }
    case "track": setTrack(game, state, s.id, trackValue(game, state, s.id) + s.delta); return;
    case "gain": setTrack(game, state, s.track, trackValue(game, state, s.track) + Number(evalExpr(s.amount, ctx))); return;
    case "pay": {
      // The step fails when the track holds less than the amount: nothing changes.
      const a = Number(evalExpr(s.amount, ctx)), have = trackValue(game, state, s.track);
      if (have >= a) setTrack(game, state, s.track, have - a);
      return;
    }
    case "roll": {
      if (!state.dice.length) throw new Error(`Effect step "roll" needs a die result but the dry run has none left`);
      (state.vars ??= {})[s.store] = state.dice.shift();
      return;
    }
    case "markerSet": { spaceOf(s, ctx, "space")[s.marker] = s.value; return; }
    case "if": runSteps(game, evalExpr(s.test, ctx) ? s.then : (s.else ?? []), ctx); return;
    case "choose": runSteps(game, s.options[0].steps, ctx); return;
    default: throw new Error(`Unknown effect op ${s.op}`);
  }
}

// Pays the action's cost, then runs its steps once per chosen space (in the chosen order).
// Changes state in place. extra: { $target } when the action picked an enemy.
export function applyAction(game, state, action, spaceIds, extra = {}) {
  const c = action.cost;
  if (c.amount > 0) {
    const total = c.per === "space" ? c.amount * spaceIds.length : c.amount;
    setTrack(game, state, c.track, trackValue(game, state, c.track) - total);
  }
  for (const id of spaceIds) runSteps(game, action.steps, { state, links: game.board.links, $space: state.spaces[id], ...extra });
}
