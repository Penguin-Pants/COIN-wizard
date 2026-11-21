import { setFactionCount } from "../../src/presets.mjs";
import { chunkText, pickChunks, claimPrompt, parseCheck, handoffText, statusLabel, overviewDiff } from "../../src/sources.mjs";
import { S, $, esc, nextId } from "../state.mjs";
import { fld, inp, area, sel, chip, btn, bound } from "../components/fields.mjs";
import { addButton, removeButton, defineList } from "../components/listEditor.mjs";
import { touch, ask, guard, writeSource } from "../store.mjs";
import { render } from "../shell.mjs";

export function renderBrief() {
  const g = S.game, b = g.brief;
  const srcRows = b.sources.map((s, i) => `<li class="src"><div class="row"><input aria-label="Source ${i + 1} URL" ${bound(`brief/sources/${i}/url`)} data-src="${esc(s.id)}" value="${esc(s.url)}">${chip(s.status === "read" ? "ok" : s.status === "failed" ? "bad" : "wait", statusLabel(s.status))}${s.status === "failed" ? btn("src-retry", "Retry", { cls: "link", data: `data-i="${i}"` }) : ""}${removeButton("sources", { i, label: "Remove" })}</div>
    <small>${s.readScope ? esc(s.readScope) + ". " : ""}${S.texts[s.id] ? `${S.texts[s.id].length.toLocaleString()} characters stored. ` : ""}${s.failure ? "Failed: " + esc(s.failure) : ""}</small>
    <details><summary>Paste text for this source</summary><textarea id="paste-${i}" rows="4" placeholder="Paste the article text here"></textarea>${btn("paste", "Use pasted text", { data: `data-i="${i}"` })}</details></li>`).join("");
  const pending = b.sources.filter((s) => s.status === "pending");
  const handoff = pending.length ? handoffText(pending) : "";
  const unsupported = b.claims.filter((c) => c.check?.verdict === "unsupported").length;
  const counts = ["pending", "read", "failed"].map((st) => `${b.sources.filter((x) => x.status === st).length} ${statusLabel(st)}`).join(", ");
  const proposal = S.proposal?.kind === "overview" ? (hasOverview(b.overview) ? diffView(b.overview, S.proposal.data) : `<div class="proposal"><h4>Claude's draft</h4><p><b>Period.</b> ${esc(S.proposal.data.period)}</p><p><b>Actors.</b> ${esc((S.proposal.data.actors ?? []).join("; "))}</p><p><b>Places.</b> ${esc((S.proposal.data.places ?? []).join("; "))}</p><p><b>Turning points.</b> ${esc((S.proposal.data.turningPoints ?? []).join("; "))}</p><p><b>${(S.proposal.data.claims ?? []).length} claims</b> (historical claims cite your sources).</p>${btn("accept-overview", "Replace overview and add claims", { cls: "primary" })} ${btn("dismiss", "Keep mine", {})}</div>`) : "";
  return `<h2 tabindex="-1" id="h">Describe and research the conflict</h2>
  <p class="lead">Give the conflict a title and a short description. Wikipedia is the starting source. Add more sources if you have them.</p>
  <div class="grid2">
    ${fld("Game title <em>required</em>", inp("meta/title", g.meta.title))}
    ${fld("Factions", `<select id="fcount" data-path="/meta/factionCount">${[2, 3, 4].map((n) => `<option value="${n}" ${n === (S.countPreview?.n ?? g.factions.length) ? "selected" : ""}>${n} factions</option>`).join("")}</select>`, "You can change this later. A preview shows what changes first.")}
  </div>
  ${S.countPreview ? `<div class="proposal" role="region" aria-label="Faction count preview"><h4>Change to ${S.countPreview.n} factions</h4><ul>${S.countPreview.changes.map((c) => `<li>${esc(c)}</li>`).join("")}</ul><div class="row">${btn("fcount-apply", "Apply", { cls: "primary" })}${btn("fcount-cancel", "Cancel")}</div></div>` : ""}
  ${fld("Conflict description <em>required</em>", area("brief/conflict", b.conflict, { rows: 3 }))}
  <section class="panel"><h3>Wikipedia article</h3>
    <div class="grid2">${fld("Article URL", inp("brief/wikipedia/url", b.wikipedia.url, { attrs: 'inputmode="url"' }))}${fld("Article title", inp("brief/wikipedia/title", b.wikipedia.title))}</div>
    <div class="row">${btn("find-wiki", S.busy.wiki ? "Asking Claude..." : "Find an article from the description", { dis: S.busy.wiki || !S.sample })} ${chip("wait", b.wikipedia.method === "supplied" ? "supplied by you" : "suggested, not opened")}</div>
    ${S.msg.wiki ? `<p class="err">${esc(S.msg.wiki)}</p>` : ""}
    ${S.wiki.length ? `<p>Several articles may match. Choose one.</p><ul class="pick">${S.wiki.map((w, i) => `<li>${btn("pick-wiki", esc(w.title), { data: `data-i="${i}"` })} <small>${esc(w.why)} <a href="${esc(w.url)}" target="_blank" rel="noopener">Open</a></small></li>`).join("")}</ul><small>Claude cannot open pages, so a suggested link is unverified until a source below shows read.</small>` : ""}
  </section>
  <section class="panel"><h3>Sources</h3>
    ${S.msg.srcNote ? `<p class="err">${esc(S.msg.srcNote)}</p>` : ""}
    ${b.sources.length ? `<p><small>${counts}.</small></p>` : ""}<ul class="srcs">${srcRows || "<li>No sources yet.</li>"}</ul>
    <div class="row">${addButton("sources", "Add source")} ${btn("sync-wiki", "Add the Wikipedia article as a source")}</div>
    <p><small>This view cannot fetch web pages. Pending sources are stored for Claude in chat to read, or you can paste the text.</small></p>
    ${handoff ? `<details open><summary>Ask Claude in chat to read pending sources</summary><textarea readonly rows="${Math.min(14, pending.length + 7)}" id="handoff">${esc(handoff)}</textarea>${btn("copy-handoff", "Copy request")}</details>` : ""}
  </section>
  <section class="panel"><h3>Overview <small>(editable)</small></h3>
    <div class="row">${btn("draft-overview", S.busy.overview ? "Drafting..." : "Draft overview with Claude", { cls: "primary", dis: S.busy.overview || !S.sample })} <small>Uses sources marked read: ${b.sources.filter((s) => s.status === "read" && S.texts[s.id]).map((s) => s.id).join(", ") || "none yet"}.</small></div>
    ${S.msg.overview ? `<p class="err">${esc(S.msg.overview)}</p>` : ""}${proposal}
    ${fld("Time period", inp("brief/overview/period", b.overview.period))}
    <div class="grid3">${fld("Main actors (one per line)", area("brief/overview/actors", b.overview.actors, { t: "l", rows: 5 }))}${fld("Places", area("brief/overview/places", b.overview.places, { t: "l", rows: 5 }))}${fld("Turning points", area("brief/overview/turningPoints", b.overview.turningPoints, { t: "l", rows: 5 }))}</div>
    <details ${S.dopen.claims ? "open" : ""} data-k="claims"><summary>Claims (${b.claims.length}): historical or proposed design. ${unsupported ? chip("bad", `${unsupported} unsupported`) : ""}</summary>
      <table class="t"><thead><tr><th>Kind</th><th>Text</th><th>Sources (ids)</th><th>Conflict note</th><th>Support</th><th><span class="sr">Actions</span></th></tr></thead><tbody>${b.claims.map((c, i) => `<tr><td>${sel(`brief/claims/${i}/kind`, c.kind, ["historical", "design"])}</td><td>${area(`brief/claims/${i}/text`, c.text, { rows: 2 })}</td><td>${inp(`brief/claims/${i}/sourceIds`, (c.sourceIds ?? []).join(", "), { t: "c" })}</td><td>${inp(`brief/claims/${i}/conflict`, c.conflict ?? "")}</td><td>${support(c, i)}</td><td>${removeButton("claims", { i })}</td></tr>`).join("") || '<tr><td colspan="6"><small>No claims yet. Draft the overview, or add one.</small></td></tr>'}</tbody></table>${addButton("claims", "Add claim")} ${btn("claims-check", S.busy.claims ? "Checking..." : "Check historical claims against their sources", { dis: S.busy.claims || !S.sample })}${S.msg.claims ? `<p class="err">${esc(S.msg.claims)}</p>` : ""}</details>
  </section>`;
}

