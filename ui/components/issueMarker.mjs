import { S, $, esc, EDITOR_STEP, STEPS } from "../state.mjs";
import { btn, chip } from "./fields.mjs";
import { factionIssueItems } from "./faction.mjs";

// Finds the one field that shows an issue. Walks up the issue path until exactly one element has that data-path.
// Two or more matches (for example the placement grid) mean no single field owns the issue.
export function findField(path, root = $("#main")) {
  for (let p = path; p.split("/").length > 2; p = p.slice(0, p.lastIndexOf("/"))) {
    const els = root.querySelectorAll(`[data-path="${CSS.escape(p)}"]`);
    if (els.length === 1) return els[0];
    if (els.length > 1) return null;
  }
  return null;
}

const here = (i) => { const st = EDITOR_STEP[i.editor] ?? [4]; return st[0] === S.step && (!st[1] || st[1] === S.tab); };

// Where an issue is, in the designer's words: the step, and the action or bot it belongs to.
const TAB = { rules: "Rules tab", deck: "Deck tab", victory: "Victory tab", bots: "Bots tab" };
export function whereOf(i) {
  const [step, tab] = EDITOR_STEP[i.editor] ?? [4];
  const g = S.game, m = /^\/(actions|bots|deck\/cards|sharedTables)\/(\d+)/.exec(i.path ?? "");
  const owner = !m ? "" : m[1] === "actions" ? g.actions[+m[2]]?.name : m[1] === "bots" ? `${g.factions.find((f) => f.id === g.bots[+m[2]]?.factionId)?.name ?? ""} bot` : m[1] === "sharedTables" ? `shared table ${g.sharedTables?.[+m[2]]?.id ?? ""}` : g.deck.cards[+m[2]]?.title;
  return `Step ${step + 1}, ${STEPS[step].name}${tab ? ` (${TAB[tab] ?? tab})` : ""}${owner ? `: ${owner}` : ""}`;
}

export function issueList(items) {
  if (!items.length) return "";
  return `<ul class="issues">${items.map((i) => `<li class="${i.severity}"><small class="where">${esc(whereOf(i))}</small> <span>${esc(i.message)}</span> ${btn("show-issue", "Show", { cls: "link", data: `data-editor="${esc(i.editor ?? "")}" data-ipath="${esc(i.path)}"` })}</li>`).join("")}</ul>`;
}

// Puts each issue of the open step under its field. The rest go to the step list (#stepissues).
// Fields in a closed fold keep the issue in the list. check() calls this after each validation.
export function placeIssues() {
  const main = $("#main"); if (!main) return;
  main.querySelectorAll(".fieldissue").forEach((m) => m.remove());
  main.querySelectorAll("[aria-invalid]").forEach((el) => { el.removeAttribute("aria-invalid"); el.removeAttribute("aria-describedby"); });
  // A faction's problem list follows every validation, also when the edit does not re-render the step.
  main.querySelectorAll("[data-fiss]").forEach((el) => { const f = S.game.factions.find((x) => x.id === el.dataset.fiss); const items = f ? factionIssueItems(f) : []; el.hidden = !items.length; el.querySelector(".fn").textContent = `${items.length} to fix.`; el.querySelector(".fl").innerHTML = issueList(items); const c = main.querySelector(`[data-fchip="${CSS.escape(el.dataset.fiss)}"]`); if (c) { c.hidden = !items.length; c.textContent = `${items.length} to fix`; } });
  main.querySelectorAll("[data-tabcount]").forEach((el) => { const n = S.issues.errors.filter((e) => e.editor === el.dataset.tabcount).length; el.innerHTML = n ? ` ${chip("bad", String(n))}` : ""; });
  const list = $("#stepissues"); if (!list) return;
  const rest = [];
  S.issues.errors.concat(S.issues.warnings).filter(here).forEach((i, n) => {
    const f = findField(i.path, main);
    if (!f || f.closest("details:not([open])")) { rest.push(i); return; }
    const m = document.createElement("span");
    m.className = `fieldissue ${i.severity}`; m.id = `fi-${n}`; m.textContent = i.message;
    const host = f.closest("label.fld");
    if (host) host.append(m); else f.insertAdjacentElement("afterend", m);
    if (i.severity === "error") f.setAttribute("aria-invalid", "true");
    f.setAttribute("aria-describedby", `${f.getAttribute("aria-describedby") ?? ""} ${m.id}`.trim());
  });
  list.innerHTML = issueList(rest);
}

// Opens the step and any closed fold that holds the field, then scrolls to it and focuses it.
export function showIssue(path) {
  const f = findField(path);
  if (!f) { $("#h")?.focus(); return; }
  for (let d = f.closest("details"); d; d = d.parentElement?.closest("details")) { d.open = true; if (d.dataset.k) S.dopen[d.dataset.k] = true; }
  placeIssues();
  f.scrollIntoView({ block: "center" }); f.focus();
}
