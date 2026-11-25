// Apply an action's cost and effect steps to a dry-run state, so later nodes and the
// linked Special Activity see the changed board. Bot rules for choices inside steps:
// - "choose" takes the option whose faction is the action's target ($target), else the first option. Count "any" means as many as can move or flip.
// - "move" from "adjacent" takes pieces from linked spaces in name order.
// - A roll uses the next die of the dry run (error when none is left).
// - A step that needs a player to pick a space ("choose", or "spaces" with "filter") is an error,
//   except in a scoring phase that bot.scoring names: its table picks (chosenRun below).
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

const pieceOf = (game, pid) => game.factions.flatMap((f) => f.pieces).find((p) => p.id === pid);
const statesOf = (game, pid) => pieceOf(game, pid)?.states ?? [];
const defaultOf = (game, pid) => pieceOf(game, pid)?.defaultState ?? statesOf(game, pid)[0];
// Room left for a piece in a space under its maxPerSpace (no limit: Infinity).
const roomIn = (game, sp, pid) => { const m = pieceOf(game, pid)?.maxPerSpace; return m ? Math.max(0, m - onSpace(sp, pid)) : Infinity; };
const onSpace = (sp, pid, st) => Object.entries(sp.pieces[pid] ?? {}).filter(([s]) => st === undefined || s === st).reduce((n, [, c]) => n + c, 0);

