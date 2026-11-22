import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { validate } from "../src/validate.mjs";
import { migrate, LATEST } from "../src/migrate.mjs";
import { applyAction } from "../src/effects.mjs";
import { stepText } from "../src/plain.mjs";
import { instantiate, TEMPLATES } from "../src/templates.mjs";
import { blankGame } from "../src/blank.mjs";
import { deriveState } from "../src/state.mjs";

// Schema 1.6.0: an action can be used against any enemy. A choice option may name the enemy faction
// it acts against (option.faction); a bot whose action node picked an enemy takes that option.
const read = (rel) => JSON.parse(readFileSync(new URL(rel, import.meta.url), "utf8"));
const codes = (g) => validate(g).errors.map((e) => e.code);
const three = () => { const g = blankGame(3); g.meta.factionCount = 3; return g; };

test("the latest version is 1.6.0", () => { assert.equal(LATEST, "coin-game/1.6.0"); });

test("a frozen 1.5.0 file migrates to 1.6.0, only its version changes, and it validates", () => {
  const old = read("./fixtures/tan-war.1.5.0.game.json");
  assert.equal(old.meta.schemaVersion, "coin-game/1.5.0");
  const m = migrate(old);
  assert.equal(m.meta.schemaVersion, "coin-game/1.6.0");
  assert.deepEqual(validate(m).errors, []);
  m.meta.schemaVersion = old.meta.schemaVersion; assert.deepEqual(m, old);
});

// A template that needs an enemy builds one option per enemy faction, so the action works against anyone.
const strike = (g) => instantiate(g, g.factions[1].id, "strike");
test("an enemy template builds one choice option per enemy faction, with no enemy chosen in advance", () => {
  const g = three(); const a = strike(g); const enemies = g.factions.filter((f) => f.id !== a.faction);
  assert.equal(a.steps.length, 1); assert.equal(a.steps[0].op, "choose");
  assert.deepEqual(a.steps[0].options.map((o) => o.faction), enemies.map((f) => f.id));
  for (const [i, f] of enemies.entries()) {
    assert.equal(a.steps[0].options[i].label, `Against ${f.name}`);
    assert.ok(JSON.stringify(a.steps[0].options[i].steps).includes(f.pieces.find((p) => !p.isBase).id));
  }
  assert.equal(a.targets.op, "or");
  for (const f of enemies) assert.ok(a.plain.includes(`Against ${f.name}`));
  g.actions.push(a);
  assert.deepEqual(validate(g).errors.filter((e) => e.path.startsWith("/actions")), [], "a blank game still lacks a deck; the action itself is valid");
});
test("with one enemy an enemy template stays a plain list of steps", () => {
  const g = blankGame(2); const a = strike(g);
  assert.notEqual(a.steps[0].op, "choose");
});
test("a template refuses only when no enemy can be its target", () => {
  const g = three(); for (const f of g.factions.slice(1)) f.pieces = f.pieces.filter((p) => p.isBase);
  assert.equal(instantiate(g, g.factions[0].id, "suppress"), null);
});

test("an option's faction must be an enemy, and each enemy appears once in a choice", () => {
  const g = three(); const a = strike(g); g.actions.push(a);
  const opts = a.steps[0].options;
  opts[0].faction = "nobody"; assert.ok(codes(g).includes("missing-ref"));
  opts[0].faction = a.faction; assert.ok(codes(g).includes("option-faction"));
  opts[0].faction = opts[1].faction; assert.ok(codes(g).includes("option-faction"));
});

test("a choice runs the option for the action's target, else the first option", () => {
  const g = three(); const [own, e1, e2] = g.factions; const t = (fid) => ({ op: "track", id: `res.${fid}`, delta: 1 });
  const step = { op: "choose", options: [{ label: "A", faction: e1.id, steps: [t(e1.id)] }, { label: "B", faction: e2.id, steps: [t(e2.id)] }] };
  for (const [target, hit] of [[e2.id, e2.id], [undefined, e1.id]]) {
    const state = deriveState(g, own.id), before = state.tracks[`res.${hit}`];
    applyAction(g, state, { steps: [step] }, [g.board.spaces[0].id], target ? { $target: target } : {}, { pay: false });
    assert.equal(state.tracks[`res.${hit}`], before + 1, String(target));
  }
});

test("plain text names the enemy of each option", () => {
  const g = three(); const a = strike(g);
  assert.match(stepText(a.steps[0], g), /^Choose an enemy faction: Against /);
});
