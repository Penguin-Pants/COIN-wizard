// Print kit generators. Everything reads the confirmed definition only.
import { aidModel, toHtml } from "./botaid.mjs";
import { graphSvg } from "./graphsvg.mjs";
import { condText, stepText } from "./plain.mjs";
import { toCond } from "./exprmodel.mjs";

const condTextOf = (g, e) => condText(toCond(e), g);
const stepTextOf = (g, st) => stepText(st, g);

const h = (s) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/"/g, "&quot;");
const draftNote = (g) => (g.meta.status === "final" ? "" : "DRAFT (not confirmed)");
const CHOICE = { event: "Event", operationSpecial: "Operation plus Special Activity", operation: "Operation only", limitedOperation: "Limited Operation", pass: "Pass" };
const faction = (g, id) => g.factions.find((f) => f.id === id);

// Space names wrap to two lines of about 16 characters.
function nameLines(name) {
  const words = String(name).split(/\s+/), out = [""];
  for (const w of words) { if ((out.at(-1) + " " + w).trim().length > 16 && out.at(-1)) out.push(w); else out[out.length - 1] = (out.at(-1) + " " + w).trim(); }
  return out.length > 2 ? [out[0], (out.slice(1).join(" ")).slice(0, 15) + "."] : out;
}

// presentation.background: { href, opacity } draws a designer image under the board.
export function boardSvg(g, { fixed = false } = {}) {
  const pos = g.board.presentation.positions;
  const xs = Object.values(pos).map((p) => p.x), ys = Object.values(pos).map((p) => p.y);
  const pad = 70;
  const minX = fixed ? 0 : Math.min(...xs) - pad, minY = fixed ? 0 : Math.min(...ys) - pad;
  const w = fixed ? 640 : Math.max(...xs) - minX + pad, hgt = fixed ? 480 : Math.max(...ys) - minY + pad;
  const bg = g.board.presentation.background;
  const image = bg?.href ? `<image href="${h(bg.href)}" x="${minX}" y="${minY}" width="${w}" height="${hgt}" preserveAspectRatio="xMidYMid slice" opacity="${bg.opacity ?? 0.35}"/>` : "";
  const line = g.board.links.filter((l) => pos[l.from] && pos[l.to]).map((l) => `<line x1="${pos[l.from].x}" y1="${pos[l.from].y}" x2="${pos[l.to].x}" y2="${pos[l.to].y}" stroke="#444" stroke-width="3" stroke-linecap="round"/>`).join("");
  const label = 'font-family="sans-serif" text-anchor="middle" paint-order="stroke" stroke="#fff" stroke-width="3" stroke-linejoin="round"';
  const nodes = g.board.spaces.filter((s) => pos[s.id]).map((s) => {
    const { x, y } = pos[s.id], lines = nameLines(s.name), top = y - (lines.length > 1 ? 12 : 5);
    const shape = s.type === "city" ? `<rect x="${x - 54}" y="${y - 32}" width="108" height="64" rx="8" fill="#fff" fill-opacity="0.92" stroke="#111" stroke-width="3"/>` : `<ellipse cx="${x}" cy="${y}" rx="58" ry="34" fill="#fff" fill-opacity="0.92" stroke="#111" stroke-width="2" stroke-dasharray="${s.type === "province" ? "0" : "5 3"}"/>`;
    return `<g data-space="${h(s.id)}" tabindex="0" style="cursor:grab"><title>${h(s.name)}: drag to move, arrow keys nudge</title>${shape}${lines.map((t, i) => `<text x="${x}" y="${top + i * 13}" font-size="12" font-weight="700" ${label}>${h(t)}</text>`).join("")}<text x="${x}" y="${top + lines.length * 13 + 2}" font-size="10.5" ${label}>${s.type}, Pop ${s.attrs.pop}</text></g>`;
  }).join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${minX} ${minY} ${w} ${hgt}" width="${Math.round(w)}" height="${Math.round(hgt)}" role="img" aria-label="Schematic board for ${h(g.meta.title)}"><rect x="${minX}" y="${minY}" width="${w}" height="${hgt}" fill="#f7f7f2"/>${image}${line}${nodes}<text x="${minX + 8}" y="${minY + hgt - 8}" font-size="10" font-family="sans-serif">${h(g.meta.title)} schematic board. Lines are legal connections. ${draftNote(g)}</text></svg>`;
}

