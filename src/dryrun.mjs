// Walk a bot decision graph against a board state. An action pays its cost and runs its
// effect steps on the dry-run state (src/effects.mjs) before its linked Special Activity
// and before the next node, so each sees the board the action left.
import { evalExpr } from "./expr.mjs";
import { applyAction, payCost, refundCost, withoutCost, runPhaseSteps, legalityOf } from "./effects.mjs";


// A node's linked Special Activities as a list: none, one object or a list (schema 1.5.0).
export const linkedOf = (node) => (node?.linked == null ? [] : [node.linked].flat());

// card.lasting: the lasting value ("momentum", "capability" or "none") of the side this bot
// plays for the card, which is the override's side, else the Event policy side (schema 1.5.0).
export function cardLasting(game, bot, cardId) {
  const side = bot.eventPolicy.overrides.find((o) => o.cardId === cardId)?.side ?? bot.eventPolicy.side;
  return game.deck.cards.find((c) => c.id === cardId)?.sides?.find((s) => s.id === side)?.lasting ?? "none";
}

// card.position (schema 1.8.0): this faction's place in the card's faction order, 1 for first, 0 if not listed.
export const cardPosition = (game, fid, cardId) => (game.deck.cards.find((c) => c.id === cardId)?.order ?? []).indexOf(fid) + 1;
// Dry-run patches may set card.lasting and card.position; otherwise they come from the deck.
function cardFields(game, bot, state) {
  if (!state.card) return;
  state.card.lasting ??= cardLasting(game, bot, state.card.id);
  state.card.position ??= cardPosition(game, bot.factionId, state.card.id);
}

function affordable(state, action, game) {
  const f = game.factions.find((x) => x.id === state.self);
  const have = state.resources[f.id];
  return action.cost.amount === 0 || have >= action.cost.amount;
}

function legalSpaces(game, state, action, extra = {}) {
  if (!affordable(state, action, game)) return [];
  const ctx = (sp) => ({ state, links: game.board.links, $space: sp, ...extra });
  const legal = legalityOf(action, extra);
  return Object.values(state.spaces).filter((sp) => !!evalExpr(legal, ctx(sp)));
}

function rollDie(state) {
  if (!state.dice.length) throw new Error("A die roll is needed but no explicit die result was supplied");
  return state.dice.shift();
}

// Picks by a priority table: the first step with any match wins (mode "sequence": see below), then the lettered tie-breaks,
// then a die over the rest in name order. items: spaces or factions. env(item, step): the expression context.
// itemsOf(step): the items that step may pick (default: all). The result carries targetOf: item id -> the
// target faction of the step that picked it (schema 1.8.0, steps with a target only).
function pick(state, table, items, env, nameOf, limitOf, itemsOf = () => items) {
  const steps = [...table.steps].sort((a, b) => a.n - b.n);
  const tag = (list, stOf) => { const out = [...list]; out.targetOf = new Map(); for (const it of out) { const t = stOf(it)?.target; if (t) out.targetOf.set(it.id, t); } return out; };
  const match = (st) => itemsOf(st).filter((it) => !!evalExpr(st.filter, env(it, st)));
  let pool = [], hit = null;
  for (const st of steps) { pool = match(st); if (pool.length) { hit = st; break; } }
  if (!pool.length) return tag([], () => null);
  const keyOf = (tb, it, st) => evalExpr(tb.key, env(it, st));
  const byN = (x, y) => nameOf(x).localeCompare(nameOf(y));
  // A step's own tie-breaks (1.7.0) replace the table's for that step's matches.
  const tbsOf = (st) => st?.tiebreak ?? table.tiebreak;
  const cmpFor = (st) => (x, y) => { for (const tb of tbsOf(st)) { const d = keyOf(tb, x, st) - keyOf(tb, y, st); if (d !== 0) return tb.order === "max" ? -d : d; } return byN(x, y); };
  // Mode "sequence" (schema 1.7.0, the GMT reading): every row in order, each row's matches in
  // tie-break order, until the limit. Mode "first" (default): only the first row with a match.
  if (table.select === "all" && table.mode === "sequence") {
    const out = [], by = new Map();
    for (const st of steps) for (const it of match(st).filter((x) => !out.includes(x)).sort(cmpFor(st))) { out.push(it); by.set(it, st); }
    return tag(out.slice(0, limitOf(out.length)), (it) => by.get(it));
  }
  if (table.select === "all") {
    const sorted = [...pool].sort(cmpFor(hit));
    return tag(sorted.slice(0, limitOf(sorted.length)), () => hit);
  }
  for (const tb of tbsOf(hit)) {
    if (pool.length === 1) break;
    const keys = pool.map((it) => keyOf(tb, it, hit));
    const best = tb.order === "max" ? Math.max(...keys) : Math.min(...keys);
    pool = pool.filter((it, i) => keys[i] === best);
  }
  if (pool.length === 1) return tag(pool, () => hit);
  pool.sort(byN);
  const die = rollDie(state);
  return tag([pool[Math.floor(((die - 1) * pool.length) / 6)]], () => hit);
}

