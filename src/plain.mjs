// Plain English for effect steps and conditions. One sentence per step.
import { toCond, toValue } from "./exprmodel.mjs";
import { sideEffects } from "./cardfx.mjs";

const cap = (s) => String(s).charAt(0).toUpperCase() + String(s).slice(1);
const pieceName = (g, id) => g.factions.flatMap((f) => f.pieces).find((p) => p.id === id)?.name ?? id;
const trackName = (g, id) => g.tracks.find((t) => t.id === id)?.name ?? id;
const spaceName = (g, id) => g.board.spaces.find((s) => s.id === id)?.name ?? id;
const POOL = { available: "Available", outOfPlay: "Out of Play" };
const VARS = {
  eligible: "this faction is Eligible", "self.resources": "own Resources",
  "rivals.maxResources": "the most Resources of any enemy", "rivals.minResources": "the fewest Resources of any enemy",
  "rivals.maxScore": "the highest enemy victory score", "rivals.minScore": "the lowest enemy victory score",
  "rivals.maxMargin": "the highest enemy victory margin", "rivals.minMargin": "the lowest enemy victory margin",
  "card.id": "the card", "card.hasEffect": "the card has an effect for this faction", "card.raisesSelf": "the card helps this faction", "card.lowersEnemy": "the card hurts the enemy", "card.lasting": "the card's lasting type",
  "card.position": "this faction's place in the card's faction order (1 is first, 0 is not listed)", "turn.position": "this faction's place this turn (1st or 2nd Eligible)", "scoring.nextFinal": "the next scoring card is the final one", "move.count": "the number of pieces moved",
  "next.id": "the next card", "next.lasting": "the next card's lasting type",
  "$space.id": "this space", "$space.name": "space name", "$space.type": "space type", "$space.pop": "Pop", "$space.opinion": "opinion", "$space.control": "the controller of this space"
};
const CMP = { eq: "is", ne: "is not", gt: "is more than", gte: "is at least", lt: "is less than", lte: "is at most" };

const FIELD = { id: "", name: " name", type: " type", resources: " Resources", eligible: " is Eligible", score: " victory score", margin: " victory margin", player: " has a human player" };
const factionName = (g, id) => g.factions.find((f) => f.id === id)?.name ?? id;
export const whoText = (g, f) => (f === "$target" ? "the target" : f === "$faction" ? "that faction" : factionName(g, f));
export function varText(g, name) {
  if (VARS[name]) return VARS[name];
  let m = /^(resources|eligible|score|margin|player)\.(.+)$/.exec(name);
  if (m) return `${factionName(g, m[2])}${FIELD[m[1]]}`;
  m = /^\$(faction|target)\.(.+)$/.exec(name);
  if (m) return m[2] === "id" ? whoText(g, `$${m[1]}`) : m[2] === "player" ? `${whoText(g, `$${m[1]}`)}${FIELD.player}` : `${m[1] === "target" ? "the target's" : "that faction's"}${FIELD[m[2]].replace(" is Eligible", " Eligibility")}`;
  if (name.startsWith("track.")) return trackName(g, name.slice(6));
  if (name.startsWith("inPlay.")) return `${g.deck.cards.find((c) => c.id === name.slice(7))?.title ?? name.slice(7)} is in play`;
  if (name.startsWith("var.")) return `the stored roll ${name.slice(4)}`;
  return name;
}

const where = (g, at) => (at === "$space" ? "in this space" : at === "*" ? "on the map" : `in ${spaceName(g, at)}`);
export function valueText(m, g) {
  switch (m.k) {
    case "lit": return String(m.value);
    case "var": return varText(g, m.name);
    case "count": return `${m.state !== "*" ? cap(m.state) + " " : ""}${pieceName(g, m.piece)} ${where(g, m.at)}`;
    case "fcount": return `${m.state !== "*" ? cap(m.state) + " " : ""}${whoText(g, m.faction)} pieces ${where(g, m.at)}`;
    case "avail": return `Available ${pieceName(g, m.piece)}`;
    case "favail": return `Available pieces of ${whoText(g, m.faction)}`;
    case "unmoved": return `${m.state !== "*" ? cap(m.state) + " " : ""}${pieceName(g, m.piece)} not yet moved ${where(g, m.at)}`;
    case "adj": return `${m.state !== "*" ? cap(m.state) + " " : ""}${pieceName(g, m.piece)} in adjacent spaces`;
    case "sum": return m.items.map((x) => valueText(x, g)).join(" plus ");
    case "diff": return `${valueText(m.a, g)} minus ${valueText(m.b, g)}`;
    case "sumWhere": return `the total ${valueText(m.v, g)} of spaces where ${condText(m.cond, g)}`;
    case "countWhere": return `the number of spaces where ${condText(m.cond, g)}`;
    case "attr": return `${m.name} of ${spaceName(g, m.space)}`;
    default: return "a formula";
  }
}