const VERDICT = { supported: "ok", partial: "wait", unsupported: "bad" };
function support(c, i) {
  if (c.kind !== "historical") return "<small>design</small>";
  const ch = c.check;
  const tag = ch ? `${chip(VERDICT[ch.verdict], ch.verdict)}${ch.reason ? ` <small>${esc(ch.reason)}${ch.passage ? ` (${esc(ch.passage.sourceId)}, characters ${ch.passage.start} to ${ch.passage.end})` : ""}</small>` : ""}` : chip("idle", "not checked");
  return `${tag} ${btn("claim-check", "Check", { cls: "link", data: `data-i="${i}"`, dis: !S.sample || S.busy.claims })}`;
}
const hasOverview = (o) => !!(o.period || o.actors.length || o.places.length || o.turningPoints.length);
const LISTS = [["actors", "Actors"], ["places", "Places"], ["turningPoints", "Turning points"]];
// A redraft against a filled overview shows each change. The designer ticks the ones to accept.
function diffView(cur, next) {
  const d = overviewDiff(cur, next);
  const box = (attr, v, on, label) => `<label class="chk"><input type="checkbox" ${attr} value="${esc(v)}" ${on ? "checked" : ""}> ${label}</label>`;
  const lists = LISTS.map(([k, name]) => d[k].add.length || d[k].remove.length ? `<p><b>${name}.</b> ${d[k].add.map((x) => box(`data-ovadd="${k}"`, x, true, `add ${esc(x)}`)).join("")}${d[k].remove.map((x) => box(`data-ovrem="${k}"`, x, false, `remove ${esc(x)}`)).join("")}</p>` : "").join("");
  const claims = (next.claims ?? []).map((c, i) => box(`data-ovclaim="${i}"`, i, true, `${esc(c.kind)}: ${esc(c.text)}`)).join("<br>");
  const none = !d.period && !lists && !claims;
  return `<div class="proposal" role="region" aria-label="Overview changes"><h4>Changes from the new draft</h4>${none ? "<p>The new draft matches your overview.</p>" : ""}
    ${d.period ? `<p><b>Period.</b> ${box('id="ov-period"', "1", true, `use "${esc(d.period.to)}" instead of "${esc(d.period.from)}"`)}</p>` : ""}${lists}${claims ? `<p><b>New claims.</b><br>${claims}</p>` : ""}
    <div class="row">${btn("accept-diff", "Apply the ticked changes", { cls: "primary" })}${btn("dismiss", "Keep mine")}</div></div>`;
}

