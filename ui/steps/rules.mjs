import { S, esc } from "../state.mjs";
import { fld, inp, area, btn } from "../components/fields.mjs";
import { valueEditor } from "../components/exprEditor.mjs";
import { stepList } from "../components/stepList.mjs";
import { renderDeck } from "./deck.mjs";
import { renderBots } from "./bots.mjs";
import { addButton } from "../components/listEditor.mjs";
import { touch, check, ask, guard } from "../store.mjs";
import { step4Prompt, fillStep4 } from "../../src/step4suggest.mjs";
import { render } from "../shell.mjs";

// One Claude button per tab. It fills only what is still empty or at its default; the designer
// reviews the result before Apply, and Undo restores it.
const SUGGEST = {
  rules: ["Fill empty rulebook text and scoring phases", "Claude writes rulebook sections that are still empty and the scoring phases when there are none."],
  deck: ["Suggest Event cards", "Claude adds Event cards from the sources. With an empty deck it also adds scoring cards and builds the piles. Your cards stay."],
  victory: ["Fill default victory rules", "Claude rewrites victory rules still at the preset default, plus empty timing and tie-break fields."],
  bots: ["Suggest bots", "Claude adds a bot for each faction that has none. You add the 6 dry runs after."]
};
const APPLY = { rules: (g, x) => { g.rules = x.rules; }, deck: (g, x) => { g.deck = x.deck; }, victory: (g, x) => { g.victory = x.victory; }, bots: (g, x) => { g.bots = x.bots; } };
const keyOf = (part) => `s4${part}`;

function suggestPanel(part) {
  const g = S.game, k = keyOf(part), [label, help] = SUGGEST[part];
  const read = g.brief.sources.filter((s) => s.status === "read" && S.texts[s.id]).map((s) => s.id);
  const p = S.proposal?.kind === k ? S.proposal : null;
  const list = (title, xs) => (xs.length ? `<details ${title === "Apply adds" ? "open" : ""}><summary>${title} (${xs.length})</summary><ul>${xs.map((x) => `<li>${esc(x)}</li>`).join("")}</ul></details>` : "");
  const prev = p ? `<div class="proposal" role="region" aria-label="Claude's suggestion"><h4>Claude's suggestion</h4>
    ${p.report.added.length ? list("Apply adds", p.report.added) : "<p>Nothing to add: every part is already filled.</p>"}
    ${p.report.notes ? `<p><small>${esc(p.report.notes)}</small></p>` : ""}
    ${list("Kept as you set it", p.report.skipped)}${list("Parts of the answer not used", p.report.dropped)}
    <div class="row">${btn("step4-accept", "Apply to this tab", { cls: "primary", data: `data-part="${part}"`, dis: !p.report.added.length })}${btn("dismiss", "Keep mine")}</div></div>` : "";
  return `<section class="panel"><h3>Suggest from sources</h3><p><small>${help} Sources: ${read.join(", ") || "none yet"}.</small></p>
  <div class="row">${btn("step4-suggest", S.busy[k] ? "Asking Claude..." : label, { cls: "primary", data: `data-part="${part}"`, dis: S.busy[k] || !S.sample || !read.length })}</div>${S.msg[k] ? `<p class="err">${esc(S.msg[k])}</p>` : ""}${prev}</section>`;
}
async function suggest(part) {
  const g = S.game;
  const r = await ask(step4Prompt(part, g, S.texts));
  S.proposal = { kind: keyOf(part), part, raw: r, ...fillStep4(part, g, r) };
}
function accept(part) {
  const p = S.proposal, k = keyOf(part);
  if (p?.kind !== k) return;
  // Apply fills the game as it is now, so edits made during the preview stay. When that changes what
  // Apply would do, the preview updates first and the designer applies again.
  let next;
  try { next = fillStep4(part, S.game, p.raw); } catch (e) { S.proposal = null; S.msg[k] = e.message; render(); return; }
  if (JSON.stringify(next.report) !== JSON.stringify(p.report)) { S.proposal = { ...p, ...next }; S.msg[k] = "The game changed since the preview. Check the updated suggestion, then apply again."; render(); return; }
  delete S.msg[k]; APPLY[part](S.game, next.game); S.proposal = null; touch(); check(); render();
}

