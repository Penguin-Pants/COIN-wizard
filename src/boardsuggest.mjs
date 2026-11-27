// Claude suggests the board and setup from the read sources: spaces, legal connections,
// starting pieces, pieces out of play, track starts and starting eligibility.
// applyBoard turns that raw answer into a valid board. It never trusts the answer: unknown names,
// pieces and states are dropped and reported, and piece counts always add up to the supply.
import { opinionMax, opinionNames, opinionLevels } from "./opinion.mjs";
import { chunkText } from "./sources.mjs";

const TYPES = ["city", "province", "line", "sanctuary", "custom"];
const MAX_SPACES = 30;

export function boardPrompt(game, texts) {
  const srcs = game.brief.sources.filter((s) => s.status === "read" && texts[s.id]);
  if (!srcs.length) throw new Error("No source text yet. Mark a source read in Step 1, or paste its text.");
  const material = srcs.map((s) => chunkText(s.id, texts[s.id]).slice(0, 2).map((c) => `SOURCE ${s.id} (${s.url}), characters ${c.start} to ${c.end}:\n${c.text}`).join("\n\n")).join("\n\n");
  const pieces = game.factions.flatMap((f) => f.pieces.map((p) => `${p.id}: ${p.name}, faction ${f.name} (${f.id}), states ${p.states.join("/")}, supply ${p.supply}${p.maxPerSpace ? `, max ${p.maxPerSpace} per space` : ""}${p.isBase ? ", base" : ""}`)).join("\n");
  const tracks = game.tracks.map((t) => `${t.id}: ${t.name}, ${t.min} to ${t.max}`).join("\n");
  const o = game.brief.overview, ph = placeholderIds(game);
  const set = game.board.spaces.filter((sp) => !ph.has(sp.id)).map((sp) => sp.name);
  return `You help design a COIN-style board game about: ${game.meta.title}. ${game.brief.conflict}
Places named in the overview: ${o.places.join("; ") || "none"}.
Start of the game: ${o.period || "not set; use the start of the period the sources cover"}. Base the starting setup on the situation at that time.
Using the sources below, suggest the map and the starting setup. Base each space on a real region, city, border area or sanctuary from the sources. Paraphrase, never copy sentences.
Space types: city, province, line (a road or rail line), sanctuary (a foreign base area), custom. pop is population weight 0 to 3 (cities 1 to 3, empty areas 0). opinion at the start is ${opinionNames(game).map(([v, n]) => `${v} ${n}`).join(", ")}.
${set.length ? `Spaces the designer already set (keep these names exactly and link new spaces to them): ${set.join(", ")}.\n` : ""}Give 8 to 20 spaces. Every space must be reachable through links. Links are legal movement between spaces that touch.
Pieces (use these ids and states exactly):
${pieces}
Place pieces where each faction was strong when the game starts. Total placed plus out of play must not exceed a piece's supply. Never place more of a piece in one space than its per-space maximum.
Tracks (use these ids; start must be inside the range):
${tracks}
Factions: ${game.factions.map((f) => `${f.id} (${f.name})`).join(", ")}.
Return only JSON: {"spaces":[{"name":"","type":"","pop":0,"opinion":0,"why":"one short reason"}],"links":[{"from":"space name","to":"space name"}],"placements":[{"space":"space name","piece":"piece id","state":"state","count":1}],"outOfPlay":{"piece id":0},"tracks":{"track id":0},"eligibility":{"faction id":true},"notes":"one or two sentences on the main choices"}

${material}`;
}

const int = (v, lo, hi, d) => { const n = Math.round(Number(v)); return Number.isFinite(n) ? Math.max(lo, Math.min(hi, n)) : d; };
const key = (s) => String(s ?? "").trim().toLowerCase();
function slug(name, taken) {
  const base = key(name).normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 32) || "space";
  let id = /^[a-z0-9]/.test(base) ? base : `s-${base}`, n = 2;
  while (taken.has(id)) id = `${base}-${n++}`;
  taken.add(id); return id;
}

