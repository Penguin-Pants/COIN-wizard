import { S, $, esc, nextId, pieces } from "../state.mjs";
import { fld, inp, sel, btn, chip, bound } from "../components/fields.mjs";
import { addButton, removeButton, defineList } from "../components/listEditor.mjs";
import { fvars, fdot } from "../components/faction.mjs";
import { boardSvg } from "../../src/kit.mjs";
import { opinionLevels, opinionNames } from "../../src/opinion.mjs";
import { setOpinionLevels } from "../../src/presets.mjs";
import { touch, check, ask, guard } from "../store.mjs";
import { boardPrompt, fillBoard, boardBase } from "../../src/boardsuggest.mjs";
import { mapPrompt, applyMapPositions } from "../../src/mapplace.mjs";
import { render } from "../shell.mjs";

export function renderBoard() {
  const g = S.game;
  const onBoard = (pid) => g.setup.placements.filter((p) => p.piece === pid).reduce((s, p) => s + p.count, 0);
  const cols = pieces().flatMap((p) => p.states.map((st) => ({ p, st })));
  const count = (sp, pid, st) => g.setup.placements.filter((x) => x.space === sp && x.piece === pid && x.state === st).reduce((s, x) => s + x.count, 0);
  const lnk = (id) => g.board.spaces.find((s) => s.id === id)?.name ?? id;
  return `<h2 tabindex="-1" id="h">Prepare the board and setup</h2><p class="lead">Spaces and legal connections define play. Drawing positions are separate and only change how the board looks.</p>
  ${suggestPanel(g)}
  <section class="panel"><h3>Spaces</h3><label class="fld inline"><span>Opinion levels</span><select id="oplevels" data-path="/board/opinionLevels">${[[3, "3: Support, Neutral, Opposition"], [5, "5: Active and Passive Support and Opposition"]].map(([v, l]) => `<option value="${v}" ${opinionLevels(g) === v ? "selected" : ""}>${l}</option>`).join("")}</select></label><table class="t"><thead><tr><th>Name</th><th>Type</th><th>Pop</th><th>Starting opinion</th><th><span class="sr">Actions</span></th></tr></thead><tbody>${g.board.spaces.map((s, i) => `<tr><td>${inp(`board/spaces/${i}/name`, s.name)}</td><td>${sel(`board/spaces/${i}/type`, s.type, ["city", "province", "line", "sanctuary", "custom"])}</td><td>${inp(`board/spaces/${i}/attrs/pop`, s.attrs.pop, { t: "n", type: "number", attrs: 'min="0"' })}</td><td>${sel(`setup/spaceAttributes/${s.id}/opinion`, g.setup.spaceAttributes?.[s.id]?.opinion ?? 0, [...opinionNames(g)].reverse(), { t: "n" })}</td><td>${removeButton("spaces", { id: s.id })}</td></tr>`).join("")}</tbody></table>${addButton("spaces", "Add space")}</section>
  <section class="panel"><h3>Legal connections</h3>
    <form class="row" onsubmit="return false"><label class="fld"><span>From</span><select id="lk-from">${g.board.spaces.map((s) => `<option value="${esc(s.id)}">${esc(s.name)}</option>`).join("")}</select></label><label class="fld"><span>To</span><select id="lk-to">${g.board.spaces.map((s, i) => `<option value="${esc(s.id)}" ${i === 1 ? "selected" : ""}>${esc(s.name)}</option>`).join("")}</select></label>${addButton("links", "Add connection")}</form>
    ${S.msg.link ? `<p class="err">${esc(S.msg.link)}</p>` : ""}
    <ul class="links">${g.board.links.map((l, i) => `<li>${esc(lnk(l.from))} to ${esc(lnk(l.to))} ${removeButton("links", { i, label: "Remove" })}</li>`).join("")}</ul></section>
  ${mapPanel(g)}
  <section class="panel"><h3>Board drawing</h3><p><small>Drag a space, or focus it and use the arrow keys. This does not change connections.</small></p><div class="row"><label class="fld inline"><span>Background image (optional, up to 1.5 MB)</span><input type="file" id="boardbg" accept="image/png,image/jpeg,image/webp" data-path="/board/presentation/background"></label>${g.board.presentation.background?.href ? `<label class="fld inline"><span>Image strength</span><input type="range" min="0.1" max="1" step="0.05" ${bound("board/presentation/background/opacity", "n", true)} value="${g.board.presentation.background.opacity ?? 0.35}"></label>${btn("board-bg-clear", "Remove image", { cls: "link" })}` : ""}</div>${S.msg.bg ? `<p class="err">${esc(S.msg.bg)}</p>` : ""}<div id="board">${boardSvg(g, { fixed: true })}</div>
    <details><summary>Exact positions</summary><table class="t"><tbody>${g.board.spaces.map((s) => `<tr><td>${esc(s.name)}</td><td>${inp(`board/presentation/positions/${s.id}/x`, g.board.presentation.positions[s.id]?.x ?? 0, { t: "n", type: "number" })}</td><td>${inp(`board/presentation/positions/${s.id}/y`, g.board.presentation.positions[s.id]?.y ?? 0, { t: "n", type: "number" })}</td></tr>`).join("")}</tbody></table></details></section>
  <section class="panel"><h3>Starting pieces on the board</h3><div class="scroll"><table class="t"><thead><tr><th><span class="sr">Faction</span></th>${g.factions.map((f) => `<th class="fgrp" colspan="${cols.filter((c) => c.p.owner === f.id).length}" style="${fvars(f.color)}">${fdot(f)} ${esc(f.name)}</th>`).join("")}</tr><tr><th>Space</th>${cols.map((c) => `<th class="fcol" style="${fvars(S.game.factions.find((f) => f.id === c.p.owner).color)}">${esc(c.p.name)}${c.p.states.length > 1 ? `<br><small>${esc(c.st)}</small>` : ""}</th>`).join("")}</tr></thead><tbody>${g.board.spaces.map((s) => `<tr><td>${esc(s.name)}</td>${cols.map((c) => `<td><input type="number" min="0" aria-label="${esc(s.name)} ${esc(c.p.name)} ${esc(c.st)}" data-pc="${esc(s.id)}|${esc(c.p.id)}|${esc(c.st)}" data-path="/setup/placements" value="${count(s.id, c.p.id, c.st)}"></td>`).join("")}</tr>`).join("")}</tbody></table></div></section>
  <section class="panel"><h3>Piece counts</h3><table class="t"><thead><tr><th>Piece</th><th>On board</th><th>Available</th><th>Out of Play</th><th>Supply</th><th>Check</th></tr></thead><tbody>${pieces().map((p) => { const pool = g.setup.pools[p.id] ?? { available: 0, outOfPlay: 0 }; const sum = onBoard(p.id) + pool.available + pool.outOfPlay; return `<tr><td>${fdot(g.factions.find((f) => f.id === p.owner))} ${esc(p.name)}</td><td>${onBoard(p.id)}</td><td>${inp(`setup/pools/${p.id}/available`, pool.available, { t: "n", type: "number", attrs: 'min="0"' })}</td><td>${inp(`setup/pools/${p.id}/outOfPlay`, pool.outOfPlay, { t: "n", type: "number", attrs: 'min="0"' })}</td><td>${p.supply}</td><td>${sum === p.supply ? chip("ok", `${sum} = ${p.supply}`) : chip("bad", `${sum} not ${p.supply}`)}</td></tr>`; }).join("")}</tbody></table></section>
  <section class="panel"><h3>Tracks and eligibility</h3><div class="grid3">${g.tracks.map((t, ti) => fld(`${esc(t.name)} (${t.min} to ${t.max})`, `<input type="number" data-track="${esc(t.id)}" data-path="/tracks/${ti}/start" value="${t.start}" min="${t.min}" max="${t.max}">`)).join("")}</div>
    <div class="row">${g.factions.map((f) => `<label class="chk"><input type="checkbox" ${bound(`setup/eligibility/${f.id}`, "b")} ${g.setup.eligibility[f.id] ? "checked" : ""}> ${esc(f.name)} starts Eligible</label>`).join("")}</div></section>`;
}

