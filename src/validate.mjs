// Validation of a coin-game definition: JSON Schema first, then semantic checks.
import Ajv2020 from "ajv/dist/2020.js";
import schema from "../schema/coin-game.schema.json" with { type: "json" };
import { scanExpr, VAR_OK } from "./expr.mjs";
import { deriveState, applyPatch } from "./state.mjs";
import { runCase, linkedOf } from "./dryrun.mjs";

const ajv = new Ajv2020({ allErrors: true, strict: false });
const schemaCheck = ajv.compile(schema);
const LOC_WORDS = new Set(["$space", "choose", "adjacent", "available", "outOfPlay"]);

const EDITORS = {
  meta: "Review", brief: "Research", factions: "Factions", actions: "Actions", board: "Board", tracks: "Setup",
  setup: "Setup", rules: "Rules", deck: "Deck", victory: "Victory", bots: "Bots"
};

export function validate(game) {
  const issues = [];
  const err = (code, path, message) => issues.push({ severity: "error", code, path, message, editor: EDITORS[path.split("/")[1]] ?? "Review" });
  const warn = (code, path, message) => issues.push({ severity: "warning", code, path, message, editor: EDITORS[path.split("/")[1]] ?? "Review" });

  if (!schemaCheck(game)) {
    for (const e of schemaCheck.errors) err("schema", e.instancePath || "/", `${e.message}${e.params?.additionalProperty ? `: ${e.params.additionalProperty}` : ""}`);
    return result(issues); // semantic checks need a well-formed document
  }

  const dup = (list, key, path) => {
    const seen = new Set();
    list.forEach((x, i) => { if (seen.has(x[key])) err("duplicate-id", `${path}/${i}`, `Duplicate id: ${x[key]}`); seen.add(x[key]); });
  };
  const ids = (list) => new Set(list.map((x) => x.id));

  const factionIds = ids(game.factions);
  const spaceIds = ids(game.board.spaces);
  const trackIds = ids(game.tracks);
  const actionById = Object.fromEntries(game.actions.map((a) => [a.id, a]));
  const pieces = game.factions.flatMap((f) => f.pieces.map((p) => ({ ...p, owner: f.id })));
  const pieceById = Object.fromEntries(pieces.map((p) => [p.id, p]));
  const cardById = Object.fromEntries(game.deck.cards.map((c) => [c.id, c]));
  const claimIds = ids(game.brief.claims);

  // ---- identity and counts
  if (game.meta.factionCount !== game.factions.length) err("faction-count", "/meta/factionCount", `meta.factionCount is ${game.meta.factionCount} but ${game.factions.length} factions exist`);
  for (const [list, key, path] of [[game.factions, "id", "/factions"], [game.board.spaces, "id", "/board/spaces"], [game.board.links, "id", "/board/links"], [game.tracks, "id", "/tracks"], [game.actions, "id", "/actions"], [game.deck.cards, "id", "/deck/cards"], [game.bots, "id", "/bots"], [game.brief.sources, "id", "/brief/sources"], [game.brief.claims, "id", "/brief/claims"], [pieces, "id", "/factions/pieces"]]) dup(list, key, path);

  // ---- factions
  game.factions.forEach((f, i) => {
    const p = `/factions/${i}`;
    if (!trackIds.has(f.resourceTrack)) err("missing-ref", `${p}/resourceTrack`, `Resource track not found: ${f.resourceTrack}`);
    for (const [list, kind] of [[f.operations, "operation"], [f.specialActivities, "specialActivity"]]) {
      for (const aid of list) {
        const a = actionById[aid];
        if (!a) err("missing-ref", `${p}/${kind}`, `Action not found: ${aid}`);
        else if (a.faction !== f.id) err("wrong-owner", `${p}/${kind}`, `Action ${aid} belongs to ${a.faction}, not ${f.id}`);
        else if (a.kind !== kind) err("wrong-kind", `${p}/${kind}`, `Action ${aid} is a ${a.kind}`);
      }
    }
    f.pieces.forEach((pc, j) => { if (!pc.states.includes(pc.defaultState)) err("bad-state", `${p}/pieces/${j}/defaultState`, `Default state ${pc.defaultState} is not in states`); });
  });
  if (new Set(game.factions.map((f) => f.symbol)).size !== game.factions.length) err("symbol-clash", "/factions", "Two factions share a symbol");
  if (new Set(game.factions.map((f) => f.color.toLowerCase())).size !== game.factions.length) err("color-clash", "/factions", "Two factions share a color");
  for (const a of game.actions) if (!factionIds.has(a.faction)) err("missing-ref", "/actions", `Action ${a.id} names unknown faction ${a.faction}`);

  // ---- board
  game.board.links.forEach((l, i) => {
    for (const end of [l.from, l.to]) if (!spaceIds.has(end)) err("missing-ref", `/board/links/${i}`, `Link ${l.id} names unknown space ${end}`);
    if (l.from === l.to) err("self-link", `/board/links/${i}`, `Link ${l.id} joins a space to itself`);
  });
  const pairs = new Set();
  game.board.links.forEach((l, i) => { const k = [l.from, l.to].sort().join("|"); if (pairs.has(k)) err("duplicate-link", `/board/links/${i}`, `Spaces ${l.from} and ${l.to} are linked twice`); pairs.add(k); });
  {
    const adj = {};
    for (const l of game.board.links) { (adj[l.from] ??= []).push(l.to); (adj[l.to] ??= []).push(l.from); }
    const first = game.board.spaces[0].id; const seen = new Set([first]); const q = [first];
    while (q.length) for (const n of adj[q.shift()] ?? []) if (!seen.has(n)) { seen.add(n); q.push(n); }
    for (const s of spaceIds) if (!seen.has(s)) err("disconnected", "/board/links", `Space ${s} cannot be reached by legal connections`);
  }
  for (const s of spaceIds) if (!game.board.presentation.positions[s]) err("no-position", "/board/presentation", `Space ${s} has no drawing position`);
  for (const s of Object.keys(game.board.presentation.positions)) if (!spaceIds.has(s)) err("missing-ref", "/board/presentation", `Position for unknown space ${s}`);

  // ---- tracks and setup
  game.tracks.forEach((t, i) => { if (t.start < t.min || t.start > t.max) err("range", `/tracks/${i}`, `Track ${t.id} start ${t.start} is outside ${t.min} to ${t.max}`); });
  for (const t of game.tracks) {
    const v = game.setup.tracks[t.id];
    if (v === undefined) err("missing-setup", "/setup/tracks", `Track ${t.id} has no setup value`);
    else if (v !== t.start) err("track-mismatch", "/setup/tracks", `Track ${t.id} setup value ${v} differs from track start ${t.start}`);
    else if (v < t.min || v > t.max) err("range", "/setup/tracks", `Track ${t.id} value ${v} is outside ${t.min} to ${t.max}`);
  }
  for (const k of Object.keys(game.setup.tracks)) if (!trackIds.has(k)) err("missing-ref", "/setup/tracks", `Setup sets unknown track ${k}`);
  for (const f of factionIds) if (game.setup.eligibility[f] === undefined) err("missing-setup", "/setup/eligibility", `No initial eligibility for ${f}`);
  for (const [sid, a] of Object.entries(game.setup.spaceAttributes ?? {})) {
    if (!spaceIds.has(sid)) err("missing-ref", "/setup/spaceAttributes", `Unknown space ${sid}`);
    if (a.opinion !== undefined && ![-1, 0, 1].includes(a.opinion)) err("range", `/setup/spaceAttributes/${sid}`, `Opinion ${a.opinion} must be -1, 0 or 1`);
  }
  const onBoard = {}; const perSpace = {};
  game.setup.placements.forEach((pl, i) => {
    const p = `/setup/placements/${i}`; const pc = pieceById[pl.piece];
    if (!spaceIds.has(pl.space)) err("missing-ref", p, `Placement names unknown space ${pl.space}`);
    if (!pc) { err("missing-ref", p, `Placement names unknown piece ${pl.piece}`); return; }
    if (!pc.states.includes(pl.state)) err("bad-state", p, `Piece ${pl.piece} has no state ${pl.state}`);
    onBoard[pl.piece] = (onBoard[pl.piece] ?? 0) + pl.count;
    const k = `${pl.piece}@${pl.space}`; perSpace[k] = (perSpace[k] ?? 0) + pl.count;
    if (pc.maxPerSpace && perSpace[k] > pc.maxPerSpace) err("stacking", p, `${pc.name} exceeds the limit of ${pc.maxPerSpace} in ${pl.space}`);
  });
  for (const pc of pieces) {
    const pool = game.setup.pools[pc.id];
    if (!pool) { err("missing-setup", "/setup/pools", `No pool counts for ${pc.id}`); continue; }
    const sum = (onBoard[pc.id] ?? 0) + pool.available + pool.outOfPlay;
    if (sum !== pc.supply) err("supply-mismatch", "/setup/pools", `${pc.name}: ${onBoard[pc.id] ?? 0} on board + ${pool.available} Available + ${pool.outOfPlay} Out of Play = ${sum}, supply is ${pc.supply}`);
  }
  for (const k of Object.keys(game.setup.pools)) if (!pieceById[k]) err("missing-ref", "/setup/pools", `Pool for unknown piece ${k}`);

  // ---- reference walkers for steps and expressions
  // scope.faction: inside an opponent table ($faction). scope.target: an action node picked an enemy ($target).
  const checkExpr = (e, path, scope = {}) => {
    const s = scanExpr(e);
    for (const v of s.vars) {
      const fv = /^(resources|eligible|score|margin)\.(.+)$/.exec(v);
      if (!VAR_OK.test(v)) err("bad-var", path, `Unknown variable ${v}${v === "other.resources" ? ". It was removed in 1.3.0: use resources.<faction> or rivals.maxResources" : ""}`);
      else if (v.startsWith("track.") && !trackIds.has(v.slice(6))) err("missing-ref", path, `Unknown track in ${v}`);
      else if (fv && !factionIds.has(fv[2])) err("missing-ref", path, `Unknown faction in ${v}`);
      else if (v.startsWith("$faction.") && !scope.faction) err("bad-var", path, `${v} works only in an opponent table`);
      else if (v.startsWith("$target.") && !scope.target) err("bad-var", path, `${v} needs an action node with a target table`);
    }
    for (const p of s.pieces) if (!pieceById[p]) err("missing-ref", path, `Unknown piece ${p}`);
    for (const f of s.factions ?? []) if (!factionIds.has(f)) err("missing-ref", path, `Unknown faction ${f}`);
  };
  // scope: { target: true } for steps that run with $target (an action node with parts and a target).
  const checkSteps = (steps, path, scope = {}) => {
    steps.forEach((st, i) => {
      const p = `${path}/${i}`;
      for (const k of ["piece", "fallbackPiece"]) if (st[k] && !pieceById[st[k]]) err("missing-ref", p, `Unknown piece ${st[k]}`);
      if (st.op === "track" && !trackIds.has(st.id)) err("missing-ref", p, `Unknown track ${st.id}`);
      if (st.op === "gain" && !trackIds.has(st.track)) err("missing-ref", p, `Unknown track ${st.track}`);
      for (const k of ["space", "to", "from"]) {
        const v = st[k];
        if (typeof v !== "string" || LOC_WORDS.has(v) || (st.op === "flip" && k !== "space")) continue;
        if (!spaceIds.has(v)) err("missing-ref", p, `Unknown space ${v}`);
      }
      const pc = pieceById[st.piece];
      if (pc) for (const k of st.op === "flip" ? ["from", "to", "state"] : ["state"]) if (st[k] !== undefined && !pc.states.includes(st[k])) err("missing-ref", p, `${pc.name} has no state ${st[k]}`);
      for (const k of ["test", "filter", "count", "amount"]) if (st[k] && typeof st[k] === "object") checkExpr(st[k], `${p}/${k}`, scope);
      if (st.then) checkSteps(st.then, `${p}/then`, scope);
      if (st.else) checkSteps(st.else, `${p}/else`, scope);
      if (st.options) {
        st.options.forEach((o, j) => checkSteps(o.steps, `${p}/options/${j}`, scope));
        // An option's faction is an enemy of the acting faction, and each enemy has at most one option.
        const seenF = new Set();
        st.options.forEach((o, j) => {
          if (o.faction === undefined) return;
          const op = `${p}/options/${j}/faction`;
          if (!factionIds.has(o.faction)) err("missing-ref", op, `Unknown faction ${o.faction}`);
          else if (o.faction === scope.owner) err("option-faction", op, `An option cannot act against its own faction ${o.faction}`);
          else if (seenF.has(o.faction)) err("option-faction", op, `Faction ${o.faction} has more than one option in this choice`);
          seenF.add(o.faction);
        });
      }
    });
  };

  // ---- actions
  game.actions.forEach((a, i) => {
    const p = `/actions/${i}`;
    if (!trackIds.has(a.cost.track)) err("missing-ref", `${p}/cost`, `Cost track not found: ${a.cost.track}`);
    else if (a.faction && game.factions.find((f) => f.id === a.faction)?.resourceTrack !== a.cost.track) warn("cost-track", `${p}/cost`, `Action ${a.id} is paid from ${a.cost.track}, not its faction's resource track`);
    if (a.kind === "specialActivity" && !a.timing) err("no-timing", p, `Special Activity ${a.id} needs a timing`);
    if (a.kind !== "specialActivity") for (const k of ["accompanies", "maxSpaces", "spaceText"]) if (a[k] !== undefined) err("sa-only", `${p}/${k}`, `${k} is for Special Activities only (${a.id})`);
    if (a.kind === "specialActivity" && Array.isArray(a.accompanies)) for (const id of a.accompanies) {
      const o = actionById[id];
      if (!o || o.kind !== "operation" || o.faction !== a.faction) err("missing-ref", `${p}/accompanies`, `${a.id} accompanies ${id}, which is not an Operation of ${a.faction}`);
    }
    checkExpr(a.targets, `${p}/targets`);
    checkSteps(a.steps, `${p}/steps`, { owner: a.faction });
    for (const d of a.dependsOn ?? []) {
      const known = pieceById[d] || trackIds.has(d) || d.startsWith("board.") || d.startsWith("die.");
      if (!known) err("missing-ref", `${p}/dependsOn`, `Dependency not found: ${d}`);
    }
  });

  // ---- sequence of play
  const seq = game.rules.sequence;
  for (const first of ["event", "operationSpecial", "operation", "pass"]) {
    if (!seq.secondActorOptions[first]?.length) err("incomplete-sequence", "/rules/sequence/secondActorOptions", `No second actor options after first actor choice "${first}"`);
  }
  for (const k of Object.keys(seq.secondActorOptions)) if (!seq.choices.includes(k)) err("bad-choice", "/rules/sequence/secondActorOptions", `Unknown choice ${k}`);
  for (const f of factionIds) if (seq.passGain[f] === undefined) err("missing-setup", "/rules/sequence/passGain", `No Pass gain for ${f}`);
  game.rules.scoring.phases.forEach((ph, i) => checkSteps(ph.steps, `/rules/scoring/phases/${i}/steps`));
  for (const ph of game.rules.scoring.phases) if (ph.steps.some((s) => s.op === "choose")) warn("scoring-choice", "/rules/scoring", `Phase ${ph.id} has a choice: confirm each bot has a rule for it`);

  // ---- deck
  const piles = game.deck.preparation.piles;
  const events = game.deck.cards.filter((c) => c.type === "event"); const scoring = game.deck.cards.filter((c) => c.type === "scoring");
  const used = {};
  const ranges = [];
  let offset = 0;
  piles.forEach((pl, i) => {
    const p = `/deck/preparation/piles/${i}`;
    for (const e of pl.events) { if (cardById[e]?.type !== "event") err("missing-ref", p, `Event card not found: ${e}`); used[e] = (used[e] ?? 0) + 1; }
    if (cardById[pl.scoring]?.type !== "scoring") err("missing-ref", p, `Scoring card not found: ${pl.scoring}`);
    used[pl.scoring] = (used[pl.scoring] ?? 0) + 1;
    const size = pl.events.length + 1;
    const { fromPosition: f, toPosition: t } = pl.scoringPlacement;
    if (f > t || t > size) err("bad-placement", `${p}/scoringPlacement`, `Placement ${f} to ${t} does not fit a pile of ${size}`);
    ranges.push([offset + f, offset + t, pl.scoring, size, offset]);
    offset += size;
  });
  for (const c of game.deck.cards) if ((used[c.id] ?? 0) !== 1) err("deck-composition", "/deck/cards", `Card ${c.id} appears ${used[c.id] ?? 0} times in the deck preparation (needs exactly 1)`);
  if (events.length === 0) err("deck-composition", "/deck/cards", "No Event cards");
  const finals = scoring.filter((c) => c.final);
  if (finals.length !== 1) err("final-card", "/deck/cards", `Exactly one scoring card must be final (found ${finals.length})`);
  else {
    const r = ranges.find((x) => x[2] === finals[0].id);
    if (r && !(r[0] === r[1] && r[0] === offset)) err("final-card", "/deck/preparation", `Final scoring card ${finals[0].id} must always be the last card of the deck`);
  }
  for (let i = 0; i < ranges.length; i++) for (let j = i + 1; j < ranges.length; j++) {
    for (let a = ranges[i][0]; a <= ranges[i][1]; a++) for (let b = ranges[j][0]; b <= ranges[j][1]; b++) {
      if (Math.abs(a - b) <= 1) { err("adjacent-scoring", "/deck/preparation", `Scoring cards ${ranges[i][2]} and ${ranges[j][2]} can be adjacent (positions ${a} and ${b})`); a = ranges[i][1] + 1; break; }
    }
  }
  game.deck.cards.forEach((c, i) => {
    const p = `/deck/cards/${i}`;
    if (c.order) {
      for (const f of c.order) if (!factionIds.has(f)) err("missing-ref", `${p}/order`, `Unknown faction ${f}`);
      if (new Set(c.order).size !== factionIds.size) err("card-order", `${p}/order`, `Card ${c.id} order must list each faction once`);
    } else err("card-order", p, `Card ${c.id} has no faction order`);
    if (c.type === "event") {
      if (c.sides?.length !== 2) err("card-sides", p, `Event ${c.id} needs unshaded and shaded sides`);
      (c.sides ?? []).forEach((s, j) => checkSteps(s.steps, `${p}/sides/${j}/steps`));
    }
    for (const cl of c.claimIds ?? []) if (!claimIds.has(cl)) err("missing-ref", `${p}/claimIds`, `Unknown claim ${cl}`);
  });

  // ---- faction count and solo play
  if (game.meta.factionCount !== game.factions.length) err("faction-count", "/meta/factionCount", `The game says ${game.meta.factionCount} factions but lists ${game.factions.length}`);
  const noBot = game.factions.filter((f) => !game.bots.some((b) => b.factionId === f.id));
  if (noBot.length > 1) warn("solo-coverage", "/bots", `Solo play needs a bot for every faction except the player's. No bot yet: ${noBot.map((f) => f.name).join(", ")}`);

  // ---- victory
  for (const f of factionIds) if (game.victory.perFaction.filter((v) => v.factionId === f).length !== 1) err("victory", "/victory/perFaction", `Faction ${f} needs exactly one victory entry`);
  game.victory.perFaction.forEach((v, i) => { if (!factionIds.has(v.factionId)) err("missing-ref", `/victory/perFaction/${i}`, `Unknown faction ${v.factionId}`); checkExpr(v.formula, `/victory/perFaction/${i}/formula`); });

  // ---- brief
  const srcIds = ids(game.brief.sources);
  game.brief.claims.forEach((c, i) => {
    for (const s of c.sourceIds ?? []) if (!srcIds.has(s)) err("missing-ref", `/brief/claims/${i}`, `Unknown source ${s}`);
    if (c.kind === "historical" && !(c.sourceIds?.length)) err("uncited", `/brief/claims/${i}`, `Historical claim ${c.id} has no source`);
    if (c.check?.verdict === "unsupported") warn("unsupported-claim", `/brief/claims/${i}`, `Claim ${c.id} is not supported by its sources: ${c.check.reason ?? ""}`.trim());
    const unread = (c.sourceIds ?? []).filter((id) => game.brief.sources.find((s) => s.id === id)?.status !== "read");
    if (c.kind === "historical" && c.sourceIds?.length && unread.length === c.sourceIds.length) warn("unread-source", `/brief/claims/${i}`, `Claim ${c.id} cites only sources that are not read yet: ${unread.join(", ")}`);
  });
  game.brief.sources.forEach((s, i) => {
    if (s.status === "read" && !s.readScope) warn("scope", `/brief/sources/${i}`, `Read source ${s.id} does not say how much was read`);
    if (s.status === "failed" && !s.failure) err("no-failure", `/brief/sources/${i}`, `Failed source ${s.id} needs a failure note`);
    if (s.status !== "read") warn("source-not-read", `/brief/sources/${i}`, `Source ${s.id} is ${s.status}`);
  });
  if (game.meta.status === "final" && !game.meta.confirmedAt) err("not-confirmed", "/meta", "A final revision needs confirmedAt");

  // ---- bots
  for (const f of factionIds) if (game.bots.filter((b) => b.factionId === f).length !== 1) err("bot-coverage", "/bots", `Faction ${f} needs exactly one bot`);
  const codes = game.bots.map((b) => b.code);
  codes.forEach((c, i) => { if (codes.indexOf(c) !== i) err("duplicate-code", `/bots/${i}/code`, `Bot code ${c} is used by more than one bot`); });
  game.bots.forEach((bot, bi) => validateBot(game, bot, `/bots/${bi}`, { err, warn, checkExpr, checkSteps, actionById, cardById, seq }));

  return result(issues);
}