export function setupSheetMd(g) {
  const L = [`# ${g.meta.title}: setup sheet`, draftNote(g), "", "## 1. Spaces", "| Space | Opinion | Pieces |", "|---|---|---|"];
  const opin = (v) => (v > 0 ? "Support" : v < 0 ? "Opposition" : "Neutral");
  for (const s of g.board.spaces) {
    const here = g.setup.placements.filter((p) => p.space === s.id).map((p) => {
      const pc = g.factions.flatMap((f) => f.pieces).find((x) => x.id === p.piece);
      return `${p.count} ${pc.name}${pc.states.length > 1 ? ` (${p.state})` : ""}`;
    });
    L.push(`| ${s.name} (Pop ${s.attrs.pop}) | ${opin(g.setup.spaceAttributes?.[s.id]?.opinion ?? 0)} | ${here.join(", ") || "none"} |`);
  }
  L.push("", "## 2. Piece pools", "| Piece | On board | Available | Out of Play | Supply |", "|---|---|---|---|---|");
  for (const f of g.factions) for (const pc of f.pieces) {
    const on = g.setup.placements.filter((p) => p.piece === pc.id).reduce((s, p) => s + p.count, 0);
    const pool = g.setup.pools[pc.id];
    L.push(`| ${f.name}: ${pc.name} | ${on} | ${pool.available} | ${pool.outOfPlay} | ${pc.supply} |`);
  }
  L.push("", "## 3. Tracks", ...g.tracks.map((t) => `- ${t.name}: ${g.setup.tracks[t.id]} (range ${t.min} to ${t.max})`));
  L.push("", "## 4. Eligibility", ...g.factions.map((f) => `- ${f.name}: ${g.setup.eligibility[f.id] ? "Eligible" : "Ineligible"}`));
  L.push("", "## 5. Deck", g.deck.preparation.text, "", "## 6. Supplies not in the kit", ...(g.meta.supplies ?? []).map((s) => `- ${s}`), "");
  return L.join("\n");
}

