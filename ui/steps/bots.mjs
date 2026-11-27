// Bots tab: flowchart, node editor, priority tables, Event rules, measures and dry runs. No JSON.
import { newBot, addNode, deleteNode, graphInfo, missingCases, newDryRun, runDry, toExpect, CASES, setCardMode, addBotCard, deleteBotCard, addBack, deleteBack } from "../../src/botedit.mjs";
import { graphSvg } from "../../src/graphsvg.mjs";
import { aidModel, toMarkdown } from "../../src/botaid.mjs";
import { renameId } from "../../src/validate.mjs";
import { linkedOf, botNodes, EXIT_TEXT, tableUsers, tablesOf } from "../../src/dryrun.mjs";
import { opinionMax } from "../../src/opinion.mjs";
import { budgetText } from "../../src/plain.mjs";
import { isExpr } from "../../src/exprmodel.mjs";
import { tracksResources } from "../../src/state.mjs";
import { S, esc, getP } from "../state.mjs";
import { fld, inp, area, sel, btn, chip } from "../components/fields.mjs";
import { condEditor, valueEditor } from "../components/exprEditor.mjs";
import { confirmButton } from "../components/confirmButton.mjs";
import { defineList, addButton, removeButton } from "../components/listEditor.mjs";
import { stepList } from "../components/stepList.mjs";
import { fvars, fbadge, fidx } from "../components/faction.mjs";
import { touch } from "../store.mjs";
import { render } from "../shell.mjs";

const ID_OK = /^[a-z0-9][a-z0-9._-]*$/;
const KINDS = [["condition", "Check (yes or no)"], ["event-check", "Event check"], ["action", "Action"], ["end", "End"]];
const OUTCOMES = ["none", "event", "operation", "operationSpecial", "pass"];
const CASE_HELP = { ineligible: "The bot is not Eligible.", "event-override": "A card with an Event exception is current.", "no-target": "The first action finds no legal space.", tie: "Two spaces tie after the tie-breaks.", "linked-sa": "The Operation runs with its linked Special Activity.", fallback: "An action finds no space and the bot falls back.", scoring: "Optional. A scoring round: the bot picks spaces in its scoring phases." };
const isCond = (e) => typeof e === "boolean" || (isExpr(e) && ["and", "or", "not", "anySpace", "canPlace", "canDo", "cardCould", "eq", "ne", "gt", "gte", "lt", "lte"].includes(e.op));

const fname = (id) => S.game.factions.find((f) => f.id === id)?.name ?? id;
const cur = () => { const n = S.game.bots.length; S.bot = Math.min(S.bot ?? 0, Math.max(0, n - 1)); return S.bot; };
const results = (S.dryResults ??= {});

// The flowchart being edited (schema 1.12.0): the bot's own, or one side of a bot card.
// S.botGraph is "" or "<card>/<side>" (indexes). p: its data path; flip: the side can flip.
function graphOf(b, bi) {
  const [ci, si] = (S.botGraph ?? "").split("/").map(Number), side = b.mode === "cards" ? b.deck.cards[ci]?.sides[si] : undefined;
  if (!side) { S.botGraph = ""; return { g: b, p: `bots/${bi}`, flip: false }; }
  return { g: side, p: `bots/${bi}/deck/cards/${ci}/sides/${si}`, flip: b.deck.cards[ci].sides.length === 2 };
}
// The bot that holds a node or graph path.
const botAt = (p) => getP(S.game, p.match(/^bots\/\d+/)[0]);

function picker() {
  const g = S.game, bi = cur();
  const tabs = g.bots.map((b, i) => { const f = g.factions.find((x) => x.id === b.factionId); return `<button type="button" role="tab" aria-selected="${i === bi}" class="${i === bi ? "on" : ""}" data-a="bot-pick" data-i="${i}">${f ? esc(f.name) : esc(b.factionId)}</button>`; }).join("");
  const free = g.factions.filter((f) => !g.bots.some((b) => b.factionId === f.id));
  return `<div class="tabs" role="tablist" aria-label="Bots">${tabs}</div>${free.length ? `<div class="row"><small>No bot yet:</small>${free.map((f) => btn("bot-new", `Add a bot for ${esc(f.name)}`, { cls: "link", data: `data-f="${esc(f.id)}"` })).join("")}</div>` : ""}`;
}

// Bot deck (schema 1.12.0): a card bot runs its flowchart, and "draw the next bot card" runs a card side.
function deckPanel(b, bi) {
  const p = `bots/${bi}`;
  if (b.mode !== "cards") return `<section class="panel"><h3>Bot deck</h3><p class="lead">A card bot draws a bot card when its flowchart says so, and follows that card's flowchart.</p>${btn("bot-cards", "Make this a card bot", { data: `data-p="${p}"` })}</section>`;
  const one = b.deck.cards.length === 1;
  // Activation Number (part B): a number or formula per side, or none.
  const an = (sd, ci, si) => { const sp = `${p}/deck/cards/${ci}/sides/${si}`; return sd.activation === undefined ? btn("bot-addan", `Add an Activation Number to side ${esc(sd.label)}`, { cls: "link", data: `data-p="${sp}"` }) : `<div class="sblock"><span class="sl">Side ${esc(sd.label)} Activation Number</span>${valueEditor(`${sp}/activation`, sd.activation)}${btn("bot-delan", "Remove", { cls: "link", data: `data-p="${sp}"` })}</div>`; };
  const cards = b.deck.cards.map((c, ci) => `<div class="opt"><div class="grid3">${fld(`Card ${ci + 1} title`, inp(`${p}/deck/cards/${ci}/title`, c.title))}${c.sides.map((sd, si) => fld(`${si ? "Back" : "Front"} letter`, inp(`${p}/deck/cards/${ci}/sides/${si}/label`, sd.label))).join("")}</div>${c.sides.map((sd, si) => an(sd, ci, si)).join("")}<div class="row">${c.sides.map((_, si) => btn("bot-graph", `Edit ${si ? "back" : "front"} ${esc(c.sides[si].label)}`, { cls: "link", data: `data-g="${ci}/${si}"` })).join("")}${c.sides.length === 1 ? btn("bot-addback", "Add a back side", { cls: "link", data: `data-p="${p}" data-i="${ci}"` }) : confirmButton(`back-${b.id}-${c.id}`, "Remove the back side", { action: "bot-delback", data: `data-p="${p}" data-i="${ci}"` })}${one ? "" : confirmButton(`card-${b.id}-${c.id}`, "Delete card", { action: "bot-delcard", data: `data-p="${p}" data-i="${ci}"` })}</div></div>`).join("");
  return `<section class="panel"><h3>Bot deck</h3><p class="lead">The bot flowchart draws the next bot card. Each card side is a small flowchart; it can draw the next card, and a card with a back can flip.</p>
    ${fld("After a draw", sel(`${p}/deck/order`, b.deck.order, [["cycle", "the card goes to the bottom, face up (cycle)"], ["shuffle", "the card is discarded, then the deck is shuffled (shuffle)"]], { r: true }), "In one turn both draw the cards in order. A turn that draws every card passes.")}
    ${cards}<div class="row">${btn("bot-addcard", "Add a bot card", { cls: "link", data: `data-p="${p}"` })}${confirmButton(`nocards-${b.id}`, "Remove the bot deck", { action: "bot-nocards", data: `data-p="${p}"` })}</div></section>`;
}
// Which flowchart the editor shows: the bot's own or one card side.
function graphPicker(b) {
  if (b.mode !== "cards") return "";
  const opts = [["", "Bot flowchart"], ...b.deck.cards.flatMap((c, ci) => c.sides.map((sd, si) => [`${ci}/${si}`, `${c.title}, side ${sd.label}`]))];
  return `<label class="fld inline"><span>Flowchart to edit</span><select data-botgraph="1" aria-label="Flowchart to edit">${opts.map(([v, l]) => `<option value="${v}" ${v === (S.botGraph ?? "") ? "selected" : ""}>${esc(l)}</option>`).join("")}</select></label>`;
}