// Map images: the designer uploads up to 3 maps of the period. Claude reads map 1 (and the others for
// context) and places each space on it; Apply also puts map 1 under the board, so the regions line up.
// Images stay in this view until Apply; map 1 is then saved with the game.
const MAX_MAPS = 3, MAX_SIDE = 1600;
function mapPanel(g) {
  const maps = S.maps ?? [], p = S.proposal?.kind === "map" ? S.proposal : null;
  const nm = (id) => esc(g.board.spaces.find((s) => s.id === id)?.name ?? id);
  const prev = p ? `<div class="proposal" role="region" aria-label="Suggested map positions"><h4>Claude's positions on map 1</h4>
    <p>Apply moves ${p.report.placed.length} of ${g.board.spaces.length} spaces onto the map and puts map 1 under the board.</p>
    ${p.report.notes ? `<p><small>${esc(p.report.notes)}</small></p>` : ""}
    ${p.report.missing.length ? `<p><small>Not found on the map, left where they are: ${p.report.missing.map(nm).join(", ")}.</small></p>` : ""}
    ${p.report.dropped.length ? `<details><summary>Parts of the answer not used (${p.report.dropped.length})</summary><ul>${p.report.dropped.map((x) => `<li>${esc(x)}</li>`).join("")}</ul></details>` : ""}
    <div class="row">${btn("map-accept", "Apply to the board", { cls: "primary", dis: !p.report.placed.length })}${btn("dismiss", "Keep mine")}</div></div>` : "";
  const why = !S.sample ? "Claude is not available in this view." : !S.sampleImages ? "This view cannot send images to Claude." : !maps.length ? "Upload a map first." : "";
  return `<section class="panel"><h3>Map from images</h3><p><small>Upload up to ${MAX_MAPS} maps of the period (PNG, JPEG, WebP, GIF or SVG), for example from Wikipedia or an atlas. Claude places each space at its real location on map 1, and the spaces draw as regions over the faded map. A map on a web page: save the image, then upload it here. This page cannot load web addresses.</small></p>
  <div class="row"><label class="fld inline"><span>Map images</span><input type="file" id="mapfiles" multiple accept="image/png,image/jpeg,image/webp,image/gif,image/svg+xml"></label></div>
  ${maps.length ? `<ol class="maps">${maps.map((m, i) => `<li><img src="${m.href}" alt="Map ${i + 1}: ${esc(m.name)}" height="72"> <small>Map ${i + 1}: ${esc(m.name)} (${m.w} x ${m.h})</small> ${btn("map-remove", "Remove", { cls: "link", data: `data-i="${i}"` })}</li>`).join("")}</ol>` : ""}
  ${S.msg.maps ? `<p class="err">${esc(S.msg.maps)}</p>` : ""}
  <div class="row">${btn("map-place", S.busy.map ? "Asking Claude..." : "Place spaces on map 1 with Claude", { cls: "primary", dis: S.busy.map || !!why })}${why ? `<small>${esc(why)}</small>` : ""}</div>${S.msg.map ? `<p class="err">${esc(S.msg.map)}</p>` : ""}${prev}</section>`;
}
// Draws the image on a canvas no larger than MAX_SIDE: a fixed format for Claude and a smaller saved file.
function rasterize(file) {
  return new Promise((ok, no) => {
    const url = URL.createObjectURL(file), img = new Image();
    img.onload = () => {
      const k = Math.min(1, MAX_SIDE / Math.max(img.naturalWidth || 1, img.naturalHeight || 1));
      const w = Math.max(1, Math.round((img.naturalWidth || 1) * k)), h = Math.max(1, Math.round((img.naturalHeight || 1) * k));
      const c = document.createElement("canvas"); c.width = w; c.height = h;
      const x = c.getContext("2d"); x.fillStyle = "#fff"; x.fillRect(0, 0, w, h); x.drawImage(img, 0, 0, w, h); URL.revokeObjectURL(url);
      const href = c.toDataURL("image/jpeg", 0.85);
      c.toBlob((blob) => (blob ? ok({ name: file.name, href, blob, w, h }) : no(new Error("could not read"))), "image/jpeg", 0.85);
    };
    img.onerror = () => { URL.revokeObjectURL(url); no(new Error("not an image")); };
    img.src = url;
  });
}
async function addMaps(files) {
  S.maps ??= []; delete S.msg.maps;
  for (const f of files) {
    if (S.maps.length >= MAX_MAPS) { S.msg.maps = `Only ${MAX_MAPS} maps are used. Remove one to add another.`; break; }
    try { S.maps.push(await rasterize(f)); } catch { S.msg.maps = `${f.name} could not be read as an image.`; }
  }
  render();
}
async function placeOnMap() {
  const g = S.game, m = S.maps[0];
  const r = await ask(mapPrompt(g), { images: S.maps.map((x) => x.blob) });
  S.proposal = { kind: "map", map: m, spaces: g.board.spaces.map((s) => s.id).join("|"), ...applyMapPositions(g, r, m) };
}
function acceptMap() {
  const p = S.proposal, g = S.game;
  if (p.spaces !== g.board.spaces.map((s) => s.id).join("|")) { S.proposal = null; S.msg.map = "The spaces changed after this suggestion, so it was discarded. Ask Claude again."; render(); return; }
  // Only the spaces Claude found move; every other space keeps its current place.
  for (const id of p.report.placed) g.board.presentation.positions[id] = p.game.board.presentation.positions[id];
  g.board.presentation.background = { href: p.map.href, opacity: 0.5 };
  S.proposal = null; touch(); check(); render();
}