export function rulebookMd(g) {
  const T = g.rules.text, seq = g.rules.sequence;
  const L = [`# ${g.meta.title}: rules`, draftNote(g), "", `Revision ${g.meta.revision}. ${g.factions.length} factions.`, ""];
  const section = (n, title, body) => L.push(`## ${n}. ${title}`, body, "");
  section(1, "Overview", T.overview);
  section(2, "Components", T.components);
  section(3, "Setup", T.setup);
  section(4, "Sequence of play", T.sequence);
  L.push(seq.firstActor, "", "| First faction chooses | Second faction may choose |", "|---|---|", ...Object.entries(seq.secondActorOptions).map(([k, v]) => `| ${CHOICE[k]} | ${v.map((x) => CHOICE[x]).join("; ")} |`), "",
    `After acting: a faction that chose ${seq.eligibilityAfter.staysEligible.map((x) => CHOICE[x]).join(" or ")} stays Eligible. Every other acting faction is Ineligible for the next card. ${seq.eligibilityAfter.bothIneligibleResult}`, "",
    `Pass: ${g.factions.map((f) => `${f.name} gains ${seq.passGain[f.id]} Resource${seq.passGain[f.id] === 1 ? "" : "s"}`).join("; ")}. An Ineligible faction does not Pass and gains nothing.`, "");
  section(5, "Operations and Special Activities", T.operations);
  for (const f of g.factions) {
    L.push(`### ${f.name} (${f.symbol})`, f.role, "");
    for (const id of [...f.operations, ...f.specialActivities]) {
      const a = g.actions.find((x) => x.id === id);
      L.push(`- **${a.name}** (${a.kind === "operation" ? "Operation" : "Special Activity"}, cost ${a.cost.amount} per ${a.cost.per}${a.limitedAllowed ? ", Limited allowed" : ""}). ${a.plain}`);
    }
    L.push("");
  }
  section(6, "Events", T.events);
  section(7, g.rules.scoring.name, T.scoring);
  g.rules.scoring.phases.forEach((p, i) => L.push(`${i + 1}. **${p.name}.** ${p.text}`));
  L.push("");
  section(8, "Victory", T.victory);
  for (const v of g.victory.perFaction) L.push(`- **${faction(g, v.factionId).name}:** ${v.plain} Threshold ${v.threshold}.`);
  L.push("", `Check: ${g.victory.checkAt} Final: ${g.victory.finalScoring}`, ...g.victory.tieBreaks.map((t) => `- Tie-break: ${t}`), "");
  section(9, "Solo and bot play", T.solo);
  for (const b of g.bots) L.push(`- ${faction(g, b.factionId).name}: use the bot aid for this faction.`);
  L.push("", "## 10. Credits and sources", ...(g.meta.credits ?? []).map((c) => `- ${c.what}: ${c.source} (${c.license})`), ...g.brief.sources.map((s) => `- Source ${s.id}: ${s.url} [${s.status}]${s.readScope ? ` ${s.readScope}` : ""}${s.failure ? ` Failure: ${s.failure}` : ""}`), "");
  L.push("## 11. Historical notes and design notes", ...g.brief.claims.map((c) => `- [${c.kind}] ${c.text}${c.conflict ? ` (Sources differ: ${c.conflict})` : ""}`), "");
  return L.join("\n");
}

// Print layout. No paper size is forced: every page box fits inside both Letter and A4
// with 10 mm margins (190 x 259 mm usable), and cards and aid sections never break across pages.
const CSS = "@page{margin:10mm}*{box-sizing:border-box}body{font:9.5pt system-ui,sans-serif;margin:0;color:#111}.page{width:190mm;break-after:page;page-break-after:always}.page:last-of-type{break-after:auto;page-break-after:auto}.note{font-size:8.5pt;margin:0 0 3mm}.draft{font-weight:700;letter-spacing:.08em}"
  + ".cards{display:grid;grid-template-columns:repeat(3,63mm);grid-auto-rows:88mm;gap:0;width:189mm}.card{width:63mm;height:88mm;border:0.3mm dashed #777;padding:3mm;overflow:hidden;break-inside:avoid;page-break-inside:avoid;position:relative;font-size:8pt;display:flex;flex-direction:column;gap:1mm}.card h3{margin:0;font-size:10pt}.ord{display:flex;gap:1mm}.ord svg{width:7mm;height:7mm}.side{border-top:0.3mm solid #999;padding-top:1mm}.shaded{background:#e8e8e8}.i{font-style:italic}.cid{margin-top:auto;font-size:7pt}"
  + ".toks{display:flex;flex-wrap:wrap;gap:1.5mm}.tok svg{width:15mm;height:15mm;display:block}.grp{break-inside:avoid;page-break-inside:avoid;margin:0 0 3mm}.grp h2{font-size:10pt;margin:0 0 1mm}"
  + ".band{display:flex;gap:3mm;align-items:center;border-left:4mm solid var(--f);padding:2mm 3mm;margin:0 0 3mm;background:#f2f2f2}.band svg{width:10mm;height:10mm}.band h1{font-size:14pt;margin:0}.cols{columns:2;column-gap:6mm}.aidsec{break-inside:avoid;page-break-inside:avoid;margin:0 0 4mm;border-top:0.6mm solid var(--f);padding-top:1.5mm}.aidsec h2{font-size:10.5pt;margin:0 0 1.5mm}.aidsec h3{font-size:9.5pt;margin:2mm 0 0.5mm}.aidsec p{margin:0 0 1mm}.where{font-style:italic}.card-size,.counter-size{border:0.3mm solid #111;flex:none}.card-size{padding:3mm}.counter-size svg{width:100%;height:100%;display:block}.ruler{display:block}table{border-collapse:collapse;width:100%}td,th{border-bottom:0.2mm solid #bbb;text-align:left;padding:0.6mm 1mm;font-size:8.5pt}";

