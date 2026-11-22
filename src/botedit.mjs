// Bot graph editing and dry-run helpers. Pure functions on the game data.
import { deriveState, applyPatch } from "./state.mjs";
import { runCase } from "./dryrun.mjs";

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
    priorityTables: [{ id: t, scope: "space", select: "one", steps: [{ n: 1, text: "Any legal space.", filter: true }], tiebreak: [{ letter: "a", text: "Highest Pop.", key: { var: "$space.pop" }, order: "max" }] }],
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
export function addNode(bot, kind) {
  const n = { id: freeId(new Set(bot.nodes.map((x) => x.id)), `${prefixOf(bot)}.n`), kind, text: "", ...structuredClone(FIELDS[kind]) };
  for (const k of BRANCHES) if (n[k] === "") delete n[k];
  bot.nodes.push(n);
  return n;
}

// Removes the node and every branch that led to it. Returns the cleared branches as "node.branch".
export function deleteNode(bot, id) {
  bot.nodes = bot.nodes.filter((n) => n.id !== id);
  const cleared = [];
  for (const n of bot.nodes) for (const k of BRANCHES) if (n[k] === id) { delete n[k]; cleared.push(`${n.id}.${k}`); }
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