export function applyBoard(game, r) {
  const g = structuredClone(game), dropped = [];
  const old = new Map(game.board.spaces.map((s) => [key(s.name), s]));
  // Every current id is reserved: a new space never inherits a removed space's id, references or position.
  const taken = new Set(game.board.spaces.map((s) => s.id)), byName = new Map(), kept = [], added = [];

  const spaces = [];
  for (const s of Array.isArray(r?.spaces) ? r.spaces : []) {
    const k = key(s?.name);
    if (!k) { dropped.push("A space with no name"); continue; }
    if (spaces.some((x) => x.k === k)) { dropped.push(`Second space named ${s.name}`); continue; }
    if (spaces.length >= MAX_SPACES) { dropped.push(`Space ${s.name} (more than ${MAX_SPACES} spaces)`); continue; }
    const prev = old.get(k);
    const id = prev ? prev.id : null;
    if (id) kept.push(id);
    spaces.push({ s, k, id, prev });
  }
  if (spaces.length < 2) throw new Error("Claude's answer needs at least 2 spaces. Try again.");
  for (const x of spaces) if (!x.id) { x.id = slug(x.s.name, taken); added.push(x.id); }

  const positions = {}, attrs = {};
  spaces.forEach((x, i) => {
    const type = TYPES.includes(x.s.type) ? x.s.type : "province";
    if (!TYPES.includes(x.s.type)) dropped.push(`Type "${x.s.type}" of ${x.s.name} (set to province)`);
    byName.set(x.k, x.id);
    x.out = { id: x.id, name: String(x.s.name).trim(), type, attrs: { ...(x.prev?.attrs ?? {}), pop: int(x.s.pop, 0, 9, 1) } };
    const a = (2 * Math.PI * i) / spaces.length;
    positions[x.id] = game.board.presentation.positions[x.id] ?? { x: Math.round(360 + 220 * Math.cos(a)), y: Math.round(240 + 180 * Math.sin(a)) };
    const om = opinionMax(game), n = Number(x.s.opinion);
    const op = Number.isInteger(n) && Math.abs(n) <= om ? n : 0;
    attrs[x.id] = { ...(game.setup.spaceAttributes?.[x.id] ?? {}), opinion: op };
  });
  const removed = game.board.spaces.map((s) => s.id).filter((id) => !kept.includes(id));

  const links = [], seen = new Set();
  for (const l of Array.isArray(r?.links) ? r.links : []) {
    const a = byName.get(key(l?.from)), b = byName.get(key(l?.to));
    const pair = [a, b].sort().join("|");
    if (!a || !b) dropped.push(`Link ${l?.from} to ${l?.to} (unknown space)`);
    else if (a === b) dropped.push(`Link from ${l.from} to itself`);
    else if (seen.has(pair)) dropped.push(`Second link ${l.from} to ${l.to}`);
    else { seen.add(pair); links.push({ id: `l${links.length + 1}`, from: a, to: b }); }
  }

  const adj = new Map(spaces.map((x) => [x.id, []]));
  for (const l of links) { adj.get(l.from).push(l.to); adj.get(l.to).push(l.from); }
  const reach = new Set([spaces[0].id]), q = [spaces[0].id];
  while (q.length) for (const n of adj.get(q.shift())) if (!reach.has(n)) { reach.add(n); q.push(n); }
  const lost = spaces.filter((x) => !reach.has(x.id)).map((x) => x.out.name);
  if (lost.length) throw new Error(`Claude's board has spaces that cannot be reached by legal connections: ${lost.join(", ")}. Nothing was changed. Try again.`);

  const pieces = new Map(g.factions.flatMap((f) => f.pieces).map((p) => [p.id, p]));
  const used = new Map(), placements = [];
  for (const pl of Array.isArray(r?.placements) ? r.placements : []) {
    const p = pieces.get(pl?.piece), sp = byName.get(key(pl?.space));
    if (!p) { dropped.push(`Placement of unknown piece ${pl?.piece}`); continue; }
    if (!sp) { dropped.push(`Placement in unknown space ${pl?.space}`); continue; }
    let state = pl.state;
    if (!p.states.includes(state)) { dropped.push(`State "${state}" of ${p.name} (set to ${p.states[0]})`); state = p.states[0]; }
    const here = placements.filter((x) => x.space === sp && x.piece === p.id).reduce((t, x) => t + x.count, 0);
    const want = int(pl.count, 0, 999, 0), left = p.supply - (used.get(p.id) ?? 0), room = p.maxPerSpace ? p.maxPerSpace - here : Infinity;
    const n = Math.max(0, Math.min(want, left, room));
    if (n < want) dropped.push(room < Math.min(want, left) ? `${want - n} ${p.name} in ${pl.space} (more than the limit of ${p.maxPerSpace} per space)` : `${want - n} ${p.name} in ${pl.space} (more than the supply of ${p.supply})`);
    if (n <= 0) continue;
    used.set(p.id, (used.get(p.id) ?? 0) + n);
    const same = placements.find((x) => x.space === sp && x.piece === p.id && x.state === state);
    if (same) same.count += n; else placements.push({ space: sp, piece: p.id, state, count: n });
  }
  const pools = {};
  for (const p of pieces.values()) {
    const left = p.supply - (used.get(p.id) ?? 0), oop = int(r?.outOfPlay?.[p.id], 0, left, 0);
    pools[p.id] = { available: left - oop, outOfPlay: oop };
  }

  for (const t of g.tracks) {
    const v = r?.tracks?.[t.id];
    if (v === undefined) continue;
    const n = int(v, t.min, t.max, t.start);
    if (n !== Number(v)) dropped.push(`${t.name} start ${v} (set to ${n}, inside ${t.min} to ${t.max})`);
    t.start = n; g.setup.tracks[t.id] = n;
  }
  for (const f of g.factions) if (typeof r?.eligibility?.[f.id] === "boolean") g.setup.eligibility[f.id] = r.eligibility[f.id];

  g.board.spaces = spaces.map((x) => x.out);
  g.board.links = links;
  g.board.presentation.positions = positions;
  g.setup.spaceAttributes = attrs;
  g.setup.placements = placements;
  g.setup.pools = pools;
  return { game: g, report: { kept, added, removed, dropped, notes: typeof r?.notes === "string" ? r.notes : "" } };
}