// Each faction has a shape by its position in the faction list, so printed pieces read in grayscale too.
const SHAPE = ["sq", "circ", "hex", "oct"];
export function shapeSvg(g, f, { base = false, label = f.symbol } = {}) {
  const i = g.factions.findIndex((x) => x.id === f.id) % 4, k = SHAPE[i];
  const poly = (n, r, rot) => Array.from({ length: n }, (_, j) => { const a = rot + (2 * Math.PI * j) / n; return `${(50 + r * Math.cos(a)).toFixed(1)},${(50 + r * Math.sin(a)).toFixed(1)}`; }).join(" ");
  const attrs = `fill="${f.color}" fill-opacity="0.22" stroke="${f.color}" stroke-width="${base ? 9 : 5}"`;
  const shape = k === "sq" ? `<rect x="8" y="8" width="84" height="84" rx="6" ${attrs}/>` : k === "circ" ? `<circle cx="50" cy="50" r="44" ${attrs}/>` : k === "hex" ? `<polygon points="${poly(6, 46, 0)}" ${attrs}/>` : `<polygon points="${poly(8, 46, Math.PI / 8)}" ${attrs}/>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" role="img" aria-label="${h(f.name)}">${shape}<text x="50" y="50" text-anchor="middle" dominant-baseline="central" font-family="sans-serif" font-weight="700" font-size="${label.length > 3 ? 18 : 30}" fill="#111">${h(label)}</text></svg>`;
}

const doc = (g, title, body) => `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><title>${h(g.meta.title)} ${h(title)}${g.meta.status === "final" ? "" : " (DRAFT)"}</title><style>${CSS}</style></head><body>${body}</body></html>`;
const head = (g, what) => `<p class="note">${h(g.meta.title)} ${h(what)}, revision ${g.meta.revision}. ${draftNote(g) ? `<span class="draft">${draftNote(g)}</span>` : ""}</p>`;
const pages = (items, per) => Array.from({ length: Math.ceil(items.length / per) }, (_, i) => items.slice(i * per, i * per + per));

// Cards: 63 x 88 mm, six to a page, with dashed cutting guides.
export function cardsHtml(g) {
  const cards = g.deck.cards.map((c) => {
    const order = c.order.map((id) => { const f = faction(g, id); return f ? shapeSvg(g, f) : "?"; }).join("");
    const sides = (c.sides ?? []).map((s) => `<div class="side ${s.id}"><b>${h(s.label || (s.id === "unshaded" ? "Unshaded" : "Shaded"))}</b>: ${h(s.text)}</div>`).join("");
    const body = c.type === "scoring" ? `<div class="side"><b>${h(g.rules.scoring.name)}</b>: ${g.rules.scoring.phases.map((p) => h(p.name)).join(", ")}.${c.final ? " <b>FINAL: the game ends.</b>" : ""}</div>` : sides;
    return `<div class="card"><h3>${h(c.title)}</h3><div class="ord" aria-label="Faction order">${order}</div>${c.flavor ? `<div class="i">${h(c.flavor)}</div>` : ""}${body}<div class="cid">${h(c.id.toUpperCase())} ${c.type === "scoring" ? "scoring" : "event"}${draftNote(g) ? " DRAFT" : ""}</div></div>`;
  });
  const legend = g.factions.map((f) => `${shapeSvg(g, f).replace("<svg ", '<svg width="12" height="12" ')} ${h(f.name)}`).join(" &nbsp; ");
  return doc(g, "cards", pages(cards, 6).map((p, i) => `<section class="page">${i === 0 ? `${head(g, "cards")}<p class="note">Cut on the dashed lines. Faction order: ${legend}.</p>` : ""}<div class="cards">${p.join("")}</div></section>`).join(""));
}