// "COIN controls this space" for $space.control compared with a side, a faction or "none" (schema 1.11.0).
export const controllerName = (g, id) => g.rules.control?.sides?.find((s) => s.id === id)?.name ?? factionName(g, id);
function controlCmp(m, g) {
  if (!["eq", "ne"].includes(m.cmp) || m.a.k !== "var" || m.a.name !== "$space.control" || m.b.k !== "lit" || typeof m.b.value !== "string") return null;
  const yes = m.cmp === "eq";
  if (m.b.value === "none") return yes ? "no one controls this space" : "someone controls this space";
  return `${controllerName(g, m.b.value)} ${yes ? "controls" : "does not control"} this space`;
}

// One card effect (schema 1.11.0, src/cardfx.mjs) in plain English.
function effectText(g, { verb, what }) {
  const who = (x) => (x === "*" ? "any piece" : g.factions.some((f) => f.id === x) ? `${whoText(g, x)} pieces` : x.startsWith("$") ? `${whoText(g, x)} pieces` : pieceName(g, x));
  switch (verb) {
    case "shift": return `shift toward ${what === "support" ? "Support" : "Opposition"}`;
    case "place": case "remove": return `${verb} ${who(what)}`;
    case "resources": return `change ${whoText(g, what)} Resources`;
    case "track": return `change ${trackName(g, what)}`;
    case "marker": return `set ${what}`;
    default: return `${verb} ${what}`;
  }
}
export const sideEffectsText = (g, steps) => sideEffects(g, steps).map((e) => effectText(g, e));

export function condText(m, g) {
  let t;
  switch (m.k) {
    case "bool": t = m.value ? "always" : "never"; break;
    case "truthy": t = valueText(m.v, g); break;
    case "all": t = m.items.map((x) => condText(x, g)).join(" and "); break;
    case "any": t = m.items.map((x) => condText(x, g)).join(" or "); break;
    case "cmp": t = controlCmp(m, g) ?? `${valueText(m.a, g)} ${CMP[m.cmp]} ${valueText(m.b, g)}`; break;
    case "anySpace": t = `some space has ${condText(m.cond, g)}`; break;
    case "canPlace": t = `a ${pieceName(g, m.piece)} can be placed ${m.at === "*" ? "in some space" : where(g, m.at)}`; break;
    case "cardCould": t = `${m.which === "played" ? "the side this faction plays" : "the card (either side)"} could ${effectText(g, { verb: m.verb, what: m.what })}`; break;
    case "canDo": t = `${g.actions.find((x) => x.id === m.action)?.name ?? m.action} is possible ${m.at === "*" ? "in some space" : where(g, m.at)}`; break;
    default: t = "a formula holds";
  }
  return m.not ? `not (${t})` : t;
}

// keep (schema 1.11.0): " Leave at least 1 Guerrillas in each space they leave where ..., underground first."
function keepText(g, s) {
  const k = s.keep;
  if (!k) return "";
  const n = typeof k.count === "number" ? String(k.count) : valueText(toValue(k.count), g);
  const what = `${s.op === "flip" ? `${s.from} ` : ""}${pieceName(g, s.piece)}`;
  const at = s.op === "move" ? " in each space they leave" : " there";
  return ` Leave at least ${n} ${what}${at}${k.if !== undefined ? `${s.op === "move" ? " where" : " if"} ${condText(toCond(k.if), g)}` : ""}${k.prefer ? `, ${k.prefer} first` : ""}.`;
}

