// Derive a board state from setup and apply dry-run patches.

export function deriveState(game, selfFactionId) {
  const spaces = {};
  for (const s of game.board.spaces) {
    spaces[s.id] = {
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
  return {
    self: selfFactionId, factions, owner, victory,
    eligible: { ...game.setup.eligibility },
    resources,
    tracks: { ...game.setup.tracks },
    card: { id: "e03", hasEffect: true, raisesSelf: false, lowersEnemy: false },
    dice: [],
    vars: {},
    spaces
  };
}

// Patch rules:
// - eligible, resources, tracks, card: shallow merge
// - dice: replace
// - clearPieces: remove these piece ids from every space
// - spaces.<id>: opinion replaces; pieces.<pieceId> replaces that piece's state map
export function applyPatch(state, patch = {}) {
  const s = structuredClone(state);
  for (const k of ["eligible", "resources", "tracks", "card"]) if (patch[k]) Object.assign(s[k], patch[k]);
  if (patch.dice) s.dice = [...patch.dice];
  for (const pid of patch.clearPieces ?? []) for (const sp of Object.values(s.spaces)) delete sp.pieces[pid];
  for (const [sid, sp] of Object.entries(patch.spaces ?? {})) {
    if (!s.spaces[sid]) throw new Error(`Patch names unknown space: ${sid}`);
    if (sp.opinion !== undefined) s.spaces[sid].opinion = sp.opinion;
    for (const [pid, byState] of Object.entries(sp.pieces ?? {})) s.spaces[sid].pieces[pid] = { ...byState };
  }
  return s;
}
