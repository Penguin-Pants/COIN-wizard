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

// Picks by a priority table: the first step with any match wins, then the lettered tie-breaks,
// then a die over the rest in name order. items: spaces or factions. env(item): the expression context.
function pick(state, table, items, env, nameOf, limitOf) {
  if (!items.length) return [];
  const steps = [...table.steps].sort((a, b) => a.n - b.n);
  let pool = [];
  for (const st of steps) { pool = items.filter((it) => !!evalExpr(st.filter, env(it))); if (pool.length) break; }
  if (!pool.length) return [];
  const keyOf = (tb, it) => evalExpr(tb.key, env(it));
  const byN = (x, y) => nameOf(x).localeCompare(nameOf(y));
  if (table.select === "all") {
    const sorted = [...pool].sort((x, y) => { for (const tb of table.tiebreak) { const d = keyOf(tb, x) - keyOf(tb, y); if (d !== 0) return tb.order === "max" ? -d : d; } return byN(x, y); });
    return sorted.slice(0, limitOf(sorted.length));
  }
  for (const tb of table.tiebreak) {
    if (pool.length === 1) break;
    const keys = pool.map((it) => keyOf(tb, it));
    const best = tb.order === "max" ? Math.max(...keys) : Math.min(...keys);
    pool = pool.filter((it, i) => keys[i] === best);
  }
  if (pool.length === 1) return pool;
  pool.sort(byN);
  const die = rollDie(state);
  return [pool[Math.floor(((die - 1) * pool.length) / 6)]];
}

// Selects spaces. extra: { $target } when the action node picked an enemy first.
export function selectByTable(game, state, table, legal, action, extra = {}) {
  const env = (sp) => ({ state, links: game.board.links, $space: sp, ...extra });
  const limitOf = (n) => {
    let limit = Math.min(table.limit ?? n, action.maxSpaces ?? Infinity);
    if (action.cost.per === "space" && action.cost.amount > 0) limit = Math.min(limit, Math.floor(state.resources[state.self] / action.cost.amount));
    return limit;
  };
  return pick(state, table, legal, env, (sp) => sp.name, limitOf);
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
    if (sel.length) { applyAction(game, state, sa, sel.map((s) => s.id), extra); return `${sa.id}:${sel.map((s) => s.id).join(",")}`; }
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
  const legal = legalityOf(action, extra);
  const legalNow = () => Object.values(state.spaces).filter((sp) => !!evalExpr(legal, { ...ctx, $space: sp, ...extra }));
  // New spaces a part may still pay for. Spaces already paid for are free.
  const canNew = () => {
    const have = state.resources[state.self];
    if (amount === 0) return Infinity;
    if (per === "use") return paid.size || have >= amount ? Infinity : 0;
    return Math.floor(have / amount);
  };
  const pool = () => { const n = canNew(); return legalNow().filter((sp) => n > 0 || paid.has(sp.id)); };
  const env = (sp) => ({ ...ctx, $space: sp, ...extra });
  const anyMatch = (pt) => { const p = pool(); return tables[pt.table].steps.some((st) => p.some((sp) => !!evalExpr(st.filter, env(sp)))); };
  const before = links[0]?.timing === "before";
  if (before) {
    if (!node.parts.some(anyMatch)) return false;
    result.linked = runLinked(game, state, links, actions, tables, ctx, extra);
  }
  const chosen = [];
  for (const pt of node.parts) {
    const t = tables[pt.table], p = pool();
    // The table ranks the pool; then new spaces stop at what is left to pay.
    const ranked = selectByTable(game, state, t.select === "all" ? { ...t, limit: p.length || 1 } : t, p, { cost: { amount: 0 } }, extra);
    let room = canNew();
    const picked = [];
    for (const sp of ranked) {
      if (t.select === "all" && picked.length >= t.limit) break;
      if (!paid.has(sp.id)) { if (room <= 0) continue; room--; if (per === "space" || !paid.size) payCost(game, state, action, [sp.id]); paid.add(sp.id); }
      picked.push(sp.id);
    }
    applyAction(game, state, { ...action, steps: pt.steps }, picked, extra, { pay: false });
    for (const id of picked) if (!chosen.includes(id)) chosen.push(id);
  }
  if (!before && !chosen.length) return false;
  result.path.push(node.id);
  result.chosen = chosen;
  if (extra.$target) result.target = extra.$target;
  if (links.length && !before) result.linked = runLinked(game, state, links, actions, tables, ctx, extra);
  return true;
}

export function runBot(game, bot, startState) {
  const state = structuredClone(startState);
  state.self = bot.factionId;
  // A dry-run patch may set card.lasting; otherwise it comes from the deck.
  if (state.card) state.card.lasting ??= cardLasting(game, bot, state.card.id);
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
      // A linked Special Activity with timing "before" resolves on the board before the Operation;
      // "after" and "during" resolve after the Operation's steps.
      // A before-timed Special Activity must leave enough for the Operation: the Operation's cost
      // is paid first, so the Special Activity's affordability check sees what is left.
      // A list of linked Special Activities is tried in order (one timing per list): the first
      // entry whose trigger holds and whose table finds a space runs.
      const links = linkedOf(node);
      const before = links[0]?.timing === "before";
      if (before) payCost(game, state, action, result.chosen);
      else applyAction(game, state, action, result.chosen, extra);
      if (links.length) result.linked = runLinked(game, state, links, actions, tables, ctx, extra);
      if (before) {
        // Spaces the Special Activity made illegal are dropped and their cost is refunded. The
        // recheck reads a view without the Operation's own reserved cost.
        const view = withoutCost(game, state, action, result.chosen);
        const legalNow = (id) => !!evalExpr(legalityOf(action, extra), { state: view, links: game.board.links, $space: view.spaces[id], ...extra });
        const kept = result.chosen.filter(legalNow);
        refundCost(game, state, action, result.chosen, kept);
        result.chosen = kept;
        applyAction(game, state, action, kept, extra, { pay: false });
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
  // As in runBot: a dry-run patch may set card.lasting; otherwise it comes from the deck.
  if (state.card) state.card.lasting ??= cardLasting(game, bot, state.card.id);
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