// A count is a word before the piece name. A formula count goes after the sentence as "(as many as ...)".
const qty = (n) => (n === "all" ? "all" : n === "any" ? "any number of" : n === "moved" ? "the moved" : typeof n === "number" ? String(n) : "");
const many = (g, n) => (n !== null && typeof n === "object" ? ` (as many as ${valueText(toValue(n), g)})` : "");
const lead = (verb, n) => `${verb} ${qty(n) ? qty(n) + " " : ""}`;
const amount = (g, n) => (typeof n === "number" ? String(n) : valueText(toValue(n), g));
const state = (s) => (s ? cap(s) + " " : "");
function target(g, s) {
  const f = s.filter !== undefined ? ` where ${condText(toCond(s.filter), g)}` : "";
  if (s.space === "choose" || (s.op === "place" && s.to === "choose")) return s.spaces > 1 ? ` in up to ${s.spaces} chosen spaces${f}` : ` in a chosen space${f}`;
  const at = s.op === "place" ? s.to : s.space;
  if (at === undefined || at === "$space") return at === "$space" ? ` in this space${f}` : f;
  return ` in ${spaceName(g, at)}${f}`;
}
const loc = (g, l) => (l === "adjacent" ? "adjacent spaces" : POOL[l] ?? (l === "$space" ? "this space" : l === "choose" ? "a chosen space" : spaceName(g, l)));

export function stepText(s, g) {
  const p = pieceName(g, s.piece);
  switch (s.op) {
    case "place": return `${lead("Place", s.count)}${state(s.state)}${p} from ${POOL[s.from]}${target(g, s)}${many(g, s.count)}.`;
    case "remove": return `${lead("Remove", s.count)}${state(s.state)}${p}${target(g, s)} to ${POOL[s.to]}${many(g, s.count)}${s.fallbackPiece ? `, or ${pieceName(g, s.fallbackPiece)} if there is no ${p}` : ""}.${keepText(g, s)}`;
    case "flip": return `${lead("Flip", s.count)}${p} from ${cap(s.from)} to ${cap(s.to)}${target(g, s)}${many(g, s.count)}.${keepText(g, s)}`;
    case "move": return `${lead("Move", s.count)}${state(s.state)}${p} from ${loc(g, s.from)} to ${loc(g, s.to)}${s.filter !== undefined ? ` where ${condText(toCond(s.filter), g)}` : ""}${many(g, s.count)}.${s.activate ? ` If ${condText(toCond(s.activate.if), g)} there, the moved pieces become ${s.activate.to}.` : ""}${keepText(g, s)}`;
    case "shift": return `Shift ${s.attr} ${s.amount} step${s.amount === 1 ? "" : "s"} toward ${cap(s.toward)}${target(g, s)}.`;
    case "track": return `${s.delta < 0 ? "Lower" : "Raise"} ${trackName(g, s.id)} by ${Math.abs(s.delta)}.`;
    case "gain": return typeof s.amount === "number" && s.amount < 0 ? `${cap(trackName(g, s.track))} loses ${-s.amount}.` : `${cap(trackName(g, s.track))} gains ${amount(g, s.amount)}.`;
    case "pay": return `Pay ${amount(g, s.amount)} ${trackName(g, s.track)}.`;
    case "roll": return `Roll a die and store the result as ${s.store}.`;
    case "markerSet": return `Set ${s.marker} to ${s.value}${target(g, s)}.`;
    case "if": {
      const sub = (list) => list.map((x) => stepText(x, g).replace(/\.$/, "").replace(/^./, (c) => c.toLowerCase())).join(", then ");
      return `If ${condText(toCond(s.test), g)}, ${sub(s.then)}${s.else?.length ? `; otherwise ${sub(s.else)}` : ""}.`;
    }
    case "choose": return `${s.options.some((o) => o.faction) ? "Choose an enemy faction" : "Choose one"}: ${s.options.map((o) => `${o.label} (${o.steps.map((x) => stepText(x, g).replace(/\.$/, "").replace(/^./, (c) => c.toLowerCase())).join(", then ")})`).join(" or ")}.`;
    default: return `Do ${s.op}.`;
  }
}

export const stepsText = (steps, g) => steps.map((s) => stepText(s, g)).join(" ");

// Short stable fingerprint of a step list. Stored as plainOf when the text is written.
export function fingerprint(steps) {
  let h = 5381;
  for (const ch of JSON.stringify(steps)) h = ((h * 33) ^ ch.charCodeAt(0)) >>> 0;
  return h.toString(36);
}
export const isStale = (holder) => holder.plainOf !== undefined && holder.plainOf !== fingerprint(holder.steps);

// An action node's budget (schema 1.11.0), for the bot aid, the Non-Player sheet and the editor.
export function budgetText(b) {
  const out = [];
  if (b.share) out.push(`Spend at most ${b.share[0]}/${b.share[1]} of Resources (round down)${b.allBelow !== undefined ? `, or all if Resources are below ${b.allBelow}` : ""}.`);
  if (b.floor !== undefined) out.push(`Keep at least ${b.floor} Resources.`);
  return out.join(" ");
}
