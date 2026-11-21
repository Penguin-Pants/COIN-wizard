// Deck tab: card list, card sides, piles builder, sample deck and the printed card sheet.
import { addCard, duplicateCard, cardRefs, deleteCard, renameCard, buildPiles, sampleDeck } from "../../src/deck.mjs";
import { cardsHtml } from "../../src/kit.mjs";
import { S, esc } from "../state.mjs";
import { fld, inp, area, sel, btn, chip, bound } from "../components/fields.mjs";
import { stepList } from "../components/stepList.mjs";
import { addButton, defineList, moveButton } from "../components/listEditor.mjs";
import { confirmButton } from "../components/confirmButton.mjs";
import { draftButton, staleChip } from "../components/plainText.mjs";
import { isOpen } from "../components/faction.mjs";
import { touch } from "../store.mjs";
import { render } from "../shell.mjs";

const ID_OK = /^[a-z0-9][a-z0-9._-]*$/;

function cardEditor(c, i) {
  const g = S.game, k = `card-${c.id}`, p = `deck/cards/${i}`;
  const refs = S.confirm === `del-${c.id}` ? cardRefs(g, c.id) : [];
  const refNote = refs.length ? `<p class="note">Deleting removes ${esc(c.id)} from: ${refs.map((r) => esc(r.label)).join("; ")}. Dry runs that use it keep the old id and show a blocker to fix.</p>` : "";
  const order = c.order.map((f, j) => sel(`${p}/order/${j}`, f, g.factions.map((x) => [x.id, x.name]), { r: true })).join("");
  const sides = (c.sides ?? []).map((s, j) => `<div class="side"><b>${s.id === "unshaded" ? "Unshaded" : "Shaded"}</b><div class="grid2">${fld("Label", inp(`${p}/sides/${j}/label`, s.label))}${fld(`Text${staleChip(s)}`, area(`${p}/sides/${j}/text`, s.text, { rows: 2 }))}</div>${draftButton(`${p}/sides/${j}`, "text")}<h4>Effects, in order</h4><ol class="steps">${stepList(s.steps, `${p}/sides/${j}/steps`)}</ol>${addButton("steps", "Add effect", { cls: "link", data: `data-p="${p}/sides/${j}/steps"` })}</div>`).join("");
  return `<details class="card" data-k="${esc(k)}" ${isOpen(k, false) ? "open" : ""}><summary><b>${esc(c.title)}</b> <small>${c.type === "event" ? "Event" : "Scoring"} ${esc(c.id)}</small>${c.final ? ` ${chip("wait", "final")}` : ""}</summary>
    <div class="row">${moveButton("cards", "up", i)}${moveButton("cards", "down", i)}${btn("card-dup", "Duplicate", { data: `data-id="${esc(c.id)}"` })}${confirmButton(`del-${c.id}`, "Delete card", { action: "card-delete", data: `data-id="${esc(c.id)}"` })}</div>${refNote}
    <div class="grid3">${fld("Card id", `<input data-cardid="${esc(c.id)}" data-path="/${p}/id" value="${esc(c.id)}">`, "Renames it in piles, bot exceptions and dry runs.")}${fld("Title", inp(`${p}/title`, c.title, { r: true }))}${fld("Flavor text", inp(`${p}/flavor`, c.flavor ?? ""))}</div>
    ${fld("Faction order (left acts first)", `<span class="row">${order}</span>`)}
    ${c.type === "scoring" ? fld("Final scoring card", `<input type="checkbox" ${bound(`${p}/final`, "b", true)} ${c.final ? "checked" : ""}>`, "The game ends after the final card. It must be the last card of the deck.") : sides}</details>`;
}

function piles() {
  const g = S.game, prep = g.deck.preparation;
  const scoring = g.deck.cards.filter((c) => c.type === "scoring");
  const n = S.pileCount ?? (prep.piles.length || Math.max(1, scoring.length));
  const pileOf = (id) => prep.piles.findIndex((p) => p.events.includes(id));
  const events = g.deck.cards.filter((c) => c.type === "event");
  const rows = prep.piles.map((pl, i) => `<tr><td>${esc(pl.id)}</td><td>${pl.events.length}</td><td>${sel(`deck/preparation/piles/${i}/scoring`, pl.scoring, scoring.map((c) => [c.id, `${c.title} (${c.id})`]), { r: true })}</td><td><span class="row">${inp(`deck/preparation/piles/${i}/scoringPlacement/fromPosition`, pl.scoringPlacement.fromPosition, { t: "n", type: "number", attrs: 'min="1"', r: true })}<span>to</span>${inp(`deck/preparation/piles/${i}/scoringPlacement/toPosition`, pl.scoringPlacement.toPosition, { t: "n", type: "number", attrs: 'min="1"', r: true })}</span></td></tr>`).join("");
  const assign = prep.piles.length ? `<details><summary>Move Event cards between piles</summary><table class="t"><thead><tr><th>Event card</th><th>Pile</th></tr></thead><tbody>${events.map((c) => `<tr><td>${esc(c.title)} <small>${esc(c.id)}</small></td><td><select data-pilemove="${esc(c.id)}" data-path="/deck/preparation/piles" aria-label="Pile for ${esc(c.title)}">${prep.piles.map((pl, i) => `<option value="${i}" ${pileOf(c.id) === i ? "selected" : ""}>${esc(pl.id)}</option>`).join("")}${pileOf(c.id) < 0 ? '<option value="" selected>none</option>' : ""}</select></td></tr>`).join("")}</tbody></table></details>` : "";
  let strip = "";
  try {
    const d = sampleDeck(g, S.deckSeed ?? 1);
    const byId = Object.fromEntries(g.deck.cards.map((c) => [c.id, c]));
    if (d.every((id) => byId[id])) strip = `<h4>One sample deck, top card first</h4><ol class="strip">${d.map((id) => `<li class="${byId[id].type}${byId[id].final ? " final" : ""}" title="${esc(byId[id].title)}">${esc(id)}</li>`).join("")}</ol>${btn("deck-reshuffle", "Shuffle again", { cls: "link" })}`;
  } catch { /* piles not complete yet */ }
  return `<section class="panel"><h3>Piles</h3><p class="lead">Each pile holds Event cards and one scoring card. The scoring card is shuffled into a position range. The final card is always the last card.</p>
    <div class="row"><label class="fld inline"><span>Number of piles</span><select id="pilecount" data-path="/deck/preparation/piles">${[1, 2, 3, 4, 5, 6].map((x) => `<option ${x === n ? "selected" : ""}>${x}</option>`).join("")}</select></label>${btn("piles-build", prep.piles.length ? "Rebuild piles" : "Build piles", { cls: "primary" })}</div>
    ${S.msg.piles ? `<p class="err">${esc(S.msg.piles)}</p>` : ""}
    ${prep.piles.length ? `<table class="t"><thead><tr><th>Pile</th><th>Event cards</th><th>Scoring card</th><th>Scoring card lands in positions</th></tr></thead><tbody>${rows}</tbody></table>` : "<p><small>No piles yet. Add cards, then build the piles.</small></p>"}
    ${assign}${strip}
    ${fld("Preparation text (printed)", area("deck/preparation/text", prep.text, { rows: 3 }))}</section>`;
}

