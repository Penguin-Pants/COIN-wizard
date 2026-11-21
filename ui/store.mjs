import { validate } from "../src/validate.mjs";
import { migrate } from "../src/migrate.mjs";
import { S, time } from "./state.mjs";
import { render, renderRail, renderBanner, renderSaveState, renderStepDone } from "./shell.mjs";
import { placeIssues } from "./components/issueMarker.mjs";
import { markTouched } from "./progress.mjs";
import { recordSoon, loadRevisions } from "./recovery.mjs";

// ---------- validation and state change
let vTimer;
export function check() {
  try { S.issues = validate(S.game); } catch (e) { S.issues = { errors: [{ code: "crash", path: "/", message: `Validator stopped: ${e.message}`, editor: "Review", severity: "error" }], warnings: [] }; }
  renderRail(); renderBanner(); renderStepDone(); placeIssues();
}
export function touch() {
  if (S.game.meta.status === "final") {
    S.game.meta.status = "draft"; delete S.game.meta.confirmedAt; S.game.meta.revision += 1;
    S.msg.reopened = `Editing reopened the draft as revision ${S.game.meta.revision}. The last confirmed export is kept.`;
  }
  markTouched(S.step); recordSoon(); S.dirty = true; renderSaveState(); clearTimeout(vTimer); vTimer = setTimeout(check, 250); scheduleSave();
}

// ---------- persistence (db, per person)
// One write at a time per document. A failed write retries twice with a growing wait.
const chains = {};
export function queueWrite(path, data) {
  const run = async () => {
    for (let i = 0; i < 3; i++) {
      try { if (data === null) await S.db.doc(path).delete(); else await S.db.doc(path).set(data); return true; } catch { await new Promise((r) => setTimeout(r, 300 * 3 ** i)); }
    }
    return false;
  };
  chains[path] = (chains[path] ?? Promise.resolve()).then(run);
  return chains[path];
}

