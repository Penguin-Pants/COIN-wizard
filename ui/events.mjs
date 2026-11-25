import { migrate } from "../src/migrate.mjs";
import { blankGame } from "../src/blank.mjs";
import { S, $, getP, setP, example, STEPS, EDITOR_STEP } from "./state.mjs";
import { touch, check, scheduleSave, writeSource, deleteSaved, syncSources, cancelBusy, fromDbJson } from "./store.mjs";
import { markDone } from "./progress.mjs";
import { showIssue, placeIssues } from "./components/issueMarker.mjs";
import { render } from "./shell.mjs";
import { briefActions } from "./steps/brief.mjs";
import { factionActions } from "./steps/factions.mjs";
import { setCount, onBoardChange, boardBgActions } from "./steps/board.mjs";
import { listActions } from "./components/listEditor.mjs";
import { onExprChange, exprActions } from "./components/exprEditor.mjs";
import { onStepChange, stepActions } from "./components/stepList.mjs";
import { onDeckChange, deckActions } from "./steps/deck.mjs";
import { onBotChange, botActions } from "./steps/bots.mjs";
import { onBriefChange } from "./steps/brief.mjs";
import { record, recordSoon, resetHistory, onKey, stepChanged, recoveryActions } from "./recovery.mjs";
import { stepsText, fingerprint } from "../src/plain.mjs";
import { confirmActions } from "./components/confirmButton.mjs";
import { rulesActions } from "./steps/rules.mjs";
import { reviewActions, openFile } from "./steps/review.mjs";

function applyBind(el) {
  const path = el.dataset.b; const t = el.dataset.t ?? "s"; let v;
  if (t === "n") v = el.value === "" ? 0 : Number(el.value); else if (t === "b") v = el.checked; else if (t === "l") v = el.value.split("\n").map((x) => x.trim()).filter(Boolean); else if (t === "c") v = el.value.split(",").map((x) => x.trim()).filter(Boolean);
  else if (t === "j") { try { v = JSON.parse(el.value); el.classList.remove("invalid"); } catch { el.classList.add("invalid"); return; } } else v = el.value;
  // An empty claim note is removed, because the schema has no empty conflict note.
  // t "o": an optional field. An empty choice removes the key.
  // t "on": an optional number. Empty removes the key.
  if (t === "on") { if (v === "") { const o = getP(S.game, path.split("/").slice(0, -1).join("/")); delete o[path.split("/").pop()]; touch(); return; } v = Number(v); }
  // An Event override node without a table is no node (1.10.0).
  if (t === "o" && v === "" && /\/eventPolicy\/overrides\/\d+\/node\/table$/.test(path)) { const ov = getP(S.game, path.split("/").slice(0, -2).join("/")); delete ov.node; touch(); return; }
  if (t === "o" && v === "") { const o = getP(S.game, path.split("/").slice(0, -1).join("/")); delete o[path.split("/").pop()]; touch(); return; }
  if (/^brief\/claims\/\d+\/conflict$/.test(path) && v === "") { const o = getP(S.game, path.split("/").slice(0, -1).join("/")); delete o.conflict; touch(); return; }
  setP(S.game, path, v);
  // A "Never play" override runs no Event, so it keeps no node (1.10.0).
  if (/\/eventPolicy\/overrides\/\d+\/directive$/.test(path) && v === "ignore") delete getP(S.game, path.slice(0, path.lastIndexOf("/"))).node;
  // Text written by hand matches the steps as they are now. A later step change marks it stale.
  if (PLAIN.test(path)) { const h = getP(S.game, path.slice(0, path.lastIndexOf("/"))); h.plainOf = fingerprint(h.steps); }
  touch();
}
const PLAIN = /^actions\/\d+\/plain$|^deck\/cards\/\d+\/sides\/\d+\/text$/;

// Progress is user work but not an edit of the step, so it saves without marking the step touched.
function saveProgress() { recordSoon(); S.dirty = true; S.saveErr = null; scheduleSave(); }
function replaceGame(g) {
  record();
  Object.assign(S, { game: g, step: 0, tab: "rules", confirm: null, proposal: null, msg: {}, dopen: {} });
  // A replaced game is its own undo step, so it never merges with the next edit.
  syncSources(); record(); S.dirty = true; S.saveErr = null; scheduleSave(); check(); render(); $("#h")?.focus();
}