// Selects spaces. extra: { $target } when the action node picked an enemy first.
// A step with a target (schema 1.8.0) reads that target, and picks only from the spaces where the
// action is legal against it.
// poolFor(step): optional; the caller's own pool for a step with a target (action-node parts).
export function selectByTable(game, state, table, legal, action, extra = {}, poolFor) {
  const env = (sp, st) => ({ state, links: game.board.links, $space: sp, ...extra, ...(st?.target ? { $target: st.target } : {}) });
  // The step's pool starts from every space: a space illegal against the node's target (or the
  // first enemy option) may be legal against the step's own target. Affordability still applies.
  const itemsOf = (st) => {
    if (st.target && poolFor) return poolFor(st);
    if (!st.target || !action.steps) return legal;
    if (!affordable(state, action, game)) return [];
    const lg = legalityOf(action, { ...extra, $target: st.target });
    return Object.values(state.spaces).filter((sp) => !!evalExpr(lg, env(sp, st)));
  };
  const limitOf = (n) => {
    let limit = Math.min(table.limit ?? n, action.maxSpaces ?? Infinity);
    if (action.cost.per === "space" && action.cost.amount > 0) limit = Math.min(limit, Math.floor(state.resources[state.self] / action.cost.amount));
    return limit;
  };
  return pick(state, table, legal, env, (sp) => sp.name, limitOf, itemsOf);
}

// Picks one enemy faction by an opponent table. Returns its id or null.
export function selectOpponent(game, state, table) {
  const enemies = game.factions.filter((f) => f.id !== state.self);
  const env = (f) => ({ state, links: game.board.links, $faction: f.id });
  return pick(state, { ...table, select: "one" }, enemies, env, (f) => f.name, () => 1)[0]?.id ?? null;
}

function eventDecision(bot, state, game) {
  const ctx = { state, links: game.board.links };
  const card = state.card;
  const ov = bot.eventPolicy.overrides.find((o) => o.cardId === card.id);
  if (ov) {
    if (ov.directive === "ignore") return { play: false };
    if (ov.directive === "force") return { play: !!card.hasEffect, side: ov.side ?? bot.eventPolicy.side };
    if (ov.directive === "conditional") return { play: !!card.hasEffect && !!evalExpr(ov.when, ctx), side: ov.side ?? bot.eventPolicy.side };
  }
  return { play: !!evalExpr(bot.eventPolicy.playIf, ctx), side: bot.eventPolicy.side };
}

// Tries a node's linked Special Activities in order (first trigger that holds and finds a space runs).
function runLinked(game, state, links, actions, tables, ctx, extra) {
  for (const L of links) {
    const sa = actions[L.action];
    if (!evalExpr(L.trigger, { ...ctx, ...extra })) continue;
    const sel = selectByTable(game, state, tables[L.table], legalSpaces(game, state, sa, extra), sa, extra);
    if (sel.length) { applyAction(game, state, sa, sel.map((s) => s.id), extra, { targetOf: sel.targetOf }); return `${sa.id}:${sel.map((s) => s.id).join(",")}`; }
  }
  return "skipped";
}

