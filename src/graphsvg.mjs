// Bot flowchart as SVG, with a small layered layout and no library.
// The wizard, the print kit and the exports share it.
import { EXIT_TEXT } from "./dryrun.mjs";

const W = 210, GAPX = 36, GAPY = 54, LINE = 14, PAD = 10, CHARS = 30;
const BRANCH = [["yes", "yes"], ["no", "no"], ["then", "then"], ["onEmpty", "no target"]];
const esc = (s) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

function wrap(text, max = 4) {
  const words = String(text || "").split(/\s+/).filter(Boolean), lines = [];
  let cur = "";
  for (const w of words) { if ((cur + " " + w).trim().length > CHARS && cur) { lines.push(cur); cur = w; } else cur = (cur + " " + w).trim(); }
  if (cur) lines.push(cur);
  if (lines.length > max) { lines.length = max; lines[max - 1] = lines[max - 1].replace(/.{0,2}$/, "...") ; }
  return lines.length ? lines : [""];
}

const edgesOf = (n) => BRANCH.filter(([k]) => n[k]).map(([k, label]) => ({ from: n.id, to: n[k], label }));

// Layers by longest path from the start, with back edges left out. Unreachable nodes go in a last layer.
export function layout(bot) {
  const byId = Object.fromEntries(bot.nodes.map((n) => [n.id, n]));
  const order = [], color = {}, back = new Set();
  const dfs = (id) => {
    color[id] = 1; order.push(id);
    for (const e of edgesOf(byId[id])) { if (!byId[e.to]) continue; if (color[e.to] === 1) back.add(`${id}>${e.to}`); else if (!color[e.to]) dfs(e.to); }
    color[id] = 2;
  };
  if (byId[bot.start]) dfs(bot.start);
  const rank = Object.fromEntries(order.map((id) => [id, 0]));
  for (let pass = 0; pass < order.length; pass++) {
    let moved = false;
    for (const id of order) for (const e of edgesOf(byId[id])) {
      if (!byId[e.to] || back.has(`${id}>${e.to}`) || !(e.to in rank)) continue;
      if (rank[e.to] < rank[id] + 1) { rank[e.to] = rank[id] + 1; moved = true; }
    }
    if (!moved) break;
  }
  const last = Math.max(-1, ...Object.values(rank)) + 1;
  for (const n of bot.nodes) if (!(n.id in rank)) { rank[n.id] = last; order.push(n.id); }
  const layers = [];
  for (const id of order) (layers[rank[id]] ??= []).push(id);
  // One barycenter pass: order each layer by the mean position of its parents.
  for (let r = 1; r < layers.length; r++) {
    const pos = Object.fromEntries((layers[r - 1] ?? []).map((id, i) => [id, i]));
    const score = (id) => { const ps = order.filter((p) => edgesOf(byId[p]).some((e) => e.to === id) && p in pos).map((p) => pos[p]); return ps.length ? ps.reduce((a, b) => a + b, 0) / ps.length : Infinity; };
    layers[r] = (layers[r] ?? []).map((id, i) => [id, score(id), i]).sort((a, b) => a[1] - b[1] || a[2] - b[2]).map((x) => x[0]);
  }
  const lines = Object.fromEntries(bot.nodes.map((n) => [n.id, wrap(n.text || n.id)]));
  const hOf = (id) => PAD * 2 + 14 + lines[id].length * LINE;
  const width = Math.max(...layers.map((l) => (l?.length ?? 0) * (W + GAPX) - GAPX), W);
  const boxes = {};
  let y = 10;
  for (const l of layers) {
    if (!l) continue;
    const rowW = l.length * (W + GAPX) - GAPX, x0 = (width - rowW) / 2 + 10;
    const rowH = Math.max(...l.map(hOf));
    l.forEach((id, i) => {
      const m = bot.layout?.[id];
      boxes[id] = m ? { x: m.x, y: m.y, w: W, h: hOf(id) } : { x: x0 + i * (W + GAPX), y, w: W, h: hOf(id) };
    });
    y += rowH + GAPY;
  }
  const all = Object.values(boxes);
  return { boxes, lines, back, width: Math.max(...all.map((b) => b.x + b.w), W) + 10, height: Math.max(...all.map((b) => b.y + b.h), 40) + 10 };
}

const KIND = { condition: "Check", "event-check": "Event", action: "Action", end: "End" };

// highlight: node ids on a dry-run path, in order. selected: one node id.
// Card bot exits (schema 1.12.0) draw as end boxes, so their branches show. A dry-run path step
// "draw:<card>" or "flip:<card>" lights that exit.
const withExits = (g) => {
  const used = new Set(g.nodes.flatMap((n) => BRANCH.map(([k]) => n[k]))), ex = Object.keys(EXIT_TEXT).filter((id) => used.has(id));
  return ex.length ? { ...g, nodes: [...g.nodes, ...ex.map((id) => ({ id, kind: "end", text: EXIT_TEXT[id] }))] } : g;
};
const pathKey = (x) => { const s = String(x); return s.startsWith("draw:") ? "$draw" : s.startsWith("flip:") ? "$flip" : s.split(":")[0]; };