export function ensureWiki() {
  const w = S.game.brief.wikipedia; if (!w.url) return;
  let s = S.game.brief.sources.find((x) => x.url === w.url);
  if (!s) { const id = nextId("s", S.game.brief.sources); s = { id, url: w.url, title: w.title, status: "pending" }; S.game.brief.sources.unshift(s); writeSource(id); touch(); }
  render();
}
async function findWiki() {
  const r = await ask(`Suggest up to 3 English Wikipedia articles that most plausibly cover this conflict. You cannot browse, so build each URL from the article title as https://en.wikipedia.org/wiki/Title_With_Underscores. Return only JSON: [{"title":"","url":"","why":"one short reason"}].\nConflict: ${S.game.meta.title}. ${S.game.brief.conflict}`);
  S.wiki = (Array.isArray(r) ? r : []).filter((x) => /^https:\/\/en\.wikipedia\.org\/wiki\//.test(x.url)).slice(0, 3);
  if (!S.wiki.length) throw new Error("No likely article found. Paste a Wikipedia link instead.");
}
async function draftOverview() {
  const srcs = S.game.brief.sources.filter((s) => s.status === "read" && S.texts[s.id]);
  if (!srcs.length) throw new Error("No source text yet. Paste text for a source, or ask Claude in chat to read the pending sources.");
  // The first two chunks of each source keep the call inside the input limit.
  const material = srcs.map((s) => chunkText(s.id, S.texts[s.id]).slice(0, 2).map((c) => `SOURCE ${s.id} (${s.url}), characters ${c.start} to ${c.end}:\n${c.text}`).join("\n\n")).join("\n\n");
  const r = await ask(`You are helping design a COIN-style board game. Using ONLY the sources below, write JSON: {"period":"","actors":[""],"places":[""],"turningPoints":[""],"claims":[{"kind":"historical|design","text":"","sourceIds":["s1"],"conflict":"only when sources disagree"}]}.\nRules: paraphrase, never copy sentences. Historical claims must cite source ids from the list. Mark anything you propose for the game (factions, spaces, events) as kind "design" with no sourceIds. Flag conflicting figures in "conflict". Give 4 to 6 actors, 4 to 8 places, 4 to 8 turning points with dates, and 5 to 10 claims.\nGame: ${S.game.meta.title}. ${S.game.brief.conflict}\n\n${material}`);
  S.proposal = { kind: "overview", data: r };
}
// Checks one claim against the read text of its sources. Unread sources never feed a check.
async function checkClaim(c) {
  const read = S.game.brief.sources.filter((s) => (c.sourceIds ?? []).includes(s.id) && s.status === "read" && S.texts[s.id]);
  if (!read.length) return `${c.id}: none of its sources is read yet`;
  const passages = pickChunks(c, read.flatMap((s) => chunkText(s.id, S.texts[s.id])), 2);
  const r = parseCheck(await ask(claimPrompt(c, passages)));
  if (!r) return `${c.id}: Claude gave no clear verdict`;
  c.check = r; return "";
}
async function checkClaims(only) {
  const list = S.game.brief.claims.filter((c, i) => c.kind === "historical" && (only === undefined || i === only));
  const skipped = [];
  for (const c of list) { const why = await checkClaim(c); if (why) skipped.push(why); }
  touch();
  if (skipped.length) throw new Error(`Not checked: ${skipped.join("; ")}.`);
}
function acceptDiff() {
  const b = S.game.brief, p = S.proposal.data, $$ = (sel) => [...document.querySelectorAll(sel)];
  if (document.getElementById("ov-period")?.checked) b.overview.period = p.period;
  for (const [k] of LISTS) {
    const rem = new Set($$(`[data-ovrem="${k}"]:checked`).map((x) => x.value));
    b.overview[k] = [...b.overview[k].filter((x) => !rem.has(x)), ...$$(`[data-ovadd="${k}"]:checked`).map((x) => x.value)];
  }
  for (const i of $$("[data-ovclaim]:checked").map((x) => Number(x.value))) {
    const c = p.claims[i]; const ids = (c.sourceIds ?? []).filter((id) => b.sources.some((s) => s.id === id && s.status === "read"));
    b.claims.push({ id: nextId("c", b.claims), kind: c.kind === "historical" ? "historical" : "design", text: c.text, ...(ids.length ? { sourceIds: ids } : {}), ...(c.conflict ? { conflict: c.conflict } : {}) });
  }
  S.proposal = null; touch(); render();
}
function acceptOverview() {
  const p = S.proposal.data, b = S.game.brief;
  Object.assign(b.overview, { period: p.period ?? b.overview.period, actors: p.actors ?? [], places: p.places ?? [], turningPoints: p.turningPoints ?? [] });
  for (const c of p.claims ?? []) { const ids = (c.sourceIds ?? []).filter((id) => b.sources.some((s) => s.id === id && s.status === "read")); b.claims.push({ id: nextId("c", b.claims), kind: c.kind === "historical" ? "historical" : "design", text: c.text, ...(ids.length ? { sourceIds: ids } : {}), ...(c.conflict ? { conflict: c.conflict } : {}) }); }
  S.proposal = null; touch(); render();
}

export const briefActions = {
  "fcount-apply": () => { setFactionCount(S.game, S.countPreview.n); S.countPreview = null; S.ftab = null; touch(); render(); },
  "fcount-cancel": () => { S.countPreview = null; render(); },
  "sync-wiki": () => ensureWiki(),
  paste: (d) => { const g = S.game; const txt = $(`#paste-${d.i}`).value.trim(); if (!txt) return; const s = g.brief.sources[d.i]; S.texts[s.id] = txt; s.status = "read"; s.readScope = `Pasted by designer, ${txt.length.toLocaleString()} characters`; delete s.failure; writeSource(s.id, { status: "read", text: txt, readScope: s.readScope }); touch(); render(); },
  "copy-handoff": () => { const t = $("#handoff"); t.select(); try { navigator.clipboard.writeText(t.value); } catch { /* user can copy manually */ } },
  "find-wiki": () => guard("wiki", findWiki),
  "pick-wiki": (d) => { const g = S.game; const w = S.wiki[d.i]; g.brief.wikipedia = { url: w.url, title: w.title, method: "discovered", candidates: S.wiki.map((x) => x.url) }; S.wiki = []; ensureWiki(); touch(); render(); },
  "draft-overview": () => guard("overview", draftOverview),
  "accept-overview": () => acceptOverview(),
  "accept-diff": () => acceptDiff(),
  "claims-check": () => { S.dopen.claims = true; guard("claims", () => checkClaims()); },
  "claim-check": (d) => { S.dopen.claims = true; guard("claims", () => checkClaims(Number(d.i))); },
  "src-retry": (d) => { const s = S.game.brief.sources[Number(d.i)]; s.status = "pending"; delete s.failure; delete s.readScope; writeSource(s.id); touch(); render(); },
};

defineList("sources", {
  add: () => { const g = S.game; const id = nextId("s", g.brief.sources); g.brief.sources.push({ id, url: "", status: "pending" }); writeSource(id); touch(); render(); },
  remove: (d) => { const g = S.game; const s = g.brief.sources[d.i]; g.brief.sources.splice(d.i, 1); S.db?.doc(`sources/${s.id}`).delete().catch(() => {}); delete S.texts[s.id]; touch(); render(); }
});
defineList("claims", {
  add: () => { const g = S.game; g.brief.claims.push({ id: nextId("c", g.brief.claims), kind: "design", text: "" }); touch(); render(); },
  remove: (d) => { S.game.brief.claims.splice(d.i, 1); touch(); render(); }
});

// Returns true when the change belonged to the faction count selector. It shows a preview first.
export function onBriefChange(el) {
  if (el.id !== "fcount") return false;
  const n = Number(el.value);
  if (n === S.game.factions.length) { S.countPreview = null; render(); return true; }
  const copy = structuredClone(S.game);
  S.countPreview = { n, changes: setFactionCount(copy, n) };
  render(); return true;
}
