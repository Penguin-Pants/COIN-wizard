// Claude suggests the parts of Step 4 (rules, deck, victory, bots) from the read sources.
// Each fill function fills only what is still empty or at its default, and keeps an item only when
// the validator finds no new problem in it. Everything not used is reported.
import { chunkText } from "./sources.mjs";
import { OPS } from "./ops.mjs";
import { VAR_OK } from "./expr.mjs";
import { validate } from "./validate.mjs";
import { addCard, buildPiles } from "./deck.mjs";
import { newBot } from "./botedit.mjs";
import { victoryFor } from "./presets.mjs";

export const PARTS = ["rules", "deck", "victory", "bots"];
export const RULE_SECTIONS = ["overview", "components", "setup", "sequence", "operations", "events", "scoring", "victory"];
const MAX_EVENTS = 30, MAX_SCORING = 6;

const KIND_TEXT = {
  piece: "piece id", state: "state of that piece", track: "track id", marker: "marker id", qty: "count: integer, \"all\", \"any\" or an expression",
  amount: "integer or expression", int: "integer", spaces: "how many spaces (integer of 1 or more)", where: "\"$space\", \"choose\" or a space id",
  pool: "\"available\" or \"outOfPlay\"", loc: "\"$space\", \"choose\", \"adjacent\", \"available\", \"outOfPlay\" or a space id", cond: "condition expression",
  attr: "\"opinion\"", toward: "\"support\" or \"opposition\"", die: "\"d6\"", varname: "lowercase name", scalar: "number, text or true/false",
  steps: "list of steps", options: "list of {label, steps}"
};
const opsText = () => Object.entries(OPS).map(([op, { req, opt }]) => `${op}: ${Object.entries(req).map(([k, v]) => `${k} (${KIND_TEXT[v]})`).join(", ")}${Object.keys(opt).length ? `; optional ${Object.entries(opt).map(([k, v]) => `${k} (${KIND_TEXT[v]})`).join(", ")}` : ""}`).join("\n");
// Arguments as src/expr.mjs evaluates them. sumSpaces takes one value, read once per space.
const EXPR_TEXT = `Expressions: a number, true/false, {"var":"name"} or {"op":"name","args":[...]}. Ops: and, or, not, eq, ne, gt, gte, lt, lte, add, sub, mul, min, max; count [piece id, space id or "$space" or "*", state or "*"]; adjCount [piece id, space id or "$space", state or "*"]: pieces in the adjacent spaces; sumSpaces [value]: the sum of value over every space, with $space as that space (true counts 1); to sum Pop where a condition holds use {"op":"sumSpaces","args":[{"op":"mul","args":[condition, {"var":"$space.pop"}]}]}; anySpace [condition]; attr [space id, attribute name]; factionCount [faction id, space or "*", state or "*"]. Variables match ${VAR_OK.source.replace(/\\/g, "")}.`;

function material(game, texts) {
  const srcs = game.brief.sources.filter((s) => s.status === "read" && texts[s.id]);
  if (!srcs.length) throw new Error("No source text yet. Mark a source read in Step 1, or paste its text.");
  return srcs.map((s) => chunkText(s.id, texts[s.id]).slice(0, 2).map((c) => `SOURCE ${s.id} (${s.url}), characters ${c.start} to ${c.end}:\n${c.text}`).join("\n\n")).join("\n\n");
}
function context(g) {
  const o = g.brief.overview;
  return `You help design a COIN-style board game about: ${g.meta.title}. ${g.brief.conflict}
Start of the game: ${o.period || "not set"}. Paraphrase the sources, never copy sentences.
Factions: ${g.factions.map((f) => `${f.id} (${f.name}, ${f.type})`).join("; ")}.
Pieces: ${g.factions.flatMap((f) => f.pieces.map((p) => `${p.id} (${p.name} of ${f.id}, states ${p.states.join("/")})`)).join("; ")}.
Spaces: ${g.board.spaces.map((s) => `${s.id} (${s.name}, ${s.type}, Pop ${s.attrs.pop})`).join("; ")}.
Tracks: ${g.tracks.map((t) => `${t.id} (${t.name}, ${t.min} to ${t.max})`).join("; ")}.
Actions: ${g.actions.map((a) => `${a.id} (${a.name}, ${a.kind} of ${a.faction})`).join("; ") || "none yet"}.`;
}

