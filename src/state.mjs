// Derive a board state from setup and apply dry-run patches.

export function deriveState(game, selfFactionId) {
  const spaces = {};
  for (const s of game.board.spaces) {
    // Markers (mutable space attributes) start from setup; markerSet changes them.
    spaces[s.id] = {
      ...game.setup.spaceAttributes?.[s.id],
      id: s.id, name: s.name, type: s.type, pop: s.attrs.pop,
      opinion: game.setup.spaceAttributes?.[s.id]?.opinion ?? 0,
      pieces: {}
    };
  }
  for (const p of game.setup.placements) {
    const sp = spaces[p.space];
    if (!sp) continue;
    sp.pieces[p.piece] ??= {};
    sp.pieces[p.piece][p.state] = (sp.pieces[p.piece][p.state] ?? 0) + p.count;
  }
  const resources = {};
  for (const f of game.factions) resources[f.id] = game.setup.tracks[f.resourceTrack] ?? 0;
  // Factions, piece owners and victory rules let expressions read any faction's values.
  const factions = Object.fromEntries(game.factions.map((f) => [f.id, { name: f.name, type: f.type }]));
  const owner = Object.fromEntries(game.factions.flatMap((f) => f.pieces.map((p) => [p.id, f.id])));
  const victory = Object.fromEntries(game.victory.perFaction.map((v) => [v.factionId, { formula: v.formula, threshold: v.threshold }]));
  // canPlace and canDo (schema 1.8.0) read piece limits and actions.
  const maxPer = Object.fromEntries(game.factions.flatMap((f) => f.pieces.filter((p) => p.maxPerSpace).map((p) => [p.id, p.maxPerSpace])));
  const actions = Object.fromEntries(game.actions.map((a) => [a.id, a]));
  // Faction order per card, so canDo can read card.position as another faction (schema 1.8.0).
  const cardOrder = Object.fromEntries(game.deck.cards.map((c) => [c.id, c.order ?? []]));
  // The side each faction's bot plays per card (its override's side, else its Event policy side),
  // so canDo can read card.lasting as another faction.
  const sideOf = Object.fromEntries(game.bots.map((b) => [b.factionId, { side: b.eventPolicy.side, overrides: Object.fromEntries(b.eventPolicy.overrides.filter((o) => o.side).map((o) => [o.cardId, o.side])) }]));
  const lastingOf = Object.fromEntries(game.deck.cards.map((c) => [c.id, Object.fromEntries((c.sides ?? []).map((sd) => [sd.id, sd.lasting ?? "none"]))]));
  return {
    self: selfFactionId, factions, owner, victory, maxPer, actions, cardOrder, sideOf, lastingOf,
    eligible: { ...game.setup.eligibility },
    resources,
    tracks: { ...game.setup.tracks },
    // Pieces off the map, so effect steps can place and remove (src/effects.mjs).
    pools: structuredClone(game.setup.pools ?? {}),
    card: { id: "e03", hasEffect: true, raisesSelf: false, lowersEnemy: false },
    // turn.position (schema 1.8.0): 1st or 2nd Eligible. A dry-run patch may set it.
    turn: { position: 1 },
    // scoring.nextFinal (schema 1.9.0): the next scoring card is the last. A dry-run patch may set it.
    scoring: { nextFinal: false },
    // players (schema 1.11.0): a faction has a human player unless the game has a bot for it.
    players: Object.fromEntries(game.factions.map((f) => [f.id, !game.bots.some((b) => b.factionId === f.id)])),
    dice: [],
    vars: {},
    spaces
  };
}

// Patch rules:
// - eligible, resources, tracks, card, turn, scoring: shallow merge
// - players: faction id -> true (a human plays it) or false; an unknown faction is an error
// - dice: replace
// - clearPieces: remove these piece ids from every space
// - spaces.<id>: opinion replaces; pieces.<pieceId> replaces that piece's state map
export function applyPatch(state, patch = {}) {
  const s = structuredClone(state);
  for (const k of ["eligible", "resources", "tracks", "card", "turn", "scoring"]) if (patch[k]) Object.assign(s[k], patch[k]);
  for (const [fid, v] of Object.entries(patch.players ?? {})) {
    if (!(fid in s.players)) throw new Error(`Patch names unknown faction: ${fid}`);
    s.players[fid] = !!v;
  }
  if (patch.dice) s.dice = [...patch.dice];
  for (const pid of patch.clearPieces ?? []) for (const sp of Object.values(s.spaces)) delete sp.pieces[pid];
  for (const [sid, sp] of Object.entries(patch.spaces ?? {})) {
    if (!s.spaces[sid]) throw new Error(`Patch names unknown space: ${sid}`);
    if (sp.opinion !== undefined) s.spaces[sid].opinion = sp.opinion;
    for (const [pid, byState] of Object.entries(sp.pieces ?? {})) s.spaces[sid].pieces[pid] = { ...byState };
  }
  return s;
}
