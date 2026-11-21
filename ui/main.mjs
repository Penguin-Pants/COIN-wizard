import { S } from "./state.mjs";
import { check, loadSaved, subscribeSources } from "./store.mjs";
import { render } from "./shell.mjs";
import { bindEvents } from "./events.mjs";
import { resetHistory } from "./recovery.mjs";

bindEvents();
window.matchMedia?.("(prefers-color-scheme: dark)").addEventListener?.("change", () => render());

// ---------- start
(async function start() {
  check(); render();
  const c = window.claude; if (!c?.use) return;
  const [db, user, sample, downloads] = await Promise.all([c.use("db"), c.use("user"), c.use("sample"), c.use("downloads")].map((p) => p.catch(() => null)));
  S.db = db; S.user = user; S.sample = sample; S.downloads = downloads;
  try { S.uid = user ? await user.id() : null; } catch { S.uid = null; }
  await loadSaved(); subscribeSources(); resetHistory(); render();
})();
