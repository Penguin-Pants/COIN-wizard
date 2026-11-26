// Deck operations: card ids, add, duplicate, delete with references, card-scoped rename, piles and a sample deck.

const PREFIX = { event: "e", scoring: "s" };

// The next id after the highest one of that type, so a deleted card's id is not given to a new card.
export function newCardId(game, type) {
  const p = PREFIX[type];
  const nums = game.deck.cards.map((c) => new RegExp(`^${p}(\\d+)$`).exec(c.id)?.[1]).filter(Boolean);
  // Follow the width the deck already uses for this type (e01 or s1). A new deck pads to 2.
  const width = nums.length ? Math.max(...nums.map((x) => x.length)) : 2;
  const id = (n) => `${p}${String(n).padStart(width, "0")}`;
  let n = Math.max(0, ...nums.map(Number)) + 1;
  while (game.deck.cards.some((c) => c.id === id(n))) n++;
  return id(n);
}

export function addCard(game, type) {
  const id = newCardId(game, type);
  const c = type === "event"
    ? { id, type, title: `Event ${id.toUpperCase()}`, order: game.factions.map((f) => f.id), sides: [{ id: "unshaded", label: "", text: "", steps: [] }, { id: "shaded", label: "", text: "", steps: [] }] }
    : { id, type, title: game.rules.scoring.name || "Scoring", order: game.factions.map((f) => f.id) };
  game.deck.cards.push(c);
  return c;
}

export function duplicateCard(game, id) {
  const i = game.deck.cards.findIndex((c) => c.id === id);
  const c = structuredClone(game.deck.cards[i]);
  c.id = newCardId(game, c.type); c.title = `${c.title} (copy)`; delete c.final;
  game.deck.cards.splice(i + 1, 0, c);
  return c;
}

// Expressions that compare card.id or next.id (1.11.0) with a literal name a card too.
function cardIdLiterals(game, visit) {
  const walk = (v, path) => {
    if (Array.isArray(v)) return v.forEach((x, i) => walk(x, `${path}/${i}`));
    if (!v || typeof v !== "object") return;
    if (Array.isArray(v.args) && v.args.length === 2 && v.args.some((a) => a?.var === "card.id" || a?.var === "next.id")) v.args.forEach((a, i) => { if (typeof a === "string") visit(v, i, path); });
    for (const [k, x] of Object.entries(v)) walk(x, `${path}/${k}`);
  };
  walk(game.bots, "/bots");
}

// inPlay.<card> variables (schema 1.11.0) anywhere in the game, and dry-run patches that set inPlay.
function inPlayVars(game, visit) {
  const walk = (v, path) => {
    if (Array.isArray(v)) return v.forEach((x, i) => walk(x, `${path}/${i}`));
    if (!v || typeof v !== "object") return;
    if (typeof v.var === "string" && v.var.startsWith("inPlay.")) visit(v, path);
    for (const [k, x] of Object.entries(v)) walk(x, `${path}/${k}`);
  };
  for (const k of ["actions", "deck", "rules", "victory", "bots"]) walk(game[k], `/${k}`);
}
const inPlayPatches = (game, visit) => game.bots.forEach((b, bi) => b.dryRuns.forEach((d, di) => { if (d.patch?.inPlay) visit(d.patch, `/bots/${bi}/dryRuns/${di}/patch/inPlay`, b, d); }));

export function cardRefs(game, id) {
  const out = [];
  game.deck.preparation.piles.forEach((p, i) => {
    if (p.events.includes(id)) out.push({ path: `/deck/preparation/piles/${i}/events`, label: `Pile ${p.id} events` });
    if (p.scoring === id) out.push({ path: `/deck/preparation/piles/${i}/scoring`, label: `Pile ${p.id} scoring card` });
  });
  game.bots.forEach((b, bi) => {
    b.eventPolicy.overrides.forEach((o, oi) => { if (o.cardId === id) out.push({ path: `/bots/${bi}/eventPolicy/overrides/${oi}`, label: `Bot ${b.id} Event exception` }); });
    b.dryRuns.forEach((d, di) => { if (d.patch?.card?.id === id) out.push({ path: `/bots/${bi}/dryRuns/${di}/patch/card`, label: `Bot ${b.id} dry run "${d.case}"` }); });
    b.dryRuns.forEach((d, di) => { if (d.patch?.next?.id === id) out.push({ path: `/bots/${bi}/dryRuns/${di}/patch/next`, label: `Bot ${b.id} dry run "${d.case}" next card` }); });
  });
  cardIdLiterals(game, (e, i, path) => { if (e.args[i] === id) out.push({ path, label: "A bot condition on the card" }); });
  inPlayVars(game, (e, path) => { if (e.var === `inPlay.${id}`) out.push({ path, label: "An expression that reads the card in play" }); });
  inPlayPatches(game, (pt, path, b, d) => { if (pt.inPlay.includes(id)) out.push({ path, label: `Bot ${b.id} dry run "${d.case}" cards in play` }); });
  return out;
}