// budget (1.11.0): what the Operation may spend. Each field is optional; an empty field removes its key.
function budgetForm(n, p) {
  const bg = n.budget ?? {}, ctl = (k, val, extra) => `<input data-budget="${p}" data-bk="${k}" data-path="/${p}/budget" value="${esc(val ?? "")}" ${extra}>`;
  return `<details class="sblock" ${n.budget ? "open" : ""}><summary>Spending limit${n.budget ? `: ${esc(budgetText(n.budget))}` : " (none)"}</summary><div class="grid3">${fld("Share of Resources", ctl("share", bg.share?.join("/"), 'placeholder="for example 2/3" aria-label="Share of Resources"'), "Rounded down.")}${fld("Spend all if Resources are below", ctl("allBelow", bg.allBelow, 'type="number" min="1" aria-label="Spend all below"'), "Needs a share.")}${fld("Keep at least", ctl("floor", bg.floor, 'type="number" min="0" aria-label="Keep at least"'), "Resources the Operation leaves.")}</div><small>A linked Special Activity pays from the full Resources.</small></details>`;
}

function nodeForm(b, bi, G) {
  const ni = G.g.nodes.findIndex((n) => n.id === S.botNode);
  if (ni < 0) return "<p><small>Select a node in the list or the flowchart.</small></p>";
  const n = G.g.nodes[ni], p = `${G.p}/nodes/${ni}`, g = S.game;
  // Exits (1.12.0): any flowchart of a card bot can draw; a side of a two-sided card can flip.
  const exits = [...(b.mode === "cards" ? ["$draw"] : []), ...(G.flip ? ["$flip"] : [])].map((x) => [x, `(${EXIT_TEXT[x].toLowerCase()})`]);
  const ids = [["", "(none)"], ...G.g.nodes.filter((x) => x.id !== n.id).map((x) => [x.id, `${x.id}: ${x.text.slice(0, 40)}`]), ...exits];
  const branch = (k, label) => fld(label, sel(`${p}/${k}`, n[k] ?? "", ids, { t: "o", r: true }));
  const ops = g.actions.filter((a) => a.faction === b.factionId && a.kind === "operation").map((a) => [a.id, a.name]);
  const sas = g.actions.filter((a) => a.faction === b.factionId && a.kind === "specialActivity").map((a) => [a.id, a.name]);
  const tables = [["", "(none)"], ...tablesOf(g, b).filter((t) => t.scope !== "opponent").map((t) => [t.id, t.id])];
  let body = "";
  if (n.kind === "condition") body = `${fld("Test", condEditor(`${p}/test`, n.test ?? true))}<div class="grid2">${branch("yes", "If yes, go to")}${branch("no", "If no, go to")}</div>`;
  if (n.kind === "event-check") body = `<p><small>Plays the Event when the Event rules below allow it.</small></p><div class="grid2">${branch("yes", "If it plays the Event, go to")}${branch("no", "If not, go to")}</div>`;
  if (n.kind === "action") {
    // linked: one object or a list tried in order (schema 1.5.0). Each entry has its own fields.
    const L = n.linked, list = Array.isArray(L), entries = linkedOf(n);
    const entry = (E, i) => {
      const lp = list ? `${p}/linked/${i}` : `${p}/linked`;
      return `<div class="sblock">${i ? `<p><b>If none, try next:</b></p>` : ""}<div class="grid3">${fld("Special Activity", sel(`${lp}/action`, E.action, sas.length ? sas : [[E.action, E.action]]))}${fld("Timing", sel(`${lp}/timing`, E.timing, ["before", "during", "after"]), list && !i ? "Every entry uses the same timing." : "")}${fld("Table", sel(`${lp}/table`, E.table, tablesOf(g, b).map((t) => [t.id, t.id])))}</div>${fld("Trigger", condEditor(`${lp}/trigger`, E.trigger))}${fld("When it is skipped (printed)", inp(`${lp}/skipText`, E.skipText ?? ""))}${entries.length > 1 ? `<div class="row">${btn("bot-linked-del", "Remove this Special Activity", { cls: "link", data: `data-p="${p}" data-i="${i}"` })}</div>` : ""}</div>`;
    };
    const enemyTables = [["", "(none: act without a target)"], ...tablesOf(g, b).filter((t) => t.scope === "opponent").map((t) => [t.id, t.id])];
    body = `<div class="grid2">${fld("Pick the enemy first", sel(`${p}/target`, n.target ?? "", enemyTables, { t: "o", r: true }), "An enemy table picks one enemy faction. The space table can then use \"the target\".")}${fld("Operation", sel(`${p}/action`, n.action ?? "", [["", "(choose)"], ...ops], { t: "o", r: true }))}${n.parts ? "" : fld("Priority table", sel(`${p}/table`, n.table ?? "", tables, { t: "o", r: true }), "The table picks the spaces, so the bot needs no judgment.")}${branch("then", "After it acts, go to")}${branch("onEmpty", "If no space qualifies (fallback), go to")}</div>
      ${G.g.activation !== undefined ? `<label class="chk"><input type="checkbox" data-a="bot-noan" data-p="${p}" ${n.noActivation ? "checked" : ""}> Skip the Activation roll</label><small> This Operation takes spaces up to its table's limit.</small>` : ""}
      ${tracksResources(b) ? budgetForm(n, p) : "<small>This bot tracks no Resources, so it has no spending limit.</small>"}
      ${partsForm(n, p, tables)}
      <label class="chk"><input type="checkbox" data-a="bot-linked" data-p="${p}" ${L ? "checked" : ""}> Linked Special Activity</label><small> Runs with the Operation when its trigger holds and its table finds a space.</small>
      ${entries.map(entry).join("")}${L ? `<div class="row">${btn("bot-linked-add", "Add an If none Special Activity", { cls: "link", data: `data-p="${p}"` })}<small> Tried in order: the first one whose trigger holds and whose table finds a space runs.</small></div>` : ""}`;
  }
  if (n.kind === "end") body = fld("Outcome", sel(`${p}/outcome`, n.outcome ?? "pass", OUTCOMES, { r: true }));
  return `<div class="nodeform"><div class="grid3">${fld("Node id", `<input data-nodeid="${esc(n.id)}" data-bot="${bi}" data-path="/${p}/id" value="${esc(n.id)}">`)}${fld("Kind", `<select data-nkind="${p}" data-path="/${p}/kind">${KINDS.map(([v, l]) => `<option value="${v}" ${v === n.kind ? "selected" : ""}>${l}</option>`).join("")}</select>`)}<div class="fld"><span>&nbsp;</span>${G.g.start === n.id ? chip("ok", "Start node") : btn("bot-start", "Make this the start", { data: `data-p="${G.p}" data-id="${esc(n.id)}"` })}</div></div>
    ${fld("Text (printed on the flowchart)", area(`${p}/text`, n.text, { rows: 2, r: true }))}${body}
    <div class="row">${confirmButton(`node-${n.id}`, "Delete node", { action: "bot-delnode", data: `data-p="${G.p}" data-id="${esc(n.id)}"` })}</div></div>`;
}

// parts: numbered sub-actions of one Operation, each with its own table and effects (schema 1.5.0).
function partsForm(n, p, tables) {
  const rows = (n.parts ?? []).map((pt, i) => `<div class="sblock"><h4>Part ${i + 1}</h4><div class="grid2">${fld("What it does (printed)", inp(`${p}/parts/${i}/text`, pt.text))}${fld("Table", sel(`${p}/parts/${i}/table`, pt.table, tables.filter(([v]) => v), { r: true }))}</div><h4>Effects in each chosen space</h4><ol class="steps">${stepList(pt.steps, `${p}/parts/${i}/steps`, { space: true, target: n.target !== undefined })}</ol>${addButton("steps", "Add effect", { cls: "link", data: `data-p="${p}/parts/${i}/steps"` })}<div class="row">${btn("bot-parts-del", "Remove this part", { cls: "link", data: `data-p="${p}" data-i="${i}"` })}</div></div>`).join("");
  return `${rows}<div class="row">${btn("bot-parts-add", n.parts ? "Add a part" : "Split into parts", { cls: "link", data: `data-p="${p}"` })}<small> Parts run in order. Each picks its own spaces with its table and runs its own effects. The cost is paid once per space.</small></div>`;
}

// shared (1.12.0 part C): a table of game.sharedTables, shown from the current bot's view.
function tableEditor(t, bi, ti, shared = false) {
  const p = shared ? `sharedTables/${ti}` : `bots/${bi}/priorityTables/${ti}`, b = S.game.bots[bi];
  // An enemy table reads "that faction". A space table reads "the target" when every node that uses it picks an enemy.
  const users = tableUsers(b, t.id);
  const ctx = t.scope === "opponent" ? { faction: true } : { space: true, target: users.length > 0 && users.every((n) => n.target) };
  // Tie-break rows for a list at path tp: the table's, or one step's own (1.7.0).
  const tieRows = (list, tp, tctx = ctx) => (list ?? []).map((x, xi) => `<li class="step"><div class="shead"><b>${x.letter}.</b>${sel(`${tp}/${xi}/order`, x.order, [["max", "Highest"], ["min", "Lowest"]], { attrs: `aria-label="Tie-break ${x.letter} direction"` })}${inp(`${tp}/${xi}/text`, x.text, { attrs: `aria-label="Tie-break ${x.letter} description"` })}${removeButton("tbreaks", { i: xi, data: `data-p="${tp}"` })}</div>${valueEditor(`${tp}/${xi}/key`, x.key, tctx)}</li>`).join("");
  // A step may name its own target faction (1.8.0): its filter and tie-breaks then read "the target".
  const enemies = S.game.factions.filter((f) => f.id !== b.factionId);
  // An opponent step may name an enemy piece (1.9.0): the step's target is that piece and its owner.
  const pieceSel = (s, si) => `<label class="inline"><small>Piece</small><select data-steppiece="${p}/steps/${si}" data-path="/${p}/steps/${si}/piece" aria-label="Step ${s.n} target piece"><option value="">any piece</option>${enemies.flatMap((f) => f.pieces.map((pc) => `<option value="${esc(pc.id)}" ${s.piece === pc.id ? "selected" : ""}>${esc(pc.name)} (${esc(f.name)})</option>`)).join("")}</select></label>`;
  const targetSel = (s, si) => (t.scope === "opponent" ? pieceSel(s, si) : `<label class="inline"><small>Target</small><select data-steptarget="${p}/steps/${si}" data-path="/${p}/steps/${si}/target" aria-label="Step ${s.n} target faction"><option value="">${ctx.target ? "the node's target" : "none"}</option>${enemies.map((f) => `<option value="${esc(f.id)}" ${s.target === f.id ? "selected" : ""}>${esc(f.name)}</option>`).join("")}</select></label>`);
  const sctx = (s) => (s.target ? { ...ctx, target: true } : ctx);
  const steps = t.steps.map((s, si) => `<li class="step"><div class="shead"><b>${s.n}.</b>${inp(`${p}/steps/${si}/text`, s.text, { attrs: `aria-label="Step ${s.n} description"` })}${targetSel(s, si)}${t.steps.length > 1 ? removeButton("tsteps", { i: si, data: `data-p="${p}/steps"` }) : ""}</div>${condEditor(`${p}/steps/${si}/filter`, s.filter, sctx(s))}${t.scope === "opponent" ? "" : `<ol class="steps tbs">${tieRows(s.tiebreak, `${p}/steps/${si}/tiebreak`, sctx(s))}</ol>${btn("bot-steptb-add", "Add a tie-break to this step", { cls: "link", data: `data-p="${p}/steps/${si}"` })}`}</li>`).join("");
  // Table tie-breaks read "the target" when every step that uses them has its own target (as the validator checks).
  const inheritors = t.steps.filter((s) => !s.tiebreak);
  const ties = tieRows(t.tiebreak, `${p}/tiebreak`, t.scope !== "opponent" && inheritors.length && inheritors.every((s) => s.target) ? { ...ctx, target: true } : ctx);
  return `<details class="act" data-k="tbl-${esc(t.id)}" ${S.dopen[`tbl-${t.id}`] ? "open" : ""}><summary><b>${esc(t.id)}</b> <small>${t.scope === "opponent" ? "picks one enemy faction" : `${t.select === "all" ? `all, up to ${t.limit ?? "?"}` : "one"} space`}</small></summary>
    <div class="grid4">${fld("Chooses", sel(`${p}/scope`, t.scope, [["space", "spaces"], ["opponent", "an enemy faction"]], { r: true }))}${t.scope === "opponent" ? "" : `${fld("How many", sel(`${p}/select`, t.select, [["one", "one"], ["all", "all that match"]], { r: true }))}${t.select === "all" ? fld("Up to", inp(`${p}/limit`, t.limit ?? 1, { t: "n", type: "number", attrs: 'min="1"' })) : ""}`}</div>
    ${t.scope === "opponent" ? "" : fld("How the steps work", sel(`${p}/mode`, t.mode ?? "first", [["sequence", "In order: every step, as far as possible (GMT)"], ["first", "Only the first step with a match"]]), "With one space chosen, both work the same.")}
    <h4>${t.mode === "sequence" && t.select === "all" ? "Steps: work down in order, each as far as possible" : "Steps: the first step with a match wins"}</h4><ol class="steps">${steps}</ol>${addButton("tsteps", "Add step", { cls: "link", data: `data-p="${p}/steps"` })}
    <h4>Tie-breaks, in letter order</h4><ol class="steps">${ties}</ol>${addButton("tbreaks", "Add tie-break", { cls: "link", data: `data-p="${p}/tiebreak"` })}
    <div class="row">${confirmButton(`tbl-${t.id}`, "Delete table", { action: shared ? "bot-delshared" : "bot-deltable", data: `data-p="bots/${bi}" data-i="${ti}"` })}</div></details>`;
}

// Scoring-phase choices (bot.scoring): in each named phase, steps that need a space pick with the table.
function scoringRules(b, bi) {
  const g = S.game, phases = g.rules.scoring.phases.map((ph) => [ph.id, ph.name]);
  const spaceTables = tablesOf(S.game, b).filter((t) => t.scope !== "opponent").map((t) => [t.id, t.id]);
  const rows = (b.scoring ?? []).map((sc, i) => `<div class="opt"><div class="grid3">${fld("Phase", sel(`bots/${bi}/scoring/${i}/phaseId`, sc.phaseId, phases, { r: true }))}${fld("Table", sel(`bots/${bi}/scoring/${i}/table`, sc.table, spaceTables, { r: true }))}${fld("What the bot does (printed)", inp(`bots/${bi}/scoring/${i}/text`, sc.text ?? ""))}</div><div class="row">${btn("bot-delscoring", "Remove", { cls: "link", data: `data-p="bots/${bi}" data-i="${i}"` })}</div></div>`).join("");
  return `<section class="panel"><h3>${esc(g.rules.scoring.name)} choices</h3><p class="lead">In a phase named here, every effect that needs a space picks it with the table, so the bot needs no judgment. Other phases are automatic.</p>${rows || "<p><small>No choices. Every phase is automatic.</small></p>"}${spaceTables.length ? btn("bot-addscoring", "Add a scoring choice", { cls: "link", data: `data-p="bots/${bi}"` }) : ""}</section>`;
}

function eventRules(b, bi) {
  const g = S.game, p = `bots/${bi}/eventPolicy`, ep = b.eventPolicy;
  const events = g.deck.cards.filter((c) => c.type === "event");
  // Override node (1.10.0): a space table runs the side's steps; an optional enemy table picks the target first.
  const spaceT = tablesOf(S.game, b).filter((t) => t.scope !== "opponent").map((t) => [t.id, t.id]), foeT = tablesOf(S.game, b).filter((t) => t.scope === "opponent").map((t) => [t.id, t.id]);
  const runEvent = (o, np) => `<div class="grid2">${fld("Run the Event with table", sel(`${np}/table`, o.node?.table ?? "", [["", "no (text only)"], ...spaceT], { t: "o", r: true }))}${o.node && foeT.length ? fld("Target enemy with table", sel(`${np}/target`, o.node.target ?? "", [["", "none"], ...foeT], { t: "o" })) : ""}</div>`;
  const rows = ep.overrides.map((o, oi) => `<div class="opt"><div class="grid4">${fld("Card", sel(`${p}/overrides/${oi}/cardId`, o.cardId, events.map((c) => [c.id, `${c.title} (${c.id})`]), { r: true }))}${fld("Rule", sel(`${p}/overrides/${oi}/directive`, o.directive, [["force", "Always play"], ["ignore", "Never play"], ["conditional", "Play only if"]], { r: true }))}${fld("Side", sel(`${p}/overrides/${oi}/side`, o.side ?? "", [["", "as usual"], ["unshaded", "unshaded"], ["shaded", "shaded"]], { t: "o" }))}<div class="fld"><span>&nbsp;</span>${removeButton("overrides", { i: oi, data: `data-p="${p}/overrides"` })}</div></div>
    ${o.directive === "conditional" ? fld("Play only if", condEditor(`${p}/overrides/${oi}/when`, o.when ?? true)) : ""}${fld("Rule in plain words (printed)", inp(`${p}/overrides/${oi}/plain`, o.plain))}${o.directive === "ignore" ? "" : runEvent(o, `${p}/overrides/${oi}/node`)}</div>`).join("");
  const none = events.filter((c) => !ep.overrides.some((o) => o.cardId === c.id));
  return `<section class="panel"><h3>Event rules</h3>${fld("When it plays an Event (printed)", area(`${p}/plain`, ep.plain, { rows: 2 }))}<div class="grid2">${fld("Plays the Event if", condEditor(`${p}/playIf`, ep.playIf))}${fld("Side", sel(`${p}/side`, ep.side, ["unshaded", "shaded"]))}</div>
    <h4>Event exceptions</h4>${rows || "<p><small>No exceptions. The rule above applies to every card.</small></p>"}${none.length ? btn("bot-addov", "Add an Event exception", { cls: "link", data: `data-p="${p}/overrides" data-card="${esc(none[0].id)}"` }) : ""}
    <p><small>${none.length ? `Cards with no exception: ${none.map((c) => esc(c.title)).join(", ")}.` : "Every Event card has an exception."}</small></p></section>`;
}

function patchForm(b, bi, d, di) {
  const g = S.game, pt = d.patch, k = `${bi}/${di}`;
  const ctl = (key, kind, val, extra = "") => `data-dk="${esc(key)}" data-dt="${kind}" data-dry="${k}" data-path="/bots/${bi}/dryRuns/${di}/patch" ${extra}`;
  const elig = g.factions.map((f) => fld(`${esc(f.name)} Eligible`, `<select ${ctl(`eligible/${f.id}`, "bool3")}>${[["", "as in setup"], ["true", "yes"], ["false", "no"]].map(([v, l]) => `<option value="${v}" ${String(pt.eligible?.[f.id] ?? "") === v ? "selected" : ""}>${l}</option>`).join("")}</select>`)).join("");
  // players (1.11.0): default is a player when the game has no bot for that faction.
  const ply = g.factions.map((f) => { const dflt = !g.bots.some((x) => x.factionId === f.id); return fld(`${esc(f.name)} is played by`, `<select ${ctl(`players/${f.id}`, "bool3")}>${[["", `as usual (${dflt ? "a human" : "the bot"})`], ["true", "a human player"], ["false", "a Non-player bot"]].map(([v, l]) => `<option value="${v}" ${String(pt.players?.[f.id] ?? "") === v ? "selected" : ""}>${l}</option>`).join("")}</select>`); }).join("");
  const res = g.factions.map((f) => fld(`${esc(f.name)} Resources`, `<input type="number" placeholder="as in setup" ${ctl(`resources/${f.id}`, "num")} value="${pt.resources?.[f.id] ?? ""}">`)).join("");
  const tr = g.tracks.filter((t) => !g.factions.some((f) => f.resourceTrack === t.id)).map((t) => fld(esc(t.name), `<input type="number" placeholder="as in setup" ${ctl(`tracks/${t.id}`, "num")} value="${pt.tracks?.[t.id] ?? ""}">`)).join("");
  const card = fld("Current card", `<select ${ctl("card/id", "text", "", 'data-r="1"')}><option value="">default</option>${g.deck.cards.filter((c) => c.type === "event").map((c) => `<option value="${c.id}" ${pt.card?.id === c.id ? "selected" : ""}>${esc(c.title)}</option>`).join("")}</select>`)
    + (pt.card ? ["hasEffect", "raisesSelf", "lowersEnemy"].map((x) => `<label class="chk"><input type="checkbox" ${ctl(`card/${x}`, "bool")} ${pt.card[x] ? "checked" : ""}> ${{ hasEffect: "has an effect", raisesSelf: "helps this faction", lowersEnemy: "hurts the enemy" }[x]}</label>`).join("") : "");
  // turn.position (1.8.0) and scoring.nextFinal (1.9.0).
  const turn = fld("This faction acts", `<select ${ctl("turn/position", "num")}>${[["", "1st Eligible (default)"], ["2", "2nd Eligible"]].map(([v, l]) => `<option value="${v}" ${String(pt.turn?.position ?? "") === v ? "selected" : ""}>${l}</option>`).join("")}</select>`)
    + `<label class="chk"><input type="checkbox" ${ctl("scoring/nextFinal", "bool")} ${pt.scoring?.nextFinal ? "checked" : ""}> the next scoring card is the final one</label>`;
  const dice = fld("Die rolls, in order", `<input placeholder="for example 3, 5" ${ctl("dice", "dice")} value="${esc((pt.dice ?? []).join(", "))}">`);
  const pcs = g.factions.flatMap((f) => f.pieces);
  const clear = `<details><summary>Remove pieces from the whole map (${(pt.clearPieces ?? []).length})</summary>${pcs.map((x) => `<label class="chk"><input type="checkbox" ${ctl("clearPieces", "list", "", `value="${x.id}"`)} ${(pt.clearPieces ?? []).includes(x.id) ? "checked" : ""}> ${esc(x.name)}</label>`).join(" ")}</details>`;
  // next (1.11.0): the next card, for next.id and next.lasting.
  const next = fld("Next card", `<select ${ctl("next/id", "text")}><option value="">none</option>${g.deck.cards.map((c) => `<option value="${esc(c.id)}" ${pt.next?.id === c.id ? "selected" : ""}>${esc(c.title)}</option>`).join("")}</select>`);
  // inPlay (1.11.0): lasting cards in play.
  const lasting = g.deck.cards.filter((c) => (c.sides ?? []).some((sd) => sd.lasting));
  const inPlay = lasting.length ? `<details ${pt.inPlay?.length ? "open" : ""}><summary>Lasting cards in play (${(pt.inPlay ?? []).length})</summary>${lasting.map((c) => `<label class="chk"><input type="checkbox" ${ctl("inPlay", "inplay", "", `value="${esc(c.id)}"`)} ${(pt.inPlay ?? []).includes(c.id) ? "checked" : ""}> ${esc(c.title)}</label>`).join(" ")}</details>` : "";
  // pools (1.11.0): the Available count of each piece. Out of Play stays as in setup. The list stays open while a count is set.
  const avail = `<details${pt.pools ? " open" : ""}><summary>Pieces Available (${Object.keys(pt.pools ?? {}).length} changed)</summary><div class="grid4">${pcs.map((x) => fld(`${esc(x.name)} Available`, `<input type="number" min="0" step="1" placeholder="as in setup (${g.setup.pools?.[x.id]?.available ?? 0})" ${ctl(`pools/${x.id}/available`, "num")} value="${pt.pools?.[x.id]?.available ?? ""}">`)).join("")}</div></details>`;
  const spaces = Object.entries(pt.spaces ?? {}).map(([sid, sp]) => {
    const name = g.board.spaces.find((s) => s.id === sid)?.name ?? sid;
    const lines = Object.entries(sp.pieces ?? {}).map(([pid, by]) => { const pc = pcs.find((x) => x.id === pid); return `<div class="row"><b>${esc(pc?.name ?? pid)}</b>${(pc?.states ?? Object.keys(by)).map((st) => `<label class="mini"><span>${esc(st)}</span><input type="number" min="0" ${ctl(`spaces/${sid}/pieces/${pid}/${st}`, "num")} value="${by[st] ?? ""}"></label>`).join("")}</div>`; }).join("");
    return `<div class="opt"><div class="row"><b>${esc(name)}</b><label class="mini"><span>Opinion</span><input type="number" min="${-opinionMax(g)}" max="${opinionMax(g)}" placeholder="as in setup" ${ctl(`spaces/${sid}/opinion`, "num")} value="${sp.opinion ?? ""}"></label><select ${ctl(`spaces/${sid}/pieces`, "addpiece", "", 'aria-label="Set a piece count"')}><option value="">Set a piece count...</option>${pcs.map((x) => `<option value="${x.id}">${esc(x.name)}</option>`).join("")}</select>${btn("dry-delspace", "Remove", { cls: "link", data: `data-dry="${k}" data-s="${esc(sid)}"` })}</div>${lines}</div>`;
  }).join("");
  const add = `<select ${ctl("spaces", "addspace")} aria-label="Change a space"><option value="">Change a space...</option>${g.board.spaces.filter((s) => !pt.spaces?.[s.id]).map((s) => `<option value="${s.id}">${esc(s.name)}</option>`).join("")}</select>`;
  // botDeck (1.12.0): the top bot card and the flipped cards.
  const bctl = (kind, extra = "") => `data-botdeck="${kind}" data-dry="${k}" data-path="/bots/${bi}/dryRuns/${di}/patch" ${extra}`;
  const botDeck = b.mode === "cards" ? `<div class="row">${fld("Activation seed", `<input type="number" min="0" step="1" placeholder="1" ${ctl("seed", "num")} value="${pt.seed ?? ""}">`, "Sets the Activation Number rolls. Empty means 1.")}${fld("Top bot card", `<select ${bctl("top")}><option value="">as listed (${esc(b.deck.cards[0].title)})</option>${b.deck.cards.map((c) => `<option value="${esc(c.id)}" ${pt.botDeck?.order?.[0] === c.id ? "selected" : ""}>${esc(c.title)}</option>`).join("")}</select>`)}${b.deck.cards.filter((c) => c.sides.length === 2).map((c) => `<label class="chk"><input type="checkbox" ${bctl("flip", `value="${esc(c.id)}"`)} ${(pt.botDeck?.flipped ?? []).includes(c.id) ? "checked" : ""}> ${esc(c.title)} shows its back</label>`).join("")}</div>` : "";
  return `<div class="grid4">${elig}${ply}${res}${tr}</div><div class="row">${card}</div><div class="row">${turn}</div><div class="row">${next}</div>${botDeck}${dice}${clear}${avail}${inPlay}<h4>Board changes</h4>${spaces}${add}`;
}

function dryRuns(b, bi) {
  const miss = missingCases(b);
  const optional = b.scoring?.length && !b.dryRuns.some((d) => d.case === "scoring") ? `<li><b>scoring</b> <small>${CASE_HELP.scoring}</small> ${btn("dry-add", "Add case", { cls: "link", data: `data-bot="${bi}" data-case="scoring"` })}</li>` : "";
  const list = CASES.map((c) => `<li>${b.dryRuns.some((d) => d.case === c) ? chip("ok", "✓") : chip("bad", "missing")} <b>${c}</b> <small>${CASE_HELP[c]}</small>${miss.includes(c) ? ` ${btn("dry-add", "Add case", { cls: "link", data: `data-bot="${bi}" data-case="${c}"` })}` : ""}</li>`).join("");
  const runs = b.dryRuns.map((d, di) => {
    const p = `bots/${bi}/dryRuns/${di}`, k = `${bi}/${di}`, r = results[k];
    const bad = S.issues.errors.find((e) => e.path === `/${p}`);
    const x = d.expect;
    const res = r ? (r.error ? `<p class="err">${esc(r.error)}</p>` : `<p><b>Result:</b> ${esc(r.outcome)}. Path: ${esc(r.path.join(" > "))}.${r.chosen?.length ? ` Chosen: ${esc(r.chosen.join(", "))}.` : ""}${r.side ? ` Side: ${r.side}.` : ""}${r.linked ? ` Linked: ${esc(r.linked)}.` : ""}${r.target ? ` Target: ${esc(fname(r.target))}.` : ""}${r.rolls ? ` Activation rolls: ${r.rolls.join(", ")}.` : ""}</p>${btn("dry-use", "Use result as expected", { data: `data-dry="${k}"` })}`) : "";
    return `<details class="act" data-k="dry-${esc(d.id)}" ${S.dopen[`dry-${d.id}`] ? "open" : ""}><summary><b>${esc(d.case)}</b> <small>${esc(d.id)}</small> ${bad ? chip("bad", "fail") : chip("ok", "pass")}</summary>
      ${bad ? `<p class="err">${esc(bad.message)}</p>` : ""}${fld("Case", sel(`${p}/case`, d.case, [...CASES, "scoring"], { r: true }))}
      <h4>Board state for this run (changes from setup)</h4>${patchForm(b, bi, d, di)}
      <h4>Expected</h4><p>${esc(x.outcome)}${x.path ? `. Path: ${esc(x.path.join(" > "))}` : ""}${x.chosen ? `. Chosen: ${esc(x.chosen.join(", "))}` : ""}${x.side ? `. Side: ${x.side}` : ""}${x.linked ? `. Linked: ${esc(x.linked)}` : ""}${x.target ? `. Target: ${esc(fname(x.target))}` : ""}.</p>
      <div class="row">${btn("dry-run", "Run now", { cls: "primary", data: `data-dry="${k}"` })}${confirmButton(`dry-${d.id}`, "Delete run", { action: "dry-del", data: `data-dry="${k}"` })}</div>${res}</details>`;
  }).join("");
  return `<section class="panel"><h3>Dry runs</h3><p class="lead">Six required cases check the bot against example board states.</p><ul class="cases">${list}${optional}</ul>${runs}</section>`;
}

export function renderBots() {
  const g = S.game;
  if (!g.bots.length) return `<section class="panel"><h3>Bots</h3>${picker()}</section>`;
  const bi = cur(), b = g.bots[bi], f = g.factions.find((x) => x.id === b.factionId);
  const G = graphOf(b, bi);
  if (!G.g.nodes.some((n) => n.id === S.botNode)) S.botNode = G.g.start;
  const info = graphInfo(G.g);
  const hl = Object.entries(results).find(([k]) => k.startsWith(`${bi}/`) && S.dryShow === k)?.[1]?.path ?? [];
  let svg; try { svg = graphSvg(G.g, { highlight: hl, selected: S.botNode, title: `${f?.name ?? b.factionId} bot flowchart` }); } catch (e) { svg = `<p class="err">Flowchart cannot be drawn: ${esc(e.message)}</p>`; }
  const list = G.g.nodes.map((n) => `<li><button type="button" class="${n.id === S.botNode ? "on" : ""}" data-a="bot-node" data-id="${esc(n.id)}"><small>${KINDS.find(([k]) => k === n.kind)?.[1] ?? n.kind}</small> ${esc(n.text || n.id)}${info.unreachable.includes(n.id) ? ` ${chip("bad", "unreachable")}` : ""}${info.cycles.includes(n.id) ? ` ${chip("bad", "loop")}` : ""}</button></li>`).join("");
  let aid; try { aid = toMarkdown(aidModel(g, b)); } catch (e) { aid = `Aid cannot be built: ${e.message}`; }
  const meas = b.measures.map((m, mi) => `<div class="opt"><div class="grid2">${fld("Name", inp(`bots/${bi}/measures/${mi}/name`, m.name))}${fld("Meaning (printed)", inp(`bots/${bi}/measures/${mi}/plain`, m.plain))}</div>${isCond(m.expr) ? condEditor(`bots/${bi}/measures/${mi}/expr`, m.expr, { space: true }) : valueEditor(`bots/${bi}/measures/${mi}/expr`, m.expr)}</div>`).join("");
  // A message from the last bot edit, such as the branches a delete cleared.
  const note = S.msg.bots ? `<p class="note" role="status">${esc(S.msg.bots)}</p>` : "";
  return `${picker()}${note}<div class="botp" style="${fvars(f?.color ?? "#888")}">
    <section class="panel"><h3>${f ? fbadge(f, fidx(f.id)) : ""} ${esc(f?.name ?? b.factionId)} bot</h3><div class="grid3">${fld("Code (2 or 3 capitals)", inp(`bots/${bi}/code`, b.code))}${fld("Most steps per turn", inp(`bots/${bi}/maxSteps`, b.maxSteps, { t: "n", type: "number", attrs: 'min="1"' }))}<div class="fld"><span>&nbsp;</span><label class="chk"><input type="checkbox" data-a="bot-res" data-i="${bi}" data-path="/bots/${bi}/tracksResources" ${tracksResources(b) ? "checked" : ""}> Tracks Resources</label><small>Off: its actions cost nothing, and it never gains or spends Resources.</small></div><div class="fld"><span>&nbsp;</span>${confirmButton(`bot-${b.id}`, "Delete this bot", { action: "bot-del", data: `data-i="${bi}"` })}</div></div>${fld("Goal in plain words (printed)", area(`bots/${bi}/objective`, b.objective, { rows: 2 }))}</section>
    ${deckPanel(b, bi)}<section class="panel"><h3>Flowchart</h3>${graphPicker(b)}<div class="flow" data-a="bot-svg" tabindex="0" role="region" aria-label="Flowchart. Use the node list below to select a node.">${svg}</div>
      <div class="graph"><div><h4>Nodes</h4><ul class="nodes">${list}</ul><select data-addnode="${bi}" data-g="${G.p}" data-path="/${G.p}/nodes" aria-label="Add a node"><option value="">Add a node...</option>${KINDS.map(([v, l]) => `<option value="${v}">${l}</option>`).join("")}</select></div><div>${nodeForm(b, bi, G)}</div></div></section>
    <section class="panel"><h3>Priority tables</h3>${b.priorityTables.map((t, ti) => tableEditor(t, bi, ti)).join("")}${btn("bot-addtable", "Add a space table", { cls: "link", data: `data-p="bots/${bi}"` })}${btn("bot-addenemy", "Add an enemy table", { cls: "link", data: `data-p="bots/${bi}"` })}
      <h4>Random ties</h4><div class="grid3">${fld("Die", sel(`bots/${bi}/randomization/die`, b.randomization.die, [["d6", "one six-sided die"]]))}${fld("Which spaces take part", area(`bots/${bi}/randomization/eligibleSet`, b.randomization.eligibleSet, { rows: 2 }))}${fld("How the roll picks", area(`bots/${bi}/randomization/procedure`, b.randomization.procedure, { rows: 2 }))}</div></section>
    <section class="panel"><h3>Shared tables</h3><p class="lead">Every bot can use these, such as the shared Move and Pieces priorities of card bots. A bot reads its own tables first. They print as S-1, S-2.</p>${(g.sharedTables ?? []).map((t, ti) => tableEditor(t, bi, ti, true)).join("")}${btn("bot-addshared", "Add a shared space table", { cls: "link", data: `data-scope="space"` })}${btn("bot-addshared", "Add a shared enemy table", { cls: "link", data: `data-scope="opponent"` })}</section>
    ${eventRules(b, bi)}
    ${scoringRules(b, bi)}
    <section class="panel"><h3>Measures</h3><p class="lead">Named values the bot aid prints.</p>${meas || "<p><small>No measures yet.</small></p>"}${btn("bot-addmeasure", "Add a measure", { cls: "link", data: `data-p="bots/${bi}/measures"` })}</section>
    ${dryRuns(b, bi)}
    <section class="panel"><details><summary>Printable aid (preview)</summary><pre class="aid" tabindex="0" aria-label="Printable aid preview">${esc(aid)}</pre></details></section></div>`;
}

// ---------- editing
const done = (msg) => { if (msg) S.msg.bots = msg; else delete S.msg.bots; touch(); render(); };
const freeId = (taken, base) => { let n = 1; while (taken.has(`${base}${n}`)) n++; return `${base}${n}`; };
const renumber = (steps) => steps.forEach((s, i) => { s.n = i + 1; });
const reletter = (ties) => ties.forEach((t, i) => { t.letter = String.fromCharCode(97 + i); });
const botOf = (p) => getP(S.game, p);

export const botActions = {
  "bot-pick": (d) => { S.bot = Number(d.i); S.botNode = null; S.botGraph = ""; render(); },
  // Card bots (1.12.0).
  "bot-addan": (d) => { getP(S.game, d.p).activation = 3; done(); },
  "bot-delan": (d) => { const sd = getP(S.game, d.p); delete sd.activation; for (const n of sd.nodes) delete n.noActivation; done(); },
  "bot-res": (d, el) => { const b = S.game.bots[d.i]; if (el.checked) delete b.tracksResources; else b.tracksResources = false; done(); },
  "bot-noan": (d, el) => { const n = getP(S.game, d.p); if (el.checked) n.noActivation = true; else delete n.noActivation; done(); },
  "bot-graph": (d) => { S.botGraph = d.g; S.botNode = null; render(); },
  "bot-cards": (d) => { setCardMode(botOf(d.p), true); S.botGraph = ""; done(); },
  "bot-nocards": (d) => { S.confirm = null; const cleared = setCardMode(botOf(d.p), false); S.botGraph = ""; done(cleared.length ? `Removed the bot deck. Cleared branches: ${cleared.join(", ")}. Set them again.` : "Removed the bot deck."); },
  "bot-addcard": (d) => { const b = botOf(d.p); addBotCard(b); S.botGraph = `${b.deck.cards.length - 1}/0`; S.botNode = null; done(); },
  "bot-delcard": (d) => { S.confirm = null; deleteBotCard(botOf(d.p), Number(d.i)); S.botGraph = ""; S.botNode = null; done(); },
  "bot-addback": (d) => { const b = botOf(d.p); addBack(b, b.deck.cards[Number(d.i)]); S.botGraph = `${d.i}/1`; S.botNode = null; done(); },
  "bot-delback": (d) => { S.confirm = null; const b = botOf(d.p), cleared = deleteBack(b, b.deck.cards[Number(d.i)]); S.botGraph = `${d.i}/0`; S.botNode = null; done(cleared.length ? `Removed the back side. Cleared branches: ${cleared.join(", ")}. Set them again.` : "Removed the back side."); },
  "bot-new": (d) => { S.game.bots.push(newBot(S.game, d.f)); S.bot = S.game.bots.length - 1; S.botNode = null; done(); },
  "bot-del": (d) => { S.confirm = null; S.game.bots.splice(Number(d.i), 1); S.bot = 0; done(); },
  "bot-node": (d) => { S.botNode = d.id; render(); },
  "bot-svg": (d, el, e) => { const g = e?.target?.closest?.("[data-node]"); if (g && el.contains(g)) { S.botNode = g.dataset.node; render(); } },
  "bot-start": (d) => { botOf(d.p).start = d.id; done(); },
  "bot-delnode": (d) => { S.confirm = null; const cleared = deleteNode(botOf(d.p), d.id); done(cleared.length ? `Deleted ${d.id}. Cleared branches: ${cleared.join(", ")}. Set them again.` : `Deleted ${d.id}.`); },
  "bot-linked": (d, el) => {
    const n = getP(S.game, d.p), b = botAt(d.p);
    if (el.checked) n.linked = { action: S.game.actions.find((a) => a.faction === b.factionId && a.kind === "specialActivity")?.id ?? "", timing: "after", trigger: true, table: tablesOf(S.game, b).find((t) => t.scope !== "opponent")?.id ?? "" };
    else delete n.linked;
    done();
  },
  // A second entry turns the object into a list; removing down to one entry turns it back.
  "bot-linked-add": (d) => {
    const n = getP(S.game, d.p), b = botAt(d.p), list = linkedOf(n);
    const { skipText, ...next } = structuredClone(list[0]);
    next.action = S.game.actions.find((a) => a.faction === b.factionId && a.kind === "specialActivity" && !list.some((x) => x.action === a.id))?.id ?? next.action;
    n.linked = [...list, next];
    done();
  },
  "bot-linked-del": (d) => {
    const n = getP(S.game, d.p), list = linkedOf(n).filter((_, i) => i !== Number(d.i));
    n.linked = list.length === 1 ? list[0] : list;
    done();
  },
  // A new choice names the first phase that no bot chooses in yet.
  "bot-addscoring": (d) => {
    const b = botOf(d.p), taken = new Set(S.game.bots.flatMap((x) => (x.scoring ?? []).map((sc) => sc.phaseId)));
    const ph = S.game.rules.scoring.phases.find((x) => !taken.has(x.id)) ?? S.game.rules.scoring.phases[0];
    (b.scoring ??= []).push({ phaseId: ph?.id ?? "", table: tablesOf(S.game, b).find((t) => t.scope !== "opponent")?.id ?? "", text: "" });
    done();
  },
  "bot-delscoring": (d) => { const b = botOf(d.p); b.scoring.splice(Number(d.i), 1); if (!b.scoring.length) delete b.scoring; done(); },
  // The first part takes the node's table and the Operation's effects; removing the last part gives its table back.
  "bot-parts-add": (d) => {
    const n = getP(S.game, d.p), b = botAt(d.p);
    const table = n.table ?? tablesOf(S.game, b).find((t) => t.scope !== "opponent")?.id ?? "";
    if (!n.parts) { n.parts = [{ text: "", table, steps: structuredClone(S.game.actions.find((a) => a.id === n.action)?.steps ?? []) }]; delete n.table; }
    else n.parts.push({ text: "", table: n.parts.at(-1).table, steps: [] });
    done();
  },
  "bot-parts-del": (d) => {
    const n = getP(S.game, d.p), [gone] = n.parts.splice(Number(d.i), 1);
    if (!n.parts.length) { delete n.parts; n.table = gone.table; }
    done();
  },
  // A step's own tie-break list is created on first add; removing the last one removes the field.
  "bot-steptb-add": (d) => { const st = getP(S.game, d.p); (st.tiebreak ??= []).push({ letter: "", text: "Highest Pop.", key: { var: "$space.pop" }, order: "max" }); reletter(st.tiebreak); done(); },
  "bot-addtable": (d) => { const b = botOf(d.p); const id = freeId(new Set(tablesOf(S.game, b).map((t) => t.id)), `${b.code.toLowerCase()}.t`); b.priorityTables.push({ id, scope: "space", select: "one", mode: "sequence", steps: [{ n: 1, text: "Any legal space.", filter: true }], tiebreak: [] }); S.dopen[`tbl-${id}`] = true; done(); },
  "bot-addenemy": (d) => { const b = botOf(d.p); const id = freeId(new Set(tablesOf(S.game, b).map((t) => t.id)), `${b.code.toLowerCase()}.enemy`); b.priorityTables.push({ id, scope: "opponent", select: "one", steps: [{ n: 1, text: "Any enemy.", filter: true }], tiebreak: [{ letter: "a", text: "Highest victory margin.", key: { var: "$faction.margin" }, order: "max" }] }); S.dopen[`tbl-${id}`] = true; done(); },
  // Shared tables (1.12.0 part C). Ids are free over every bot's tables and the shared ones.
  "bot-addshared": (d) => {
    const g = S.game, taken = new Set([...g.bots.flatMap((b) => b.priorityTables.map((t) => t.id)), ...(g.sharedTables ?? []).map((t) => t.id)]);
    const enemy = d.scope === "opponent", id = freeId(taken, enemy ? "sh.enemy" : "sh.t");
    (g.sharedTables ??= []).push(enemy ? { id, scope: "opponent", select: "one", steps: [{ n: 1, text: "Any enemy.", filter: true }], tiebreak: [{ letter: "a", text: "Highest victory margin.", key: { var: "$faction.margin" }, order: "max" }] } : { id, scope: "space", select: "one", mode: "sequence", steps: [{ n: 1, text: "Any legal space.", filter: true }], tiebreak: [] });
    S.dopen[`tbl-${id}`] = true; done();
  },
  "bot-delshared": (d) => { S.confirm = null; S.game.sharedTables.splice(Number(d.i), 1); if (!S.game.sharedTables.length) delete S.game.sharedTables; done(); },
  "bot-deltable": (d) => { S.confirm = null; botOf(d.p).priorityTables.splice(Number(d.i), 1); done(); },
  "bot-addov": (d) => { getP(S.game, d.p).push({ cardId: d.card, directive: "force", plain: "Always play this Event when it has an effect." }); done(); },
  "bot-addmeasure": (d) => { const arr = getP(S.game, d.p); arr.push({ id: freeId(new Set(arr.map((m) => m.id)), "m"), name: "New measure", plain: "", expr: 0 }); done(); },
  "dry-add": (d) => { const b = S.game.bots[Number(d.bot)]; const r = newDryRun(b, d.case); b.dryRuns.push(r); S.dopen[`dry-${r.id}`] = true; done(); },
  "dry-del": (d) => { S.confirm = null; const [bi, di] = d.dry.split("/").map(Number); S.game.bots[bi].dryRuns.splice(di, 1); delete results[d.dry]; done(); },
  "dry-run": (d) => { const [bi, di] = d.dry.split("/").map(Number); results[d.dry] = runDry(S.game, S.game.bots[bi], S.game.bots[bi].dryRuns[di]); S.dryShow = d.dry; render(); },
  "dry-use": (d) => { const [bi, di] = d.dry.split("/").map(Number); const r = results[d.dry]; if (!r || r.error) return; S.game.bots[bi].dryRuns[di].expect = toExpect(r); done(); },
  "dry-delspace": (d) => { const [bi, di] = d.dry.split("/").map(Number); const pt = S.game.bots[bi].dryRuns[di].patch; delete pt.spaces[d.s]; if (!Object.keys(pt.spaces).length) delete pt.spaces; done(); }
};

// Sets a key in a patch. Parts are joined with "/", since ids may hold dots. An empty value removes the key and any object it leaves empty.
function setPatch(pt, key, v) {
  const ks = key.split("/"), last = ks.pop(), chain = [pt];
  for (const k of ks) chain.push(chain.at(-1)[k] ??= {});
  if (v === undefined) delete chain.at(-1)[last]; else chain.at(-1)[last] = v;
  for (let i = ks.length - 1; i >= 0; i--) if (!Object.keys(chain[i + 1]).length) delete chain[i][ks[i]];
}

// Returns true when the change belonged to the bots tab.
export function onBotChange(el) {
  const d = el.dataset ?? {};
  if (d.dk) {
    const [bi, di] = d.dry.split("/").map(Number), pt = S.game.bots[bi].dryRuns[di].patch, v = el.value;
    if (d.dt === "bool3") setPatch(pt, d.dk, v === "" ? undefined : v === "true");
    else if (d.dt === "num") setPatch(pt, d.dk, v === "" ? undefined : Number(v));
    else if (d.dt === "bool") setPatch(pt, d.dk, el.checked);
    else if (d.dt === "text") setPatch(pt, d.dk, v === "" ? undefined : v);
    else if (d.dt === "dice") { const n = v.split(/[ ,]+/).filter(Boolean).map(Number).filter((x) => x >= 1 && x <= 6); setPatch(pt, "dice", n.length ? n : undefined); }
    else if (d.dt === "inplay") { const s = new Set(pt.inPlay ?? []); if (el.checked) s.add(el.value); else s.delete(el.value); setPatch(pt, "inPlay", s.size ? [...s] : undefined); }
    else if (d.dt === "list") { const s = new Set(pt.clearPieces ?? []); if (el.checked) s.add(el.value); else s.delete(el.value); setPatch(pt, "clearPieces", s.size ? [...s] : undefined); }
    else if (d.dt === "addspace" && v) setPatch(pt, `spaces/${v}/opinion`, S.game.setup.spaceAttributes?.[v]?.opinion ?? 0);
    else if (d.dt === "addpiece" && v) { const pc = S.game.factions.flatMap((f) => f.pieces).find((x) => x.id === v); setPatch(pt, `${d.dk}/${v}/${pc.states[0]}`, 0); }
    if (d.dk.startsWith("card/id") && pt.card && pt.card.hasEffect === undefined) pt.card.hasEffect = true;
    done(); return true;
  }
  if (d.budget) {
    const n = getP(S.game, d.budget), v = el.value.trim(), bg = { ...n.budget };
    if (d.bk === "share") {
      const m = /^(\d+)\s*\/\s*(\d+)$/.exec(v);
      if (v && !m) { el.classList.add("invalid"); return true; }
      el.classList.remove("invalid");
      if (m) bg.share = [Number(m[1]), Number(m[2])]; else delete bg.share;
    } else if (v === "") delete bg[d.bk]; else bg[d.bk] = Number(v);
    if (Object.keys(bg).length) n.budget = bg; else delete n.budget;
    done(); return true;
  }
  // A step's own target (schema 1.8.0): an enemy faction, or none.
  if (d.steppiece) { const st = getP(S.game, d.steppiece); if (el.value) st.piece = el.value; else delete st.piece; done(); return true; }
  if (d.steptarget) { const st = getP(S.game, d.steptarget); if (el.value) st.target = el.value; else delete st.target; done(); return true; }
  if (d.botgraph) { S.botGraph = el.value; S.botNode = null; render(); return true; }
  // botDeck (1.12.0): the top card puts that card first, the rest in deck order; flipped is a list.
  if (d.botdeck) {
    const [bi, di] = d.dry.split("/").map(Number), b = S.game.bots[bi], pt = b.dryRuns[di].patch, bd = { ...pt.botDeck }, ids = b.deck.cards.map((c) => c.id);
    if (d.botdeck === "top") { if (el.value) bd.order = [el.value, ...ids.filter((x) => x !== el.value)]; else delete bd.order; }
    else { const f = new Set(bd.flipped ?? []); if (el.checked) f.add(el.value); else f.delete(el.value); if (f.size) bd.flipped = ids.filter((x) => f.has(x)); else delete bd.flipped; }
    if (Object.keys(bd).length) pt.botDeck = bd; else delete pt.botDeck;
    done(); return true;
  }
  if (d.addnode) { if (!el.value) return true; const b = S.game.bots[Number(d.addnode)]; S.botNode = addNode(b, el.value, getP(S.game, d.g)).id; done(); return true; }
  if (d.nkind) {
    const n = getP(S.game, d.nkind), keep = { id: n.id, kind: el.value, text: n.text };
    for (const k of Object.keys(n)) delete n[k];
    Object.assign(n, keep, el.value === "condition" ? { test: true } : el.value === "end" ? { outcome: "pass" } : {});
    done(); return true;
  }
  if (d.nodeid) {
    const v = el.value.trim(), bi = Number(d.bot), b = S.game.bots[bi];
    if (!ID_OK.test(v) || botNodes(b).some((n) => n.id === v)) { done(`Node id "${v}" is not valid or is already in use.`); return true; }
    S.game.bots[bi] = renameId(b, d.nodeid, v); S.botNode = v; done(); return true;
  }
  return false;
}

defineList("tsteps", {
  add: (d) => { const a = getP(S.game, d.p); a.push({ n: a.length + 1, text: "", filter: true }); done(); },
  remove: (d) => { const a = getP(S.game, d.p); a.splice(Number(d.i), 1); renumber(a); done(); }
});
defineList("tbreaks", {
  add: (d) => { const a = getP(S.game, d.p); a.push({ letter: "", text: "Highest Pop.", key: { var: "$space.pop" }, order: "max" }); reletter(a); done(); },
  remove: (d) => { const a = getP(S.game, d.p); a.splice(Number(d.i), 1); reletter(a); if (!a.length && /\/steps\/\d+\/tiebreak$/.test(d.p)) delete getP(S.game, d.p.replace(/\/tiebreak$/, "")).tiebreak; done(); }
});
defineList("overrides", { remove: (d) => { getP(S.game, d.p).splice(Number(d.i), 1); done(); } });
