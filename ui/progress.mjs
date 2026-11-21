import { S, STEPS, EDITOR_STEP } from "./state.mjs";

// Step progress lives in meta.progress so it saves with the draft.
const entry = (i) => ((S.game.meta.progress ??= {})[STEPS[i].id] ??= { visited: false, touched: false, done: false });

export const stepErrors = (i) => S.issues.errors.filter((e) => (EDITOR_STEP[e.editor]?.[0] ?? 4) === i).length;
export const markVisited = (i) => { entry(i).visited = true; };
export const markTouched = (i) => { entry(i).touched = true; if (S.game.meta.status !== "final") entry(4).done = false; };
// Returns true when the step became done. A step with blockers never becomes done.
export function markDone(i) { if (stepErrors(i)) return false; const p = entry(i); p.touched = true; p.done = true; return true; }

// Not started, In progress, Done or Needs fix. Review is done only when the revision is final.
export function stepStatus(i) {
  const p = S.game.meta.progress?.[STEPS[i].id] ?? {};
  if (i === 4) return S.game.meta.status === "final" ? "Done" : p.visited ? "In progress" : "Not started";
  const started = p.touched || p.done;
  if (stepErrors(i)) return started ? "Needs fix" : "Not started";
  return p.done ? "Done" : started ? "In progress" : "Not started";
}
export const STATUS_CHIP = { "Not started": "idle", "In progress": "wait", Done: "ok", "Needs fix": "bad" };