const ASK = {
  rules: (g) => `Write the rulebook text and the scoring phases.
Rulebook sections, plain text, 1 to 4 sentences each: ${RULE_SECTIONS.join(", ")}.
Scoring: the name of the scoring card (for example a period-fitting word) and 3 to 5 phases in order, each with a short text and effect steps where the effect is automatic.
Effect steps, one object each with "op" and these fields:
${opsText()}
${EXPR_TEXT}
Return only JSON: {"text":{"overview":"",...},"scoring":{"name":"","phases":[{"name":"","text":"","steps":[]}]},"notes":""}`,
  deck: (g) => `Write Event cards drawn from real events, people and policies in the sources. Give ${Math.max(8, Math.min(MAX_EVENTS, 6 * g.factions.length))} cards.
Each card: a title, one line of flavor text, the faction order (each faction id once, left acts first), and two sides. Unshaded helps the state side (${g.factions.filter((f) => f.type === "state").map((f) => f.id).join(", ") || "none"}), shaded helps its opponents.
Each side: a short label, plain rules text and effect steps that do exactly what the text says. Use only the piece, space and track ids above.
Effect steps, one object each with "op" and these fields:
${opsText()}
${EXPR_TEXT}
Also give the scoring card title and how many scoring cards (2 to ${MAX_SCORING}); the last one ends the game.
Return only JSON: {"events":[{"title":"","flavor":"","order":[],"unshaded":{"label":"","text":"","steps":[]},"shaded":{"label":"","text":"","steps":[]}}],"scoringTitle":"","scoringCards":3,"notes":""}`,
  victory: (g) => `Write a victory condition for each faction that fits its aims in the sources: plain text, a score formula and the threshold the score must reach.
${EXPR_TEXT}
Return only JSON: {"perFaction":[{"factionId":"","plain":"","formula":0,"threshold":0}],"checkAt":"","finalScoring":"","tieBreaks":[""],"notes":""}`,
  bots: (g) => `Write a solo bot for each faction: what it tries to do, when it plays an Event, and how it picks the space for its Operation.
priorities: 1 to 4 rules in order (first match wins), each a short text and a condition on the space ($space.id, $space.pop, $space.opinion, count of pieces in "$space").
tiebreak: one rule with text, a value expression and "max" or "min".
${EXPR_TEXT}
eventPlain is the rule in words; eventSide ("unshaded" or "shaded") and playIf (a condition on the card: card.hasEffect, card.raisesSelf, card.lowersEnemy, card.lasting, card.id) must do exactly what it says.
Return only JSON: {"bots":[{"factionId":"","objective":"","eventPlain":"","eventSide":"unshaded","playIf":{"var":"card.hasEffect"},"priorities":[{"text":"","filter":true}],"tiebreak":{"text":"","key":{"var":"$space.pop"},"order":"max"}}],"notes":""}`
};

export function step4Prompt(part, game, texts) {
  const m = material(game, texts);
  return `${context(game)}\n\n${ASK[part](game)}\n\n${m}`;
}


// The problems the validator finds under a path. Missing dry runs are expected for a new bot.
const problems = (g, prefix) => validate(g).errors.filter((e) => (e.path === prefix || e.path.startsWith(`${prefix}/`)) && e.code !== "dry-run-missing");
// Applies put to a trial copy; true when it adds no problem under the path that the base trial
// (by default: no change) does not already have. A new bot is compared with the default bot, so a
// problem that the designer still has to fix anyway (such as a missing Operation) does not count.
const keys = (g, prefix) => new Set(problems(g, prefix).map((e) => `${e.code} ${e.path} ${e.message}`));
function fits(g, prefix, put, base = () => {}) {
  const t = structuredClone(g), b = structuredClone(g); put(t); base(b);
  const before = keys(b, prefix);
  return [...keys(t, prefix)].every((k) => before.has(k));
}
const str = (v) => (typeof v === "string" ? v.trim() : "");
const arr = (v) => (Array.isArray(v) ? v : []);

