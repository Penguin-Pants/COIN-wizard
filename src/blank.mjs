// A new blank project for 2 to 4 factions: preset factions, no actions and no deck.
// It holds the generated parts every game needs: a connected board, resource tracks, setup pools,
// Pass gains and a victory rule per faction.
import { LATEST } from "./migrate.mjs";
import { addFaction, defaultTypes } from "./presets.mjs";

const SEQUENCE = {
  choices: ["event", "operationSpecial", "operation", "limitedOperation", "pass"],
  firstActor: "The first two Eligible factions in the card's faction order act, in that order. If only one faction is Eligible, it acts alone.",
  secondActorOptions: {
    event: ["operationSpecial", "operation", "pass"],
    operationSpecial: ["limitedOperation", "pass"],
    operation: ["limitedOperation", "event", "pass"],
    pass: ["event", "operationSpecial", "operation", "pass"]
  },
  eligibilityAfter: { staysEligible: ["limitedOperation", "pass"], bothIneligibleResult: "If every faction would be Ineligible, all factions become Eligible." }
};

// A ring of 2n + 2 spaces, each linked to its neighbors and every other one to the center space.
export function defaultBoard(n) {
  const count = 2 * n + 2, spaces = [], links = [], positions = {};
  for (let i = 0; i < count; i++) {
    const id = `space${i + 1}`, a = (2 * Math.PI * i) / (count - 1);
    spaces.push({ id, name: `Space ${i + 1}`, type: i === 0 ? "city" : "province", attrs: { pop: i === 0 ? 2 : 1 } });
    positions[id] = i === 0 ? { x: 360, y: 240 } : { x: Math.round(360 + 220 * Math.cos(a)), y: Math.round(240 + 180 * Math.sin(a)) };
  }
  for (let i = 1; i < count; i++) {
    links.push({ id: `l${links.length + 1}`, from: `space${i + 1}`, to: `space${(i % (count - 1)) + 2}` });
    if (i % 2) links.push({ id: `l${links.length + 1}`, from: "space1", to: `space${i + 1}` });
  }
  return { spaces, links, presentation: { style: "schematic", positions, background: null } };
}

export function blankGame(n = 2) {
  const board = defaultBoard(n);
  const g = {
    meta: { schemaVersion: LATEST, gameId: `game-${Math.random().toString(36).slice(2, 10)}`, title: "Untitled COIN game", revision: 1, status: "draft", factionCount: 0, supplies: [], credits: [], progress: {} },
    brief: { conflict: "Untitled conflict", wikipedia: { url: "", title: "", method: "supplied" }, overview: { period: "", actors: [], places: [], turningPoints: [] }, sources: [], claims: [] },
    factions: [],
    board,
    tracks: [],
    setup: { placements: [], spaceAttributes: Object.fromEntries(board.spaces.map((s) => [s.id, { opinion: 0 }])), pools: {}, tracks: {}, eligibility: {} },
    rules: { sequence: { ...structuredClone(SEQUENCE), passGain: {} }, scoring: { name: "Scoring", phases: [] }, text: { overview: "" } },
    actions: [],
    deck: { cards: [], preparation: { piles: [], text: "" } },
    victory: { perFaction: [], checkAt: "", finalScoring: "", tieBreaks: [] },
    bots: []
  };
  for (const t of defaultTypes(n)) addFaction(g, t);
  return g;
}
