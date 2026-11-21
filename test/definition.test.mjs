import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import YAML from "yaml";
import { validate, renameId } from "../src/validate.mjs";
import { deriveState, applyPatch } from "../src/state.mjs";
import { runBot } from "../src/dryrun.mjs";
import { aidModel, toMarkdown, toMermaid, toPolicyYaml, tableLabels } from "../src/botaid.mjs";

const load = () => JSON.parse(readFileSync(new URL("../examples/tan-war.game.json", import.meta.url), "utf8"));
const codes = (g) => validate(g).errors.map((e) => e.code);

test("the example definition is valid and only warns about the pending source", () => {
  const r = validate(load());
  assert.equal(r.ok, true, JSON.stringify(r.errors));
  assert.deepEqual(r.warnings.map((w) => w.code), ["source-not-read"]);
});

test("schema rejects an unknown key", () => {
  const g = load(); g.meta.surprise = 1;
  assert.ok(codes(g).includes("schema"));
});

test("a link to a deleted space is reported with its path", () => {
  const g = load(); g.board.spaces = g.board.spaces.filter((s) => s.id !== "kerry");
  const e = validate(g).errors.find((x) => x.code === "missing-ref" && x.path.startsWith("/board/links"));
  assert.ok(e, "expected a missing-ref on a link");
  assert.equal(e.editor, "Board");
});

test("supply mismatch shows the sum", () => {
  const g = load(); g.setup.pools["ira.volunteer"].available = 4;
  const e = validate(g).errors.find((x) => x.code === "supply-mismatch");
  assert.match(e.message, /9 on board \+ 4 Available \+ 2 Out of Play = 15, supply is 16/);
});

test("stacking limit on bases is enforced", () => {
  const g = load(); g.setup.placements.push({ space: "dublin", piece: "crown.barracks", state: "normal", count: 1 });
  g.setup.pools["crown.barracks"].available = 1;
  assert.ok(codes(g).includes("stacking"));
});

test("disconnected board is reported", () => {
  const g = load(); g.board.links = g.board.links.filter((l) => l.to !== "cork-city");
  assert.ok(codes(g).includes("disconnected"));
});

test("deck: duplicate card, missing final card position and adjacent scoring are caught", () => {
  let g = load(); g.deck.preparation.piles[1].events.push("e01");
  assert.ok(codes(g).includes("deck-composition"));
  g = load(); g.deck.preparation.piles[1].scoringPlacement = { fromPosition: 1, toPosition: 1 };
  assert.ok(codes(g).includes("final-card"));
  g = load(); g.deck.preparation.piles[0].scoringPlacement = { fromPosition: 5, toPosition: 5 };
  g.deck.preparation.piles[1].scoringPlacement = { fromPosition: 5, toPosition: 5 };
  assert.equal(codes(g).includes("adjacent-scoring"), false, "5 and 10 are not adjacent");
});

test("a scoring card that could sit next to another is rejected", () => {
  const g = load();
  g.deck.preparation.piles[0].events.pop(); // pile 1 now 4 cards: 3 events + scoring
  g.deck.cards = g.deck.cards.filter((c) => c.id !== "e04");
  g.deck.preparation.piles[0].scoringPlacement = { fromPosition: 4, toPosition: 4 };
  g.deck.preparation.piles[1].events = ["e05", "e06", "e07", "e08"];
  g.deck.preparation.piles[1].scoringPlacement = { fromPosition: 1, toPosition: 5 };
  assert.ok(codes(g).includes("adjacent-scoring"));
});

test("sequence table must be complete", () => {
  const g = load(); delete g.rules.sequence.secondActorOptions.operation;
  assert.ok(codes(g).includes("incomplete-sequence"));
});

test("final status needs confirmation", () => {
  const g = load(); g.meta.status = "final";
  assert.ok(codes(g).includes("not-confirmed"));
});

test("historical claims need a source", () => {
  const g = load(); delete g.brief.claims[0].sourceIds;
  assert.ok(codes(g).includes("uncited"));
});

test("bot graph: unreachable node, loop and missing branch are reported", () => {
  let g = load(); g.bots[0].nodes.push({ id: "cw.orphan", kind: "end", text: "x", outcome: "pass" });
  assert.ok(codes(g).includes("unreachable"));
  g = load(); g.bots[0].nodes.find((n) => n.id === "cw.sweep").onEmpty = "cw.start";
  assert.ok(codes(g).includes("cycle"));
  g = load(); delete g.bots[0].nodes.find((n) => n.id === "cw.sweep").onEmpty;
  assert.ok(codes(g).includes("incomplete-node"));
});

test("bot tables: unbounded select-all and bad lettering are reported", () => {
  let g = load(); delete g.bots[0].priorityTables[0].limit;
  assert.ok(codes(g).includes("unbounded"));
  g = load(); g.bots[0].priorityTables[1].tiebreak[0].letter = "b";
  assert.ok(codes(g).includes("numbering"));
});

