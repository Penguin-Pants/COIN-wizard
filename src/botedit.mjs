// Bot graph editing and dry-run helpers. Pure functions on the game data.
import { deriveState, applyPatch } from "./state.mjs";
import { runCase, botNodes } from "./dryrun.mjs";

export const CASES = ["ineligible", "event-override", "no-target", "tie", "linked-sa", "fallback"];
const BRANCHES = ["yes", "no", "then", "onEmpty"];
const prefixOf = (bot) => (bot.start.includes(".") ? bot.start.slice(0, bot.start.indexOf(".")) : bot.code.toLowerCase());
const freeId = (taken, base) => { let n = 1; while (taken.has(`${base}${n}`)) n++; return `${base}${n}`; };

// A bot with a complete graph: eligible check, Event check, one Operation with a priority table, and end nodes.
// Only the six dry runs are missing. The designer edits it from there.
export function newBot(game, factionId) {
  const f = game.factions.find((x) => x.id === factionId);
  // Bot codes are 2 or 3 capital letters: the initials of a multi-word name, else its first two letters.
  const words = (f.name || f.id).toUpperCase().replace(/[^A-Z ]/g, "").split(/\s+/).filter(Boolean);
  const base = (words.length > 1 ? words.map((w) => w[0]).join("").slice(0, 3) : (words[0] ?? "BOT").slice(0, 2)).padEnd(2, "X");
  // With 3 or 4 factions, initials can repeat. Another bot's code (and node prefix) is never reused.
  const taken = new Set(game.bots.filter((b) => b.factionId !== factionId).map((b) => b.code));
  const letters = [...(words.join("") + "ABCDEFGHIJKLMNOPQRSTUVWXYZ")].filter((c) => /[A-Z]/.test(c));
  const code = !taken.has(base) ? base : [...letters.map((c) => base.slice(0, 2) + c), ...letters.map((c) => base[0] + c)].find((c) => !taken.has(c)) ?? base;
  const p = code.toLowerCase();
  const op = game.actions.find((a) => a.faction === factionId && a.kind === "operation");
  const t = `${p}.t1`;
  return {
    id: `bot.${factionId}`, factionId, code, objective: `Win as ${f.name}.`, measures: [],
    eventPolicy: { plain: "Play the unshaded side if the Event has an effect.", playIf: { var: "card.hasEffect" }, side: "unshaded", overrides: [] },
    start: `${p}.start`,
    nodes: [
      { id: `${p}.start`, kind: "condition", text: `Is ${f.name} Eligible?`, test: { var: "eligible" }, yes: `${p}.event`, no: `${p}.end-none` },
      { id: `${p}.end-none`, kind: "end", text: "Ineligible: take no action.", outcome: "none" },
      { id: `${p}.event`, kind: "event-check", text: "Event: apply the Event rules.", yes: `${p}.end-event`, no: `${p}.op` },
      { id: `${p}.end-event`, kind: "end", text: "Execute the Event.", outcome: "event" },
      { id: `${p}.op`, kind: "action", text: `${op ? op.name : "Operation"} in 1 space (priority table ${code}-1).`, ...(op ? { action: op.id } : {}), table: t, then: `${p}.end-op`, onEmpty: `${p}.pass` },
      { id: `${p}.end-op`, kind: "end", text: "Operation done.", outcome: "operation" },
      { id: `${p}.pass`, kind: "end", text: "Pass.", outcome: "pass" }
    ],
    priorityTables: [{ id: t, scope: "space", select: "one", mode: "sequence", steps: [{ n: 1, text: "Any legal space.", filter: true }], tiebreak: [{ letter: "a", text: "Highest Pop.", key: { var: "$space.pop" }, order: "max" }] }],
    randomization: { die: "d6", eligibleSet: "All spaces still tied after the lettered tie-breaks, in alphabetical order of space name.", procedure: "Roll one die. With N tied spaces, divide the faces into N equal groups in list order and use the group the roll falls in." },
    maxSteps: 12, dryRuns: []
  };
}

const FIELDS = {
  condition: { test: true, yes: "", no: "" },
  "event-check": { yes: "", no: "" },
  action: { then: "", onEmpty: "" },
  end: { outcome: "pass" }
};
// graph: the bot's own flowchart (default) or one side of a bot card (schema 1.12.0). Node ids are unique over the whole bot.
export function addNode(bot, kind, graph = bot) {
  const n = { id: freeId(new Set(botNodes(bot).map((x) => x.id)), `${prefixOf(bot)}.n`), kind, text: "", ...structuredClone(FIELDS[kind]) };
  for (const k of BRANCHES) if (n[k] === "") delete n[k];
  graph.nodes.push(n);
  return n;
}

// Removes the node and every branch that led to it. Returns the cleared branches as "node.branch".
// bot: a bot, or one side of a bot card: anything with nodes and start.
export function deleteNode(bot, id) {
  bot.nodes = bot.nodes.filter((n) => n.id !== id);
  const cleared = clearBranches(bot.nodes, id);
  if (bot.start === id) { bot.start = bot.nodes[0]?.id ?? ""; cleared.push("start"); }
  return cleared;
}