// How many: a number, "all" or "any" (as many as there are), "moved", or a formula.
// "moved" counts the pieces of the last move in one state, at the place they moved to
// (moved: { piece, at, byState }). at: a space id or a pool.
function qty(q, ctx, max, piece, st, at) {
  if (q === "all" || q === "any") return max;
  if (q === "moved") {
    if (ctx.moved?.piece !== piece || ctx.moved.at !== at) return 0;
    const n = st === undefined ? Object.values(ctx.moved.byState).reduce((a, b) => a + b, 0) : ctx.moved.byState[st] ?? 0;
    return Math.min(max, n);
  }
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

// Steps whose space a player picks, and the field that names the space.
const CHOICE_FIELD = { place: "to", remove: "space", flip: "space", shift: "space", markerSet: "space" };

// A step that needs a space ("spaces" with "filter", or a "choose" space) asks ctx.choose(filter, n)
// when the dry run gives one (bot.scoring, runScoring in src/dryrun.mjs). It then runs once in each
// chosen space. Without ctx.choose the step is an error, as before.
// How many spaces each choice step of a list may pick (its "spaces", 1 for a "choose" space or move
// end), in nested steps too. The Non-Player sheet prints the largest, capped by the table.
export function choiceCounts(steps) {
  const out = [];
  for (const s of steps ?? []) {
    const f = CHOICE_FIELD[s.op];
    if (f && (s.spaces !== undefined || s.filter !== undefined || s[f] === "choose")) out.push(s.spaces ?? 1);
    if (s.op === "move" && (s.to === "choose" || s.from === "choose")) out.push(1);
    out.push(...choiceCounts(s.then), ...choiceCounts(s.else), ...(s.options ?? []).flatMap((o) => choiceCounts(o.steps)));
  }
  return out;
}

function chosenRun(game, s, ctx) {
  const f = CHOICE_FIELD[s.op];
  if (f && (s.spaces !== undefined || s.filter !== undefined || s[f] === "choose")) {
    const { spaces, filter, ...one } = s, prev = ctx.$space;
    for (const sp of ctx.choose(filter, spaces ?? 1)) { ctx.$space = sp; runStep(game, { ...one, [f]: "$space" }, ctx); }
    ctx.$space = prev;
    return true;
  }
  // move: a chosen source must meet the step's filter (the source filter). A chosen destination
  // becomes the space context, so "adjacent" sources are the spaces linked to it.
  if (s.op === "move" && (s.to === "choose" || s.from === "choose")) {
    const src = s.from === "choose" ? ctx.choose(s.filter, 1)[0] : undefined;
    const from = s.from === "choose" ? src?.id : s.from;
    const dest = s.to === "choose" ? ctx.choose(undefined, 1)[0] : undefined;
    const to = s.to === "choose" ? dest?.id : s.to;
    // No qualifying choice: the move moves nothing, so a later "moved" count is 0 (as in the move executor).
    if (to === undefined || from === undefined) { ctx.moved = { piece: s.piece, at: to ?? s.to, byState: {} }; return true; }
    const prev = ctx.$space;
    // The chosen destination is the space context; with none chosen, the chosen source is.
    if (dest ?? src) ctx.$space = dest ?? src;
    runStep(game, { ...s, to, from }, ctx);
    ctx.$space = prev;
    return true;
  }
  return false;
}

function runStep(game, s, ctx) {
  const { state } = ctx;
  if (ctx.choose && chosenRun(game, s, ctx)) return;
  switch (s.op) {
    case "place": {
      const sp = spaceOf(s, ctx, "to");
      const pool = poolOf(state, s.piece);
      let n = Math.min(qty(s.count, ctx, pool[s.from], s.piece, s.state, s.from), roomIn(game, sp, s.piece));
      pool[s.from] -= n;
      addPieces(sp, s.piece, s.state ?? defaultOf(game, s.piece), n);
      // Placed moved pieces leave the moved count (taken from its states in order).
      if (s.count === "moved" && n > 0) for (const [st, k] of Object.entries(ctx.moved.byState)) {
        if (s.state !== undefined && st !== s.state) continue;
        const used = Math.min(k, n); ctx.moved.byState[st] -= used; n -= used;
      }
      return;
    }
    case "remove": {
      const sp = spaceOf(s, ctx, "space");
      // The fallback piece is used only when no primary piece is there (as the rule text says).
      const primary = onSpace(sp, s.piece, s.state) > 0 || !s.fallbackPiece;
      const pid = primary ? s.piece : s.fallbackPiece, st = primary ? s.state : undefined;
      // "moved" with no state removes the moved pieces in the states they moved in.
      const parts = s.count === "moved" && st === undefined ? (ctx.moved?.piece === pid ? Object.keys(ctx.moved.byState) : []) : [st];
      for (const ps of parts) {
        const got = takePieces(game, sp, pid, ps, qty(s.count, ctx, onSpace(sp, pid, ps), pid, ps, sp.id));
        poolOf(state, pid)[s.to] += got.reduce((t, [, c]) => t + c, 0);
        // Removed moved pieces leave the moved count.
        if (s.count === "moved") for (const [gs, k] of got) ctx.moved.byState[gs] -= k;
      }
      return;
    }
    case "flip": {
      const sp = spaceOf(s, ctx, "space");
      const n = qty(s.count, ctx, onSpace(sp, s.piece, s.from), s.piece, s.from, sp.id);
      takePieces(game, sp, s.piece, s.from, n);
      addPieces(sp, s.piece, s.to, n);
      // Moved pieces that flip keep counting as moved, in their new state.
      if (s.count === "moved" && n) { const b = ctx.moved.byState; b[s.from] -= n; b[s.to] = (b[s.to] ?? 0) + n; }
      return;
    }
    case "move": {
      if (s.to === "choose" || s.from === "choose") noChoice(s, "move");
      const dest = isPool(s.to) ? null : spaceOf({ ...s, filter: undefined }, ctx, "to");
      const sources = s.from === "adjacent"
        // "adjacent" is next to the space being resolved; with none (a scoring phase), next to the destination.
        ? neighbors(game.board.links, (ctx.$space ?? dest).id).map((id) => state.spaces[id]).sort((a, b) => a.name.localeCompare(b.name))
        : isPool(s.from) ? [] : [spaceOf({ ...s, filter: undefined }, ctx, "from")];
      // "moved" moves only the pieces at the place they moved to.
      const ok = (sp) => (s.count !== "moved" || sp.id === ctx.moved?.at) && (s.filter === undefined || !!evalExpr(s.filter, { ...ctx, $space: sp }));
      const from = isPool(s.from) ? s.from : sources.find(ok)?.id;
      const can = isPool(s.from) ? poolOf(state, s.piece)[s.from] : sources.filter(ok).reduce((t, sp) => t + onSpace(sp, s.piece, s.state), 0);
      let left = Math.min(qty(s.count, ctx, can, s.piece, s.state, from), dest ? roomIn(game, dest, s.piece) : Infinity);
      const byState = {};
      const put = (st, k) => { if (dest) addPieces(dest, s.piece, st, k); else poolOf(state, s.piece)[s.to] += k; byState[st] = (byState[st] ?? 0) + k; };
      if (isPool(s.from)) { poolOf(state, s.piece)[s.from] -= left; put(s.state ?? defaultOf(game, s.piece), left); left = 0; }
      // "moved" with no state moves the moved pieces in their own states; otherwise one pass.
      const passes = s.count === "moved" && s.state === undefined && ctx.moved?.piece === s.piece
        ? Object.entries(ctx.moved.byState).filter(([, n]) => n > 0) : [[s.state, left]];
      for (const [ps, want] of passes) {
        let need = Math.min(want, left);
        for (const sp of sources.filter(ok)) {
          if (!need) break;
          for (const [st, k] of takePieces(game, sp, s.piece, ps, need)) { put(st, k); left -= k; need -= k; }
        }
      }
      ctx.moved = { piece: s.piece, at: dest ? dest.id : s.to, byState };
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
    // The option for the enemy the action targets, else the first option (a player chooses on the table).
    case "choose": runSteps(game, runOption(s, ctx).steps, ctx); return;
    default: throw new Error(`Unknown effect op ${s.op}`);
  }
}

// Runs a scoring phase's steps. choose(filter, n) picks up to n spaces for each choice step.
export function runPhaseSteps(game, state, steps, choose) {
  runSteps(game, steps, { state, links: game.board.links, choose });
}

// The cost of an action in the chosen spaces.
// No space: no cost, also for a per-use cost.
export const costOf = (action, spaceIds) => (action.cost.amount > 0 && spaceIds.length ? (action.cost.per === "space" ? action.cost.amount * spaceIds.length : action.cost.amount) : 0);

// Gives back the cost of the dropped spaces: the cost for all chosen spaces minus the cost for the kept ones.
export function refundCost(game, state, action, chosenIds, keptIds) {
  const back = costOf(action, chosenIds) - costOf(action, keptIds);
  if (back) setTrack(game, state, action.cost.track, trackValue(game, state, action.cost.track) + back);
}

// A read-only view of the state with the cost of these spaces added back to the cost track,
// kept inside the track range (for legality checks that must not count the reserved cost).
// The real state is not changed.
export function withoutCost(game, state, action, spaceIds) {
  const back = costOf(action, spaceIds);
  if (!back) return state;
  const id = action.cost.track, t = game.tracks.find((x) => x.id === id);
  const v = clamp(trackValue(game, state, id) + back, t?.min, t?.max);
  const view = { ...state, tracks: { ...state.tracks, [id]: v }, resources: { ...state.resources } };
  for (const f of game.factions) if (f.resourceTrack === id) view.resources[f.id] = v;
  return view;
}

// Pays the cost of an action (in place).
export function payCost(game, state, action, spaceIds) {
  const total = costOf(action, spaceIds);
  if (total) setTrack(game, state, action.cost.track, trackValue(game, state, action.cost.track) - total);
}

// The option of a choice that runs: the one for the action's target, else the first option.
const runOption = (s, ctx) => (ctx.$target && s.options.find((o) => o.faction === ctx.$target)) || s.options[0];

// The legal-space condition when a bot runs the action: the action's targets and the legal spaces of
// the option each top-level choice will run (schema 1.6.0). A player before choosing sees the action's
// targets alone: the spaces legal against any enemy. The validator allows legal only at the top level.
export function legalityOf(action, extra = {}) {
  const legal = (action.steps ?? []).filter((s) => s.op === "choose").map((s) => runOption(s, extra).legal).filter((x) => x !== undefined);
  return legal.length ? { op: "and", args: [action.targets, ...legal] } : action.targets;
}

// Pays the action's cost (unless pay is false), then runs its steps once per chosen space
// (in the chosen order). Changes state in place. extra: { $target } when the action picked an enemy.
// targetOf: space id -> the target faction of the table step that picked it (schema 1.8.0).
export function applyAction(game, state, action, spaceIds, extra = {}, { pay = true, targetOf } = {}) {
  if (pay) payCost(game, state, action, spaceIds);
  for (const id of spaceIds) {
    const t = targetOf?.get(id);
    runSteps(game, action.steps, { state, links: game.board.links, $space: state.spaces[id], ...extra, ...(t ? { $target: t } : {}) });
  }
}
