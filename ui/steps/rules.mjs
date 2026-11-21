import { S, esc } from "../state.mjs";
import { fld, inp, area } from "../components/fields.mjs";
import { valueEditor } from "../components/exprEditor.mjs";
import { stepList } from "../components/stepList.mjs";
import { renderDeck } from "./deck.mjs";
import { renderBots } from "./bots.mjs";
import { addButton } from "../components/listEditor.mjs";
import { render } from "../shell.mjs";

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
  } else if (T === "deck") {
    body = renderDeck();
  } else if (T === "victory") {
    body = `<section class="panel"><h3>Victory</h3>${g.victory.perFaction.map((v, i) => `<div class="grid2">${fld(`${esc(g.factions.find((f) => f.id === v.factionId)?.name ?? v.factionId)}: how it wins`, area(`victory/perFaction/${i}/plain`, v.plain, { rows: 2 }))}${fld("Threshold", inp(`victory/perFaction/${i}/threshold`, v.threshold, { t: "n", type: "number" }))}</div><div class="fld"><span>Score</span>${valueEditor(`victory/perFaction/${i}/formula`, v.formula)}</div>`).join("")}
    ${fld("When victory is checked", inp("victory/checkAt", g.victory.checkAt))}${fld("Final scoring", inp("victory/finalScoring", g.victory.finalScoring))}${fld("Tie-breaks (one per line)", area("victory/tieBreaks", g.victory.tieBreaks, { t: "l", rows: 3 }))}</section>`;
  } else {
    body = renderBots();
  }
  return `<h2 tabindex="-1" id="h">Complete the rules, cards and bots</h2>${nav}${body}`;
}

export const rulesActions = {
  tab: (d) => { S.tab = d.tab; render(); },
};
