// Effect step catalogue: the fields of each op. This is the engine contract for steps.
// The schema's $defs.step is generated from it (test/ops.test.mjs keeps them equal).
// req fields must be present. opt fields may be present. No other field is allowed.

// Field kinds. Each has a JSON Schema and a form control in ui/components/stepList.mjs.
export const KINDS = {
  piece: { $ref: "#/$defs/id" },
  state: { $ref: "#/$defs/id" },
  track: { $ref: "#/$defs/id" },
  marker: { $ref: "#/$defs/id" },
  // How many: a number, a keyword or a formula.
  qty: { anyOf: [{ type: "integer", minimum: 0 }, { enum: ["all", "any", "moved"] }, { $ref: "#/$defs/expr" }] },
  amount: { anyOf: [{ type: "integer" }, { $ref: "#/$defs/expr" }] },
  int: { type: "integer" },
  spaces: { type: "integer", minimum: 1 },
  // Where: the space being resolved, a space the player chooses, or a named space.
  where: { anyOf: [{ enum: ["$space", "choose"] }, { $ref: "#/$defs/id" }] },
  // A piece pool off the map.
  pool: { enum: ["available", "outOfPlay"] },
  // Any place a piece can be: on the map or in a pool.
  loc: { anyOf: [{ enum: ["$space", "choose", "adjacent", "available", "outOfPlay"] }, { $ref: "#/$defs/id" }] },
  cond: { $ref: "#/$defs/expr" },
  attr: { enum: ["opinion"] },
  toward: { enum: ["support", "opposition"] },
  die: { enum: ["d6"] },
  varname: { type: "string", pattern: "^[a-z0-9_]+$" },
  scalar: { type: ["integer", "string", "boolean"] },
  steps: { type: "array", items: { $ref: "#/$defs/step" } },
  // 1.9.0: after a move, when "if" holds at the destination (move.count: pieces moved), the moved pieces flip to "to".
  activate: { type: "object", required: ["if", "to"], additionalProperties: false, properties: { if: { $ref: "#/$defs/expr" }, to: { $ref: "#/$defs/id" } } },
  options: {
    type: "array", minItems: 1,
    items: { type: "object", required: ["label", "steps"], additionalProperties: false, properties: { label: { type: "string" }, faction: { $ref: "#/$defs/id", description: "The enemy faction this option acts against (1.6.0). A bot whose action node picked an enemy ($target) takes the option for that faction." }, piece: { $ref: "#/$defs/id", description: "1.9.0, needs faction: a piece type of that faction. A bot whose opponent table picked that piece takes this option and no other." }, legal: { $ref: "#/$defs/expr", description: "Spaces where this option can be used (1.6.0, needs faction). When the action is used against that faction, a space must meet both the action's targets and this." }, steps: { type: "array", minItems: 1, items: { $ref: "#/$defs/step" } } } }
  }
};

const where = { space: "where", spaces: "spaces", filter: "cond" };
export const OPS = {
  place: { req: { piece: "piece", count: "qty", from: "pool", to: "where" }, opt: { state: "state", ...where } },
  remove: { req: { piece: "piece", count: "qty", to: "pool" }, opt: { state: "state", fallbackPiece: "piece", ...where } },
  flip: { req: { piece: "piece", from: "state", to: "state", count: "qty" }, opt: where },
  move: { req: { piece: "piece", count: "qty", from: "loc", to: "loc" }, opt: { state: "state", filter: "cond", activate: "activate" } },
  shift: { req: { attr: "attr", toward: "toward", amount: "int" }, opt: where },
  track: { req: { id: "track", delta: "int" }, opt: {} },
  gain: { req: { track: "track", amount: "amount" }, opt: {} },
  pay: { req: { track: "track", amount: "amount" }, opt: {} },
  roll: { req: { die: "die", store: "varname" }, opt: {} },
  markerSet: { req: { marker: "marker", value: "scalar" }, opt: where },
  if: { req: { test: "cond", then: "steps" }, opt: { else: "steps" } },
  choose: { req: { options: "options" }, opt: {} }
};

export const fieldsOf = (op) => ({ ...OPS[op].req, ...OPS[op].opt });

export function stepSchema() {
  return {
    type: "object",
    description: "Effect step. Fields per op come from src/ops.mjs.",
    required: ["op"],
    properties: { op: { enum: Object.keys(OPS) } },
    allOf: Object.keys(OPS).map((op) => ({
      if: { properties: { op: { const: op } } },
      then: {
        required: Object.keys(OPS[op].req),
        additionalProperties: false,
        properties: { op: { const: op }, ...Object.fromEntries(Object.entries(fieldsOf(op)).map(([k, kind]) => [k, KINDS[kind]])) }
      }
    }))
  };
}

// A new step with every required field filled from the game's own pieces, tracks and spaces.
export function defaultStep(op, game) {
  const pc = game.factions.flatMap((f) => f.pieces)[0];
  const track = game.tracks[0]?.id;
  const piece = pc?.id, st = pc?.states ?? [];
  switch (op) {
    case "place": return { op, piece, count: 1, from: "available", to: "$space" };
    case "remove": return { op, piece, count: 1, to: "available" };
    case "flip": return { op, piece, from: st[0], to: st[1] ?? st[0], count: 1 };
    case "move": return { op, piece, count: 1, from: "adjacent", to: "$space" };
    case "shift": return { op, attr: "opinion", toward: "support", amount: 1 };
    case "track": return { op, id: track, delta: 1 };
    case "gain": return { op, track, amount: 1 };
    case "pay": return { op, track, amount: 1 };
    case "roll": return { op, die: "d6", store: "roll" };
    case "markerSet": return { op, marker: "marker", value: true, space: "$space" };
    case "if": return { op, test: true, then: [defaultStep("track", game)] };
    case "choose": return { op, options: [{ label: "Option 1", steps: [defaultStep("track", game)] }] };
    default: throw new Error(`Unknown op ${op}`);
  }
}