function fillRules(g, r, rep) {
  for (const k of RULE_SECTIONS) {
    const v = str(r?.text?.[k]); if (!v) continue;
    if (str(g.rules.text[k])) rep.skipped.push(`Rulebook ${k}: kept your text`);
    else { g.rules.text[k] = v; rep.added.push(`Rulebook ${k}`); }
  }
  const phases = arr(r?.scoring?.phases);
  if (g.rules.scoring.phases.length) { if (phases.length) rep.skipped.push("Scoring phases: kept your phases"); return; }
  if (str(r?.scoring?.name)) g.rules.scoring.name = str(r.scoring.name);
  phases.slice(0, 6).forEach((p, i) => {
    const name = str(p?.name); if (!name) { rep.dropped.push("A scoring phase with no name"); return; }
    const ph = { id: `ph${g.rules.scoring.phases.length + 1}`, name, text: str(p.text), steps: arr(p.steps) };
    const at = `/rules/scoring/phases/${g.rules.scoring.phases.length}`;
    if (!fits(g, at, (t) => t.rules.scoring.phases.push(ph))) { rep.dropped.push(`Effects of scoring phase ${name} (not valid; the text is kept)`); ph.steps = []; }
    g.rules.scoring.phases.push(ph); rep.added.push(`Scoring phase ${name}`);
  });
}

function fillDeck(g, r, rep) {
  const ids = g.factions.map((f) => f.id);
  const hadDeck = g.deck.cards.length > 0;
  for (const e of arr(r?.events).slice(0, MAX_EVENTS)) {
    const title = str(e?.title); if (!title) { rep.dropped.push("An Event card with no title"); continue; }
    const c = addCard(g, "event"); c.title = title;
    if (str(e.flavor)) c.flavor = str(e.flavor);
    const order = arr(e.order);
    if (order.length === ids.length && new Set(order).size === ids.length && order.every((x) => ids.includes(x))) c.order = [...order];
    else rep.dropped.push(`Faction order of ${title} (set to the default order)`);
    const at = `/deck/cards/${g.deck.cards.length - 1}`, getCard = (t) => t.deck.cards[t.deck.cards.length - 1];
    c.sides.forEach((s, j) => {
      const src = e[s.id] ?? {};
      s.label = str(src.label); s.text = str(src.text); s.steps = arr(src.steps);
      if (!fits(g, `${at}/sides/${j}`, () => {}, (t) => { getCard(t).sides[j].steps = []; })) { rep.dropped.push(`Effects of ${title}, ${s.id} side (not valid; the text is kept)`); s.steps = []; }
    });
    rep.added.push(`Event card ${c.id}: ${title}`);
  }
  if (hadDeck) { if (r?.scoringCards) rep.skipped.push("Scoring cards and piles: kept yours. Put the new cards in a pile."); return; }
  const events = g.deck.cards.filter((c) => c.type === "event").length;
  const n = Math.max(1, Math.min(MAX_SCORING, Number.isInteger(r?.scoringCards) ? r.scoringCards : 3, events));
  const title = str(r?.scoringTitle) || g.rules.scoring.name || "Scoring";
  for (let i = 0; i < n; i++) { const c = addCard(g, "scoring"); c.title = title; if (i === n - 1) c.final = true; rep.added.push(`Scoring card ${c.id}${c.final ? " (final)" : ""}`); }
  try { buildPiles(g, n); rep.added.push(`${n} piles`); } catch (e) { rep.dropped.push(`Piles: ${e.message}`); }
}

// A rule is still the preset default when its formula and threshold are the default ones and its text
// is the default text, allowing for a renamed piece (the default text names the base piece).
function isDefaultVictory(f, v) {
  const d = victoryFor(f);
  if (JSON.stringify([v.formula, v.threshold]) !== JSON.stringify([d.formula, d.threshold])) return false;
  const base = f.pieces.find((p) => p.isBase)?.name;
  const pattern = base && d.plain.includes(base) ? new RegExp(`^${d.plain.split(base).map((x) => x.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join(".+")}$`) : null;
  return v.plain === d.plain || !!pattern?.test(v.plain);
}