// Control (schema 1.11.0): sides, pieces that do not count and the space types that can be controlled.
function controlPanel(g) {
  const c = g.rules.control, chk = (kind, val, on, label, extra = "") => `<label class="chk"><input type="checkbox" data-ctl="${kind}" value="${esc(val)}" data-path="/rules/control" ${extra} ${on ? "checked" : ""}> ${esc(label)}</label>`;
  const head = `${chk("on", "on", !!c, "This game uses Control")}<p><small>A faction or side controls a space when its pieces there outnumber all other pieces. Bots read it as "the controller of this space".</small></p>`;
  if (!c) return `<section class="panel"><h3>Control</h3>${head}</section>`;
  const types = [...new Set([...g.board.spaces.map((s) => s.type), ...(c.types ?? [])])];
  const sides = (c.sides ?? []).map((sd, i) => `<div class="sblock"><div class="grid2">${fld("Side id (bots compare with it)", `<input data-ctl="side-id" data-i="${i}" data-path="/rules/control/sides/${i}" value="${esc(sd.id)}">`)}${fld("Side name", `<input data-ctl="side-name" data-i="${i}" data-path="/rules/control/sides/${i}" value="${esc(sd.name)}">`)}</div><p>${g.factions.map((f) => chk("side-f", f.id, sd.factions.includes(f.id), f.name, `data-i="${i}"`)).join(" ")}</p>${btn("ctl-side-del", "Remove this side", { cls: "link", data: `data-i="${i}"` })}</div>`).join("");
  return `<section class="panel"><h3>Control</h3>${head}
    <h4>Spaces that can be controlled</h4><p>${types.map((t) => chk("type", t, c.types?.includes(t), t)).join(" ")}</p><p><small>None checked: every space.</small></p>
    <h4>Pieces that do not count</h4><p>${g.factions.flatMap((f) => f.pieces).map((p) => chk("exclude", p.id, c.exclude?.includes(p.id), p.name)).join(" ")}</p>
    <h4>Sides</h4><p><small>Factions in one side control together, such as COIN (US and ARVN). A faction in no side controls alone.</small></p>${sides}${btn("ctl-side-add", "Add a side", { cls: "link" })}</section>`;
}

// Returns true when the change belonged to the Control panel.
export function onControlChange(el) {
  const k = el.dataset?.ctl;
  if (!k) return false;
  const g = S.game;
  if (k === "on") { if (el.checked) g.rules.control = {}; else delete g.rules.control; touch(); render(); return true; }
  const c = g.rules.control, i = Number(el.dataset.i);
  const toggle = (list, v) => { const s = new Set(list ?? []); if (el.checked) s.add(v); else s.delete(v); return [...s]; };
  if (k === "type" || k === "exclude") { const key = k === "type" ? "types" : "exclude", v = toggle(c[key], el.value); if (v.length) c[key] = v; else delete c[key]; }
  if (k === "side-f") c.sides[i].factions = g.factions.map((f) => f.id).filter((id) => toggle(c.sides[i].factions, el.value).includes(id));
  if (k === "side-id" && el.value.trim()) c.sides[i].id = el.value.trim();
  if (k === "side-name") c.sides[i].name = el.value;
  touch(); render(); return true;
}