// Action node parts (docs/SCHEMA.md, "Action node parts", rules 1 to 8). Each part picks spaces with
// its own table from the Operation's legal spaces, on the board the earlier parts left, and runs its
// own steps there. Cost: once per distinct space (per "space"), or once on the first pick (per "use").
// Returns false when the node is empty (no part picked; with timing "before", no part could pick).
function runParts(game, state, node, action, tables, actions, extra, result) {
  const links = linkedOf(node), ctx = { state, links: game.board.links };
  const { amount, per } = action.cost, paid = new Set();
  // Each part runs its own steps, so the legal spaces of its own enemy option apply (schema 1.6.0).
  // ex: the node's extra, or a step's own target (schema 1.8.0).
  const legalNow = (pt, ex = extra) => { const legal = legalityOf({ ...action, steps: pt.steps }, ex); return Object.values(state.spaces).filter((sp) => !!evalExpr(legal, { ...ctx, $space: sp, ...ex })); };
  // New spaces a part may still pay for. Spaces already paid for are free.
  const canNew = () => {
    const have = state.resources[state.self];
    if (amount === 0) return Infinity;
    if (per === "use") return paid.size || have >= amount ? Infinity : 0;
    return Math.floor(have / amount);
  };
  const pool = (pt, ex = extra) => { const n = canNew(); return legalNow(pt, ex).filter((sp) => n > 0 || paid.has(sp.id)); };
  const exOf = (st) => (st.target ? { ...extra, $target: st.target } : extra);
  // The precheck reads each step as the selection does: with its own target and its own legal spaces.
  const anyMatch = (pt) => tables[pt.table].steps.some((st) => { const ex = exOf(st); return pool(pt, ex).some((sp) => !!evalExpr(st.filter, { ...ctx, $space: sp, ...ex })); });
  const before = links[0]?.timing === "before";
  if (before) {
    if (!node.parts.some(anyMatch)) return false;
    result.linked = runLinked(game, state, links, actions, tables, ctx, extra);
  }
  const chosen = [], targets = {};
  for (const pt of node.parts) {
    const t = tables[pt.table], p = pool(pt);
    // The table ranks the pool; then new spaces stop at what is left to pay.
    // A step with a target ranks the spaces legal against that target, under the same payment rules.
    const ranked = selectByTable(game, state, t.select === "all" ? { ...t, limit: Object.values(state.spaces).length } : t, p, { cost: { amount: 0 } }, extra, (st) => pool(pt, exOf(st)));
    let room = canNew();
    const picked = [];
    for (const sp of ranked) {
      if (t.select === "all" && picked.length >= t.limit) break;
      if (!paid.has(sp.id)) { if (room <= 0) continue; room--; if (per === "space" || !paid.size) payCost(game, state, action, [sp.id]); paid.add(sp.id); }
      picked.push(sp.id);
    }
    applyAction(game, state, { ...action, steps: pt.steps }, picked, extra, { pay: false, targetOf: ranked.targetOf });
    for (const id of picked) { if (!chosen.includes(id)) chosen.push(id); const t = ranked.targetOf?.get(id); if (t) targets[id] = t; }
  }
  if (!before && !chosen.length) return false;
  result.path.push(node.id);
  result.chosen = chosen;
  // Steps with their own target (schema 1.8.0), as for an action node without parts.
  if (Object.keys(targets).length) result.targets = targets; else delete result.targets;
  if (extra.$target) result.target = extra.$target;
  if (links.length && !before) result.linked = runLinked(game, state, links, actions, tables, ctx, extra);
  return true;
}

