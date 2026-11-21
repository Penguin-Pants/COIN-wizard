// Action archetypes drawn from common patterns in COIN-style games.
// All text is original. Names are generic. Each template builds a valid action
// from the faction's own pieces, so the result passes validation at once.

const sp = { var: "$space.id" };
const cnt = (piece, state = "*") => ({ op: "count", args: [piece, sp, state] });
const gte = (a, n) => ({ op: "gte", args: [a, n] });
const and = (...a) => ({ op: "and", args: a });
// Opinion is one axis: the state side wants Support, every other faction wants Opposition.
const side = (f) => (f.type === "state" ? "Support" : "Opposition");

const states = (p) => ({ hid: p && p.states.length > 1 ? p.states[0] : null, rev: p && p.states.length > 1 ? p.states[1] : null });

export const TEMPLATES = [
  {
    id: "deploy", kind: "operation", name: "Deploy", fits: ["state"], needs: ["mine"],
    blurb: "Place mobile pieces from Available into chosen spaces.",
    build: ({ M, track }) => ({
      plain: `In each chosen space, place up to 2 ${M.name} from Available.`, cost: { track, amount: 2, per: "space" }, limitedAllowed: true, targets: true,
      dependsOn: [M.id, track], steps: [{ op: "place", piece: M.id, count: 2, from: "available", to: "$space" }]
    })
  },
  {
    id: "recruit", kind: "operation", name: "Recruit", fits: ["guerrilla", "custom"], needs: ["mine"],
    blurb: "Place hidden pieces where you already have presence. A base adds a bonus.",
    build: ({ M, B, track }) => {
      const s = states(M).hid;
      const here = B ? { op: "or", args: [gte(cnt(B.id), 1), gte(cnt(M.id), 1)] } : gte(cnt(M.id), 1);
      const put = (n) => ({ op: "place", piece: M.id, count: n, from: "available", to: "$space", ...(s ? { state: s } : {}) });
      return {
        plain: B ? `In each chosen space with a ${M.name} or ${B.name}, place 2 ${M.name} if a ${B.name} is there, otherwise 1.` : `In each chosen space with a ${M.name}, place 1 ${M.name}.`,
        cost: { track, amount: 1, per: "space" }, limitedAllowed: true, targets: here, dependsOn: [M.id, ...(B ? [B.id] : []), track],
        steps: B ? [{ op: "if", test: gte(cnt(B.id), 1), then: [put(2)], else: [put(1)] }] : [put(1)]
      };
    }
  },
  {
    id: "march", kind: "operation", name: "March", fits: ["guerrilla", "state", "custom"], needs: ["mine"],
    blurb: "Move mobile pieces in from adjacent spaces.",
    build: ({ M, track }) => ({
      plain: `Into each chosen space, move any number of ${M.name} from adjacent spaces.`, cost: { track, amount: 1, per: "space" }, limitedAllowed: true,
      targets: gte({ op: "adjCount", args: [M.id, sp, "*"] }, 1), dependsOn: [M.id, "board.links", track],
      steps: [{ op: "move", piece: M.id, count: "any", from: "adjacent", to: "$space" }]
    })
  },
  {
    id: "sweep", kind: "operation", name: "Sweep", fits: ["state"], needs: ["mine", "foe", "foeStates"],
    blurb: "Bring pieces in and reveal hidden enemies.",
    build: ({ M, F, track }) => {
      const fs = states(F);
      return {
        plain: `In each chosen space with a ${fs.hid} ${F.name}, move up to 3 ${M.name} in from adjacent spaces. Then flip one ${fs.hid} ${F.name} to ${fs.rev} for each ${M.name} there.`,
        cost: { track, amount: 1, per: "space" }, limitedAllowed: true, targets: gte(cnt(F.id, fs.hid), 1), dependsOn: [M.id, F.id, "board.links", track],
        steps: [{ op: "move", piece: M.id, count: 3, from: "adjacent", to: "$space" }, { op: "flip", piece: F.id, from: fs.hid, to: fs.rev, count: cnt(M.id) }]
      };
    }
  },
  {
    id: "suppress", kind: "operation", name: "Suppress", fits: ["state"], needs: ["mine", "foe"],
    blurb: "Remove exposed enemies, one for each of your pieces there.",
    build: ({ M, F, track }) => {
      const fs = states(F).rev ?? "*";
      return {
        plain: `In each chosen space with a ${M.name} and an exposed ${F.name}, remove up to as many ${F.name} as there are ${M.name}.`,
        cost: { track, amount: 1, per: "space" }, limitedAllowed: true, targets: and(gte(cnt(F.id, fs), 1), gte(cnt(M.id), 1)), dependsOn: [M.id, F.id, track],
        steps: [{ op: "remove", piece: F.id, ...(fs !== "*" ? { state: fs } : {}), count: cnt(M.id), to: "available" }]
      };
    }
  },
  {
    id: "strike", kind: "operation", name: "Strike", fits: ["guerrilla", "custom"], needs: ["mine", "foe"],
    blurb: "Roll a die. On a low roll, remove one enemy. Your pieces become exposed.",
    build: ({ M, F, track }) => {
      const s = states(M);
      return {
        plain: `In one chosen space with ${M.name} and ${F.name}, roll one die. On a roll at or below the number of ${M.name} there, remove 1 ${F.name}.${s.rev ? ` Then flip all ${s.hid} ${M.name} there to ${s.rev}.` : ""}`,
        cost: { track, amount: 0, per: "space" }, limitedAllowed: true, targets: and(gte(cnt(M.id), 1), gte(cnt(F.id), 1)), dependsOn: [M.id, F.id, "die.d6", track],
        steps: [{ op: "roll", die: "d6", store: "r" }, { op: "if", test: { op: "lte", args: [{ var: "var.r" }, cnt(M.id)] }, then: [{ op: "remove", piece: F.id, count: 1, to: "available" }] }, ...(s.rev ? [{ op: "flip", piece: M.id, from: s.hid, to: s.rev, count: "all" }] : [])]
      };
    }
  },
  {
    id: "build", kind: "operation", name: "Build", fits: ["guerrilla", "custom", "state"], needs: ["mine", "base"],
    blurb: "Swap mobile pieces for a base.",
    build: ({ M, B, track }) => ({
      plain: `In one chosen space with 2 or more ${M.name}, remove 2 ${M.name} and place 1 ${B.name} from Available.`, cost: { track, amount: 2, per: "space" }, limitedAllowed: false,
      targets: and(gte(cnt(M.id), 2), { op: "eq", args: [cnt(B.id), 0] }), dependsOn: [M.id, B.id, track],
      steps: [{ op: "remove", piece: M.id, count: 2, to: "available" }, { op: "place", piece: B.id, count: 1, from: "available", to: "$space" }]
    })
  },
  {
    id: "campaign", kind: "operation", name: "Campaign", fits: ["nonviolent"], needs: [],
    blurb: "Shift public opinion toward you. No fighting.",
    build: ({ faction, track }) => ({
      plain: `In each chosen space, shift opinion one step toward ${side(faction)}.`, cost: { track, amount: 1, per: "space" }, limitedAllowed: true, targets: true, dependsOn: ["board.opinion", track],
      steps: [{ op: "shift", attr: "opinion", toward: side(faction).toLowerCase(), amount: 1 }]
    })
  },
  {
    id: "mobilize", kind: "operation", name: "Mobilize", fits: ["nonviolent"], needs: ["mine"],
    blurb: "Place supporters where the population is large enough.",
    build: ({ M, track }) => ({
      plain: `In each chosen space with Population 1 or more, place 1 ${M.name} from Available.`, cost: { track, amount: 1, per: "space" }, limitedAllowed: true,
      targets: gte({ var: "$space.pop" }, 1), dependsOn: [M.id, track], steps: [{ op: "place", piece: M.id, count: 1, from: "available", to: "$space" }]
    })
  },
  {
    id: "raid", kind: "specialActivity", name: "Raid", fits: ["guerrilla", "custom"], needs: ["mine"],
    blurb: "Gain resources from a space where you have presence.",
    build: ({ M, track }) => ({
      plain: `In one space with a ${M.name}, gain 2 resources.`, cost: { track, amount: 0, per: "use" }, timing: "after", targets: gte(cnt(M.id), 1), dependsOn: [M.id, track],
      steps: [{ op: "gain", track, amount: 2 }]
    })
  },
  {
    id: "pressure", kind: "specialActivity", name: "Pressure", fits: ["state"], needs: ["mine"],
    blurb: "Shift opinion toward you where you hold the ground.",
    build: ({ M, faction, track }) => ({
      plain: `In one space with 2 or more ${M.name}, shift opinion one step toward ${side(faction)}.`, cost: { track, amount: 1, per: "use" }, timing: "after",
      targets: gte(cnt(M.id), 2), dependsOn: [M.id, "board.opinion", track], steps: [{ op: "shift", attr: "opinion", toward: side(faction).toLowerCase(), amount: 1 }]
    })
  },
  {
    id: "propaganda", kind: "specialActivity", name: "Propaganda", fits: ["nonviolent", "guerrilla", "state", "custom"], needs: [],
    blurb: "Shift opinion one step toward you in a chosen space.",
    build: ({ faction, track }) => ({
      plain: `In one space, shift opinion one step toward ${side(faction)}.`, cost: { track, amount: 1, per: "use" }, timing: "after", targets: true, dependsOn: ["board.opinion", track],
      steps: [{ op: "shift", attr: "opinion", toward: side(faction).toLowerCase(), amount: 1 }]
    })
  },
  {
    id: "ambush", kind: "specialActivity", name: "Ambush", fits: ["guerrilla"], needs: ["mine", "foe", "mineStates"],
    blurb: "Remove one enemy while staying hidden.",
    build: ({ M, F, track }) => {
      const s = states(M);
      return {
        plain: `In one space with a ${s.hid} ${M.name} and an enemy ${F.name}, remove 1 ${F.name}. The ${M.name} stays ${s.hid}.`, cost: { track, amount: 1, per: "use" }, timing: "during",
        targets: and(gte(cnt(M.id, s.hid), 1), gte(cnt(F.id), 1)), dependsOn: [M.id, F.id, track], steps: [{ op: "remove", piece: F.id, count: 1, to: "available" }]
      };
    }
  },
  {
    id: "fortify", kind: "specialActivity", name: "Fortify", fits: ["state"], needs: ["mine", "base"],
    blurb: "Place a base where you have a strong force.",
    build: ({ M, B, track }) => ({
      plain: `In one space with 3 or more ${M.name} and no ${B.name}, place 1 ${B.name} from Available.`, cost: { track, amount: 2, per: "use" }, timing: "after",
      targets: and(gte(cnt(M.id), 3), { op: "eq", args: [cnt(B.id), 0] }), dependsOn: [M.id, B.id, track], steps: [{ op: "place", piece: B.id, count: 1, from: "available", to: "$space" }]
    })
  },
  {
    id: "smuggle", kind: "specialActivity", name: "Smuggle", fits: ["guerrilla", "nonviolent", "custom", "state"], needs: [],
    blurb: "Gain resources at any time with no space needed.",
    build: ({ track }) => ({
      plain: "Gain 2 resources.", cost: { track, amount: 0, per: "use" }, timing: "any", targets: true, dependsOn: [track], steps: [{ op: "gain", track, amount: 2 }]
    })
  }
];