function validateBot(game, bot, p, { err, warn, checkExpr, checkSteps, actionById, cardById, seq }) {
  const faction = game.factions.find((f) => f.id === bot.factionId);
  if (!faction) { err("missing-ref", p, `Bot ${bot.id} names unknown faction ${bot.factionId}`); return; }
  const nodes = Object.fromEntries(bot.nodes.map((n) => [n.id, n]));
  const tables = Object.fromEntries(bot.priorityTables.map((t) => [t.id, t]));
  if (Object.keys(nodes).length !== bot.nodes.length) err("duplicate-id", `${p}/nodes`, "Duplicate node id");
  if (Object.keys(tables).length !== bot.priorityTables.length) err("duplicate-id", `${p}/priorityTables`, "Duplicate table id");
  if (!nodes[bot.start]) err("missing-ref", `${p}/start`, `Start node not found: ${bot.start}`);
  bot.measures.forEach((m, i) => checkExpr(m.expr, `${p}/measures/${i}`));
  checkExpr(bot.eventPolicy.playIf, `${p}/eventPolicy/playIf`);
  bot.eventPolicy.overrides.forEach((o, i) => {
    const c = cardById[o.cardId];
    if (!c || c.type !== "event") err("missing-ref", `${p}/eventPolicy/overrides/${i}`, `Override names unknown Event card ${o.cardId}`);
    if (o.targets && o.directive !== "ignore") warn("solo", `${p}/eventPolicy/overrides/${i}`, `Event exception for ${o.cardId} names its targets in text only. The engine cannot read it: express the choice with the card's effects or a table.`);
    if (o.directive === "conditional") { if (!o.when) err("override", `${p}/eventPolicy/overrides/${i}`, `Conditional override for ${o.cardId} needs a "when" condition`); else checkExpr(o.when, `${p}/eventPolicy/overrides/${i}/when`); }
  });
  const ref = (id, path, what) => { if (!nodes[id]) err("missing-ref", path, `${what} not found: ${id}`); };
  const used = new Set();
  const outcomes = new Set();
  bot.nodes.forEach((n, i) => {
    const np = `${p}/nodes/${i}`;
    if (n.kind === "condition") {
      if (!n.test) err("incomplete-node", np, `Condition ${n.id} has no test`); else checkExpr(n.test, `${np}/test`);
      if (!n.yes || !n.no) err("incomplete-node", np, `Condition ${n.id} needs both a yes and a no branch`); else { ref(n.yes, np, "Yes branch"); ref(n.no, np, "No branch"); }
    } else if (n.kind === "event-check") {
      if (!n.yes || !n.no) err("incomplete-node", np, `Event check ${n.id} needs both branches`); else { ref(n.yes, np, "Yes branch"); ref(n.no, np, "No branch"); }
    } else if (n.kind === "action") {
      const a = actionById[n.action];
      if (!a) err("missing-ref", np, `Action not found: ${n.action}`);
      else if (a.faction !== bot.factionId || a.kind !== "operation") err("wrong-owner", np, `Node ${n.id} must use an Operation of ${bot.factionId}`);
      // Solo rule: a bot never asks the player to pick. Every action chooses its spaces through a table.
      // parts: each part chooses with its own space table; the node then has no table of its own.
      (n.parts ?? []).forEach((pt, j) => {
        const pp = `${np}/parts/${j}`;
        if (!tables[pt.table]) err("missing-ref", pp, `Part table not found: ${pt.table}`);
        else { used.add(pt.table); if (tables[pt.table].scope === "opponent") err("bad-target", pp, `Table ${pt.table} picks an enemy. A part chooses spaces with a space table`); }
        checkSteps(pt.steps, `${pp}/steps`, { target: n.target !== undefined });
      });
      if (n.parts) { if (n.table !== undefined) err("parts-table", np, `Action ${n.id} has parts, so it takes no table of its own: each part has its table`); }
      else if (!n.table) err("solo", np, `Action ${n.id} needs a priority table, so the choice needs no judgment`);
      else if (!tables[n.table]) err("missing-ref", np, `Priority table not found: ${n.table}`);
      else { used.add(n.table); if (tables[n.table].scope === "opponent") err("bad-target", np, `Table ${n.table} picks an enemy. Use it as the target table and choose spaces with a space table`); }
      if (n.target !== undefined) {
        if (!tables[n.target]) err("missing-ref", np, `Target table not found: ${n.target}`);
        else if (tables[n.target].scope !== "opponent") err("bad-target", np, `Target table ${n.target} must pick an enemy (scope: an enemy faction)`);
        else used.add(n.target);
      }
      if (!n.then || !n.onEmpty) err("incomplete-node", np, `Action ${n.id} needs "then" and "onEmpty" branches (empty target sets must have a next branch)`); else { ref(n.then, np, "Then branch"); ref(n.onEmpty, np, "Empty branch"); }
      // linked: one object (path .../linked) or a list (path .../linked/<i>). One timing per list.
      const list = Array.isArray(n.linked);
      linkedOf(n).forEach((L, j) => {
        const lp = list ? `${np}/linked/${j}` : np;
        const s = actionById[L.action];
        if (!s || s.kind !== "specialActivity" || s.faction !== bot.factionId) err("wrong-owner", lp, `Linked action ${L.action} must be a Special Activity of ${bot.factionId}`);
        else if (s.timing && s.timing !== "any" && s.timing !== L.timing) err("timing", lp, `Linked timing ${L.timing} conflicts with ${s.id} timing ${s.timing}`);
        if (s && Array.isArray(s.accompanies) && !s.accompanies.includes(n.action)) err("not-accompanying", lp, `${s.id} does not accompany ${n.action}`);
        if (j > 0 && L.timing !== n.linked[0].timing) err("linked-timing", lp, `Linked entries of ${n.id} must share one timing: ${L.timing} differs from ${n.linked[0].timing}`);
        if (!tables[L.table]) err("missing-ref", lp, `Linked table not found: ${L.table}`); else used.add(L.table);
        checkExpr(L.trigger, `${list ? lp : `${np}/linked`}/trigger`, { target: n.target !== undefined });
      });
    } else if (n.kind === "end") {
      if (!n.outcome) err("incomplete-node", np, `End node ${n.id} needs an outcome`); else outcomes.add(n.outcome);
      if (n.outcome === "pass" && !seq.choices.includes("pass")) err("pass-illegal", np, "Bot passes but the rules do not allow Pass");
    }
  });
  // Scoring choices: a known phase, a space table, and one scoring entry per phase over all bots.
  (bot.scoring ?? []).forEach((sc, i) => {
    const sp = `${p}/scoring/${i}`;
    if (!game.rules.scoring.phases.some((ph) => ph.id === sc.phaseId)) err("missing-ref", sp, `Scoring phase not found: ${sc.phaseId}`);
    if (!tables[sc.table]) err("missing-ref", sp, `Scoring table not found: ${sc.table}`);
    else { used.add(sc.table); if (tables[sc.table].scope === "opponent") err("bad-target", sp, `Table ${sc.table} picks an enemy. A scoring phase chooses spaces with a space table`); }
    const named = game.bots.flatMap((b) => (b.scoring ?? []).filter((x) => x.phaseId === sc.phaseId));
    if (named.length > 1) err("scoring-phase", sp, `Phase ${sc.phaseId} is named by ${named.length} scoring entries. One bot chooses in a phase, once`);
  });
  bot.priorityTables.forEach((t, i) => {
    const tp = `${p}/priorityTables/${i}`;
    // An opponent table reads $faction. A space table may read $target only if every node using it has a target.
    const users = tableUsers(bot, t.id);
    const scope = t.scope === "opponent" ? { faction: true } : { target: users.length > 0 && users.every((n) => n.target !== undefined) };
    t.steps.forEach((s, j) => checkExpr(s.filter, `${tp}/steps/${j}`, scope));
    t.steps.forEach((s, j) => { if (s.n !== j + 1) err("numbering", tp, `Table ${t.id} steps must be numbered 1, 2, 3 in order`); });
    t.tiebreak.forEach((tb, j) => { checkExpr(tb.key, `${tp}/tiebreak/${j}`, scope); if (tb.letter !== String.fromCharCode(97 + j)) err("numbering", tp, `Table ${t.id} tie-breaks must be lettered a, b, c in order`); });
    if (t.select === "all" && !t.limit) err("unbounded", tp, `Table ${t.id} selects all targets without a limit`);
    if (!used.has(t.id)) warn("unused-table", tp, `Table ${t.id} is never used`);
  });
  // reachability, termination, cycles
  const next = (n) => n.kind === "condition" || n.kind === "event-check" ? [n.yes, n.no] : n.kind === "action" ? [n.then, n.onEmpty] : [];
  const reach = new Set(); const stack = [bot.start];
  while (stack.length) { const id = stack.pop(); if (reach.has(id) || !nodes[id]) continue; reach.add(id); stack.push(...next(nodes[id]).filter(Boolean)); }
  for (const n of bot.nodes) if (!reach.has(n.id)) err("unreachable", p, `Node ${n.id} cannot be reached from ${bot.start}`);
  const color = {};
  const dfs = (id) => {
    if (!nodes[id]) return;
    if (color[id] === 1) { err("cycle", p, `Decision loop through node ${id} has no explicit limit`); return; }
    if (color[id] === 2) return;
    color[id] = 1; for (const nx of next(nodes[id]).filter(Boolean)) dfs(nx); color[id] = 2;
  };
  dfs(bot.start);
  if (![...outcomes].some((o) => o === "pass")) warn("no-pass", p, "No branch ends in Pass: confirm a legal fallback exists");
  if (!bot.nodes.some((n) => n.kind === "end" && n.outcome === "none")) err("no-ineligible-path", p, "No end node for an Ineligible turn");
  // dry runs
  const needed = ["ineligible", "event-override", "no-target", "tie", "linked-sa", "fallback"];
  for (const c of needed) if (!bot.dryRuns.some((d) => d.case === c)) err("dry-run-missing", `${p}/dryRuns`, `No dry run for case "${c}"`);
  const base = deriveState(game, bot.factionId);
  bot.dryRuns.forEach((d, i) => {
    const dp = `${p}/dryRuns/${i}`;
    let r;
    try { r = runCase(game, bot, applyPatch(base, d.patch), d.case); } catch (e) { err("dry-run-error", dp, `${d.id}: ${e.message}`); return; }
    const x = d.expect; const miss = [];
    if (r.outcome !== x.outcome) miss.push(`outcome ${r.outcome}, expected ${x.outcome}`);
    if (x.path && JSON.stringify(r.path) !== JSON.stringify(x.path)) miss.push(`path ${r.path.join(">")}, expected ${x.path.join(">")}`);
    if (x.target !== undefined && r.target !== x.target) miss.push(`target ${r.target ?? "none"}, expected ${x.target}`);
    if (x.chosen && JSON.stringify(r.chosen) !== JSON.stringify(x.chosen)) miss.push(`chosen ${r.chosen}, expected ${x.chosen}`);
    if (x.side && r.side !== x.side) miss.push(`side ${r.side}, expected ${x.side}`);
    if (x.linked && r.linked !== x.linked) miss.push(`linked ${r.linked}, expected ${x.linked}`);
    if (miss.length) err("dry-run-mismatch", dp, `${d.id}: ${miss.join("; ")}`);
  });
}

// What chooses with a table: nodes (as the node's table or a linked entry's table) and scoring
// entries. A scoring entry has no target, so a table it uses may not read $target.
export const tableUsers = (bot, id) => [...bot.nodes.filter((n) => n.table === id || linkedOf(n).some((L) => L.table === id) || (n.parts ?? []).some((pt) => pt.table === id)), ...(bot.scoring ?? []).filter((sc) => sc.table === id)];

function result(issues) {
  return { ok: !issues.some((i) => i.severity === "error"), errors: issues.filter((i) => i.severity === "error"), warnings: issues.filter((i) => i.severity === "warning") };
}

// Rename an id everywhere it appears as an exact string value or object key.
export function renameId(game, oldId, newId) {
  const walk = (x) => {
    if (typeof x === "string") {
      if (x === oldId) return newId;
      // dry-run paths and linked results look like "<id>:empty" or "<id>:space"
      if (x.startsWith(`${oldId}:`)) return `${newId}${x.slice(oldId.length)}`;
      return x;
    }
    if (Array.isArray(x)) return x.map(walk);
    if (x && typeof x === "object") return Object.fromEntries(Object.entries(x).map(([k, v]) => [k === oldId ? newId : k, walk(v)]));
    return x;
  };
  return walk(game);
}