// Print test sheet: one page that fits Letter and A4. A 50 mm ruler, one card outline and one
// counter at the sizes the kit prints (cards 63 x 88 mm, counters 15 x 15 mm), to measure on paper.
export function printTestHtml(g) {
  const ticks = Array.from({ length: 51 }, (_, i) => `<line x1="${i}" y1="0" x2="${i}" y2="${i % 10 === 0 ? 5 : i % 5 === 0 ? 3.5 : 2}" stroke="#111" stroke-width="0.15"/>`).join("")
    + [0, 10, 20, 30, 40, 50].map((i) => `<text x="${i}" y="8" font-size="2.6" text-anchor="${i === 0 ? "start" : i === 50 ? "end" : "middle"}" font-family="sans-serif">${i}</text>`).join("");
  const ruler = `<svg class="ruler" xmlns="http://www.w3.org/2000/svg" width="50mm" height="9mm" viewBox="0 0 50 9" role="img" aria-label="50 mm ruler"><line x1="0" y1="0" x2="50" y2="0" stroke="#111" stroke-width="0.2"/>${ticks}</svg>`;
  const f = g.factions[0];
  const body = `<section class="page">${head(g, "print test sheet")}<h1 style="font-size:14pt;margin:0 0 2mm">Print test sheet</h1>
<p>Print this page at 100 % scale ("Actual size"), not "Fit to page". It fits both Letter and A4. Then measure and cut:</p>
<ol><li>The ruler must measure 50 mm from 0 to 50.</li><li>Cut the card on its outline: it must be 63 x 88 mm.</li><li>Cut the counter on its outline: it must be 15 x 15 mm.</li><li>Write the sizes below and report them with the paper size (Letter or A4).</li></ol>
<p>${ruler}</p>
<div style="display:flex;gap:8mm;align-items:flex-start"><div class="card-size" style="width:63mm;height:88mm"><b>Card</b><br>63 x 88 mm</div><div class="counter-size" style="width:15mm;height:15mm">${shapeSvg(g, f)}</div>
<table style="width:auto"><tr><th>Item</th><th>Should be</th><th>Measured</th></tr><tr><td>Ruler</td><td>50 mm</td><td>&nbsp;</td></tr><tr><td>Card</td><td>63 x 88 mm</td><td>&nbsp;</td></tr><tr><td>Counter</td><td>15 x 15 mm</td><td>&nbsp;</td></tr><tr><td>Paper</td><td>Letter or A4</td><td>&nbsp;</td></tr></table></div></section>`;
  return doc(g, "print test sheet", body);
}

// Space markers set by markerSet steps or started in setup (opinion has its own track on the board).
// One marker per space, so every space can hold one.
export function spaceMarkers(g) {
  const out = new Set(Object.values(g.setup.spaceAttributes ?? {}).flatMap((a) => Object.keys(a)).filter((k) => k !== "opinion"));
  JSON.stringify([g.actions, g.deck.cards], (k, v) => { if (v?.op === "markerSet" && typeof v.marker === "string") out.add(v.marker); return v; });
  return [...out].map((id) => ({ id, name: id.charAt(0).toUpperCase() + id.slice(1), count: g.board.spaces.length }));
}

