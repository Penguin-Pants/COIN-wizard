// Recovery: undo and redo from JSON patches, revision snapshots, compare and restore.
import { diff, applyPatch, invert, compareGames } from "../src/history.mjs";
import { migrate } from "../src/migrate.mjs";
import { fingerprint } from "../src/plain.mjs";
import { S, $, esc, clone, STEPS } from "./state.mjs";
import { check, scheduleSave, syncSources, queueWrite } from "./store.mjs";
import { render } from "./shell.mjs";
import { btn, chip } from "./components/fields.mjs";
import { confirmButton } from "./components/confirmButton.mjs";

// ---------- undo and redo
const H = { undo: [], redo: [], base: null, timer: null };
const LIMIT = 200;

export function resetHistory() { clearTimeout(H.timer); H.undo = []; H.redo = []; H.base = clone(S.game); renderUndo(); }
// Edits that come close together become one undo step.
export function recordSoon() { clearTimeout(H.timer); H.timer = setTimeout(record, 400); }
export function record() {
  clearTimeout(H.timer);
  if (!H.base) { H.base = clone(S.game); return; }
  // Step progress is bookkeeping, not an edit: it never becomes an undo step.
  const p = diff(H.base, S.game).filter((c) => !(c.path[0] === "meta" && c.path[1] === "progress"));
  if (!p.length) { H.base = clone(S.game); return; }
  H.undo.push(p); if (H.undo.length > LIMIT) H.undo.shift();
  H.redo = []; H.base = clone(S.game); renderUndo();
}
function step(from, to, dir) {
  record();
  const p = from.pop(); if (!p) return;
  S.game = applyPatch(S.game, dir === "undo" ? invert(p) : p);
  to.push(p); H.base = clone(S.game);
  S.dirty = true; S.saveErr = null; scheduleSave(); check(); render();
  S.msg.undo = dir === "undo" ? "Undone." : "Redone.";
}
export const undo = () => step(H.undo, H.redo, "undo");
export const redo = () => step(H.redo, H.undo, "redo");
export function renderUndo() {
  const el = $("#undo"); if (!el) return;
  el.innerHTML = `${btn("undo", "Undo", { dis: !H.undo.length && !H.timer, data: 'title="Undo (Ctrl+Z)" aria-keyshortcuts="Control+Z"' })}${btn("redo", "Redo", { dis: !H.redo.length, data: 'title="Redo (Ctrl+Shift+Z)" aria-keyshortcuts="Control+Shift+Z"' })}`;
}
// Ctrl+Z and Ctrl+Shift+Z work outside text fields. Inside a field the browser's own undo applies.
export function onKey(e) {
  if (!(e.ctrlKey || e.metaKey) || e.key.toLowerCase() !== "z") return;
  const t = e.target;
  if (t && (t.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(t.tagName))) return;
  e.preventDefault();
  if (e.shiftKey) redo(); else undo();
}

// ---------- revision snapshots
const KEEP = 20;
const base = () => `data/users/${S.uid}`;
export async function loadRevisions() {
  if (!S.db || !S.uid) return;
  try { const d = await S.db.doc(`${base()}/revisions-index`).get(); S.revs = d.exists ? d.data().items ?? [] : []; } catch { S.revs = []; }
}
// Saves the game as a snapshot when it changed since the last one. Keeps the newest 20.
export async function snapshot(reason) {
  if (!S.db || !S.uid) return;
  // Step progress alone is not a reason for a new snapshot.
  const fp = fingerprint({ ...S.game, meta: { ...S.game.meta, progress: undefined } });
  if (fp === S.lastSnap) return;
  S.lastSnap = fp;
  S.revs ??= [];
  const n = Math.max(0, ...S.revs.map((r) => r.n)) + 1, at = new Date().toISOString();
  await queueWrite(`${base()}/revisions/${n}`, { json: JSON.stringify(S.game), at, reason });
  S.revs.push({ n, at, reason, title: S.game.meta.title });
  while (S.revs.length > KEEP) { const old = S.revs.shift(); await queueWrite(`${base()}/revisions/${old.n}`, null); }
  await queueWrite(`${base()}/revisions-index`, { items: S.revs });
}
export const stepChanged = (from) => snapshot(`Left step ${from + 1}: ${STEPS[from].name}`);

async function loadRevision(n) {
  const d = await S.db.doc(`${base()}/revisions/${n}`).get();
  if (!d.exists) throw new Error(`Snapshot ${n} is gone.`);
  return migrate(JSON.parse(d.data().json));
}

export function renderRevisions() {
  if (!S.db || !S.uid) return `<section class="panel"><h3>Revisions</h3><p><small>Snapshots need a signed-in view. Undo still works.</small></p></section>`;
  const list = [...(S.revs ?? [])].reverse();
  const cmp = S.compare ? `<div class="proposal" role="region" aria-label="Compare"><h4>Snapshot ${S.compare.n} compared with your current game</h4><table class="t"><thead><tr><th>Section</th><th>Changes</th><th>Where</th></tr></thead><tbody>${S.compare.sections.map((s) => `<tr><td>${esc(s.name)}</td><td>${s.changes ? chip("wait", String(s.changes)) : chip("ok", "same")}</td><td><small>${esc(s.paths.join(", "))}${s.changes > s.paths.length ? ", ..." : ""}</small></td></tr>`).join("")}</tbody></table>${btn("rev-close", "Close")}</div>` : "";
  return `<section class="panel"><h3>Revisions</h3><p class="lead">A snapshot is saved when you leave a step and when you finalize. The newest ${KEEP} are kept.</p>
    ${S.msg.rev ? `<p class="${S.msg.revOk ? "okmsg" : "err"}">${esc(S.msg.rev)}</p>` : ""}
    ${list.length ? `<table class="t"><thead><tr><th>#</th><th>Saved</th><th>Why</th><th><span class="sr">Actions</span></th></tr></thead><tbody>${list.map((r) => `<tr><td>${r.n}</td><td>${esc(new Date(r.at).toLocaleString())}</td><td>${esc(r.reason)}</td><td><span class="row">${btn("rev-compare", "Compare", { cls: "link", data: `data-n="${r.n}"` })}${confirmButton(`rev-${r.n}`, "Restore", { action: "rev-restore", data: `data-n="${r.n}"`, confirmLabel: "Yes, restore it" })}</span></td></tr>`).join("")}</tbody></table>` : "<p><small>No snapshots yet.</small></p>"}${cmp}</section>`;
}

export const recoveryActions = {
  undo: () => undo(),
  redo: () => redo(),
  "rev-close": () => { S.compare = null; render(); },
  "rev-compare": async (d) => {
    try { const g = await loadRevision(Number(d.n)); S.compare = { n: Number(d.n), sections: compareGames(g, S.game) }; delete S.msg.rev; } catch (e) { S.msg.rev = e.message; S.msg.revOk = false; }
    render();
  },
  // Restore saves the current game as a snapshot first, then opens the old one as a new draft revision.
  "rev-restore": async (d) => {
    S.confirm = null;
    try {
      const g = await loadRevision(Number(d.n));
      await snapshot("Before restore");
      record();
      g.meta.status = "draft"; delete g.meta.confirmedAt;
      g.meta.revision = S.game.meta.revision + (S.game.meta.status === "final" ? 1 : 0);
      S.game = g; syncSources(); record();
      S.dirty = true; scheduleSave(); check();
      S.msg.rev = `Restored snapshot ${d.n} as draft revision ${g.meta.revision}. Undo brings back the game you had.`; S.msg.revOk = true;
    } catch (e) { S.msg.rev = e.message; S.msg.revOk = false; }
    render();
  }
};