// One Claude call fills the empty fields of this step from the read sources (placeholder spaces and
// default values count as empty; src/boardsuggest.mjs fillBoard). Nothing changes until Apply.
function suggestPanel(g) {
  const read = g.brief.sources.filter((s) => s.status === "read" && S.texts[s.id]).map((s) => s.id);
  const p = S.proposal?.kind === "board" ? S.proposal : null;
  const list = (title, xs) => (xs.length ? `<details><summary>${title} (${xs.length})</summary><ul>${xs.map((x) => `<li>${esc(x)}</li>`).join("")}</ul></details>` : "");
  const nm = (id) => esc(p.game.board.spaces.find((s) => s.id === id)?.name ?? id);
  const newLinks = p ? p.game.board.links.length - g.board.links.filter((l) => p.report.kept.includes(l.from) && p.report.kept.includes(l.to)).length : 0;
  const prev = p ? `<div class="proposal" role="region" aria-label="Suggested board"><h4>Claude's suggested board</h4>
    <p>Apply adds ${p.report.added.length} spaces${p.report.added.length ? ` (${p.report.added.map(nm).join(", ")})` : ""} and ${newLinks} legal connections, and fills starting pieces, track starts and eligibility where you left them empty or at the default.</p>
    ${p.report.notes ? `<p><small>${esc(p.report.notes)}</small></p>` : ""}
    ${p.report.removed.length ? `<p><b>Note.</b> Apply replaces ${p.report.removed.length} placeholder spaces: ${p.report.removed.map((id) => esc(g.board.spaces.find((s) => s.id === id)?.name ?? id)).join(", ")}. Undo restores them.</p>` : ""}
    ${list("Kept as you set it", p.report.skipped)}
    ${list("Parts of the answer not used", p.report.dropped)}
    <div class="row">${btn("board-accept", "Apply to this step", { cls: "primary" })}${btn("dismiss", "Keep mine")}</div></div>` : "";
  return `<section class="panel"><h3>Suggest from sources</h3><p><small>Claude fills the empty fields of this step (spaces, legal connections, starting pieces, piece counts, track starts and eligibility) from the sources marked read. Placeholder spaces and default values count as empty; everything you set stays. Sources: ${read.join(", ") || "none yet"}. You review the result before anything changes.</small></p>
  <div class="row">${btn("suggest-board", S.busy.board ? "Asking Claude..." : "Fill empty fields with Claude", { cls: "primary", dis: S.busy.board || !S.sample || !read.length })}</div>${S.msg.board ? `<p class="err">${esc(S.msg.board)}</p>` : ""}${prev}</section>`;
}
async function suggestBoard() {
  const g = S.game;
  const r = await ask(boardPrompt(g, S.texts));
  S.proposal = { kind: "board", base: boardBase(g), ...fillBoard(g, r) };
}
function acceptBoard() {
  const { game, base } = S.proposal; const g = S.game;
  // Factions, pieces or tracks changed since the suggestion: its counts would no longer fit.
  if (base !== boardBase(g)) { S.proposal = null; S.msg.board = "Factions, pieces or tracks changed after this suggestion, so it was discarded. Ask Claude again."; render(); return; }
  g.board = game.board; g.setup = game.setup; g.tracks = game.tracks;
  S.proposal = null; touch(); check(); render();
}

