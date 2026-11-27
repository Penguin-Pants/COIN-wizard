// Generate bot exports from the same definition the validator and dry-runs use:
// Mermaid source, printable aid (Markdown and HTML), policy YAML, structured JSON.
import YAML from "yaml";
import { linkedOf, botNodes, EXIT_TEXT, tablesOf, usesTable } from "./dryrun.mjs";
import { budgetText, valueText } from "./plain.mjs";
import { toValue } from "./exprmodel.mjs";

const esc = (s) => String(s).replace(/"/g, "'").replace(/[<>]/g, "");
const mid = (id) => (id.startsWith("$") ? `x_${id.slice(1)}` : id.replace(/[^a-z0-9]/gi, "_"));

// "Base (Valley Militia)": a piece target names its owner (schema 1.9.0).
const pieceLabel = (g, pid) => { const f = g.factions.find((x) => x.pieces.some((p) => p.id === pid)); return f ? `${f.pieces.find((p) => p.id === pid).name} (${f.name})` : pid; };

// A bot's tables print as CW-1, CW-2; the game's shared tables (1.12.0 part C) as S-1, S-2. A bot code
// has 2 or 3 capitals, so a shared label never matches a bot's own.
export function tableLabels(bot, game) {
  return Object.fromEntries([...bot.priorityTables.map((t, i) => [t.id, `${bot.code}-${i + 1}`]), ...(game?.sharedTables ?? []).map((t, i) => [t.id, `S-${i + 1}`])]);
}

// Number the steps in breadth-first order from the start node.
export function stepNumbers(bot) {
  const nodes = Object.fromEntries(bot.nodes.map((n) => [n.id, n]));
  const num = {}; let n = 0; const q = [bot.start]; const seen = new Set();
  while (q.length) {
    const id = q.shift();
    if (seen.has(id)) continue; seen.add(id);
    const node = nodes[id];
    if (!node) continue; // an exit of a card bot (1.12.0): $draw or $flip
    if (node.kind !== "end") num[id] = ++n;
    const nx = node.kind === "condition" || node.kind === "event-check" ? [node.yes, node.no] : node.kind === "action" ? [node.then, node.onEmpty] : [];
    q.push(...nx);
  }
  return { num, nodes };
}

export function toMermaid(bot) {
  const { num } = stepNumbers(bot);
  const lines = ["flowchart TD"];
  const used = new Set(bot.nodes.flatMap((n) => [n.yes, n.no, n.then, n.onEmpty]));
  for (const [id, text] of Object.entries(EXIT_TEXT)) if (used.has(id)) lines.push(`  ${mid(id)}(["${text}"])`);
  for (const n of bot.nodes) {
    const label = `${n.kind === "end" ? "" : `${num[n.id]}. `}${esc(n.text)}`;
    const shape = n.kind === "condition" ? `{"${label}"}` : n.kind === "event-check" ? `{{"${label}"}}` : n.kind === "end" ? `(["${label}"])` : `["${label}"]`;
    lines.push(`  ${mid(n.id)}${shape}`);
  }
  for (const n of bot.nodes) {
    if (n.kind === "condition" || n.kind === "event-check") {
      lines.push(`  ${mid(n.id)} -->|yes| ${mid(n.yes)}`, `  ${mid(n.id)} -->|no| ${mid(n.no)}`);
    } else if (n.kind === "action") {
      lines.push(`  ${mid(n.id)} -->|done| ${mid(n.then)}`, `  ${mid(n.id)} -->|no legal target| ${mid(n.onEmpty)}`);
    }
  }
  return lines.join("\n") + "\n";
}

function costText(a) {
  if (a.cost.amount === 0) return "free";
  return `${a.cost.amount} Resource${a.cost.amount > 1 ? "s" : ""} per ${a.cost.per}`;
}

// Scoring rounds: one sentence per bot.scoring entry, else the bot makes no choices (schema 1.5.0).
function scoringText(game, bot, labels) {
  const phase = (id) => game.rules.scoring.phases.find((p) => p.id === id)?.name ?? id;
  const lines = (bot.scoring ?? []).map((sc) => `In the ${phase(sc.phaseId)} phase: ${sc.text ? `${sc.text} ` : ""}Choose each space with table ${labels[sc.table]}.`);
  return lines.length ? `${lines.join(" ")} Every other phase is automatic.` : "The bot makes no choices in a scoring round. Every phase is automatic.";
}

// Structured model of one aid. Both renderers read this.
export function aidModel(game, bot) {
  const faction = game.factions.find((f) => f.id === bot.factionId);
  const labels = tableLabels(bot, game);
  const actions = Object.fromEntries(game.actions.map((a) => [a.id, a]));
  const passGain = game.rules.sequence.passGain[bot.factionId];
  const endLabel = (n) => ({
    none: "END, take no action and gain nothing",
    event: "END, execute the Event",
    operation: "END, Operation done",
    operationSpecial: "END, Operation plus Special Activity done",
    pass: `END, Pass and gain ${passGain} Resource${passGain === 1 ? "" : "s"}`
  })[n.outcome];
  let num, nodes;
  const goto = (id) => (EXIT_TEXT[id] ? EXIT_TEXT[id].toLowerCase() : nodes[id].kind === "end" ? endLabel(nodes[id]) : `go to step ${num[id]}`);
  const select = (t) => (t.select === "all" ? `up to ${t.limit} spaces` : "1 space");
  const tableById = Object.fromEntries(tablesOf(game, bot).map((t) => [t.id, t]));
  // The steps of one flowchart: the bot's own, or one side of a bot card (1.12.0), numbered from its start.
  // A side that starts with an end node prints that end as its one step.
  const stepsOf = (graph) => { ({ num, nodes } = stepNumbers(graph)); const first = nodes[graph.start]; if (first?.kind === "end") return [{ n: 1, text: `${first.text} ${endLabel(first)}.` }]; return graph.nodes.filter((n) => n.kind !== "end").sort((a, b) => num[a.id] - num[b.id]).map(stepOf); };
  const stepOf = (n) => {
    if (n.kind === "condition") return { n: num[n.id], text: `${n.text} Yes: ${goto(n.yes)}. No: ${goto(n.no)}.` };
    if (n.kind === "event-check") return { n: num[n.id], text: `${n.text} If you play the Event: ${goto(n.yes)}. If not: ${goto(n.no)}.` };
    const a = actions[n.action];
    // parts: numbered sub-actions, each with its own table (schema 1.5.0, docs/SCHEMA.md "Action node parts").
    const choose = n.parts
      ? `Do these parts in order, each in its own spaces: ${n.parts.map((pt, i) => `${i + 1}. ${pt.text} Choose ${select(tableById[pt.table])} with table ${labels[pt.table]}.`).join(" ")} ${a.cost.per === "use" ? "Pay the cost once, for the whole Operation." : "Pay the cost once for each space, over all parts."} If no part finds a legal or affordable space`
      : `Choose ${select(tableById[n.table])} with table ${labels[n.table]}. If no space is legal or affordable`;
    let t = `${a.name} (cost ${costText(a)}). ${n.noActivation ? "Do not roll for the Activation Number. " : ""}${n.budget ? `${budgetText(n.budget)} ` : ""}${n.target ? `First choose the target: one enemy faction with table ${labels[n.target]}. If no enemy qualifies: ${goto(n.onEmpty)}. ` : ""}${choose}: ${goto(n.onEmpty)}. Otherwise resolve it, then ${goto(n.then)}.`;
    const links = linkedOf(n);
    const saText = (L) => `${actions[L.action].name} (cost ${costText(actions[L.action])}). ${L.skipText ?? "Skip it if it cannot be used."} Choose its space with table ${labels[L.table]}.`;
    if (links.length === 1) {
      const L = links[0], sa = actions[L.action];
      t += ` Before you end: Special Activity ${sa.name} (cost ${costText(sa)}) may follow, ${L.timing} the Operation. ${L.skipText ?? "Skip it if it cannot be used."} Choose its space with table ${labels[L.table]}.`;
    } else if (links.length) {
      t += ` Before you end: Special Activities may follow, ${links[0].timing} the Operation. Try them in order; the first one that can be used runs. ${links.map((L, i) => `${i + 1}. ${i ? "If none: " : ""}${saText(L)}`).join(" ")}`;
    }
    return { n: num[n.id], text: t };
  };
  const steps = stepsOf(bot);
  // The Activation Number (part B) prints under the side's title.
  const anText = (sd) => (sd.activation === undefined ? undefined : `Activation Number: ${valueText(toValue(sd.activation), game)}. Before each space after the first, roll 1d6. At or under the number, the Operation ends.`);
  const cards = (bot.mode === "cards" ? bot.deck.cards : []).flatMap((c) => c.sides.map((sd) => ({ title: `${c.title}, side ${sd.label}`, activation: anText(sd), steps: stepsOf(sd) })));
  return {
    title: `${faction.name} bot aid (${faction.symbol})`,
    game: game.meta.title, revision: game.meta.revision, status: game.meta.status,
    objective: bot.objective,
    before: [
      "Use this aid for the faction no player controls.",
      "Check Eligibility first. An Ineligible bot takes no action and gains nothing.",
      `You need one six-sided die. Roll only when a tie-break says so. ${bot.randomization.procedure}`
    ],
    measures: bot.measures.map((m) => [m.name, m.plain]),
    eventRule: bot.eventPolicy.plain,
    steps,
    cards,
    // The bot's own tables, then the shared tables it uses.
    tables: [...bot.priorityTables, ...(game.sharedTables ?? []).filter((t) => usesTable(bot, t.id))].map((t) => ({
      label: labels[t.id], select: t.scope === "opponent" ? "one enemy faction" : t.select === "all" ? `all matching spaces, up to ${t.limit}` : "one space",
      what: t.scope === "opponent" ? "Choose an enemy faction that is" : "Choose a space that is",
      rows: t.steps.map((s) => [String(s.n), `${s.text}${s.target ? ` Target: ${game.factions.find((f) => f.id === s.target)?.name ?? s.target}.` : ""}${s.piece ? ` Target: ${pieceLabel(game, s.piece)}.` : ""}${s.tiebreak?.length ? ` Ties in this step: ${s.tiebreak.map((tb) => `${tb.letter}. ${tb.text} (${tb.order === "max" ? "highest" : "lowest"} wins)`).join("; ")}` : ""}`]),
      how: t.mode === "sequence" && t.select === "all" && t.scope !== "opponent" ? "Work down the steps in order. Take every match of each step, in tie-break order, until the limit." : "The first step with a match wins.",
      ties: t.tiebreak.map((tb) => [tb.letter, `${tb.text} (${tb.order === "max" ? "highest" : "lowest"} wins)`])
    })),
    tieRandom: `If spaces are still tied after the lettered tie-breaks: ${bot.randomization.eligibleSet} ${bot.randomization.procedure}`,
    exceptions: bot.eventPolicy.overrides.map((o) => [o.cardId.toUpperCase() + " " + (game.deck.cards.find((c) => c.id === o.cardId)?.title ?? ""), `${o.directive}: ${o.plain}${o.targets ? " Targets: " + o.targets : ""}${o.node ? ` Priorities: Table ${labels[o.node.table] ?? o.node.table}${o.node.target ? `; target: Table ${labels[o.node.target] ?? o.node.target}` : ""}.` : ""}`]),
    fallback: `If every action has no legal target, or Resources are too low, Pass and gain ${passGain} Resource${passGain === 1 ? "" : "s"}.`,
    scoring: scoringText(game, bot, labels),
    outcome: "If an Operation runs and its linked Special Activity also runs, count it as Operation plus Special Activity for the sequence of play."
  };
}

// Bot cards (1.12.0): the steps of each card side, in deck order.
const cardsMd = (m) => (m.cards.length ? ["## Bot cards", "When a step says to draw the next bot card, draw it and follow its face-up side.", ...m.cards.flatMap((c) => ["", `### ${c.title}`, ...(c.activation ? [c.activation] : []), ...c.steps.map((s) => `${s.n}. ${s.text}`)]), ""] : []);

export function toMarkdown(m) {
  const L = [`# ${m.title}`, `${m.game}, revision ${m.revision}${m.status === "draft" ? " (DRAFT)" : ""}`, "", `**Goal.** ${m.objective}`, "", "## Before you act", ...m.before.map((b) => `- ${b}`), "", "## Terms", ...m.measures.map(([a, b]) => `- **${a}.** ${b}`), "", "## Events", m.eventRule, "", "### Event exceptions", ...(m.exceptions.length ? m.exceptions.map(([a, b]) => `- **${a}.** ${b}`) : ["- None."]), "", "## Steps (follow in order)", ...m.steps.map((s) => `${s.n}. ${s.text}`), "", ...cardsMd(m), "## Priority tables"];
  for (const t of m.tables) {
    L.push("", `### Table ${t.label} (choose ${t.select})`, `| Step | ${t.what} |`, "|---|---|", ...t.rows.map(([a, b]) => `| ${a} | ${b} |`), "", t.how, "", "Tie-breaks, in order:", ...t.ties.map(([a, b]) => `- ${a}. ${b}`));
  }
  L.push("", "## Ties and dice", m.tieRandom, "", "## Fallback", m.fallback, "", "## Scoring rounds", m.scoring, "", "## Counting the turn", m.outcome, "");
  return L.join("\n");
}

const h = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;");
export function toHtml(m) {
  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><title>${h(m.title)}</title>
<style>@page{margin:14mm}body{font:11pt/1.35 system-ui,sans-serif;color:#111;max-width:180mm;margin:0 auto}h1{font-size:18pt;margin:0}h2{font-size:12.5pt;border-bottom:1px solid #999;margin:12px 0 4px}h3{font-size:11pt;margin:8px 0 2px}table{border-collapse:collapse;width:100%}td,th{border:1px solid #888;padding:2px 6px;text-align:left;vertical-align:top}ol li{margin:3px 0}.draft{color:#b3261e;font-weight:700}</style></head><body>
<h1>${h(m.title)}</h1><p>${h(m.game)}, revision ${m.revision}${m.status === "draft" ? ' <span class="draft">DRAFT</span>' : ""}</p>
<p><b>Goal.</b> ${h(m.objective)}</p>
<h2>Before you act</h2><ul>${m.before.map((b) => `<li>${h(b)}</li>`).join("")}</ul>
<h2>Terms</h2><ul>${m.measures.map(([a, b]) => `<li><b>${h(a)}.</b> ${h(b)}</li>`).join("")}</ul>
<h2>Events</h2><p>${h(m.eventRule)}</p><h3>Event exceptions</h3><ul>${(m.exceptions.length ? m.exceptions : [["None", ""]]).map(([a, b]) => `<li><b>${h(a)}.</b> ${h(b)}</li>`).join("")}</ul>
<h2>Steps (follow in order)</h2><ol>${m.steps.map((s) => `<li value="${s.n}">${h(s.text)}</li>`).join("")}</ol>${m.cards.length ? `<h2>Bot cards</h2>${m.cards.map((c) => `<h3>${h(c.title)}</h3>${c.activation ? `<p>${h(c.activation)}</p>` : ""}<ol>${c.steps.map((s) => `<li value="${s.n}">${h(s.text)}</li>`).join("")}</ol>`).join("")}` : ""}
<h2>Priority tables</h2>${m.tables.map((t) => `<h3>Table ${h(t.label)} (choose ${h(t.select)})</h3><table><tr><th>Step</th><th>${h(t.what)}</th></tr>${t.rows.map(([a, b]) => `<tr><td>${a}</td><td>${h(b)}</td></tr>`).join("")}</table><p>${h(t.how)}</p><p>Tie-breaks, in order:</p><ul>${t.ties.map(([a, b]) => `<li>${a}. ${h(b)}</li>`).join("")}</ul>`).join("")}
<h2>Ties and dice</h2><p>${h(m.tieRandom)}</p><h2>Fallback</h2><p>${h(m.fallback)}</p><h2>Scoring rounds</h2><p>${h(m.scoring)}</p><h2>Counting the turn</h2><p>${h(m.outcome)}</p></body></html>`;
}

// A bot with the shared tables (1.12.0 part C) it uses, so its exported policy files stand alone.
export function policyOf(game, bot) {
  const shared = (game.sharedTables ?? []).filter((t) => usesTable(bot, t.id));
  return shared.length ? { ...bot, sharedTables: shared } : bot;
}

export function toPolicyYaml(game, bot) {
  const used = new Set();
  for (const n of botNodes(bot)) { if (n.action) used.add(n.action); for (const L of linkedOf(n)) used.add(L.action); }
  const actions = game.actions.filter((a) => used.has(a.id)).map((a) => ({ id: a.id, name: a.name, kind: a.kind, cost: a.cost, plain: a.plain, dependsOn: a.dependsOn }));
  const { dryRuns, ...policy } = policyOf(game, bot);
  const f = game.factions.find((x) => x.id === bot.factionId);
  return YAML.stringify({ schemaVersion: game.meta.schemaVersion, game: game.meta.gameId, revision: game.meta.revision, faction: { id: bot.factionId, name: f?.name ?? bot.factionId }, policy, actions, dryRuns }, { lineWidth: 100 });
}