export function renderDeck() {
  const g = S.game;
  const nE = g.deck.cards.filter((c) => c.type === "event").length, nS = g.deck.cards.length - nE;
  let sheet;
  try { sheet = `<details><summary>Card sheet preview (printed)</summary><iframe class="sheet" title="Card sheet preview" sandbox="" srcdoc="${esc(cardsHtml(g))}"></iframe></details>`; } catch { sheet = "<p><small>The card sheet preview needs a faction order on every card.</small></p>"; }
  return `<section class="panel"><h3>Cards</h3><p class="lead">${nE} Event cards and ${nS} scoring cards.</p>
    <div class="row">${btn("card-add", "Add Event card", { data: 'data-type="event"' })}${btn("card-add", "Add scoring card", { data: 'data-type="scoring"' })}</div>
    ${S.msg.deck ? `<p class="${S.msg.deckOk ? "okmsg" : "err"}">${esc(S.msg.deck)}</p>` : ""}
    ${g.deck.cards.map(cardEditor).join("") || "<p><small>No cards yet. Add an Event card to start.</small></p>"}</section>${piles()}<section class="panel"><h3>Print</h3>${sheet}</section>`;
}

const done = (msg, ok = true) => { if (msg !== undefined) { S.msg.deck = msg; S.msg.deckOk = ok; } touch(); render(); };
export const deckActions = {
  "card-add": (d) => { const c = addCard(S.game, d.type); S.dopen[`card-${c.id}`] = true; done(`Added ${c.id}. Put it in a pile below.`); },
  "card-dup": (d) => { const c = duplicateCard(S.game, d.id); S.dopen[`card-${c.id}`] = true; done(`Added ${c.id}, a copy of ${d.id}. Put it in a pile below.`); },
  "card-delete": (d) => { S.confirm = null; const refs = deleteCard(S.game, d.id); const open = refs.filter((r) => !r.fixed); done(`Deleted ${d.id}.${refs.length ? ` Removed ${refs.length - open.length} reference${refs.length - open.length === 1 ? "" : "s"}.` : ""}${open.length ? ` Still to fix: ${open.map((r) => r.label).join("; ")}.` : ""}`, !open.length); },
  "piles-build": () => { try { buildPiles(S.game, Number(document.getElementById("pilecount").value)); delete S.msg.piles; } catch (e) { S.msg.piles = e.message; } done(); },
  "deck-reshuffle": () => { S.deckSeed = (S.deckSeed ?? 1) + 1; render(); }
};

// Returns true when the change belonged to the deck tab.
export function onDeckChange(el) {
  const d = el.dataset ?? {};
  if (el.id === "pilecount") { S.pileCount = Number(el.value); return true; }
  if (d.pilemove) {
    for (const p of S.game.deck.preparation.piles) p.events = p.events.filter((e) => e !== d.pilemove);
    if (el.value !== "") S.game.deck.preparation.piles[Number(el.value)].events.push(d.pilemove);
    done(); return true;
  }
  if (d.cardid) {
    const v = el.value.trim();
    if (v === d.cardid) return true;
    if (!ID_OK.test(v)) { done(`Card id "${v}" is not valid. Use lowercase letters, digits, dot, dash or underscore.`, false); return true; }
    if (S.game.deck.cards.some((c) => c.id === v)) { done(`Card id ${v} is already in use.`, false); return true; }
    S.game = renameCard(S.game, d.cardid, v);
    S.dopen[`card-${v}`] = true;
    done(`Renamed ${d.cardid} to ${v}.`); return true;
  }
  return false;
}

defineList("cards", {
  up: (d) => { const a = S.game.deck.cards, i = Number(d.i); if (i > 0) [a[i - 1], a[i]] = [a[i], a[i - 1]]; done(); },
  down: (d) => { const a = S.game.deck.cards, i = Number(d.i); if (i < a.length - 1) [a[i + 1], a[i]] = [a[i], a[i + 1]]; done(); }
});