// The draft saves after a pause in editing. A failed save retries with backoff (1, 2, 4 ... 30 seconds)
// and the header says so. Only one draft write runs at a time.
let saveTimer, saving = false, again = false, tries = 0;
export function scheduleSave(delay = 1500) { clearTimeout(saveTimer); saveTimer = setTimeout(saveDraft, delay); }
async function saveDraft() {
  if (!S.db || !S.uid) { renderSaveState(); return; }
  if (saving) { again = true; return; }
  saving = true; again = false;
  const json = JSON.stringify(S.game), at = new Date().toISOString();
  try {
    await S.db.doc(`data/users/${S.uid}/draft`).set({ json, savedAt: at });
    S.draftSavedAt = at; tries = 0; S.saveErr = null; S.retryIn = 0;
    if (JSON.stringify(S.game) === json) { S.dirty = false; S.saved = `Saved ${time()}`; } else again = true;
  } catch (e) {
    S.saveErr = e.code ?? "error"; S.retryIn = Math.min(30, 2 ** tries++);
    scheduleSave(S.retryIn * 1000);
  }
  saving = false;
  renderSaveState();
  if (again) scheduleSave(0);
}
export async function deleteSaved(which) {
  S.confirm = null;
  try {
    if (S.db && S.uid) await S.db.doc(`data/users/${S.uid}/${which === "final" ? "final" : "draft"}`).delete();
    if (which === "final") { S.finalGame = null; S.msg.saved = "Last confirmed export deleted."; }
    else { clearTimeout(saveTimer); S.draftOffer = null; S.draftSavedAt = null; if (S.db && S.uid) S.db.doc(`data/users/${S.uid}/prefs`).delete().catch(() => {}); S.msg.saved = "Saved draft deleted. Your open work stays on screen and saves again when you edit."; }
  } catch (e) { S.msg.saved = `Could not delete (${e.code ?? "error"}). Try again.`; }
  render();
}
export async function saveFinal() {
  if (!S.db || !S.uid) return;
  try { await S.db.doc(`data/users/${S.uid}/final`).set({ json: JSON.stringify(S.finalGame), savedAt: new Date().toISOString() }); } catch { /* keep in memory */ }
}
export async function loadSaved() {
  if (!S.db || !S.uid) return;
  try {
    const [d, f, pf] = await Promise.all([S.db.doc(`data/users/${S.uid}/draft`).get(), S.db.doc(`data/users/${S.uid}/final`).get(), S.db.doc(`data/users/${S.uid}/prefs`).get()]);
    if (f.exists) { try { S.finalGame = migrate(JSON.parse(f.data().json)); } catch { /* ignore */ } }
    if (d.exists) {
      S.draftSavedAt = d.data().savedAt;
      const dismissed = pf.exists && pf.data().dismissedDraftAt === d.data().savedAt;
      if (!dismissed) S.draftOffer = { json: d.data().json, savedAt: d.data().savedAt };
    }
  } catch { /* offline: stay with template */ }
  await loadRevisions();
}
// Applies the latest source documents from chat to the game's sources. Runs on every snapshot and
// whenever the game is replaced (example, resumed draft, opened file). Returns true when a value changed.
export function syncSources() {
  let changed = false;
  for (const src of S.game.brief.sources) {
    const x = S.srcDocs[src.id]; if (!x) continue;
    for (const k of ["status", "readScope", "failure", "title"]) if (x[k] !== undefined && src[k] !== x[k]) { src[k] = x[k]; changed = true; }
    if (x.status === "read") delete src.failure;
  }
  return changed;
}
export function subscribeSources() {
  if (!S.db) return;
  let timer = setTimeout(() => { S.msg.srcNote = "Source status cannot be reached yet. It may be out of date."; render(); }, 10000);
  S.db.collection("sources").onSnapshot((snap) => {
    clearTimeout(timer); delete S.msg.srcNote;
    for (const d of snap.docs) { const x = d.data(); S.srcDocs[d.id] = x; S.texts[d.id] = x.text ?? ""; }
    if (syncSources()) { check(); if (S.step === 0) render(); }
  }, () => { S.msg.srcNote = "Source status is not available in this view. Use pasted text."; });
}
export async function writeSource(id, extra = {}) {
  const src = S.game.brief.sources.find((s) => s.id === id); if (!src || !S.db) return;
  try { await S.db.doc(`sources/${id}`).set({ url: src.url, status: "pending", updatedAt: new Date().toISOString(), ...extra }); } catch (e) { S.msg.srcNote = `Source not stored (${e.code ?? "error"}). Paste text instead.`; }
}

// ---------- Claude (sample)
export async function ask(prompt) {
  if (!S.sample) throw new Error("Claude drafting is not available in this view. Edit by hand or paste text.");
  if (S.cancelled) throw Object.assign(new Error("Cancelled."), { code: "cancelled" });
  const r = await S.sample(prompt, { modelTier: "default", cache: false });
  // A cancelled request drops its answer, so nothing it would change is changed.
  if (S.cancelled) throw Object.assign(new Error("Cancelled."), { code: "cancelled" });
  const t = r.text ?? "";
  const a = t.search(/[[{]/); const b = Math.max(t.lastIndexOf("}"), t.lastIndexOf("]"));
  if (a < 0 || b < a) throw new Error("Claude did not return structured data. Try again.");
  return JSON.parse(t.slice(a, b + 1));
}
export const guard = async (key, fn) => {
  S.busy[key] = true; S.cancelled = false; delete S.msg[key]; render();
  try { await fn(); announce("Claude's answer is ready."); } catch (e) {
    if (e.code === "cancelled") { S.msg[key] = "Cancelled. Nothing was changed."; announce("Cancelled."); }
    else { S.msg[key] = e.code === "not_granted" ? "Permission for Claude calls was not granted." : e.code === "rate_limited" ? "Too many requests. Wait and retry." : e.message || "Request failed."; announce(S.msg[key]); }
  }
  S.busy[key] = false; render();
};
export function cancelBusy() { S.cancelled = true; for (const k of Object.keys(S.busy)) S.busy[k] = false; render(); }
// Polite announcements for screen readers: Claude results, undo and similar events.
export function announce(text) { const el = document.getElementById("announce"); if (el) { el.textContent = ""; setTimeout(() => { el.textContent = text; }, 30); } }
