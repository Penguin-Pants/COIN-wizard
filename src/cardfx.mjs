// What a card side could do, read from its effect steps (schema 1.11.0, gap G2).
// Returns [{ verb, what }] in step order, without repeats, nested steps (if, choose) included.
// verb: shift (what: support | opposition), place or remove (a piece id), resources (a faction id),
// track (a track id), marker (a marker name). A move from a pool places; a move to a pool removes.
const POOLS = new Set(["available", "outOfPlay"]);

export function sideEffects(game, steps = []) {
  const out = [], seen = new Set();
  const add = (verb, what) => { const k = `${verb}\n${what}`; if (what !== undefined && !seen.has(k)) { seen.add(k); out.push({ verb, what }); } };
  const changeTrack = (id) => {
    for (const f of game.factions) if (f.resourceTrack === id) add("resources", f.id);
    add("track", id);
  };
  const walk = (list) => {
    for (const s of list ?? []) {
      if (s.op === "shift") add("shift", s.toward);
      if (s.op === "place") add("place", s.piece);
      if (s.op === "remove") { add("remove", s.piece); if (s.fallbackPiece) add("remove", s.fallbackPiece); }
      if (s.op === "move" && POOLS.has(s.from) && !POOLS.has(s.to)) add("place", s.piece);
      if (s.op === "move" && POOLS.has(s.to) && !POOLS.has(s.from)) add("remove", s.piece);
      if (s.op === "track") changeTrack(s.id);
      if (s.op === "gain" || s.op === "pay") changeTrack(s.track);
      if (s.op === "markerSet") add("marker", s.marker);
      walk(s.then); walk(s.else);
      for (const o of s.options ?? []) walk(o.steps);
    }
  };
  walk(steps);
  return out;
}

// A side's effects match: place and remove take a piece id, a faction id (any of its pieces) or "*".
export function effectMatches(effects, verb, what, owner) {
  return effects.some((e) => e.verb === verb && (e.what === what || ((verb === "place" || verb === "remove") && (what === "*" || owner[e.what] === what))));
}

// The next card's lasting type: capability if a side is a Capability, else momentum if a side is a Momentum Event.
export const cardLastingAny = (card) => {
  const ls = (card?.sides ?? []).map((s) => s.lasting);
  return ls.includes("capability") ? "capability" : ls.includes("momentum") ? "momentum" : "none";
};