export function wireBoard() {
  const wrap = $("#board"); if (!wrap) return;
  let drag = null;
  const pos = (id, x, y) => { S.game.board.presentation.positions[id] = { x: Math.max(0, Math.min(640, Math.round(x))), y: Math.max(0, Math.min(480, Math.round(y))) }; wrap.innerHTML = boardSvg(S.game, { fixed: true }); };
  wrap.addEventListener("pointerdown", (e) => { const g = e.target.closest("[data-space]"); if (!g) return; drag = g.dataset.space; wrap.setPointerCapture(e.pointerId); e.preventDefault(); });
  wrap.addEventListener("pointermove", (e) => {
    if (!drag) return; const svg = wrap.querySelector("svg"); const pt = svg.createSVGPoint(); pt.x = e.clientX; pt.y = e.clientY; const p = pt.matrixTransform(svg.getScreenCTM().inverse()); pos(drag, p.x, p.y);
  });
  wrap.addEventListener("pointerup", () => { if (drag) { drag = null; touch(); render(); } });
  wrap.addEventListener("keydown", (e) => {
    const g = e.target.closest?.("[data-space]"); if (!g) return; const id = g.dataset.space; const p = S.game.board.presentation.positions[id]; const d = { ArrowLeft: [-10, 0], ArrowRight: [10, 0], ArrowUp: [0, -10], ArrowDown: [0, 10] }[e.key]; if (!d) return; e.preventDefault(); pos(id, p.x + d[0], p.y + d[1]); touch(); wrap.querySelector(`[data-space="${id}"]`)?.focus();
  });
}

