// Faction presets and the generators that add or remove a faction from a game.
// Every generator returns plain-language lines that say what it changed, for the preview.
import { fromValue } from "./exprmodel.mjs";

const piece = (key, name, states, supply, extra = {}) => ({ key, name, states, supply, isBase: false, ...extra });
export const PRESETS = {
  state: { name: "Government", pieces: [piece("troops", "Troops", ["normal"], 15), piece("police", "Police", ["normal"], 12), piece("base", "Base", ["normal"], 6, { isBase: true, maxPerSpace: 2 })], passGain: 2, victory: "support" },
  guerrilla: { name: "Insurgents", pieces: [piece("guerrilla", "Guerrillas", ["underground", "active"], 20), piece("base", "Base", ["normal"], 8, { isBase: true, maxPerSpace: 2 })], passGain: 1, victory: "opposition" },
  nonviolent: { name: "Movement", pieces: [piece("activist", "Activists", ["underground", "active"], 15), piece("office", "Office", ["normal"], 6, { isBase: true, maxPerSpace: 1 })], passGain: 1, victory: "opposition" },
  custom: { name: "Faction", pieces: [piece("unit", "Units", ["normal"], 15)], passGain: 1, victory: "presence" }
};
const COLORS = ["#2b6cc4", "#b8520a", "#2f8a4e", "#7a4fb5"];

export const defaultTypes = (n) => ({ 2: ["state", "guerrilla"], 3: ["state", "guerrilla", "nonviolent"], 4: ["state", "state", "guerrilla", "guerrilla"] })[n];

const free = (taken, make) => { let i = 1; while (taken.has(make(i))) i++; return make(i); };

export function presetPieces(fid, type) {
  return PRESETS[type].pieces.map((p) => ({ id: `${fid}.${p.key}`, name: p.name, states: [...p.states], defaultState: p.states[0], supply: p.supply, isBase: p.isBase, ...(p.maxPerSpace ? { maxPerSpace: p.maxPerSpace } : {}) }));
}

// Victory by preset: Support Pop for the state side, Opposition Pop plus own bases for the others,
// own pieces on the map for a custom faction.
function victoryFor(f) {
  const pop = (side) => ({ k: "sumWhere", cond: { k: "cmp", cmp: "eq", a: { k: "var", name: "$space.opinion" }, b: { k: "lit", value: side } }, v: { k: "var", name: "$space.pop" } });
  const base = f.pieces.find((p) => p.isBase), unit = f.pieces[0];
  const kind = PRESETS[f.type].victory;
  if (kind === "support") return { factionId: f.id, plain: "Support Pop: total Pop of spaces at Support.", formula: fromValue(pop(1)), threshold: 8 };
  if (kind === "opposition") return { factionId: f.id, plain: `Opposition Pop plus ${base?.name ?? "bases"} on the map.`, formula: fromValue(base ? { k: "sum", items: [pop(-1), { k: "count", piece: base.id, at: "*", state: "*" }] } : pop(-1)), threshold: 8 };
  return { factionId: f.id, plain: `${unit.name} on the map.`, formula: fromValue({ k: "count", piece: unit.id, at: "*", state: "*" }), threshold: 10 };
}

export function addFaction(game, type) {
  const taken = new Set(game.factions.map((f) => f.id));
  const id = free(taken, (i) => `f${i}`);
  const names = new Set(game.factions.map((f) => f.name));
  const base = PRESETS[type].name;
  const name = names.has(base) ? free(names, (i) => `${base} ${i + 1}`) : base;
  const syms = new Set(game.factions.map((f) => f.symbol));
  const symbol = syms.has(name[0]) ? free(syms, (i) => `${name[0]}${i + 1}`) : name[0];
  const color = COLORS.find((c) => !game.factions.some((f) => f.color.toLowerCase() === c)) ?? COLORS[game.factions.length % 4];
  const track = { id: `res.${id}`, name: `${name} Resources`, min: 0, max: 30, start: 5, owner: id };
  const f = { id, name, type, preset: type, color, symbol, role: "", pieces: presetPieces(id, type), operations: [], specialActivities: [], resourceTrack: track.id };
  game.factions.push(f);
  game.tracks.push(track);
  game.setup.tracks[track.id] = track.start;
  for (const p of f.pieces) game.setup.pools[p.id] = { available: p.supply, outOfPlay: 0 };
  game.setup.eligibility[id] = true;
  game.rules.sequence.passGain[id] = PRESETS[type].passGain;
  game.victory.perFaction.push(victoryFor(f));
  for (const c of game.deck.cards) c.order.push(id);
  game.meta.factionCount = game.factions.length;
  return [
    `Adds ${name} (${type}) with ${f.pieces.map((p) => `${p.supply} ${p.name}`).join(", ")}, all Available.`,
    `Adds the track ${track.name}, starting at ${track.start}.`,
    `${name} starts Eligible and gains ${PRESETS[type].passGain} on Pass.`,
    `Adds a victory rule: ${victoryFor(f).plain}`,
    ...(game.deck.cards.length ? [`Adds ${name} last in the card faction order of ${game.deck.cards.length} cards.`] : [])
  ];
}

export function removeFaction(game, id) {
  const f = game.factions.find((x) => x.id === id);
  if (!f) return [];
  const pieces = new Set(f.pieces.map((p) => p.id));
  const acts = game.actions.filter((a) => a.faction === id);
  const bots = game.bots.filter((b) => b.factionId === id);
  game.factions = game.factions.filter((x) => x.id !== id);
  game.actions = game.actions.filter((a) => a.faction !== id);
  game.tracks = game.tracks.filter((t) => t.id !== f.resourceTrack);
  delete game.setup.tracks[f.resourceTrack];
  game.setup.placements = game.setup.placements.filter((p) => !pieces.has(p.piece));
  for (const p of pieces) delete game.setup.pools[p];
  delete game.setup.eligibility[id];
  delete game.rules.sequence.passGain[id];
  game.victory.perFaction = game.victory.perFaction.filter((v) => v.factionId !== id);
  for (const c of game.deck.cards) c.order = c.order.filter((x) => x !== id);
  game.bots = game.bots.filter((b) => b.factionId !== id);
  game.meta.factionCount = game.factions.length;
  return [
    `Removes ${f.name} and its pieces: ${f.pieces.map((p) => p.name).join(", ") || "none"}.`,
    `Removes the track ${f.resourceTrack} and ${f.name} from setup, Pass gains and eligibility.`,
    `Removes ${acts.length} action${acts.length === 1 ? "" : "s"}${acts.length ? `: ${acts.map((a) => a.name).join(", ")}` : ""}.`,
    `Removes the victory rule for ${f.name}.`,
    `Removes ${f.name} from the card faction order${bots.length ? " and removes its bot" : ""}.`,
    "Effects and Events of other factions that use these pieces show as blockers to fix."
  ];
}

// Adds default factions or removes the last ones until the game has n factions.
export function setFactionCount(game, n) {
  const out = [];
  while (game.factions.length > n) out.push(...removeFaction(game, game.factions.at(-1).id));
  // Add the default types the game does not have yet, so 2 becomes 4 as state, guerrilla, state, guerrilla.
  const want = [...defaultTypes(n)];
  for (const f of game.factions) { const i = want.indexOf(f.type); if (i >= 0) want.splice(i, 1); }
  while (game.factions.length < n) out.push(...addFaction(game, want.shift() ?? "custom"));
  return out;
}