export function renderRules() {
  const g = S.game, T = S.tab;
  const tabs = [["rules", "Rules"], ["deck", "Event and scoring deck"], ["victory", "Victory"], ["bots", "Bots"]];
  const nav = `<div class="tabs" role="tablist">${tabs.map(([k, l]) => `<button type="button" role="tab" aria-selected="${T === k}" class="${T === k ? "on" : ""}" data-a="tab" data-tab="${k}">${l}<span data-tabcount="${k[0].toUpperCase() + k.slice(1)}"></span></button>`).join("")}</div>`;
  let body;
  if (T === "rules") {
    const seq = g.rules.sequence;
    body = `<section class="panel"><h3>Rulebook text</h3>${Object.keys(g.rules.text).map((k) => fld(k[0].toUpperCase() + k.slice(1), area(`rules/text/${k}`, g.rules.text[k], { rows: 3 }))).join("")}</section>
    <section class="panel"><h3>Sequence of play</h3>${fld("Who acts first", area("rules/sequence/firstActor", seq.firstActor, { rows: 2 }))}
    <table class="t"><thead><tr><th>First faction chooses</th><th>Second faction may choose</th></tr></thead><tbody>${Object.entries(seq.secondActorOptions).map(([k, v]) => `<tr><td>${esc(k)}</td><td>${esc(v.join(", "))}</td></tr>`).join("")}</tbody></table>
    <div class="grid3">${g.factions.map((f) => fld(`${esc(f.name)} Pass gain`, inp(`rules/sequence/passGain/${f.id}`, seq.passGain[f.id], { t: "n", type: "number", attrs: 'min="0"' }))).join("")}</div>
    ${fld("If every acting faction would be Ineligible", inp("rules/sequence/eligibilityAfter/bothIneligibleResult", seq.eligibilityAfter.bothIneligibleResult))}</section>
    <section class="panel"><h3>${esc(g.rules.scoring.name)} phases</h3>${g.rules.scoring.phases.map((p, i) => `<div class="phase">${fld(esc(p.name), area(`rules/scoring/phases/${i}/text`, p.text, { rows: 2 }))}<ol class="steps">${stepList(p.steps, `rules/scoring/phases/${i}/steps`)}</ol>${addButton("steps", "Add effect", { cls: "link", data: `data-p="rules/scoring/phases/${i}/steps"` })}</div>`).join("")}</section>`;
    body += controlPanel(g);
  } else if (T === "deck") {
    body = renderDeck();
  } else if (T === "victory") {
    body = `<section class="panel"><h3>Victory</h3>${g.victory.perFaction.map((v, i) => `<div class="grid2">${fld(`${esc(g.factions.find((f) => f.id === v.factionId)?.name ?? v.factionId)}: how it wins`, area(`victory/perFaction/${i}/plain`, v.plain, { rows: 2 }))}${fld("Threshold", inp(`victory/perFaction/${i}/threshold`, v.threshold, { t: "n", type: "number" }))}</div><div class="fld"><span>Score</span>${valueEditor(`victory/perFaction/${i}/formula`, v.formula)}</div>`).join("")}
    ${fld("When victory is checked", inp("victory/checkAt", g.victory.checkAt))}${fld("Final scoring", inp("victory/finalScoring", g.victory.finalScoring))}${fld("Tie-breaks (one per line)", area("victory/tieBreaks", g.victory.tieBreaks, { t: "l", rows: 3 }))}</section>`;
  } else {
    body = renderBots();
  }
  return `<h2 tabindex="-1" id="h">Complete the rules, cards and bots</h2>${nav}${suggestPanel(T)}${body}`;
}

export const rulesActions = {
  "ctl-side-add": () => {
    const g = S.game, c = g.rules.control, sides = (c.sides ??= []);
    const used = new Set(sides.flatMap((s) => s.factions)), free = g.factions.map((f) => f.id).filter((id) => !used.has(id));
    let n = sides.length + 1; while (sides.some((s) => s.id === `side${n}`)) n++;
    sides.push({ id: `side${n}`, name: `Side ${n}`, factions: (free.length >= 2 ? free : g.factions.map((f) => f.id)).slice(0, 2) });
    touch(); render();
  },
  "ctl-side-del": (d) => { const c = S.game.rules.control; c.sides.splice(Number(d.i), 1); if (!c.sides.length) delete c.sides; touch(); render(); },
  tab: (d) => { S.tab = d.tab; render(); },
  "step4-suggest": (d) => guard(keyOf(d.part), () => suggest(d.part)),
  "step4-accept": (d) => accept(d.part),
};
