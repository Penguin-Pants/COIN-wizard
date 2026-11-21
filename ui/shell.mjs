import { S, $, esc, STEPS, EXAMPLES } from "./state.mjs";
import { btn, chip } from "./components/fields.mjs";
import { confirmButton } from "./components/confirmButton.mjs";
import { fdot, factionIssues } from "./components/faction.mjs";
import { placeIssues } from "./components/issueMarker.mjs";
import { renderUndo } from "./recovery.mjs";
import { labelTableFields } from "./components/a11y.mjs";
import { markVisited, stepStatus, stepErrors, STATUS_CHIP } from "./progress.mjs";
import { renderBrief } from "./steps/brief.mjs";
import { renderFactions } from "./steps/factions.mjs";
import { renderBoard, wireBoard } from "./steps/board.mjs";
import { renderRules } from "./steps/rules.mjs";
import { renderReview } from "./steps/review.mjs";

// Markers are mutable space attributes other than opinion: from setup and from steps that set them.
function markers() {
  const out = new Set(Object.values(S.game.setup.spaceAttributes ?? {}).flatMap((a) => Object.keys(a)));
  JSON.stringify(S.game, (k, v) => { if (v?.op === "markerSet" && typeof v.marker === "string") out.add(v.marker); return v; });
  out.delete("opinion");
  return [...out].sort();
}
// After a re-render, focus returns to the control with the same identity, so keyboard users keep their place.
function focusKey(el) {
  if (!el || el === document.body || !el.closest?.("#main")) return null;
  const id = ["data-path", "data-a", "data-x", "data-xm", "data-key", "data-i", "data-id", "data-p", "data-k", "id"].map((a) => el.getAttribute(a) ?? "").join("|");
  const same = [...document.querySelectorAll(`#main ${el.tagName}`)].filter((x) => focusId(x) === id);
  return { tag: el.tagName, id, n: same.indexOf(el) };
}
const focusId = (x) => ["data-path", "data-a", "data-x", "data-xm", "data-key", "data-i", "data-id", "data-p", "data-k", "id"].map((a) => x.getAttribute(a) ?? "").join("|");
function restoreFocus(k) {
  if (!k) return;
  const same = [...document.querySelectorAll(`#main ${k.tag}`)].filter((x) => focusId(x) === k.id);
  same[Math.min(Math.max(k.n, 0), same.length - 1)]?.focus({ preventScroll: true });
}
export function render() {
  const keep = focusKey(document.activeElement);
  const m = $("#main");
  const fn = [renderBrief, renderFactions, renderBoard, renderRules, renderReview][S.step];
  markVisited(S.step);
  m.innerHTML = (S.draftOffer ? `<div class="offer" role="region" aria-label="Saved draft"><span>A saved draft from ${esc(new Date(S.draftOffer.savedAt).toLocaleString())} exists. Editing without resuming it replaces it.${S.msg.offer ? ` <span class="err">${esc(S.msg.offer)}</span>` : ""}</span><span class="row">${btn("resume", "Resume draft", { cls: "primary" })}${confirmButton("draft", "Delete draft", { action: "confirm-delete", data: 'data-w="draft"' })}${btn("dismiss-offer", "Dismiss", { cls: "link" })}</span></div>`: "") + fn() + (S.step < 4 ? '<div id="stepissues"></div><div id="stepdone" class="row stepdone"></div>' : "");
  $("#back").disabled = S.step === 0; $("#next").textContent = S.step === STEPS.length - 1 ? "Back to start" : `Next: ${STEPS[S.step + 1].name}`;
  $("#dl-marker").innerHTML = markers().map((m) => `<option value="${esc(m)}">`).join("");
  if (Object.values(S.busy).some(Boolean)) m.insertAdjacentHTML("afterbegin", `<div class="busy" role="status">Waiting for Claude...${btn("cancel-busy", "Cancel")}</div>`);
  labelTableFields(m);
  renderRail(); renderBanner(); renderSaveState(); renderStepDone(); placeIssues(); if (S.step === 2) wireBoard();
  restoreFocus(keep);
}
export function renderRail() {
  const chipFor = (i) => { const st = stepStatus(i); return chip(STATUS_CHIP[st], st === "Needs fix" ? `Needs fix (${stepErrors(i)})` : st); };
  const fStarted = stepStatus(1) !== "Not started";
  $("#rail").innerHTML = STEPS.map((s, i) => `<li><button type="button" data-a="goto" data-step="${i}" ${i === S.step ? 'aria-current="step"' : ""}><span class="n">${i + 1}</span><span>${esc(s.name)}</span>${chipFor(i)}</button></li>` + (i === 1 ? S.game.factions.map((f) => { const n = factionIssues(f); return `<li class="fsub"><button type="button" data-a="goto" data-step="1" data-f="${esc(f.id)}">${fdot(f)}<span>${esc(f.name)}</span>${!fStarted ? "" : n ? chip("bad", `${n} to fix`) : chip("ok", "ok")}</button></li>`; }).join("") : "")).join("");
}
// The Mark step done row. check() calls this too, so it follows the blockers while the designer types.
export function renderStepDone() {
  const el = $("#stepdone"); if (!el) return;
  const n = stepErrors(S.step);
  el.innerHTML = stepStatus(S.step) === "Done" ? chip("ok", "Step done") : `${btn("mark-done", "Mark step done", { dis: n > 0 })}${n ? `<small>Fix the ${n} blocker${n === 1 ? "" : "s"} in this step first.</small>` : ""}`;
}
export function renderBanner() {
  const g = S.game, n = S.issues.errors.length;
  $("#status").innerHTML = g.meta.status === "final" ? chip("ok", `Confirmed rev ${g.meta.revision}`) : chip("wait", "DRAFT");
  $("#blockers").textContent = n ? `${n} blocker${n === 1 ? "" : "s"}` : "No blockers";
  $("#blockers").className = n ? "bad" : "ok";
  $("#title").textContent = g.meta.title;
  renderUndo();
  $("#menu").innerHTML = `<details class="menu" data-k="menu" ${S.dopen.menu ? "open" : ""}><summary>Project</summary><div class="menupop">${confirmButton("new", "New blank project", { action: "new-project", confirmLabel: "Yes, replace my work" })}${Object.entries(EXAMPLES).map(([k, [label]]) => confirmButton(k, `Load ${label}`, { action: "load-example", data: `data-ex="${k}"`, confirmLabel: "Yes, replace my work" })).join("")}<small>Both replace the project on screen and the saved draft.</small></div></details>`;
}
// Saving covers the wait before the write and the write itself.
export function renderSaveState() {
  $("#save").textContent = !S.uid ? (S.dirty ? "Not saved (sign in or export)" : "") : S.saveErr ? `Not saved (${S.saveErr}).${S.retryIn ? ` Retrying in ${S.retryIn} s.` : ""}` : S.dirty ? "Saving..." : S.saved;
}