export function graphInfo(bot) {
  const byId = Object.fromEntries(bot.nodes.map((n) => [n.id, n]));
  const next = (n) => BRANCHES.map((k) => n[k]).filter((x) => x && byId[x]);
  const seen = new Set(), stack = [bot.start];
  while (stack.length) { const id = stack.pop(); if (seen.has(id) || !byId[id]) continue; seen.add(id); stack.push(...next(byId[id])); }
  const cycles = [], color = {};
  const dfs = (id) => { color[id] = 1; for (const x of next(byId[id])) { if (color[x] === 1) cycles.push(x); else if (!color[x]) dfs(x); } color[id] = 2; };
  if (byId[bot.start]) dfs(bot.start);
  return { unreachable: bot.nodes.filter((n) => !seen.has(n.id)).map((n) => n.id), cycles: [...new Set(cycles)] };
}

// Card bots (schema 1.12.0). A new card has one side, front "A", that passes. Ids are free over the whole bot.
export function addBotCard(bot) {
  const taken = new Set(botNodes(bot).map((x) => x.id)), cards = (bot.deck ??= { order: "cycle", cards: [] }).cards;
  const id = freeId(new Set(cards.map((c) => c.id)), "k"), start = freeId(taken, `${prefixOf(bot)}.${id}.n`);
  const card = { id, title: `Card ${cards.length + 1}`, sides: [{ id: "front", label: String.fromCharCode(65 + (cards.length % 26)), start, nodes: [{ id: start, kind: "end", text: "Pass.", outcome: "pass" }] }] };
  cards.push(card);
  // A dry run that sets the order lists every card, so the new card goes to the bottom.
  for (const d of bot.dryRuns ?? []) if (d.patch.botDeck?.order) d.patch.botDeck.order.push(id);
  return card;
}
// Removes a bot card and its id from every dry-run botDeck patch. The deck keeps at least one card.
export function deleteBotCard(bot, ci) {
  if (bot.deck.cards.length < 2) return;
  const [gone] = bot.deck.cards.splice(ci, 1);
  for (const d of bot.dryRuns) dropFromBotDeck(d.patch, gone.id, ["order", "flipped"]);
}
const dropFromBotDeck = (patch, id, keys) => {
  const bd = patch.botDeck;
  if (!bd) return;
  for (const k of keys) if (bd[k]) { bd[k] = bd[k].filter((x) => x !== id); if (!bd[k].length) delete bd[k]; }
  if (!Object.keys(bd).length) delete patch.botDeck;
};
// The back side doubles the front letter, as on the printed cards (A and AA).
export function addBack(bot, card) {
  const start = freeId(new Set(botNodes(bot).map((x) => x.id)), `${prefixOf(bot)}.${card.id}.n`);
  card.sides.push({ id: "back", label: card.sides[0].label.repeat(2), start, nodes: [{ id: start, kind: "end", text: "Pass.", outcome: "pass" }] });
}
// Removing the back clears every front branch that flipped, and the card from every dry-run botDeck.flipped.
// Returns the cleared branches.
export function deleteBack(bot, card) {
  card.sides.length = 1;
  for (const d of bot.dryRuns) dropFromBotDeck(d.patch, card.id, ["flipped"]);
  return clearBranches(card.sides[0].nodes, "$flip");
}
// A card bot: the deck starts with one card. Back to a flowchart bot: the deck goes, with every dry-run
// botDeck patch and every $draw branch.
export function setCardMode(bot, on) {
  if (on) { bot.mode = "cards"; if (!bot.deck) addBotCard(bot); return []; }
  delete bot.mode; delete bot.deck;
  for (const d of bot.dryRuns) delete d.patch.botDeck;
  return clearBranches(bot.nodes, "$draw");
}
// Deletes every branch to a node id or an exit. Returns the cleared branches as "node.branch".
const clearBranches = (nodes, to) => { const out = []; for (const n of nodes) for (const k of BRANCHES) if (n[k] === to) { delete n[k]; out.push(`${n.id}.${k}`); } return out; };

export const missingCases = (bot) => CASES.filter((c) => !bot.dryRuns.some((d) => d.case === c));

export function newDryRun(bot, kase) {
  const id = freeId(new Set(bot.dryRuns.map((d) => d.id)), `${prefixOf(bot)}.d`);
  return { id, case: kase, patch: kase === "ineligible" ? { eligible: { [bot.factionId]: false } } : {}, expect: { outcome: "none" } };
}

// Runs one dry run against the setup with its patch. Returns the result, or { error } when it cannot run.
export function runDry(game, bot, dry) {
  try { return runCase(game, bot, applyPatch(deriveState(game, bot.factionId), dry.patch), dry.case); } catch (e) { return { error: e.message }; }
}

// The expected block that a result satisfies. Empty parts are left out.
export function toExpect(r) {
  const e = { outcome: r.outcome };
  if (r.path?.length) e.path = [...r.path];
  if (r.chosen?.length) e.chosen = [...r.chosen];
  if (r.side) e.side = r.side;
  if (r.linked !== undefined) e.linked = r.linked;
  if (r.target) e.target = r.target;
  return e;
}