// Counters: each faction's shape in its color, with the symbol. Bases have a thick border.
export function countersHtml(g) {
  const groups = g.factions.map((f) => `<div class="grp"><h2>${h(f.name)}</h2><div class="toks">${f.pieces.flatMap((pc) => Array.from({ length: pc.supply }, () => `<span class="tok" title="${h(pc.name)}">${shapeSvg(g, f, { base: pc.isBase, label: pc.isBase ? `${f.symbol}B` : f.symbol })}</span>`)).join("")}</div><p class="note">${f.pieces.map((pc) => `${pc.supply} ${h(pc.name)}${pc.isBase ? " (thick border)" : ""}${pc.states.length > 1 ? `, two-sided: ${pc.states.map(h).join(" / ")}` : ""}`).join("; ")}.</p></div>`).join("");
  const markers = g.tracks.map((t) => `<li>${h(t.name)} marker (track ${t.min} to ${t.max})</li>`).join("") + g.factions.map((f) => `<li>${h(f.name)} Eligibility marker (${h(f.symbol)})</li>`).join("") + spaceMarkers(g).map((m) => `<li>${h(m.name)} marker (${m.count}, one per space)</li>`).join("");
  return doc(g, "counters", `<section class="page">${head(g, "counters")}${groups}<div class="grp"><h2>Markers</h2><ul>${markers}</ul></div></section>`);
}

// Faction player aid, in the order of a printed GMT faction aid (checked against the Colonial
// Twilight FLN sheet): Operations (3.0), Special Activities (4.0), then Victory (7.0) for every
// faction with the final-scoring rule. Each action reads Location, Cost, Procedure. Forces, the
// sequence of play and scoring follow; that sheet does not show them.
export function factionAidHtml(g, f) {
  const acts = (kind) => f[kind === "operation" ? "operations" : "specialActivities"].map((id) => g.actions.find((a) => a.id === id)).filter(Boolean);
  const track = (id) => g.tracks.find((t) => t.id === id)?.name ?? id;
  const act = (a) => `<h3>${h(a.name)}</h3><p class="where"><b>Location:</b> ${h(condTextOf(g, a.targets))}.</p><p><b>Cost:</b> ${a.cost.amount ? `${a.cost.amount} ${h(track(a.cost.track))} per ${a.cost.per}` : "free"}${a.kind === "operation" ? `. ${a.limitedAllowed ? "Allowed" : "Not allowed"} as a Limited Operation` : `. Timing: ${h(a.timing ?? "after")} the Operation`}.</p><p><b>Procedure:</b> ${h(a.plain)}</p>`;
  const seq = g.rules.sequence;
  const mine = new Set([f.resourceTrack, ...f.pieces.map((p) => p.id)]);
  const scoring = g.rules.scoring.phases.flatMap((p) => p.steps.filter((st) => [...mine].some((id) => JSON.stringify(st).includes(`"${id}"`))).map((st) => `<li>${h(p.name)}: ${h(stepTextOf(g, st))}</li>`));
  const body = `<section class="page" style="--f:${f.color}"><div class="band">${shapeSvg(g, f)}<div><h1>${h(f.name)}: faction aid</h1>${head(g, "player aid")}</div></div><div class="cols">
    <section class="aidsec"><h2>3.0 Operations</h2>${acts("operation").map(act).join("") || "<p>None yet.</p>"}</section>
    <section class="aidsec"><h2>4.0 Special Activities</h2>${acts("specialActivity").map(act).join("") || "<p>None yet.</p>"}</section>
    <section class="aidsec"><h2>7.0 Victory</h2>${g.victory.perFaction.map((v) => `<p><b>${h(faction(g, v.factionId).name)}:</b> ${h(v.plain)} Threshold: ${v.threshold}.</p>`).join("") || "<p>No victory rule yet.</p>"}<p>${h(g.victory.checkAt)} ${h(g.victory.finalScoring)}</p></section>
    <section class="aidsec"><h2>Forces</h2><table><tr><th>Piece</th><th>Sides</th><th>Supply</th></tr>${f.pieces.map((p) => `<tr><td>${h(p.name)}${p.isBase ? " (base)" : ""}</td><td>${p.states.map(h).join(" / ")}</td><td>${p.supply}</td></tr>`).join("")}</table><p>Resources: ${h(track(f.resourceTrack))}. Pass: gain ${seq.passGain[f.id] ?? 0}.</p></section>
    <section class="aidsec"><h2>Sequence of play</h2><p>${h(seq.firstActor)}</p><table><tr><th>1st Eligible chose</th><th>2nd Eligible may choose</th></tr>${Object.entries(seq.secondActorOptions).map(([k, v]) => `<tr><td>${CHOICE[k]}</td><td>${v.map((x) => CHOICE[x]).join(", ")}</td></tr>`).join("")}</table></section>
    <section class="aidsec"><h2>At each ${h(g.rules.scoring.name)} card</h2>${scoring.length ? `<ul>${scoring.join("")}</ul>` : "<p>Nothing specific to this faction.</p>"}</section></div></section>`;
  return doc(g, `${f.name} aid`, body);
}