// What a suggestion depends on: factions, pieces and tracks. A proposal is applied only while this is unchanged.
// The opinion levels (schema 1.9.0) count too: a suggestion uses the scale it was made for.
export const boardBase = (g) => JSON.stringify([g.factions.map((f) => [f.id, f.pieces]), g.tracks.map((t) => [t.id, t.min, t.max]), opinionLevels(g)]);

// fillBoard: the suggestion fills only empty fields (owner decision, 2026-11-22).
// - A placeholder space (default name "Space N" or "New space N", no starting pieces, and not
//   named by an action, card, bot, victory or rules text) is replaced. Every other space is kept as
//   it is; Claude only adds spaces. Links between kept spaces stay; Claude's new links are added.
// - Starting pieces and pools fill only for a piece with none on the board and default pools.
// - A track start fills only when unset or at the preset default (5 for a faction's Resources);
//   eligibility only when unset or at the default (Eligible).
const PLACEHOLDER = /^(new )?space \d+$/i;
const RES_DEFAULT = 5;
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// Placeholder spaces: a default name, no starting pieces, and not named (by id or displayed name)
// anywhere outside the board.
export function placeholderIds(game) {
  const refs = JSON.stringify([game.actions, game.deck, game.bots, game.sharedTables ?? [], game.victory, game.rules]);
  const named = (id) => new RegExp(`(^|[^a-z0-9._-])${esc(id)}($|[^a-z0-9._-])`, "i").test(refs);
  // Text can name a space by its displayed name too, such as "Control of Space 3".
  const shown = (name) => new RegExp(`(^|[^a-z0-9])${esc(name.trim())}($|[^a-z0-9])`, "i").test(refs);
  return new Set(game.board.spaces.filter((sp) => PLACEHOLDER.test(sp.name.trim()) && !game.setup.placements.some((p) => p.space === sp.id) && !named(sp.id) && !shown(sp.name)).map((sp) => sp.id));
}

