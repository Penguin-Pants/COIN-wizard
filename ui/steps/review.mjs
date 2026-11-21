import { S, $, esc, clone, pieces } from "../state.mjs";
import { chip, btn, issueCount } from "../components/fields.mjs";
import { issueList } from "../components/issueMarker.mjs";
import { zip } from "../../src/zip.mjs";
import { snapshot, renderRevisions } from "../recovery.mjs";
import { confirmButton } from "../components/confirmButton.mjs";
import { fdot } from "../components/faction.mjs";
import { validate } from "../../src/validate.mjs";
import { migrate } from "../../src/migrate.mjs";
import { toMermaid, toMarkdown, toPolicyYaml } from "../../src/botaid.mjs";
import { buildFiles } from "../../src/kit.mjs";
import { check, scheduleSave, saveFinal, syncSources } from "../store.mjs";
import { render } from "../shell.mjs";

export function renderReview() {
  const g = S.game, errs = S.issues.errors.length;
  const card = (title, step, tab, lines, editors) => { const n = issueCount(editors); return `<div class="rc ${n ? "bad" : ""}"><h3 class="h4">${title} ${n ? chip("bad", `${n} to fix`) : chip("ok", "ok")}</h3>${lines.map((l) => `<p>${l}</p>`).join("")}${btn("goto", "Edit", { cls: "link", data: `data-step="${step}" ${tab ? `data-tab="${tab}"` : ""}` })}</div>`; };
  const srcCount = (st) => g.brief.sources.filter((s) => s.status === st).length;
  const passed = g.bots.reduce((a, b, bi) => a + b.dryRuns.filter((d, di) => !S.issues.errors.some((e) => e.path === `/bots/${bi}/dryRuns/${di}`)).length, 0), total = g.bots.reduce((a, b) => a + b.dryRuns.length, 0);
  const ready = errs === 0;
  const kit = S.game.meta.status === "final" ? S.game : null;
  return `<h2 tabindex="-1" id="h">Review and finalize</h2><p class="lead">Everything in one place. Fix blockers beside the item, then confirm.</p>
  ${S.msg.reopened ? `<p class="note">${esc(S.msg.reopened)}</p>` : ""}
  <div class="rcs">
  ${card("Conflict and sources", 0, "", [esc(g.brief.conflict.slice(0, 120)), `${srcCount("read")} read, ${srcCount("pending")} pending, ${srcCount("failed")} failed. ${g.brief.claims.length} claims.`], ["Research"])}
  ${card("Factions, pieces, actions", 1, "", [g.factions.map((f) => `${fdot(f)} ${esc(f.name)}`).join(" "), `${pieces().length} piece types, ${g.actions.length} actions.`], ["Factions", "Actions"])}
  ${card("Board and setup", 2, "", [`${g.board.spaces.length} spaces, ${g.board.links.length} connections. ${g.setup.placements.length} placements.`], ["Board", "Setup"])}
  ${card("Rules", 3, "rules", [`${Object.keys(g.rules.text).length} sections. ${g.rules.scoring.phases.length} ${esc(g.rules.scoring.name)} phases.`], ["Rules"])}
  ${card("Deck", 3, "deck", [`${g.deck.cards.length} cards in ${g.deck.preparation.piles.length} piles.`], ["Deck"])}
  ${card("Victory", 3, "victory", g.victory.perFaction.map((v) => `${esc(v.factionId)}: ${esc(v.plain)} (${v.threshold})`), ["Victory"])}
  ${card("Bots", 3, "bots", g.bots.map((b) => esc(b.objective.slice(0, 110))).concat([`Dry runs passing: ${passed} of ${total}.`]), ["Bots"])}
  </div>
  ${errs ? `<h3>Blockers (${errs})</h3>${issueList(S.issues.errors)}` : `<p class="okmsg">No blockers.</p>`}
  ${S.issues.warnings.length ? `<h3>Warnings (${S.issues.warnings.length})</h3>${issueList(S.issues.warnings)}` : ""}
  <section class="panel"><h3>Confirm</h3>
    <p>${g.meta.status === "final" ? chip("ok", `Confirmed revision ${g.meta.revision}`) + " " + esc(g.meta.confirmedAt ?? "") : chip("wait", "Draft")}</p>
    <label class="chk"><input type="checkbox" id="confirm" ${ready ? "" : "disabled"}> I reviewed every section and want to finalize revision ${g.meta.revision}.</label>
    <div class="row">${btn("finalize", "Finalize this revision", { cls: "primary", dis: !ready || g.meta.status === "final" })} ${!ready ? "<small>Fix the blockers first.</small>" : ""}</div>
    ${S.msg.final ? `<p class="err">${esc(S.msg.final)}</p>` : ""}</section>
  ${renderRevisions()}
  <section class="panel"><h3>Saved copies</h3>
    ${S.msg.saved ? `<p class="note">${esc(S.msg.saved)}</p>` : ""}
    ${[["draft", S.draftSavedAt ? `Saved draft from ${esc(new Date(S.draftSavedAt).toLocaleString())}` : "", "Delete saved draft"], ["final", S.finalGame ? `Last confirmed export: revision ${S.finalGame.meta.revision}` : "", "Delete last confirmed export"]].map(([w, txt, lbl]) => txt ? `<div class="row"><span>${txt}</span>${confirmButton(w, lbl, { action: "confirm-delete", data: `data-w="${w}"` })}</div>` : "").join("") || "<p><small>Nothing saved yet.</small></p>"}
    <p><small>Deleting removes the copy stored for you. It does not change what is on screen.</small></p></section>
  <section class="panel"><h3>Export</h3>
    <p>${S.finalGame ? `Last confirmed export: revision ${S.finalGame.meta.revision}.` : "No confirmed export yet."} ${kit ? "" : "Exports from the current draft are marked DRAFT."}</p>
    <div class="row">${btn("dl-zip", "Download print kit (zip)", { cls: "primary", dis: !S.downloads })} ${btn("dl-json", "Download project file", { dis: !S.downloads })} ${S.finalGame && !kit ? btn("dl-final", "Download last confirmed kit", { dis: !S.downloads }) : ""} <label class="fld inline"><span>Open a project file</span><input type="file" id="openfile" accept=".json,application/json"></label></div>
    ${S.downloads ? "" : "<p class='err'>Downloads are not available in this view. Open the Artifact in claude.ai.</p>"}${S.msg.dl ? `<p class="${/^(Saved|Project opened)/.test(S.msg.dl) ? "okmsg" : "err"}">${esc(S.msg.dl)}</p>` : ""}
    <p><small>The kit holds the rulebook, setup sheet, board, cards, counters, component list, bot aids, flowcharts, policy files and the project file. Board, cards and counters are HTML or SVG: open them in a browser to print.</small></p></section>`;
}