export function setCount(sp, pid, st, n) {
  const pl = S.game.setup.placements; const i = pl.findIndex((x) => x.space === sp && x.piece === pid && x.state === st);
  if (n <= 0) { if (i >= 0) pl.splice(i, 1); } else if (i >= 0) pl[i].count = n; else pl.push({ space: sp, piece: pid, state: st, count: n });
  touch();
}
function delSpace(id) {
  const g = S.game; g.board.spaces = g.board.spaces.filter((s) => s.id !== id); delete g.board.presentation.positions[id]; delete g.setup.spaceAttributes?.[id];
  const nl = g.board.links.length, np = g.setup.placements.length;
  g.board.links = g.board.links.filter((l) => l.from !== id && l.to !== id); g.setup.placements = g.setup.placements.filter((p) => p.space !== id);
  S.msg.review = `Removed ${nl - g.board.links.length} connections and ${np - g.setup.placements.length} placements that used ${id}. Check piece counts below.`;
  touch(); check(); render();
}

defineList("spaces", {
  add: () => { const g = S.game; const name = `New space ${g.board.spaces.length + 1}`; const id = nextId("space", g.board.spaces); g.board.spaces.push({ id, name, type: "province", attrs: { pop: 1 } }); g.board.presentation.positions[id] = { x: 60 + 20 * g.board.spaces.length, y: 40 }; (g.setup.spaceAttributes ??= {})[id] = { opinion: 0 }; touch(); render(); },
  remove: (d) => delSpace(d.id)
});
defineList("links", {
  add: () => { const g = S.game; const f = $("#lk-from").value, t = $("#lk-to").value; delete S.msg.link; if (f === t) S.msg.link = "Choose two different spaces."; else if (g.board.links.some((l) => [l.from, l.to].sort().join() === [f, t].sort().join())) S.msg.link = "Those spaces are already connected."; else { g.board.links.push({ id: nextId("l", g.board.links), from: f, to: t }); touch(); } render(); },
  remove: (d) => { S.game.board.links.splice(d.i, 1); touch(); render(); }
});

// Reads the chosen image as a data URL, so the kit carries it with no outside link.
export function onBoardChange(el) {
  if (el.id === "mapfiles") { addMaps([...(el.files ?? [])]); return true; }
  // Opinion levels (schema 1.9.0): see setOpinionLevels.
  if (el.id === "oplevels") {
    setOpinionLevels(S.game, Number(el.value));
    touch(); render(); return true;
  }
  if (el.id !== "boardbg") return false;
  const file = el.files?.[0]; if (!file) return true;
  if (file.size > 1.5 * 1024 * 1024) { S.msg.bg = "That image is larger than 1.5 MB. Use a smaller one."; render(); return true; }
  const rd = new FileReader();
  rd.onload = () => { delete S.msg.bg; S.game.board.presentation.background = { href: rd.result, opacity: 0.35 }; touch(); render(); };
  rd.readAsDataURL(file);
  return true;
}
export const boardBgActions = {
  "board-bg-clear": () => { S.game.board.presentation.background = null; touch(); render(); },
  "suggest-board": () => guard("board", suggestBoard),
  "board-accept": () => acceptBoard(),
  "map-place": () => guard("map", placeOnMap),
  "map-accept": () => acceptMap(),
  "map-remove": (d) => { S.maps.splice(Number(d.i), 1); if (S.proposal?.kind === "map") S.proposal = null; render(); }
};