export function graphSvg(graph, { highlight = [], selected = null, title } = {}) {
  const bot = withExits(graph);
  const L = layout(bot), hl = new Set(highlight.map(pathKey));
  const hlEdge = new Set(); for (let i = 1; i < highlight.length; i++) hlEdge.add(`${pathKey(highlight[i - 1])}>${pathKey(highlight[i])}`);
  // Edges to the next layer curve straight down. Longer edges and back edges run in a lane right of
  // every box they pass, so no line crosses a box.
  let lanes = 0, right = L.width;
  const edges = bot.nodes.flatMap((n) => edgesOf(n)).filter((e) => L.boxes[e.to] && L.boxes[e.from]).map((e) => {
    const a = L.boxes[e.from], b = L.boxes[e.to];
    const x1 = a.x + a.w / 2, y1 = a.y + a.h, x2 = b.x + b.w / 2, y2 = b.y;
    const near = y2 > y1 && y2 - y1 <= GAPY + 1;
    let d, lx, ly;
    if (near) { d = `M${x1},${y1} C${x1},${y1 + GAPY / 2} ${x2},${y2 - GAPY / 2} ${x2},${y2}`; lx = (x1 + x2) / 2; ly = (y1 + y2) / 2; }
    else {
      const top = Math.min(y1, y2), bottom = Math.max(y1, y2);
      const passed = Object.values(L.boxes).filter((x) => x.y + x.h > top - 1 && x.y < bottom + 1);
      const lane = Math.max(...passed.map((x) => x.x + x.w)) + 16 + 12 * lanes++;
      right = Math.max(right, lane + 40);
      d = `M${x1},${y1} C${x1},${y1 + 18} ${lane},${y1 + 4} ${lane},${y1 + 24} L${lane},${y2 - 24} C${lane},${y2 - 4} ${x2},${y2 - 18} ${x2},${y2}`;
      lx = lane + 4; ly = y1 + 40;
    }
    const on = hlEdge.has(`${e.from}>${e.to}`);
    return `<path class="edge${on ? " hl" : ""}" d="${d}" marker-end="url(#arr)"/><text class="elabel${near ? "" : " side"}" x="${lx}" y="${ly}">${esc(e.label)}</text>`;
  }).join("");
  const nodes = bot.nodes.map((n) => {
    const b = L.boxes[n.id], cls = `node ${hl.has(n.id) ? "hl " : ""}${n.id === selected ? "sel " : ""}k-${n.kind}`;
    const r = n.kind === "end" ? 18 : n.kind === "condition" ? 2 : 8;
    const text = L.lines[n.id].map((t, i) => `<tspan x="${b.x + PAD}" y="${b.y + PAD + 26 + i * LINE}">${esc(t)}</tspan>`).join("");
    return `<g class="${cls}" data-node="${esc(n.id)}"><rect x="${b.x}" y="${b.y}" width="${b.w}" height="${b.h}" rx="${r}"/><text class="kind" x="${b.x + PAD}" y="${b.y + PAD + 9}">${KIND[n.kind] ?? n.kind}${n.id === bot.start ? " (start)" : ""}</text><text>${text}</text></g>`;
  }).join("");
  const style = ".edge{fill:none;stroke:currentColor;stroke-opacity:.45;stroke-width:1.4}.edge.hl{stroke-opacity:1;stroke-width:3}.elabel{font:11px sans-serif;fill:currentColor;fill-opacity:.75;text-anchor:middle;paint-order:stroke;stroke:Canvas;stroke-width:3px}.elabel.side{text-anchor:start}.node rect{fill:none;stroke:currentColor;stroke-width:1.4}.node text{font:12px sans-serif;fill:currentColor}.node .kind{font-weight:700;font-size:10px;letter-spacing:.06em;text-transform:uppercase}.k-condition rect{stroke-dasharray:5 3}.node.hl rect{stroke-width:3.5}.node.sel rect{stroke-width:3;stroke-dasharray:none}";
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${right} ${L.height}" width="${right}" height="${L.height}" role="img" aria-label="${esc(title ?? `Flowchart for ${bot.id}`)}"><title>${esc(title ?? `Flowchart for ${bot.id}`)}</title><defs><marker id="arr" viewBox="0 0 10 10" refX="9" refY="5" markerUnits="userSpaceOnUse" markerWidth="9" markerHeight="9" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="currentColor"/></marker><style>${style}</style></defs>${edges}${nodes}</svg>`;
}