function fillVictory(g, r, rep) {
  for (const v of arr(r?.perFaction)) {
    const i = g.victory.perFaction.findIndex((x) => x.factionId === v?.factionId);
    const f = g.factions.find((x) => x.id === v?.factionId);
    if (!f || i < 0) { rep.dropped.push(`Victory for unknown faction ${v?.factionId}`); continue; }
    const cur = g.victory.perFaction[i];
    if (!isDefaultVictory(f, cur)) { rep.skipped.push(`${f.name} victory: kept yours`); continue; }
    const next = { factionId: f.id, plain: str(v.plain) || cur.plain, formula: v.formula ?? cur.formula, threshold: Number.isInteger(v.threshold) ? v.threshold : cur.threshold };
    if (!fits(g, `/victory/perFaction/${i}`, (t) => { t.victory.perFaction[i] = next; })) { rep.dropped.push(`${f.name} victory (the formula is not valid)`); continue; }
    g.victory.perFaction[i] = next; rep.added.push(`${f.name} victory`);
  }
  for (const k of ["checkAt", "finalScoring"]) if (str(r?.[k])) { if (str(g.victory[k])) rep.skipped.push(`Victory ${k}: kept yours`); else { g.victory[k] = str(r[k]); rep.added.push(`Victory ${k}`); } }
  const tb = arr(r?.tieBreaks).map(str).filter(Boolean);
  if (tb.length) { if (g.victory.tieBreaks.length) rep.skipped.push("Tie-breaks: kept yours"); else { g.victory.tieBreaks = tb; rep.added.push("Tie-breaks"); } }
}

function fillBots(g, r, rep) {
  for (const s of arr(r?.bots)) {
    const f = g.factions.find((x) => x.id === s?.factionId);
    if (!f) { rep.dropped.push(`Bot for unknown faction ${s?.factionId}`); continue; }
    if (g.bots.some((b) => b.factionId === f.id)) { rep.skipped.push(`${f.name} bot: kept yours`); continue; }
    const b = newBot(g, f.id), plain = structuredClone(b), at = `/bots/${g.bots.length}`;
    const asDefault = (x) => x.bots.push(plain);
    if (str(s.objective)) b.objective = str(s.objective);
    // The printed Event rule must say what the bot does: text, side and condition are used together or not at all.
    if (str(s.eventPlain)) {
      const pol = { ...b.eventPolicy, plain: str(s.eventPlain), side: ["unshaded", "shaded"].includes(s.eventSide) ? s.eventSide : b.eventPolicy.side, playIf: s.playIf ?? b.eventPolicy.playIf };
      if (s.playIf !== undefined && fits(g, at, (x) => x.bots.push({ ...b, eventPolicy: pol }), asDefault)) b.eventPolicy = pol;
      else rep.dropped.push(`${f.name} bot Event rule (${s.playIf === undefined ? "no condition given" : "condition not valid"}; the default rule is kept)`);
    }
    const t = b.priorityTables[0];
    const steps = arr(s.priorities).slice(0, 4).map((p, n) => ({ n: n + 1, text: str(p?.text), filter: p?.filter ?? true })).filter((p) => p.text);
    if (steps.length) {
      const old = t.steps; t.steps = [...steps, { n: steps.length + 1, text: "Any other legal space.", filter: true }];
      if (!fits(g, at, (x) => x.bots.push(b), asDefault)) { rep.dropped.push(`${f.name} bot priorities (not valid; the default table is kept)`); t.steps = old; }
    }
    const k = s.tiebreak;
    if (k && str(k.text) && ["max", "min"].includes(k.order)) {
      const old = t.tiebreak; t.tiebreak = [{ letter: "a", text: str(k.text), key: k.key ?? { var: "$space.pop" }, order: k.order }];
      if (!fits(g, at, (x) => x.bots.push(b), asDefault)) { rep.dropped.push(`${f.name} bot tie-break (not valid)`); t.tiebreak = old; }
    }
    g.bots.push(b); rep.added.push(`${f.name} bot (${b.code}): add its 6 dry runs in the Bots tab`);
    if (!g.actions.some((a) => a.faction === f.id && a.kind === "operation")) rep.skipped.push(`${f.name} has no Operation yet: add one, then pick it in the bot's action node`);
  }
}

const FILL = { rules: fillRules, deck: fillDeck, victory: fillVictory, bots: fillBots };
export function fillStep4(part, game, r) {
  // The validator stops at a schema problem, so no item could be checked against the rest of the game.
  const schema = validate(game).errors.filter((e) => e.code === "schema");
  if (schema.length) throw new Error(`Fix the problems marked in the game first (${schema[0].path}: ${schema[0].message}), then ask Claude again.`);
  const g = structuredClone(game), report = { added: [], skipped: [], dropped: [], notes: str(r?.notes) };
  FILL[part](g, r, report);
  return { game: g, report };
}