export function fillBoard(game, r) {
  const { game: s, report } = applyBoard(game, r);
  const g = structuredClone(game), skipped = [];
  const ph = placeholderIds(game), isPlaceholder = (sp) => ph.has(sp.id);
  const kept = game.board.spaces.filter((sp) => !isPlaceholder(sp)), keptIds = new Set(kept.map((sp) => sp.id));
  const removed = game.board.spaces.filter(isPlaceholder).map((sp) => sp.id);
  for (const sp of s.board.spaces) if (keptIds.has(sp.id)) skipped.push(`Space ${sp.name}: kept as you set it`);
  const added = s.board.spaces.filter((sp) => !keptIds.has(sp.id));

  g.board.spaces = [...kept, ...added];
  const ids = new Set(g.board.spaces.map((sp) => sp.id));
  g.board.links = game.board.links.filter((l) => keptIds.has(l.from) && keptIds.has(l.to));
  const pairs = new Set(g.board.links.map((l) => [l.from, l.to].sort().join("|")));
  const linkIds = new Set(g.board.links.map((l) => l.id));
  for (const l of s.board.links) {
    const pair = [l.from, l.to].sort().join("|");
    if (!ids.has(l.from) || !ids.has(l.to) || pairs.has(pair)) continue;
    let n = g.board.links.length + 1; while (linkIds.has(`l${n}`)) n++;
    linkIds.add(`l${n}`); pairs.add(pair); g.board.links.push({ id: `l${n}`, from: l.from, to: l.to });
  }
  g.board.presentation.positions = Object.fromEntries(g.board.spaces.map((sp) => [sp.id, keptIds.has(sp.id) ? game.board.presentation.positions[sp.id] : s.board.presentation.positions[sp.id]]).filter(([, p]) => p));
  g.setup.spaceAttributes = Object.fromEntries(g.board.spaces.map((sp) => [sp.id, keptIds.has(sp.id) ? game.setup.spaceAttributes?.[sp.id] ?? {} : s.setup.spaceAttributes[sp.id]]));

  const placements = game.setup.placements.filter((p) => ids.has(p.space));
  for (const p of g.factions.flatMap((f) => f.pieces)) {
    const pool = game.setup.pools[p.id];
    const empty = !game.setup.placements.some((x) => x.piece === p.id) && (!pool || (pool.available === p.supply && pool.outOfPlay === 0));
    const theirs = s.setup.placements.filter((x) => x.piece === p.id);
    if (empty) { placements.push(...theirs); g.setup.pools[p.id] = s.setup.pools[p.id]; }
    else if (theirs.length) skipped.push(`${p.name}: kept your starting pieces and pools`);
  }
  g.setup.placements = placements;

  for (const t of g.tracks) {
    const cur = game.setup.tracks[t.id], next = s.setup.tracks[t.id];
    if (next === undefined || next === cur) continue;
    if (cur === undefined || (t.owner && cur === RES_DEFAULT)) { g.setup.tracks[t.id] = next; t.start = next; }
    else skipped.push(`${t.name}: kept your start ${cur}`);
  }
  for (const f of g.factions) {
    const cur = game.setup.eligibility[f.id], next = s.setup.eligibility[f.id];
    if (next === undefined || next === cur) continue;
    if (cur === undefined || cur === true) g.setup.eligibility[f.id] = next;
    else skipped.push(`${f.name}: kept your starting eligibility`);
  }
  return { game: g, report: { kept: [...keptIds], added: added.map((sp) => sp.id), removed, dropped: report.dropped, skipped, notes: report.notes } };
}