function finalize() {
  if (S.issues.errors.length) return;
  if (!$("#confirm")?.checked) { S.msg.final = "Tick the confirmation box first."; render(); return; }
  delete S.msg.final; delete S.msg.reopened;
  S.game.meta.status = "final"; S.game.meta.confirmedAt = new Date().toISOString();
  const r = validate(S.game); if (!r.ok) { S.game.meta.status = "draft"; delete S.game.meta.confirmedAt; S.msg.final = "Validation failed after confirming. Nothing was finalized."; check(); render(); return; }
  S.finalGame = clone(S.game); saveFinal(); snapshot(`Finalized revision ${S.game.meta.revision}`); S.dirty = true; scheduleSave(); check(); render();
}
function kitFiles(game) { return buildFiles(game, { toMermaid, toMarkdown, toPolicyYaml }); }
async function saveFile(name, blob) {
  try { await S.downloads.save({ filename: name, data: blob }); S.msg.dl = `Saved ${name}.`; } catch (e) { S.msg.dl = e.code === "declined" ? "Download cancelled." : `Download failed (${e.code ?? "error"}). Try again.`; }
  render();
}
async function download(game) {
  try {
    const blob = new Blob([zip(kitFiles(game))], { type: "application/zip" });
    await saveFile(`${game.meta.gameId}${game.meta.status === "final" ? "" : ".DRAFT"}.rev${game.meta.revision}.zip`, blob);
  } catch (e) { S.msg.dl = `Could not build the kit: ${e.message}`; render(); }
}
export function openFile(file) {
  if (!file) return; const rd = new FileReader();
  rd.onload = () => { try { const g = migrate(JSON.parse(rd.result)); const r = validate(g); const sch = r.errors.filter((e) => e.code === "schema"); if (sch.length) { S.msg.dl = `Not a valid project file: ${sch[0].message} at ${sch[0].path}`; render(); return; } S.game = g; S.dirty = true; syncSources(); scheduleSave(); check(); S.msg.dl = "Project opened."; render(); } catch (e) { S.msg.dl = `Could not read the file: ${e.message}`; render(); } };
  rd.readAsText(file);
}

export const reviewActions = {
  finalize: () => finalize(),
  "dl-zip": () => download(S.game),
  "dl-final": () => download(S.finalGame),
  "dl-json": () => saveFile(`${S.game.meta.gameId}.project.json`, new Blob([JSON.stringify(S.game, null, 2)], { type: "application/json" })),
};