const coreActions = {
  goto: (d) => { if (Number(d.step) !== S.step) stepChanged(S.step); S.step = Number(d.step); if (d.tab) S.tab = d.tab; if (d.f) S.ftab = d.f; render(); $("#h")?.focus(); },
  "show-issue": (d) => {
    const st = EDITOR_STEP[d.editor] ?? [4];
    // The bot or faction tab that holds the issue: only the selected one is on screen.
    const b = /^\/bots\/(\d+)/.exec(d.ipath), a = /^\/actions\/(\d+)/.exec(d.ipath), f = /^\/factions\/(\d+)/.exec(d.ipath);
    const pick = b && S.bot !== +b[1] ? () => { S.bot = +b[1]; S.botNode = null; } : null;
    const ftab = a ? S.game.actions[+a[1]]?.faction : f ? S.game.factions[+f[1]]?.id : null;
    if (st[0] !== S.step || (st[1] && st[1] !== S.tab) || pick || (ftab && ftab !== S.ftab)) { S.step = st[0]; if (st[1]) S.tab = st[1]; pick?.(); if (ftab) S.ftab = ftab; render(); }
    showIssue(d.ipath);
  },
  "mark-done": () => { if (markDone(S.step)) saveProgress(); render(); },
  "new-project": () => replaceGame(blankGame()),
  "load-example": (d) => replaceGame(migrate(example(d.ex))),
  dismiss: () => { S.proposal = null; render(); },
  resume: async () => { try { S.game = migrate(await fromDbJson(S.draftOffer.json)); } catch (e) { S.msg.offer = `The saved draft could not be opened: ${e.message}`; render(); return; } delete S.msg.offer; S.draftOffer = null; S.dirty = false; syncSources(); resetHistory(); check(); render(); },
  "dismiss-offer": () => { const at = S.draftOffer?.savedAt; S.draftOffer = null; S.confirm = null; if (S.db && S.uid && at) S.db.doc(`data/users/${S.uid}/prefs`).set({ dismissedDraftAt: at }).catch(() => {}); render(); },
  "confirm-delete": (d) => deleteSaved(d.w),
  "cancel-busy": () => cancelBusy(),
  "draft-plain": (d) => { const h = getP(S.game, d.p); h[d.t] = stepsText(h.steps, S.game); h.plainOf = fingerprint(h.steps); touch(); render(); },
};
const ACTIONS = { ...coreActions, ...recoveryActions, ...boardBgActions, ...listActions, ...exprActions, ...stepActions, ...deckActions, ...botActions, ...confirmActions, ...briefActions, ...factionActions, ...rulesActions, ...reviewActions };

export function bindEvents() {
  document.addEventListener("input", (e) => {
    const el = e.target;
    if (el.dataset?.b && (el.tagName === "TEXTAREA" || el.type === "text" || el.type === "number" || el.type === "color" || el.dataset.t === "c")) applyBind(el);
    else if (el.dataset?.pc) { const [sp, pid, st] = el.dataset.pc.split("|"); setCount(sp, pid, st, Math.max(0, parseInt(el.value || "0", 10))); }
    else if (el.dataset?.track) { const t = S.game.tracks.find((x) => x.id === el.dataset.track); t.start = Number(el.value); S.game.setup.tracks[t.id] = t.start; touch(); }
  });
  document.addEventListener("change", (e) => {
    const el = e.target;
    if (onExprChange(el) || onStepChange(el) || onDeckChange(el) || onBotChange(el) || onBriefChange(el) || onBoardChange(el)) return;
    if (el.dataset?.b && !(el.tagName === "TEXTAREA" || el.type === "text" || el.type === "number" || el.type === "color")) { applyBind(el); if (el.dataset.r) render(); }
    else if (el.dataset?.b && el.dataset.r) render();
    else if (el.dataset?.src) { const src = S.game.brief.sources.find((s) => s.id === el.dataset.src); src.status = "pending"; delete src.readScope; delete src.failure; writeSource(src.id); touch(); render(); }
    else if (el.id === "openfile") openFile(el.files[0]);
    else if (el.dataset?.pc || el.dataset?.track) render();
  });
  document.addEventListener("click", (e) => {
    const b = e.target.closest("[data-a]"); if (!b || b.tagName === "FORM") return;
    ACTIONS[b.dataset.a]?.(b.dataset, b, e);
  });
  $("#back").addEventListener("click", () => { if (S.step > 0) { stepChanged(S.step); S.step--; render(); $("#h")?.focus(); } });
  $("#next").addEventListener("click", () => {
    const p = S.game.meta.progress?.[STEPS[S.step].id];
    if (S.step < 4 && p?.touched && !p.done && markDone(S.step)) saveProgress();
    stepChanged(S.step);
    S.step = S.step === STEPS.length - 1 ? 0 : S.step + 1; render(); $("#h")?.focus(); });
  document.addEventListener("keydown", onKey);
  document.addEventListener("keydown", onNavKey);
  $("#keys").addEventListener("click", () => toggleHelp());
  $("#help-close").addEventListener("click", () => toggleHelp(false));
  // Warn before the page closes while a change is not saved yet.
  window.addEventListener("beforeunload", (e) => { if (S.dirty && S.uid) { e.preventDefault(); e.returnValue = ""; } });
  document.addEventListener("toggle", (e) => { const k = e.target?.dataset?.k; if (k) S.dopen[k] = e.target.open; if (e.target.closest?.("#main")) placeIssues(); }, true);
}

// ---------- keyboard map
const inField = (t) => t && (t.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(t.tagName));
function toggleHelp(open) {
  const h = $("#help"), k = $("#keys"), show = open ?? h.hidden;
  h.hidden = !show; k.setAttribute("aria-expanded", String(show));
  (show ? $("#help-close") : k).focus();
}
function onNavKey(e) {
  if (e.key === "Escape") {
    if (!$("#help").hidden) { toggleHelp(false); return; }
    if (S.confirm) { S.confirm = null; render(); return; }
    if (S.dopen.menu) { S.dopen.menu = false; render(); $("#menu summary")?.focus(); }
    return;
  }
  if (e.key === "?" && !inField(e.target)) { e.preventDefault(); toggleHelp(true); return; }
  if (!(e.altKey && e.shiftKey)) return;
  const n = /^Digit([1-5])$/.exec(e.code);
  if (n) { e.preventDefault(); ACTIONS.goto({ step: String(Number(n[1]) - 1) }); return; }
  if (e.key === "ArrowRight") { e.preventDefault(); $("#next").click(); }
  if (e.key === "ArrowLeft") { e.preventDefault(); $("#back").click(); }
}