// The enemy a template acts against. By default: the first faction on the other side
// (the state side against the others), so allies are never the default target with 3 or 4 factions.
export function defaultTarget(game, factionId) {
  const f = game.factions.find((x) => x.id === factionId);
  const others = game.factions.filter((x) => x.id !== factionId);
  const isState = (x) => x.type === "state";
  return (others.find((x) => isState(x) !== isState(f)) ?? others[0])?.id ?? null;
}
export function defaultRoles(game, factionId, targetId = defaultTarget(game, factionId)) {
  const f = game.factions.find((x) => x.id === factionId);
  const mine = f.pieces.find((p) => !p.isBase) ?? null;
  const base = f.pieces.find((p) => p.isBase) ?? null;
  const foe = game.factions.find((x) => x.id === targetId)?.pieces.find((p) => !p.isBase) ?? null;
  return { faction: f, M: mine, B: base, F: foe, track: f.resourceTrack };
}

const NEED_TEXT = { mine: "a non-base piece", base: "a base piece", foe: "an enemy piece", foeStates: "an enemy piece with two states", mineStates: "a piece with two states (hidden and exposed)" };
export function unmet(tpl, roles) {
  const ok = { mine: !!roles.M, base: !!roles.B, foe: !!roles.F, foeStates: !!roles.F && roles.F.states.length > 1, mineStates: !!roles.M && roles.M.states.length > 1 };
  const miss = tpl.needs.filter((n) => !ok[n]);
  return miss.length ? `needs ${miss.map((n) => NEED_TEXT[n]).join(" and ")}` : "";
}

export function templatesFor(game, factionId, targetId) {
  const roles = defaultRoles(game, factionId, targetId);
  const type = roles.faction.type;
  return TEMPLATES.map((t) => ({ tpl: t, reason: unmet(t, roles), fit: t.fits.includes(type) })).sort((a, b) => (a.reason ? 1 : 0) - (b.reason ? 1 : 0) || (b.fit ? 1 : 0) - (a.fit ? 1 : 0));
}

const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "action";

export function instantiate(game, factionId, templateId, name, targetId) {
  const tpl = TEMPLATES.find((t) => t.id === templateId);
  if (!tpl) return null;
  const roles = defaultRoles(game, factionId, targetId ?? defaultTarget(game, factionId));
  if (unmet(tpl, roles)) return null;
  const nm = (name ?? "").trim() || tpl.name;
  let id = `${factionId}.${slug(nm)}`, n = 2;
  while (game.actions.some((a) => a.id === id)) id = `${factionId}.${slug(nm)}-${n++}`;
  return { id, faction: factionId, kind: tpl.kind, name: nm, templateId: tpl.id, ...tpl.build(roles) };
}