test("bot cannot use another faction's action", () => {
  const g = load(); g.bots[0].nodes.find((n) => n.id === "cw.sweep").action = "ira.march";
  assert.ok(codes(g).includes("wrong-owner"));
});

test("event override must name a real Event card and a conditional needs a condition", () => {
  let g = load(); g.bots[0].eventPolicy.overrides[0].cardId = "e99";
  assert.ok(codes(g).includes("missing-ref"));
  g = load(); delete g.bots[0].eventPolicy.overrides[0].when;
  assert.ok(codes(g).includes("override"));
});

test("every bot has all six required dry-run cases and they pass", () => {
  const g = load();
  for (const bot of g.bots) {
    assert.deepEqual([...new Set(bot.dryRuns.map((d) => d.case))].sort(), ["event-override", "fallback", "ineligible", "linked-sa", "no-target", "tie"]);
  }
  const bad = load(); bad.bots[1].dryRuns[2].expect.chosen = ["dublin"];
  assert.ok(codes(bad).includes("dry-run-mismatch"));
  const missing = load(); missing.bots[0].dryRuns = missing.bots[0].dryRuns.filter((d) => d.case !== "tie");
  assert.ok(codes(missing).includes("dry-run-missing"));
});

test("same state and same die give the same result; a different die changes a tie", () => {
  const g = load(); const bot = g.bots[0]; const base = deriveState(g, "crown");
  const tieCase = bot.dryRuns.find((d) => d.case === "tie").patch;
  const a = runBot(g, bot, applyPatch(base, tieCase));
  const b = runBot(g, bot, applyPatch(base, tieCase));
  assert.deepEqual(a, b);
  const other = runBot(g, bot, applyPatch(base, { ...tieCase, dice: [5] }));
  assert.deepEqual(a.chosen, ["belfast"]);
  assert.deepEqual(other.chosen, ["cork-city"]);
});

test("a tie without an explicit die is an error, not a guess", () => {
  const g = load(); const bot = g.bots[0]; const base = deriveState(g, "crown");
  const tieCase = { ...bot.dryRuns.find((d) => d.case === "tie").patch, dice: [] };
  assert.throws(() => runBot(g, bot, applyPatch(base, tieCase)), /die roll is needed/);
});

test("renaming a space, a piece and a node keeps the definition valid", () => {
  let g = load();
  g = renameId(g, "dublin", "dublin-city");
  g = renameId(g, "crown.army", "crown.troops");
  g = renameId(g, "cw.crack", "cw.crackdown-step");
  const r = validate(g);
  assert.equal(r.ok, true, JSON.stringify(r.errors));
});

test("aid, flowchart and policy export describe the same decisions", () => {
  const g = load();
  for (const bot of g.bots) {
    const model = aidModel(g, bot);
    const md = toMarkdown(model);
    const mmd = toMermaid(bot);
    const yaml = YAML.parse(toPolicyYaml(g, bot));
    const nonEnd = bot.nodes.filter((n) => n.kind !== "end");
    assert.equal(model.steps.length, nonEnd.length, "one printed step per decision node");
    for (const n of bot.nodes) assert.ok(mmd.includes(n.id.replace(/[^a-z0-9]/gi, "_")), `flowchart has ${n.id}`);
    for (const label of Object.values(tableLabels(bot))) assert.ok(md.includes(`Table ${label}`), `aid has table ${label}`);
    for (const o of bot.eventPolicy.overrides) assert.ok(md.includes(o.cardId.toUpperCase()), `aid has exception ${o.cardId}`);
    assert.deepEqual(yaml.policy.nodes, bot.nodes);
    assert.deepEqual(yaml.policy.priorityTables, bot.priorityTables);
    assert.deepEqual(yaml.policy.eventPolicy, bot.eventPolicy);
    assert.ok(md.split("\n").length <= 150, "aid fits three pages");
  }
});

test("print kit files build from the definition and mention every space, card and piece", async () => {
  const { buildFiles } = await import("../src/kit.mjs");
  const { toMermaid, toMarkdown, toPolicyYaml } = await import("../src/botaid.mjs");
  const g = load();
  const files = Object.fromEntries(buildFiles(g, { toMermaid, toMarkdown, toPolicyYaml }));
  const all = Object.values(files).join("\n");
  for (const s of g.board.spaces) assert.ok(files["kit/tan-war.setup-sheet.md"].includes(s.name), `setup sheet has ${s.name}`);
  for (const c of g.deck.cards) assert.ok(files["kit/tan-war.cards.html"].includes(c.title), `cards has ${c.title}`);
  for (const f of g.factions) for (const p of f.pieces) assert.ok(files["kit/tan-war.components.md"].includes(`${p.supply} |`), `checklist has ${p.id}`);
  assert.ok(files["kit/tan-war.board.svg"].startsWith("<svg"));
  assert.ok(files["kit/tan-war.rulebook.md"].includes("DRAFT"));
  assert.ok(Object.keys(files).length >= 17);
  assert.equal(all.includes("—"), false, "no em dashes in generated text");
});
