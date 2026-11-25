// Opinion levels (schema 1.9.0). A game has 3 levels (Support, Neutral, Opposition: 1, 0, -1), the
// default, or 5 (Active and Passive Support and Opposition: 2 to -2), as its rules say.
export const opinionLevels = (g) => (g?.board?.opinionLevels === 5 ? 5 : 3);
export const opinionMax = (g) => (opinionLevels(g) === 5 ? 2 : 1);
const NAMES3 = [[1, "Support"], [0, "Neutral"], [-1, "Opposition"]];
const NAMES5 = [[2, "Active Support"], [1, "Passive Support"], [0, "Neutral"], [-1, "Passive Opposition"], [-2, "Active Opposition"]];
// [value, name] from Support to Opposition.
export const opinionNames = (g) => (opinionLevels(g) === 5 ? NAMES5 : NAMES3).map(([v, n]) => [v, n]);
export const opinionName = (g, v) => opinionNames(g).find(([x]) => x === v)?.[1] ?? String(v);