export function checklistMd(g) {
  const L = [`# ${g.meta.title}: component checklist`, draftNote(g), "", "| Item | Count |", "|---|---|"];
  for (const f of g.factions) for (const pc of f.pieces) L.push(`| ${f.name}: ${pc.name}${pc.states.length > 1 ? ` (${pc.states.join("/")})` : ""} | ${pc.supply} |`);
  L.push(`| Spaces on the board | ${g.board.spaces.length} |`, `| Event cards | ${g.deck.cards.filter((c) => c.type === "event").length} |`, `| Scoring cards | ${g.deck.cards.filter((c) => c.type === "scoring").length} |`, ...g.tracks.map((t) => `| ${t.name} marker | 1 |`), ...spaceMarkers(g).map((m) => `| ${m.name} marker | ${m.count} |`), "", "Supplies you provide:", ...(g.meta.supplies ?? []).map((s) => `- ${s}`), "");
  return L.join("\n");
}

// All files of the print kit and exports, as [path, text] pairs.
export function buildFiles(g, { toMermaid, toMarkdown, toPolicyYaml }) {
  const id = g.meta.gameId;
  const files = [
    [`${id}.game.json`, JSON.stringify(g, null, 2) + "\n"],
    [`kit/${id}.rulebook.md`, rulebookMd(g)],
    [`kit/${id}.setup-sheet.md`, setupSheetMd(g)],
    [`kit/${id}.board.svg`, boardSvg(g)],
    [`kit/${id}.cards.html`, cardsHtml(g)],
    [`kit/${id}.counters.html`, countersHtml(g)],
    [`kit/${id}.components.md`, checklistMd(g)],
    [`kit/${id}.print-test.html`, printTestHtml(g)],
    ...g.factions.map((f) => [`kit/${id}.${f.id}.aid.html`, factionAidHtml(g, f)])
  ];
  const draft = draftNote(g);
  for (const bot of g.bots) {
    const m = aidModel(g, bot);
    const base = `bots/${id}.${bot.factionId}`;
    files.push(
      [`${base}.aid.md`, toMarkdown(m)], [`${base}.aid.html`, toHtml(m)],
      [`${base}.flow.mmd`, `${draft ? `%% ${draft}\n` : ""}${toMermaid(bot)}`],
      [`${base}.flow.svg`, graphSvg(bot, { title: `${g.meta.title}: ${faction(g, bot.factionId)?.name ?? bot.factionId} bot flowchart${draft ? ` (${draft})` : ""}` })],
      [`${base}.policy.yaml`, `${draft ? `# ${draft}\n` : ""}${toPolicyYaml(g, bot)}`],
      [`${base}.policy.json`, JSON.stringify(draft ? { draft: true, ...bot } : bot, null, 2) + "\n"]);
  }
  return files;
}
