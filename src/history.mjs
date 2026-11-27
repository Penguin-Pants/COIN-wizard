// JSON patches for undo and redo, and a section-level compare between two games.
// A patch is a list of { path, from, to }. A missing value is undefined: the key is absent.

const isObj = (x) => x !== null && typeof x === "object";

// The smallest set of value changes from a to b. Arrays of different length change as a whole.
export function diff(a, b, path = [], out = []) {
  if (a === b) return out;
  if (isObj(a) && isObj(b) && Array.isArray(a) === Array.isArray(b) && (!Array.isArray(a) || a.length === b.length)) {
    for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) diff(a[k], b[k], [...path, Array.isArray(a) ? Number(k) : k], out);
    return out;
  }
  if (JSON.stringify(a) !== JSON.stringify(b)) out.push({ path, from: structuredClone(a), to: structuredClone(b) });
  return out;
}

// Applies the "to" side of each change. Returns the game: a change at the root replaces it.
export function applyPatch(game, patch) {
  for (const { path, to } of patch) {
    if (!path.length) { game = structuredClone(to); continue; }
    const parent = path.slice(0, -1).reduce((o, k) => o[k], game), k = path.at(-1);
    if (to === undefined) delete parent[k]; else parent[k] = structuredClone(to);
  }
  return game;
}

export const invert = (patch) => patch.map(({ path, from, to }) => ({ path, from: to, to: from })).reverse();

export const SECTIONS = [
  { id: "overview", name: "Conflict and overview", keys: ["brief", "meta"] },
  { id: "factions", name: "Factions and actions", keys: ["factions", "actions"] },
  { id: "board", name: "Board and setup", keys: ["board", "tracks", "setup"] },
  { id: "rules", name: "Rules", keys: ["rules"] },
  { id: "deck", name: "Deck", keys: ["deck"] },
  { id: "victory", name: "Victory", keys: ["victory"] },
  { id: "bots", name: "Bots", keys: ["bots", "sharedTables"] }
];
// Progress and save bookkeeping are not design changes.
const IGNORE = new Set(["progress", "confirmedAt"]);

export function compareGames(a, b) {
  return SECTIONS.map((s) => {
    const changes = s.keys.flatMap((k) => diff(a[k], b[k], [k])).filter((c) => !c.path.some((p) => IGNORE.has(p)));
    return { id: s.id, name: s.name, changes: changes.length, paths: changes.slice(0, 5).map((c) => "/" + c.path.join("/")) };
  });
}
