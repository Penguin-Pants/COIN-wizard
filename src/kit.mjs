// Print kit generators. Everything reads the confirmed definition only.
import { aidModel, toHtml, stepNumbers, tableLabels } from "./botaid.mjs";
import { graphSvg } from "./graphsvg.mjs";
import { linkedOf, cardLasting } from "./dryrun.mjs";
import { choiceCounts } from "./effects.mjs";
import { condText, stepText } from "./plain.mjs";
import { toCond } from "./exprmodel.mjs";
import { voronoi, FRAME } from "./mapplace.mjs";

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
// The board as a map: provinces and other areas are region shapes (cells around each space's
// position), cities are round markers and lines are bars, both drawn on top. Lines between centers
// are the legal connections. Region tint shows starting opinion. With a map image the board keeps the
// editor frame, so each space stays on its place on the image.
const OPINION_FILL = { 1: "#dbe7f3", 0: "#efeadb", "-1": "#f3dcd8" };
export function boardSvg(g, { fixed = false } = {}) {
  const pos = g.board.presentation.positions;
  const bg = g.board.presentation.background;
  const frame = fixed || bg?.href;
  const xs = Object.values(pos).map((p) => p.x), ys = Object.values(pos).map((p) => p.y);
  const pad = 70;
  const minX = frame ? 0 : Math.min(...xs) - pad, minY = frame ? 0 : Math.min(...ys) - pad;
  const w = frame ? FRAME.w : Math.max(...xs) - minX + pad, hgt = frame ? FRAME.h : Math.max(...ys) - minY + pad;
  const image = bg?.href ? `<image href="${h(bg.href)}" x="${minX}" y="${minY}" width="${w}" height="${hgt}" preserveAspectRatio="xMidYMid meet" opacity="${bg.opacity ?? 0.35}"/>` : "";
  const placed = g.board.spaces.filter((s) => pos[s.id]);
  const isRegion = (s) => s.type !== "city" && s.type !== "line";
  const cells = voronoi(Object.fromEntries(placed.filter(isRegion).map((s) => [s.id, pos[s.id]])), { x: minX, y: minY, w, h: hgt }, { reach: 0.85 });
  const opinion = (s) => OPINION_FILL[g.setup.spaceAttributes?.[s.id]?.opinion ?? 0] ?? OPINION_FILL[0];
  const label = 'font-family="sans-serif" text-anchor="middle" paint-order="stroke" stroke="#fff" stroke-width="3" stroke-linejoin="round"';
  const text = (s, x, y) => { const lines = nameLines(s.name), top = y - (lines.length > 1 ? 12 : 5); return `${lines.map((t, i) => `<text x="${x}" y="${top + i * 13}" font-size="12" font-weight="700" ${label}>${h(t)}</text>`).join("")}<text x="${x}" y="${top + lines.length * 13 + 2}" font-size="10.5" ${label}>${s.type}, Pop ${s.attrs.pop}</text>`; };
  const grp = (s, body) => `<g data-space="${h(s.id)}" tabindex="0" style="cursor:grab"><title>${h(s.name)}: drag to move, arrow keys nudge</title>${body}</g>`;
  const regions = placed.filter(isRegion).map((s) => grp(s, `<polygon points="${cells[s.id].map(([x, y]) => `${Math.round(x * 10) / 10},${Math.round(y * 10) / 10}`).join(" ")}" fill="${opinion(s)}" fill-opacity="${bg?.href ? 0.45 : 1}" stroke="#555" stroke-width="1.5" stroke-dasharray="${s.type === "province" ? "0" : "6 3"}"/>${text(s, pos[s.id].x, pos[s.id].y)}`)).join("");
  const line = g.board.links.filter((l) => pos[l.from] && pos[l.to]).map((l) => `<line x1="${pos[l.from].x}" y1="${pos[l.from].y}" x2="${pos[l.to].x}" y2="${pos[l.to].y}" stroke="#333" stroke-width="2" stroke-opacity="0.55" stroke-linecap="round"/>`).join("");
  const markers = placed.filter((s) => !isRegion(s)).map((s) => {
    const { x, y } = pos[s.id];
    const shape = s.type === "city" ? `<circle cx="${x}" cy="${y}" r="16" fill="${opinion(s)}" stroke="#111" stroke-width="3"/>` : `<rect x="${x - 26}" y="${y - 7}" width="52" height="14" rx="7" fill="#d8c9a3" stroke="#111" stroke-width="2"/>`;
    return grp(s, `${shape}${text(s, x, y + 34)}`);
  }).join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${minX} ${minY} ${w} ${hgt}" width="${Math.round(w)}" height="${Math.round(hgt)}" role="img" aria-label="Board for ${h(g.meta.title)}"><rect x="${minX}" y="${minY}" width="${w}" height="${hgt}" fill="#f7f7f2"/>${image}${regions}${line}${markers}<text x="${minX + 8}" y="${minY + hgt - 8}" font-size="10" font-family="sans-serif">${h(g.meta.title)} board. Lines are legal connections; tint is starting opinion (blue Support, red Opposition). ${draftNote(g)}</text></svg>`;
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
  g.factions.forEach((f, fi) => {
    L.push(`### 5.${fi + 1} ${f.name} (${f.symbol})`, f.role, "");
    for (const id of [...f.operations, ...f.specialActivities]) {
      const a = g.actions.find((x) => x.id === id);
      L.push(`- **${a.name}** (${a.ruleRef ? `${a.ruleRef}, ` : ""}${a.kind === "operation" ? "Operation" : "Special Activity"}, cost ${a.cost.amount} per ${a.cost.per}${a.limitedAllowed ? ", Limited allowed" : ""}). ${a.purpose ? `${a.purpose} ` : ""}${a.plain}`);
    }
    L.push("");
  });
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
  + ".cards{display:grid;grid-template-columns:repeat(3,63mm);grid-auto-rows:88mm;gap:0;width:189mm}.card{width:63mm;height:88mm;border:0.3mm dashed #777;padding:3mm;overflow:hidden;break-inside:avoid;page-break-inside:avoid;position:relative;font-size:8pt;display:flex;flex-direction:column;gap:1mm}.card h3{margin:0;font-size:10pt}.ord{display:flex;gap:1mm}.ord svg{width:7mm;height:7mm}.side{border-top:0.3mm solid #999;padding-top:1mm}.shaded{background:#e8e8e8}.i{font-style:italic}.cid{margin-top:auto;font-size:7pt}.lasting{font-size:7pt;font-weight:700;text-transform:uppercase;border:0.2mm solid #111;padding:0 0.8mm}"
  + ".toks{display:flex;flex-wrap:wrap;gap:1.5mm}.tok svg{width:15mm;height:15mm;display:block}.grp{break-inside:avoid;page-break-inside:avoid;margin:0 0 3mm}.grp h2{font-size:10pt;margin:0 0 1mm}"
  + ".band{display:flex;gap:3mm;align-items:center;border-left:4mm solid var(--f);padding:2mm 3mm;margin:0 0 3mm;background:#f2f2f2}.band svg{width:10mm;height:10mm}.band h1{font-size:14pt;margin:0}.cols{columns:2;column-gap:6mm}.aidsec{break-inside:avoid;page-break-inside:avoid;margin:0 0 4mm;border-top:0.6mm solid var(--f);padding-top:1.5mm}.aidsec h2{font-size:10.5pt;margin:0 0 1.5mm}.aidsec h3{font-size:9.5pt;margin:2mm 0 0.5mm}.aidsec p{margin:0 0 1mm}.where{font-style:italic}.sheethead{display:flex;justify-content:center;align-items:center;gap:4mm;margin:0 0 1mm}.sheethead svg{width:11mm;height:11mm}.sheethead h1{font-size:20pt;margin:0}.sheetcols{display:grid;grid-template-columns:1fr 1fr;gap:4mm}.col h2{font-size:12pt;margin:0 0 1.5mm;text-align:center;color:var(--f)}.box{border:0.5mm solid #222;border-radius:2mm;padding:1.5mm 2mm;margin:0 0 3mm;break-inside:avoid;page-break-inside:avoid;font-size:8.5pt}.box p{margin:0 0 0.6mm;padding-left:3mm;text-indent:-3mm}.bt{display:flex;justify-content:space-between;align-items:baseline;gap:2mm;border-bottom:0.5mm solid var(--f);margin:0 0 1mm}.bt h3{font-size:11pt;margin:0}.bt small{font-weight:400;font-size:8pt}.tag{font-weight:700;font-size:8pt;color:var(--f);white-space:nowrap}.box.sa{background:color-mix(in srgb,var(--f) 14%,#fff)}.vic p.mine{background:color-mix(in srgb,var(--f) 28%,#fff);font-weight:600}.vic .i{font-style:italic;text-indent:0}.card-size,.counter-size{border:0.3mm solid #111;flex:none}.card-size{padding:3mm}.counter-size svg{width:100%;height:100%;display:block}.ruler{display:block}table{border-collapse:collapse;width:100%}td,th{border-bottom:0.2mm solid #bbb;text-align:left;padding:0.6mm 1mm;font-size:8.5pt}"
  + ".np{font-size:8pt}.npgrid{display:grid;grid-template-columns:42mm 1fr 1fr;gap:3mm;align-items:start}.np .col h2{font-size:12pt;margin:0 0 1.5mm;text-align:center;color:var(--f)}.np .box{font-size:8pt}.np .box p{margin:0 0 0.5mm}.np .where{font-style:italic;padding-left:0;text-indent:0}.np .pr{padding-left:4mm;text-indent:-4mm}.tb{background:color-mix(in srgb,var(--f) 22%,#fff);border-radius:1mm;padding:0.5mm 1.5mm;margin:0.5mm 0 1mm}.arr{font-size:7.5pt;color:#333;text-indent:0;padding-left:0}.arr b{color:var(--f)}.skip{font-style:italic;text-align:right;text-indent:0}.box.evt{background:#f2f2f2}.gate{font-weight:600;border-bottom:0.2mm solid #999;padding-bottom:0.5mm}.gate b{color:var(--f)}.dia{margin:0 0 3mm;break-inside:avoid;page-break-inside:avoid}.dia .q{clip-path:polygon(50% 0,100% 50%,50% 100%,0 50%);background:color-mix(in srgb,var(--f) 22%,#fff);margin:0;padding:6mm 7mm;text-align:center;font-weight:600;font-size:7.5pt;min-height:22mm;display:flex;align-items:center;justify-content:center}.dia .arr{text-align:center;margin:0.3mm 0}.evi{break-inside:avoid;page-break-inside:avoid;border-top:0.6mm solid var(--f);margin-top:2mm;padding-top:1mm}.evi h2{font-size:12pt;margin:0 0 1mm}.evi p{margin:0 0 0.6mm;padding-left:4mm;text-indent:-4mm}.foot{font-size:7pt;color:#333;margin:1mm 0 0}.terms{font-size:7.5pt;margin:1mm 0 0}.part .pt{font-weight:600;margin:1mm 0 0}"
  + ".ref h1{font-size:18pt;margin:0 0 1mm;text-align:center;letter-spacing:.04em}.ref h2{font-size:13pt;margin:3mm 0 1.5mm}.ref h3{margin:0;font-size:10pt}.flow{display:grid;grid-template-columns:38mm 1fr 6mm 1fr 44mm;gap:2mm;align-items:center}.flow .hd{text-align:center;grid-column:2}.flow .hd+.hd{grid-column:4}.flow>.side-note{grid-column:1}.sop1{grid-column:2}.flow .to{grid-column:3}.sop2{grid-column:4}.sides{grid-column:1}.sop1,.sop2,.ref .box{border:0.6mm solid #6b2b2b;border-radius:3mm;padding:2mm;background:#f3e6e3;text-align:center;font-weight:600;font-size:9pt}.ref .box h3{font-size:10pt}.ref .box p{font-weight:400;padding:0;text-indent:0;font-size:8pt}.to{text-align:center;font-size:14pt;color:#6b2b2b}.side-note{font-style:italic;font-size:8pt;color:#333}.right{grid-column:5;grid-row:2 / span 4;display:flex;flex-direction:column;gap:3mm}.ref .box.pass{grid-column:2 / span 3;text-align:center}.phase{margin:0 0 1.2mm;padding-left:4mm;text-indent:-4mm}"
  + ".clist{display:grid;grid-template-columns:repeat(4,1fr);gap:1mm 4mm}.cgrp h3{font-size:9.5pt;margin:1mm 0 0.3mm;letter-spacing:.05em}.cgrp p,.scl{margin:0 0 0.2mm;font-size:8.5pt}.band2{background:#6b2b2b;color:#fff;padding:1mm 0;margin:0 0 1.5mm}.band2 h1{margin:0}.slist{display:grid;grid-template-columns:1fr 1fr;gap:4mm;align-items:start}.slist h2{font-size:11pt;margin:2mm 0 1mm}.tot{font-style:italic;font-weight:600;margin:1mm 0 0}";

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
const LASTING = { momentum: "Momentum", capability: "Capability" };
export function cardsHtml(g) {
  const cards = g.deck.cards.map((c) => {
    const order = c.order.map((id) => { const f = faction(g, id); return f ? shapeSvg(g, f) : "?"; }).join("");
    const sides = (c.sides ?? []).map((s) => `<div class="side ${s.id}"><b>${h(s.label || (s.id === "unshaded" ? "Unshaded" : "Shaded"))}</b>${s.lasting ? ` <span class="lasting">${LASTING[s.lasting]}</span>` : ""}: ${h(s.text)}</div>`).join("");
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
  const out = new Set(Object.values(g.setup.spaceAttributes ?? {}).flatMap((a) => Object.keys(a)));
  JSON.stringify(g, (k, v) => { if (v?.op === "markerSet" && typeof v.marker === "string") out.add(v.marker); return v; });
  out.delete("opinion");
  return [...out].sort().map((id) => ({ id, name: id.charAt(0).toUpperCase() + id.slice(1), count: g.board.spaces.length }));
}

// Counters: each faction's shape in its color, with the symbol. Bases have a thick border.
export function countersHtml(g) {
  const groups = g.factions.map((f) => `<div class="grp"><h2>${h(f.name)}</h2><div class="toks">${f.pieces.flatMap((pc) => Array.from({ length: pc.supply }, () => `<span class="tok" title="${h(pc.name)}">${shapeSvg(g, f, { base: pc.isBase, label: pc.isBase ? `${f.symbol}B` : f.symbol })}</span>`)).join("")}</div><p class="note">${f.pieces.map((pc) => `${pc.supply} ${h(pc.name)}${pc.isBase ? " (thick border)" : ""}${pc.states.length > 1 ? `, two-sided: ${pc.states.map(h).join(" / ")}` : ""}`).join("; ")}.</p></div>`).join("");
  const markers = g.tracks.map((t) => `<li>${h(t.name)} marker (track ${t.min} to ${t.max})</li>`).join("") + g.factions.map((f) => `<li>${h(f.name)} Eligibility marker (${h(f.symbol)})</li>`).join("") + spaceMarkers(g).map((m) => `<li>${h(m.name)} marker (${m.count}, one per space)</li>`).join("");
  return doc(g, "counters", `<section class="page">${head(g, "counters")}${groups}<div class="grp"><h2>Markers</h2><ul>${markers}</ul></div></section>`);
}

// Joins names as "A", "A or B", "A, B or C".
const orList = (xs) => (xs.length < 2 ? xs.join("") : `${xs.slice(0, -1).join(", ")} or ${xs.at(-1)}`);

// The Special Activities of a faction that may go with an Operation. null: not known.
export function pairingOf(g, f, op) {
  const sas = f.specialActivities.map((id) => g.actions.find((a) => a.id === id)).filter(Boolean);
  // Unknown while any Special Activity leaves its pairing unstated: print no tag rather than a wrong one.
  if (!sas.length || sas.some((s) => s.accompanies === undefined)) return null;
  const ok = sas.filter((s) => s.accompanies === "any" || (Array.isArray(s.accompanies) && s.accompanies.includes(op.id)));
  return { all: ok.length === sas.length, names: ok.map((s) => s.name) };
}

// Player faction sheet. Front page mirrors the printed GMT faction sheets (examples/player-faction-sheets/):
// an Operations column and a Special Activities column of boxes, then a Victory box for every faction
// with this faction's row marked. Rule sections follow this kit's rulebook (5: actions, 8: Victory).
// The back page holds forces, the sequence of play and scoring, which the front sheet does not show.
export function factionAidHtml(g, f) {
  const acts = (kind) => f[kind === "operation" ? "operations" : "specialActivities"].map((id) => g.actions.find((a) => a.id === id)).filter(Boolean);
  const track = (id) => g.tracks.find((t) => t.id === id)?.name ?? id;
  const name = (id) => g.actions.find((a) => a.id === id)?.name ?? id;
  const cost = (a) => `${a.cost.amount ? `${a.cost.amount} ${h(track(a.cost.track))} per ${a.cost.per === "space" ? "space selected" : "use"}` : "free"}${a.kind === "operation" ? `. ${a.limitedAllowed ? "Allowed" : "Not allowed"} as a Limited Operation` : `. Timing: ${h(a.timing ?? "after")} the Operation`}.`;
  const title = (a, tag) => `<div class="bt"><h3>${h(a.name)}${a.ruleRef ? ` <small>(${h(a.ruleRef)})</small>` : ""}</h3>${tag ? `<span class="tag">${h(tag)}</span>` : ""}</div>`;
  const line = (k, v) => `<p><b>${k}:</b> ${v}</p>`;
  const where = (a) => (a.targets === true ? "Any space." : `${h(condTextOf(g, a.targets))}.`);
  const opTag = (a) => { const p = pairingOf(g, f, a); return !p ? "" : p.all ? "+ any Special Activity?" : p.names.length ? `+ ${orList(p.names)}?` : "no Special Activity"; };
  const op = (a) => `<section class="box">${title(a, opTag(a))}${a.purpose ? line("Purpose", h(a.purpose)) : ""}${line("Location", where(a))}${line("Cost", cost(a))}${line("Procedure", h(a.plain))}</section>`;
  const accOf = (a) => (a.accompanies === "any" ? "Any." : Array.isArray(a.accompanies) ? `${h(orList(a.accompanies.map(name)))}.` : "");
  const sa = (a) => `<section class="box sa">${title(a, a.spaceText ?? (a.maxSpaces ? `max ${a.maxSpaces} space${a.maxSpaces === 1 ? "" : "s"}` : ""))}${a.purpose ? line("Purpose", h(a.purpose)) : ""}${a.accompanies !== undefined ? line("Accompanying Op", accOf(a)) : ""}${line("Location", where(a))}${line("Cost", cost(a))}${line("Procedure", h(a.plain))}</section>`;
  const victory = `<section class="box vic"><div class="bt"><h3>Victory (8)</h3></div>${g.victory.perFaction.map((v) => `<p${v.factionId === f.id ? ' class="mine"' : ""}><b>${h(faction(g, v.factionId).name)}:</b> ${h(v.plain)} Threshold: ${v.threshold}.</p>`).join("") || "<p>No victory rule yet.</p>"}<p class="i">${h(g.victory.checkAt)} ${h(g.victory.finalScoring)}</p></section>`;
  const seq = g.rules.sequence;
  const mine = new Set([f.resourceTrack, ...f.pieces.map((p) => p.id)]);
  const scoring = g.rules.scoring.phases.flatMap((p) => p.steps.filter((st) => [...mine].some((id) => JSON.stringify(st).includes(`"${id}"`))).map((st) => `<li>${h(p.name)}: ${h(stepTextOf(g, st))}</li>`));
  const sym = shapeSvg(g, f);
  const body = `<section class="page sheet" style="--f:${f.color}"><div class="sheethead">${sym}<h1>${h(f.name)}</h1>${sym}</div>${head(g, "faction sheet")}
    <div class="sheetcols"><div class="col ops"><h2>${f.type === "state" ? "COIN Operations" : "Insurgent Operations"}</h2>${acts("operation").map(op).join("") || "<p>None yet.</p>"}</div>
    <div class="col sas"><h2>Special Activities</h2>${acts("specialActivity").map(sa).join("") || "<p>None yet.</p>"}${victory}</div></div></section>
    <section class="page back" style="--f:${f.color}"><div class="band">${sym}<div><h1>${h(f.name)}: reference</h1>${head(g, "faction sheet, back")}</div></div><div class="cols">
    <section class="aidsec"><h2>Forces</h2><table><tr><th>Piece</th><th>Sides</th><th>Supply</th></tr>${f.pieces.map((p) => `<tr><td>${h(p.name)}${p.isBase ? " (base)" : ""}</td><td>${p.states.map(h).join(" / ")}</td><td>${p.supply}</td></tr>`).join("")}</table><p>Resources: ${h(track(f.resourceTrack))}. Pass: gain ${seq.passGain[f.id] ?? 0}.</p></section>
    <section class="aidsec"><h2>Sequence of play</h2><p>${h(seq.firstActor)}</p><table><tr><th>1st Eligible chose</th><th>2nd Eligible may choose</th></tr>${Object.entries(seq.secondActorOptions).map(([k, v]) => `<tr><td>${CHOICE[k]}</td><td>${v.map((x) => CHOICE[x]).join(", ")}</td></tr>`).join("")}</table></section>
    <section class="aidsec"><h2>At each ${h(g.rules.scoring.name)} card</h2>${scoring.length ? `<ul>${scoring.join("")}</ul>` : "<p>Nothing specific to this faction.</p>"}</section></div></section>`;
  return doc(g, `${f.name} faction sheet`, body);
}

// Non-Player sheet: one page in the layout of the printed GMT Non-Player sheets
// (examples/non-player-bot-sheets/). Event? box top left, condition diamonds down the left,
// Operation boxes in the middle (numbered priorities, shaded lettered tie-breaks, "if none" arrow),
// Special Activity boxes on the right ("then" or "with" arrow from the Operation, skip text),
// Event Instructions at the bottom. Arrows are printed as labels that name their target.
const NUM = (n) => (n >= 1 && n <= 10 ? String.fromCodePoint(0x2775 + n) : `(${n})`);
const LET = (l) => (/^[a-z]$/.test(l) ? String.fromCodePoint(0x24d0 + l.charCodeAt(0) - 97) : `(${l})`);
const TIMING = { after: "then", during: "with", before: "before" };
const END = { none: "No action", event: "Event", operation: "Operation done", operationSpecial: "Operation plus Special Activity done", pass: "Pass" };

export function nonPlayerSheetHtml(g, bot) {
  const f = faction(g, bot.factionId);
  const { num, nodes } = stepNumbers(bot);
  const labels = tableLabels(bot);
  const act = (id) => g.actions.find((a) => a.id === id);
  const table = (id) => bot.priorityTables.find((t) => t.id === id);
  const order = bot.nodes.filter((n) => num[n.id]).sort((a, b) => num[a.id] - num[b.id]);
  const to = (id) => { const n = nodes[id]; return n.kind === "end" ? END[n.outcome] : n.kind === "event-check" ? "Event?" : n.kind === "action" ? `${act(n.action)?.name ?? n.action} (${n.parts ? n.parts.map((pt) => labels[pt.table]).join(", ") : labels[n.table]})` : n.text; };
  const arr = (label, id) => `<p class="arr"><b>${label}</b> → ${h(to(id))}</p>`;
  const where = (a) => (!a || a.targets === true ? "" : `<p class="where">Where ${h(condTextOf(g, a.targets))}.</p>`);
  // The printed max is what a dry run takes: the table limit, capped by the action's maxSpaces (src/dryrun.mjs).
  const max = (t, a) => (t.scope === "opponent" ? "" : `<span class="tag">max ${Math.min(t.select === "all" ? t.limit : 1, a?.maxSpaces ?? Infinity)}</span>`);
  // A table that selects several spaces breaks its last ties by space name, not by the die (pick in src/dryrun.mjs).
  const byName = (t) => (t.select === "all" && t.scope !== "opponent" ? '<p class="pr">Still tied: take spaces in alphabetical order of name.</p>' : "");
  const prio = (t) => `${t.steps.map((s) => `<p class="pr">${NUM(s.n)} ${h(s.text)}</p>`).join("")}${t.tiebreak.length ? `<div class="tb">${t.tiebreak.map((x) => `<p>${LET(x.letter)} ${h(x.text)} (${x.order === "max" ? "highest" : "lowest"} wins)</p>`).join("")}</div>` : ""}${byName(t)}`;
  const title = (name, t, a) => `<div class="bt"><h3>${h(name)} <small>(${labels[t.id]})</small></h3>${max(t, a)}</div>`;

  const evNodes = order.filter((n) => n.kind === "event-check");
  // Conditions that run before the first Event check (such as Eligible?) read first, in the Event? box.
  const first = evNodes.length ? num[evNodes[0].id] : 0;
  const gate = (n) => num[n.id] < first;
  const ep = bot.eventPolicy;
  const gates = order.filter((n) => n.kind === "condition" && gate(n)).map((n) => `<p class="gate">${h(n.text)} <b>Yes</b> → ${h(to(n.yes))} <b>No</b> → ${h(to(n.no))}</p>`).join("");
  const evt = `<section class="box evt"><div class="bt"><h3>Event?</h3></div>${gates}<p>${h(ep.plain)}</p><p><b>Side:</b> ${ep.side === "shaded" ? "Shaded" : "Unshaded"}.</p><p><b>Play if:</b> ${h(condTextOf(g, ep.playIf))}.</p>${evNodes.map((n) => arr("Yes", n.yes) + arr("if none", n.no)).join("")}</section>`;
  const dias = order.filter((n) => n.kind === "condition" && !gate(n)).map((n) => `<div class="dia"><p class="q">${h(n.text)}</p>${arr("Yes", n.yes)}${arr("No", n.no)}</div>`).join("");

  // A linked list prints in order: the first entry after "then" or "with", the next ones after "if none".
  // One box per distinct Special Activity use. Per box, "nexts" maps each "if none" target to the
  // Operations whose list goes there, and "ends" holds the Operations whose list stops there. When
  // the uses differ, every "if none" arrow names its Operations, so the sheet follows runBot.
  const sas = new Map();
  const saKey = (l) => JSON.stringify([l.action, l.table, l.trigger ?? null, l.skipText ?? ""]);
  const saName = (l) => `${act(l.action)?.name ?? l.action} (${labels[l.table]})`;
  const ops = order.filter((n) => n.kind === "action").map((n) => {
    const a = act(n.action), t = table(n.table), links = linkedOf(n);
    links.forEach((l, i) => {
      const box = sas.get(saKey(l)) ?? sas.set(saKey(l), { l, nexts: new Map(), ends: new Set() }).get(saKey(l));
      if (links[i + 1]) { const x = saName(links[i + 1]); box.nexts.set(x, (box.nexts.get(x) ?? new Set()).add(to(n.id))); }
      else box.ends.add(to(n.id));
    });
    const target = n.target ? `<p><b>Target:</b> one enemy faction (${labels[n.target]})</p>${prio(table(n.target))}` : "";
    const linked = links.map((l, i) => `<p class="arr"><b>${i ? "if none" : TIMING[l.timing] ?? "then"}</b> → ${h(saName(l))}</p>`).join("");
    const next = nodes[n.then].kind === "end" ? "" : arr("after", n.then);
    // parts: numbered sub-actions in one box, each with its table label, max and priorities.
    const maxOf = (pt) => { const x = table(pt.table); return Math.min(x.select === "all" ? x.limit : 1, a?.maxSpaces ?? Infinity); };
    const body = n.parts
      ? `<div class="bt"><h3>${h(a?.name ?? n.action)}</h3></div>${where(a)}${target}${n.parts.map((pt, i) => `<div class="part"><p class="pt">${i + 1}. ${h(pt.text)} <small>(${labels[pt.table]}, max ${maxOf(pt)})</small></p>${prio(table(pt.table))}</div>`).join("")}<p class="pr">${a?.cost.per === "use" ? "Pay once, for the whole Operation." : "Pay once per space, over all parts."}</p>`
      : `${title(a?.name ?? n.action, t, a)}${where(a)}${target}${prio(t)}`;
    return `<section class="box op">${body}${linked}${next}${arr("if none", n.onEmpty)}</section>`;
  }).join("");
  const saBoxes = [...sas.values()].map(({ l, nexts, ends }) => {
    const a = act(l.action), t = table(l.table);
    const mixed = nexts.size + (ends.size ? 1 : 0) > 1;
    const after = (ops) => (mixed ? ` (after ${h([...ops].join(", "))})` : "");
    const skip = l.skipText || (ends.size && !mixed) ? `<p class="skip">${h(l.skipText ?? "If none, no Special Activity.")}</p>` : "";
    const arrows = [...nexts].map(([x, ops]) => `<p class="arr"><b>if none</b>${after(ops)} → ${h(x)}</p>`).join("") + (mixed && ends.size ? `<p class="arr"><b>if none</b>${after(ends)} → no Special Activity</p>` : "");
    return `<section class="box sa">${title(a?.name ?? l.action, t, a)}${where(a)}${l.trigger !== undefined && l.trigger !== true ? `<p><b>Only if:</b> ${h(condTextOf(g, l.trigger))}.</p>` : ""}${prio(t)}${skip}${arrows}</section>`;
  }).join("");

  // Scoring-phase choices (bot.scoring): one box per phase, like the GMT "Support Phase" box.
  const phaseOf = (id) => g.rules.scoring.phases.find((p) => p.id === id);
  // max: the most spaces one choice step picks (its spaces, capped by the table), as runScoring does.
  const scMax = (sc) => { const t = table(sc.table), n = choiceCounts(phaseOf(sc.phaseId)?.steps); return n.length ? Math.min(t.select === "all" ? t.limit : 1, Math.max(...n)) : 0; };
  const scTitle = (sc) => `<div class="bt"><h3>${h(phaseOf(sc.phaseId)?.name ?? sc.phaseId)} <small>(${labels[sc.table]})</small></h3>${scMax(sc) ? `<span class="tag">max ${scMax(sc)}</span>` : ""}</div>`;
  const scBoxes = (bot.scoring ?? []).map((sc) => `<section class="box sa">${scTitle(sc)}${sc.text ? `<p>${h(sc.text)}</p>` : ""}${prio(table(sc.table))}</section>`).join("");
  const scoring = scBoxes ? `<h2>${h(g.rules.scoring.name)} card</h2>${scBoxes}` : "";
  const card = (id) => g.deck.cards.find((c) => c.id === id)?.title ?? id.toUpperCase();
  // Overrides for lasting cards (card.lasting of the side this bot plays) print in their own box.
  const playSide = (o) => (o.directive === "ignore" ? "" : ` (play the ${o.side ?? ep.side} side)`);
  const lasting = (o) => cardLasting(g, bot, o.cardId);
  const lastingOvs = ep.overrides.filter((o) => lasting(o) !== "none");
  const evi = `<section class="evi"><h2>Event Instructions</h2>${ep.overrides.filter((o) => lasting(o) === "none").map((o) => `<p><b>${h(card(o.cardId))}:</b> ${h(o.plain)}${playSide(o)}</p>`).join("") || "<p>None.</p>"}</section>${lastingOvs.length ? `<section class="evi"><h2>Momentum, Capability</h2>${lastingOvs.map((o) => `<p><b>${h(card(o.cardId))}</b> (${LASTING[lasting(o)]}): ${h(o.plain)}${playSide(o)}</p>`).join("")}</section>` : ""}`;
  const terms = bot.measures.length ? `<div class="terms"><b>Terms.</b> ${bot.measures.map((m) => `<b>${h(m.name)}:</b> ${h(m.plain)}`).join(" ")}</div>` : "";
  const gain = g.rules.sequence.passGain[bot.factionId] ?? 0;
  const foot = `<p class="foot">Ties after the lettered tie-breaks, when one space or faction is chosen: ${h(bot.randomization.eligibleSet)} ${h(bot.randomization.procedure)} Pass: gain ${gain} Resource${gain === 1 ? "" : "s"}.</p>`;
  const sym = shapeSvg(g, f);
  const body = `<section class="page np" style="--f:${f.color}"><div class="sheethead">${sym}<h1>Non-Player ${h(f.name)}</h1>${sym}</div>${head(g, "Non-Player sheet")}
    <div class="npgrid"><div class="col flow">${evt}${dias}</div><div class="col ops"><h2>Operations</h2>${ops || "<p>None.</p>"}</div><div class="col sas"><h2>Special Activities</h2>${saBoxes || "<p>None.</p>"}${scoring}</div></div>${evi}${terms}${foot}</section>`;
  return doc(g, `Non-Player ${f.name} sheet`, body);
}

export function checklistMd(g) {
  const L = [`# ${g.meta.title}: component checklist`, draftNote(g), "", "| Item | Count |", "|---|---|"];
  for (const f of g.factions) for (const pc of f.pieces) L.push(`| ${f.name}: ${pc.name}${pc.states.length > 1 ? ` (${pc.states.join("/")})` : ""} | ${pc.supply} |`);
  L.push(`| Spaces on the board | ${g.board.spaces.length} |`, `| Event cards | ${g.deck.cards.filter((c) => c.type === "event").length} |`, `| Scoring cards | ${g.deck.cards.filter((c) => c.type === "scoring").length} |`, ...g.tracks.map((t) => `| ${t.name} marker | 1 |`), ...spaceMarkers(g).map((m) => `| ${m.name} marker | ${m.count} |`), "", "Supplies you provide:", ...(g.meta.supplies ?? []).map((s) => `- ${s}`), "");
  return L.join("\n");
}

// Sequence of Play sheet: one page in the layout of the GMT Sequence of Play sheet
// (examples/non-player-bot-sheets/A_Distant_Plain_Sequence_of_Play.JPEG). Top: the Event card flow,
// 1st Eligible choice to 2nd Eligible options, then Adjust Eligibility and Next Card, with the Pass box.
// Bottom: the scoring card phases. Built from rules.sequence, rules.scoring and the bots' Event side.
export function sequenceHtml(g) {
  const seq = g.rules.sequence, sc = g.rules.scoring;
  const rows = seq.choices.filter((k) => seq.secondActorOptions[k]).map((k) => `<div class="sop1">${CHOICE[k]}</div><div class="to">→</div><div class="sop2">${h(orList(seq.secondActorOptions[k].map((x) => CHOICE[x])))}</div>`).join("");
  const gain = (f) => { const n = seq.passGain[f.id] ?? 0; return `${h(f.name)} +${n} Resource${n === 1 ? "" : "s"}`; };
  const sides = g.bots.length ? `<p class="side-note">Non-Player Event side: ${g.bots.map((b) => `${h(faction(g, b.factionId)?.name ?? b.factionId)} ${b.eventPolicy.side}`).join("; ")}.</p>` : "";
  const stays = seq.eligibilityAfter.staysEligible.map((x) => CHOICE[x]);
  const right = `<div class="right"><div class="box adj"><h3>Adjust Eligibility</h3><p>${stays.length ? `A faction that chose ${h(orList(stays))} stays Eligible. ` : ""}Every other faction that acted is Ineligible for the next card. ${h(seq.eligibilityAfter.bothIneligibleResult)}</p></div><div class="to">↓</div><div class="box next"><h3>Next Card</h3></div></div>`;
  const body = `<section class="page ref">${head(g, "Sequence of Play")}<h1>Sequence of Play</h1>
    <h2>Event Card</h2><div class="flow"><div class="side-note">${h(seq.firstActor)}</div><div class="hd"><h3>1st Eligible Faction</h3></div><div class="hd"><h3>2nd Eligible Faction</h3></div>${right}${rows}<div class="sides">${sides}</div><div class="box pass"><b>Pass:</b> ${g.factions.map(gain).join("; ")}.</div></div>
    <h2>${h(sc.name)} Card</h2>${sc.phases.map((p) => `<p class="phase">▸ <b>${h(p.name)}:</b> ${h(p.text)}</p>`).join("")}<p class="phase"><b>Final ${h(sc.name)} card:</b> ${h(g.victory.finalScoring)}</p></section>`;
  return doc(g, "Sequence of Play", body);
}

// Card List and Spaces List: one page in the layout of the GMT list sheet
// (examples/non-player-bot-sheets/A_Distant_Plain_Non-Player_Bot_Card_and_Space_List.JPEG).
// Event cards grouped by faction order (groups in faction order), then the scoring cards.
// Spaces: one table per space type with Pop, end-points for lines, and the total Pop.
const SPACE_TYPES = [["city", "Cities"], ["province", "Provinces"], ["line", "Lines of Communication"], ["sanctuary", "Sanctuaries"], ["custom", "Other spaces"]];
export function listsHtml(g) {
  const idx = (id) => g.factions.findIndex((f) => f.id === id);
  const groups = new Map();
  for (const c of g.deck.cards.filter((x) => x.type === "event")) { const k = c.order.join(" "); if (!groups.has(k)) groups.set(k, []); groups.get(k).push(c); }
  const cmp = (a, b) => { const x = a.split(" ").map(idx), y = b.split(" ").map(idx); for (let i = 0; i < Math.max(x.length, y.length); i++) if ((x[i] ?? -1) !== (y[i] ?? -1)) return (x[i] ?? -1) - (y[i] ?? -1); return 0; };
  const sym = (id) => { const f = faction(g, id); return f ? `<span style="color:${f.color}">${h(f.symbol)}</span>` : h(id); };
  const cards = [...groups.keys()].sort(cmp).map((k) => `<div class="cgrp"><h3 data-order="${h(k)}">${k.split(" ").map(sym).join("")}</h3>${groups.get(k).map((c) => `<p>${h(c.id.toUpperCase())}. ${h(c.title)}</p>`).join("")}</div>`).join("");
  const scoring = g.deck.cards.filter((x) => x.type === "scoring");
  const name = (id) => g.board.spaces.find((s) => s.id === id)?.name ?? id;
  const ends = (s) => g.board.links.flatMap((l) => (l.from === s.id ? [l.to] : l.to === s.id ? [l.from] : [])).map(name).sort().join(" – ");
  const tables = SPACE_TYPES.map(([t, title]) => {
    const ss = g.board.spaces.filter((s) => s.type === t);
    if (!ss.length) return "";
    const line = t === "line";
    return `<div><h2>${title}</h2><table><tr><th>Space</th>${line ? "<th>End-points</th>" : ""}<th>Pop</th></tr>${ss.map((s) => `<tr><td>${h(s.name)}</td>${line ? `<td>${h(ends(s))}</td>` : ""}<td>${s.attrs.pop}</td></tr>`).join("")}</table></div>`;
  }).join("");
  const total = g.board.spaces.reduce((n, s) => n + (s.attrs.pop ?? 0), 0);
  const body = `<section class="page ref">${head(g, "Card and Spaces list")}<div class="band2"><h1>Card List</h1></div><div class="clist">${cards}</div>${scoring.length ? `<p class="scl"><b>${h(g.rules.scoring.name)}:</b> ${scoring.map((c) => `${h(c.id.toUpperCase())}. ${h(c.title)}`).join("; ")}</p>` : ""}
    <div class="band2"><h1>Spaces List</h1></div><div class="slist">${tables}</div><p class="tot">Total Pop: ${total}</p></section>`;
  return doc(g, "Card and Spaces list", body);
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
    [`kit/${id}.sequence.html`, sequenceHtml(g)],
    [`kit/${id}.lists.html`, listsHtml(g)],
    ...g.factions.map((f) => [`kit/${id}.${f.id}.aid.html`, factionAidHtml(g, f)]),
    ...g.bots.map((b) => [`kit/${id}.${b.factionId}.nonplayer.html`, nonPlayerSheetHtml(g, b)])
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
