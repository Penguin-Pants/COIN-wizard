// Lifts older coin-game documents to the latest schema version.
// Each entry lifts one version. Never edit an old entry: add a new one.
export const LATEST = "coin-game/1.8.0";

const STEPS = ["brief", "factions", "board", "rules", "review"];

const MIGRATIONS = {
  "coin-game/1.0.0": (g) => {
    g.meta.schemaVersion = "coin-game/1.1.0";
    g.meta.progress = g.meta.status === "final" ? Object.fromEntries(STEPS.map((s) => [s, { visited: true, touched: true, done: true }])) : {};
    for (const f of g.factions ?? []) f.preset ??= f.type;
  },
  // Steps get fixed fields per op. shift.toward names a side of the opinion axis, not a faction.
  "coin-game/1.1.0": (g) => {
    g.meta.schemaVersion = "coin-game/1.2.0";
    const side = (t) => {
      if (t === "support" || t === "opposition") return t;
      const f = (g.factions ?? []).find((x) => x.id === t || x.name?.toLowerCase() === String(t).toLowerCase());
      return f ? (f.type === "state" ? "support" : "opposition") : t;
    };
    const walk = (steps) => (steps ?? []).forEach((s) => {
      if (s.op === "shift" && "toward" in s) s.toward = side(s.toward);
      walk(s.then); walk(s.else); (s.options ?? []).forEach((o) => walk(o.steps));
    });
    (g.actions ?? []).forEach((a) => walk(a.steps));
    (g.deck?.cards ?? []).forEach((c) => (c.sides ?? []).forEach((sd) => walk(sd.steps)));
    (g.rules?.scoring?.phases ?? []).forEach((p) => walk(p.steps));
  },
  // N factions: other.resources is replaced by resources.<faction>. Where the acting faction is known
  // (its bot, its own actions) the first other faction is written out, which is what 1.2.0 meant.
  // Elsewhere it stays and the validator asks for a choice.
  "coin-game/1.2.0": (g) => {
    g.meta.schemaVersion = "coin-game/1.3.0";
    const ids = (g.factions ?? []).map((f) => f.id);
    const rewrite = (v, self) => {
      if (Array.isArray(v)) return v.forEach((x) => rewrite(x, self));
      if (!v || typeof v !== "object") return;
      if (v.var === "other.resources") { const o = ids.find((x) => x !== self); if (o) v.var = `resources.${o}`; return; }
      Object.values(v).forEach((x) => rewrite(x, self));
    };
    for (const b of g.bots ?? []) rewrite(b, b.factionId);
    for (const a of g.actions ?? []) rewrite(a, a.faction);
  },
  // Optional sheet fields on actions (purpose, ruleRef, accompanies, maxSpaces). Nothing to rewrite.
  "coin-game/1.3.0": (g) => {
    g.meta.schemaVersion = "coin-game/1.4.0";
  },
  // Bot model gaps (linked list, parts, scoring tables, lasting cards). All new fields are optional.
  "coin-game/1.4.0": (g) => {
    g.meta.schemaVersion = "coin-game/1.5.0";
  },
  // An action can be used against any enemy: an optional faction on a choice option. Nothing to rewrite.
  "coin-game/1.5.0": (g) => {
    g.meta.schemaVersion = "coin-game/1.6.0";
  },
  // Priority tables may use mode "sequence". No mode means "first", as before. Nothing to rewrite.
  "coin-game/1.6.0": (g) => {
    g.meta.schemaVersion = "coin-game/1.7.0";
  },
  // New variables (card.position, turn.position), ops (canPlace, canDo) and an optional step target. Nothing to rewrite.
  "coin-game/1.7.0": (g) => {
    g.meta.schemaVersion = "coin-game/1.8.0";
  }
};

// Returns a migrated copy. The input is not changed.
export function migrate(game) {
  const g = structuredClone(game);
  if (typeof g?.meta?.schemaVersion !== "string") throw new Error("Not a coin-game definition: meta.schemaVersion is missing.");
  while (g.meta.schemaVersion !== LATEST) {
    const from = g.meta.schemaVersion, step = MIGRATIONS[from];
    if (!step) throw new Error(`Unknown schema version ${from}. This tool reads up to ${LATEST}.`);
    step(g);
    if (g.meta.schemaVersion === from) throw new Error(`Migration from ${from} did not change the version.`);
  }
  return g;
}