// Removes the card and the references that can go with it. Returns each reference with fixed true or false.
export function deleteCard(game, id) {
  const refs = cardRefs(game, id).map((r) => ({ ...r, fixed: /\/events$|\/overrides\/\d+$|\/patch\/inPlay$|\/patch\/next$/.test(r.path) }));
  for (const b of game.bots) for (const d of b.dryRuns) if (d.patch?.next?.id === id) delete d.patch.next;
  inPlayPatches(game, (pt) => { pt.inPlay = pt.inPlay.filter((c) => c !== id); if (!pt.inPlay.length) delete pt.inPlay; });
  game.deck.cards = game.deck.cards.filter((c) => c.id !== id);
  for (const p of game.deck.preparation.piles) p.events = p.events.filter((e) => e !== id);
  for (const b of game.bots) b.eventPolicy.overrides = b.eventPolicy.overrides.filter((o) => o.cardId !== id);
  return refs;
}

// Renames a card id in card references only. Other ids with the same text (a source s1, say) stay.
export function renameCard(game, oldId, newId) {
  const g = structuredClone(game);
  for (const c of g.deck.cards) if (c.id === oldId) c.id = newId;
  for (const p of g.deck.preparation.piles) { p.events = p.events.map((e) => (e === oldId ? newId : e)); if (p.scoring === oldId) p.scoring = newId; }
  for (const b of g.bots) {
    for (const o of b.eventPolicy.overrides) if (o.cardId === oldId) o.cardId = newId;
    for (const d of b.dryRuns) if (d.patch?.card?.id === oldId) d.patch.card.id = newId;
    for (const d of b.dryRuns) if (d.patch?.next?.id === oldId) d.patch.next.id = newId;
  }
  cardIdLiterals(g, (e, i) => { if (e.args[i] === oldId) e.args[i] = newId; });
  inPlayVars(g, (e) => { if (e.var === `inPlay.${oldId}`) e.var = `inPlay.${newId}`; });
  inPlayPatches(g, (pt) => { pt.inPlay = pt.inPlay.map((c) => (c === oldId ? newId : c)); });
  return g;
}

// Splits the Event cards into n piles in deck order and gives each pile one scoring card.
// The final scoring card goes to the last position of the last pile. Others land in the bottom half.
export function buildPiles(game, n) {
  const events = game.deck.cards.filter((c) => c.type === "event").map((c) => c.id);
  const scoring = game.deck.cards.filter((c) => c.type === "scoring");
  const fin = scoring.filter((c) => c.final);
  if (scoring.length !== n) throw new Error(`${n} piles need ${n} scoring cards. The deck has ${scoring.length}.`);
  if (fin.length !== 1) throw new Error("Mark exactly one scoring card as final first.");
  if (events.length < n) throw new Error(`${n} piles need at least ${n} Event cards.`);
  const order = [...scoring.filter((c) => !c.final), fin[0]];
  let at = 0;
  game.deck.preparation.piles = order.map((sc, i) => {
    const take = Math.floor(events.length / n) + (i < events.length % n ? 1 : 0);
    const ev = events.slice(at, at + take); at += take;
    const size = ev.length + 1, last = i === n - 1;
    return { id: `p${i + 1}`, events: ev, scoring: sc.id, scoringPlacement: last ? { fromPosition: size, toPosition: size } : { fromPosition: Math.floor(size / 2) + 1, toPosition: size } };
  });
}

// A seeded shuffle that follows the preparation: one possible deck, top card first.
export function sampleDeck(game, seed = 1) {
  let s = seed >>> 0;
  const rnd = () => { s = (s + 0x6d2b79f5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  const out = [];
  for (const p of game.deck.preparation.piles) {
    const ev = [...p.events];
    for (let i = ev.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [ev[i], ev[j]] = [ev[j], ev[i]]; }
    const { fromPosition: f, toPosition: t } = p.scoringPlacement;
    const pos = f + Math.floor(rnd() * (t - f + 1));
    ev.splice(pos - 1, 0, p.scoring);
    out.push(...ev);
  }
  return out;
}
