// Map-like boards: region shapes for the spaces, and space positions read by Claude from a map image.
export const FRAME = { w: 640, h: 480 };

// Clips a polygon to the half-plane of points nearer to a than to b (Sutherland-Hodgman).
function clip(poly, a, b) {
  const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2, nx = b.x - a.x, ny = b.y - a.y;
  const side = ([x, y]) => (x - mx) * nx + (y - my) * ny; // <= 0 is a's side
  const out = [];
  poly.forEach((p, i) => {
    const q = poly[(i + 1) % poly.length], sp = side(p), sq = side(q);
    if (sp <= 0) out.push(p);
    if ((sp <= 0) !== (sq <= 0)) { const t = sp / (sp - sq); out.push([p[0] + t * (q[0] - p[0]), p[1] + t * (q[1] - p[1])]); }
  });
  return out;
}
// Clips a polygon to one side of the line through p and q (the side the convex shape lies on).
function clipLine(poly, p, q) {
  const side = ([x, y]) => (q[0] - p[0]) * (y - p[1]) - (q[1] - p[1]) * (x - p[0]); // >= 0 keeps (counter-clockwise shape)
  const out = [];
  poly.forEach((a, i) => {
    const b = poly[(i + 1) % poly.length], sa = side(a), sb = side(b);
    if (sa >= 0) out.push(a);
    if ((sa >= 0) !== (sb >= 0)) { const t = sa / (sa - sb); out.push([a[0] + t * (b[0] - a[0]), a[1] + t * (b[1] - a[1])]); }
  });
  return out;
}
// Voronoi cells of the sites, clipped to the rectangle: id -> [[x, y], ...].
// With reach, each cell is also clipped to a 24-sided circle around its site: radius = reach x the
// distance to the nearest other site (at least 60). Regions then stay near their space, as on a map,
// instead of filling every empty corner of the board.
export function voronoi(sites, { x, y, w, h }, { reach = 0 } = {}) {
  const ids = Object.keys(sites), cells = {};
  for (const id of ids) {
    const s = sites[id];
    let poly = [[x, y], [x + w, y], [x + w, y + h], [x, y + h]];
    for (const o of ids) if (o !== id && (sites[o].x !== s.x || sites[o].y !== s.y)) poly = clip(poly, s, sites[o]);
    if (reach) {
      const near = Math.min(...ids.filter((o) => o !== id).map((o) => Math.hypot(sites[o].x - s.x, sites[o].y - s.y)), 1e9);
      const r = Math.max(60, Math.min(near * reach, 200));
      const ring = Array.from({ length: 24 }, (_, i) => [s.x + r * Math.cos((i * Math.PI) / 12), s.y + r * Math.sin((i * Math.PI) / 12)]);
      ring.forEach((p, i) => { if (poly.length) poly = clipLine(poly, p, ring[(i + 1) % 24]); });
    }
    cells[id] = poly;
  }
  return cells;
}

// Where an image of w x h pixels sits in the board frame when it is fitted whole and centered.
export function frameOf(w, h) {
  const scale = Math.min(FRAME.w / w, FRAME.h / h);
  return { x: (FRAME.w - w * scale) / 2, y: (FRAME.h - h * scale) / 2, scale };
}

export function mapPrompt(game) {
  return `The image is a map for a COIN-style board game about: ${game.meta.title}. ${game.brief.conflict}
Find each space below on the map and give its position on the image: x from 0 (left edge) to 1 (right edge), y from 0 (top edge) to 1 (bottom edge). Use the middle of a region, the location of a city, and the midpoint of a road or rail line. Leave out a space that is not on the map.
Spaces (id: name, type):
${game.board.spaces.map((s) => `${s.id}: ${s.name}, ${s.type}`).join("\n")}
Return only JSON: {"positions":{"space id":{"x":0.5,"y":0.5}},"notes":"one sentence on what the map shows and its date"}`;
}

const unit = (v) => typeof v === "number" && Number.isFinite(v) && v >= 0 && v <= 1;
export function applyMapPositions(game, r, { w, h }) {
  const g = structuredClone(game), f = frameOf(w, h), placed = [], dropped = [];
  const ids = new Set(g.board.spaces.map((s) => s.id));
  for (const [id, p] of Object.entries(r?.positions ?? {})) {
    if (!ids.has(id)) { dropped.push(`Position for unknown space ${id}`); continue; }
    if (!unit(p?.x) || !unit(p?.y)) { dropped.push(`Position of ${id} is outside the image`); continue; }
    g.board.presentation.positions[id] = { x: Math.round(f.x + p.x * w * f.scale), y: Math.round(f.y + p.y * h * f.scale) };
    placed.push(id);
  }
  const missing = g.board.spaces.map((s) => s.id).filter((id) => !placed.includes(id));
  return { game: g, report: { placed, missing, dropped, notes: typeof r?.notes === "string" ? r.notes : "" } };
}
