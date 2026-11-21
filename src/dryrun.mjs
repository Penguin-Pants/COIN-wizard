// Walk a bot decision graph against a board state. An action pays its cost and runs its
// effect steps on the dry-run state (src/effects.mjs) before its linked Special Activity
// and before the next node, so each sees the board the action left.
import { evalExpr } from "./expr.mjs";
import { applyAction, payCost, refundCost, withoutCost } from "./effects.mjs";


function affordable(state, action, game) {
  const f = game.factions.find((x) => x.id === state.self);
  const have = state.resources[f.id];
  return action.cost.amount === 0 || have >= action.cost.amount;
}

function legalSpaces(game, state, action, extra = {}) {
  if (!affordable(state, action, game)) return [];
  const ctx = (sp) => ({ state, links: game.board.links, $space: sp, ...extra });
  return Object.values(state.spaces).filter((sp) => !!evalExpr(action.targets, ctx(sp)));
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

export function runBot(game, bot, startState) {
  const state = structuredClone(startState);
  state.self = bot.factionId;
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
      const before = node.linked?.timing === "before";
      if (before) payCost(game, state, action, result.chosen);
      else applyAction(game, state, action, result.chosen, extra);
      if (node.linked) {
        const sa = actions[node.linked.action];
        let hit = null;
        if (evalExpr(node.linked.trigger, { ...ctx, ...extra })) {
          const sel = selectByTable(game, state, tables[node.linked.table], legalSpaces(game, state, sa, extra), sa, extra);
          if (sel.length) { hit = `${sa.id}:${sel.map((s) => s.id).join(",")}`; applyAction(game, state, sa, sel.map((s) => s.id), extra); }
        }
        result.linked = hit ?? "skipped";
      }
      if (before) {
        // Spaces the Special Activity made illegal are dropped and their cost is refunded. The
        // recheck reads a view without the Operation's own reserved cost.
        const view = withoutCost(game, state, action, result.chosen);
        const legalNow = (id) => !!evalExpr(action.targets, { state: view, links: game.board.links, $space: view.spaces[id], ...extra });
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