export function runBot(game, bot, startState) {
  const state = structuredClone(startState);
  state.self = bot.factionId;
  cardFields(game, bot, state);
  const nodes = Object.fromEntries(bot.nodes.map((n) => [n.id, n]));
  const tables = Object.fromEntries(bot.priorityTables.map((t) => [t.id, t]));
  const actions = Object.fromEntries(game.actions.map((a) => [a.id, a]));
  const ctx = { state, links: game.board.links };
  const result = { path: [], chosen: [], linked: undefined, side: undefined, outcome: undefined, target: undefined };
  let cur = bot.start;
  for (let i = 0; i <= bot.maxSteps; i++) {
    if (i === bot.maxSteps) throw new Error(`Bot ${bot.id} did not terminate within ${bot.maxSteps} steps`);
    const node = nodes[cur];
    if (!node) throw new Error(`Bot ${bot.id}: missing node ${cur}`);
    if (node.kind === "condition") {
      result.path.push(node.id);
      cur = evalExpr(node.test, ctx) ? node.yes : node.no;
    } else if (node.kind === "event-check") {
      result.path.push(node.id);
      const d = eventDecision(bot, state, game);
      if (d.play) result.side = d.side;
      cur = d.play ? node.yes : node.no;
    } else if (node.kind === "action") {
      const action = actions[node.action];
      // An action with a target picks the enemy first. No enemy qualifies: the same as no space.
      const target = node.target ? selectOpponent(game, state, tables[node.target]) : null;
      if (node.target && !target) { result.path.push(`${node.id}:empty`); cur = node.onEmpty; continue; }
      const extra = target ? { $target: target } : {};
      if (node.parts) {
        if (!runParts(game, state, node, action, tables, actions, extra, result)) { result.path.push(`${node.id}:empty`); cur = node.onEmpty; continue; }
        cur = node.then;
        continue;
      }
      const legal = legalSpaces(game, state, action, extra);
      const chosen = selectByTable(game, state, tables[node.table], legal, action, extra);
      if (!chosen.length) { result.path.push(`${node.id}:empty`); cur = node.onEmpty; continue; }
      result.path.push(node.id);
      result.chosen = chosen.map((s) => s.id);
      if (target) result.target = target;
      // Steps with their own target (schema 1.8.0): each chosen space with the faction it acts against.
      // A later node replaces the earlier node's spaces, so its targets go too.
      if (chosen.targetOf?.size) result.targets = Object.fromEntries(chosen.targetOf); else delete result.targets;
      const targetOf = chosen.targetOf;
      // A linked Special Activity with timing "before" resolves on the board before the Operation;
      // "after" and "during" resolve after the Operation's steps.
      // A before-timed Special Activity must leave enough for the Operation: the Operation's cost
      // is paid first, so the Special Activity's affordability check sees what is left.
      // A list of linked Special Activities is tried in order (one timing per list): the first
      // entry whose trigger holds and whose table finds a space runs.
      const links = linkedOf(node);
      const before = links[0]?.timing === "before";
      if (before) payCost(game, state, action, result.chosen);
      else applyAction(game, state, action, result.chosen, extra, { targetOf });
      if (links.length) result.linked = runLinked(game, state, links, actions, tables, ctx, extra);
      if (before) {
        // Spaces the Special Activity made illegal are dropped and their cost is refunded. The
        // recheck reads a view without the Operation's own reserved cost.
        const view = withoutCost(game, state, action, result.chosen);
        // Each space is checked against its own step target (schema 1.8.0), else the node's.
        const legalNow = (id) => { const ex = targetOf?.get(id) ? { ...extra, $target: targetOf.get(id) } : extra; return !!evalExpr(legalityOf(action, ex), { state: view, links: game.board.links, $space: view.spaces[id], ...ex }); };
        const kept = result.chosen.filter(legalNow);
        refundCost(game, state, action, result.chosen, kept);
        result.chosen = kept;
        // Report targets only for the spaces the Operation still runs in.
        if (result.targets) { result.targets = Object.fromEntries(Object.entries(result.targets).filter(([id]) => kept.includes(id))); if (!Object.keys(result.targets).length) delete result.targets; }
        applyAction(game, state, action, kept, extra, { pay: false, targetOf });
      }
      cur = node.then;
    } else if (node.kind === "end") {
      result.path.push(node.id);
      result.outcome = node.outcome === "operation" && result.linked && result.linked !== "skipped" ? "operationSpecial" : node.outcome;
      return result;
    }
  }
  throw new Error("unreachable");
}

// Dry-run case "scoring": runs each phase that bot.scoring names, in rules order. Every step in it
// that needs a space picks with that entry's table: up to the step's "spaces" (1 for "choose"),
// capped by the table. path: the phase ids. chosen: every chosen space, in order. outcome: none.
export function runScoring(game, bot, startState) {
  const state = structuredClone(startState);
  state.self = bot.factionId;
  const tables = Object.fromEntries(bot.priorityTables.map((t) => [t.id, t]));
  cardFields(game, bot, state);
  const result = { path: [], chosen: [], linked: undefined, side: undefined, outcome: "none", target: undefined };
  for (const ph of game.rules.scoring.phases) {
    const sc = (bot.scoring ?? []).find((x) => x.phaseId === ph.id);
    if (!sc) continue;
    result.path.push(ph.id);
    const choose = (filter, n) => {
      const legal = Object.values(state.spaces).filter((sp) => filter === undefined || !!evalExpr(filter, { state, links: game.board.links, $space: sp }));
      const sel = selectByTable(game, state, tables[sc.table], legal, { cost: { amount: 0 }, maxSpaces: n });
      result.chosen.push(...sel.map((sp) => sp.id));
      return sel;
    };
    runPhaseSteps(game, state, ph.steps, choose);
  }
  return result;
}

// Runs one dry-run case: "scoring" runs the scoring phases, every other case the decision graph.
export const runCase = (game, bot, state, kase) => (kase === "scoring" ? runScoring : runBot)(game, bot, state);
