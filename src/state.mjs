// Derive a board state from setup and apply dry-run patches.
import { sideEffects, cardLastingAny } from "./cardfx.mjs";

// Part D (schema 1.12.0): false when the bot tracks no Resources (PP 8.5.4). Default: true.
export const tracksResources = (bot) => bot?.tracksResources !== false;

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
  // An action of a faction whose bot tracks no Resources (schema 1.12.0 part D) costs nothing, so its
  // costs, cost limits and budgets have no effect in bot runs and in canDo.
  const free = new Set(game.bots.filter((b) => !tracksResources(b)).map((b) => b.factionId));
  const actions = Object.fromEntries(game.actions.map((a) => [a.id, free.has(a.faction) ? { ...a, cost: { ...a.cost, amount: 0 } } : a]));
  // Faction order per card, so canDo can read card.position as another faction (schema 1.8.0).
  const cardOrder = Object.fromEntries(game.deck.cards.map((c) => [c.id, c.order ?? []]));
  // The side each faction's bot plays per card (its override's side, else its Event policy side),
  // so canDo can read card.lasting as another faction.
  const sideOf = Object.fromEntries(game.bots.map((b) => [b.factionId, { side: b.eventPolicy.side, overrides: Object.fromEntries(b.eventPolicy.overrides.filter((o) => o.side).map((o) => [o.cardId, o.side])) }]));
  const lastingOf = Object.fromEntries(game.deck.cards.map((c) => [c.id, Object.fromEntries((c.sides ?? []).map((sd) => [sd.id, sd.lasting ?? "none"]))]));
  // What each card side could do (schema 1.11.0, cardCould), and each card's lasting type (next.lasting).
  const cardFx = Object.fromEntries(game.deck.cards.map((c) => [c.id, Object.fromEntries((c.sides ?? []).map((sd) => [sd.id, sideEffects(game, sd.steps)]))]));
  const cardLast = Object.fromEntries(game.deck.cards.map((c) => [c.id, cardLastingAny(c)]));
  // Control rules (schema 1.11.0): $space.control reads them. None: no space is controlled.
  const control = game.rules.control ?? null;
  return {
    self: selfFactionId, factions, owner, victory, maxPer, actions, cardOrder, sideOf, lastingOf, control, cardFx, cardLast,
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
    // inPlay (schema 1.11.0): lasting cards in play. A dry-run patch may set them.
    inPlay: [],
    // next (schema 1.11.0): the next card. None by default; a dry-run patch may set it.
    next: { id: "none" },
    dice: [],
    vars: {},
    spaces
  };
}

// Patch rules:
// - eligible, resources, tracks, card, turn, scoring: shallow merge
// - players: faction id -> true (a human plays it) or false; an unknown faction is an error
// - pools.<pieceId>.available (1.11.0): a whole number >= 0 replaces the Available count; Out of Play stays.
//   An unknown piece or another key is an error.
// - next (1.11.0): { id } of the next card; an unknown card is an error.
// - inPlay (1.11.0): card ids in play; replaces. An unknown card is an error.
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
  for (const [pid, pool] of Object.entries(patch.pools ?? {})) {
    if (!(pid in s.owner)) throw new Error(`Patch names unknown piece: ${pid}`);
    if (Object.keys(pool).some((k) => k !== "available")) throw new Error(`Patch pools.${pid} may set only available`);
    if (!Number.isInteger(pool.available) || pool.available < 0) throw new Error(`Patch pools.${pid}.available must be a whole number, 0 or more`);
    s.pools[pid] = { outOfPlay: 0, ...s.pools[pid], available: pool.available };
  }
  if (patch.next?.id !== undefined) {
    if (!(patch.next.id in s.cardOrder)) throw new Error(`Patch names unknown card: ${patch.next.id}`);
    s.next = { id: patch.next.id };
  }
  if (patch.inPlay) {
    for (const id of patch.inPlay) if (!(id in s.cardOrder)) throw new Error(`Patch names unknown card: ${id}`);
    s.inPlay = [...patch.inPlay];
  }
  if (patch.dice) s.dice = [...patch.dice];
  // seed (1.12.0 part B): the random seed of the Activation Number rolls. Default 1 (owner decision 2026-11-27).
  if (patch.seed !== undefined) {
    if (!Number.isInteger(patch.seed) || patch.seed < 0) throw new Error("Patch seed must be a whole number, 0 or more");
    s.seed = patch.seed;
  }
  // botDeck (1.12.0): the bot deck order and flipped cards. runBot checks it against the bot's deck.
  if (patch.botDeck) {
    if (Object.keys(patch.botDeck).some((k) => k !== "order" && k !== "flipped")) throw new Error("Patch botDeck may set only order and flipped");
    s.botDeck = structuredClone(patch.botDeck);
  }
  for (const pid of patch.clearPieces ?? []) for (const sp of Object.values(s.spaces)) delete sp.pieces[pid];
  for (const [sid, sp] of Object.entries(patch.spaces ?? {})) {
    if (!s.spaces[sid]) throw new Error(`Patch names unknown space: ${sid}`);
    if (sp.opinion !== undefined) s.spaces[sid].opinion = sp.opinion;
    for (const [pid, byState] of Object.entries(sp.pieces ?? {})) s.spaces[sid].pieces[pid] = { ...byState };
  }
  return s;
}
