import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { TEMPLATES, templatesFor, instantiate, unmet, defaultRoles } from "../src/templates.mjs";
import { validate } from "../src/validate.mjs";

const base = () => JSON.parse(readFileSync(new URL("../examples/tan-war.game.json", import.meta.url), "utf8"));
const actionErrors = (g) => validate(g).errors.filter((e) => e.path.startsWith("/actions") || e.code === "schema");

test("every buildable template passes validation for each Tan War faction", () => {
  for (const f of base().factions) {
    for (const t of TEMPLATES) {
      const g = base();
      const a = instantiate(g, f.id, t.id);
      if (!a) { assert.ok(unmet(t, defaultRoles(g, f.id)), `${t.id}/${f.id} refused without a reason`); continue; }
      g.actions.push(a);
      (a.kind === "operation" ? g.factions.find((x) => x.id === f.id).operations : g.factions.find((x) => x.id === f.id).specialActivities).push(a.id);
      assert.deepEqual(actionErrors(g), [], `${t.id} for ${f.id}`);
    }
  }
});

test("template ids are unique and kinds are valid", () => {
  const ids = TEMPLATES.map((t) => t.id);
  assert.equal(new Set(ids).size, ids.length);
  for (const t of TEMPLATES) assert.ok(["operation", "specialActivity"].includes(t.kind));
  assert.ok(TEMPLATES.filter((t) => t.kind === "specialActivity").length >= 5);
});

test("a nonviolent faction gets non-fighting templates first", () => {
  const g = base();
  g.factions[1].type = "nonviolent";
  const list = templatesFor(g, g.factions[1].id).filter((x) => !x.reason && x.fit).map((x) => x.tpl.id);
  assert.ok(list.includes("campaign") && list.includes("propaganda"));
  assert.ok(!list.includes("strike") && !list.includes("sweep"));
});

test("templates that need missing pieces are refused with a reason", () => {
  const g = base();
  g.factions[1].pieces = g.factions[1].pieces.filter((p) => !p.isBase);
  assert.equal(instantiate(g, g.factions[1].id, "build"), null);
  assert.match(unmet(TEMPLATES.find((t) => t.id === "build"), defaultRoles(g, g.factions[1].id)), /base piece/);
});

test("instantiate makes unique ids and honors a custom name", () => {
  const g = base();
  const a = instantiate(g, "ira", "propaganda", "Pamphlet Drive");
  assert.equal(a.id, "ira.pamphlet-drive");
  g.actions.push(a);
  assert.equal(instantiate(g, "ira", "propaganda", "Pamphlet Drive").id, "ira.pamphlet-drive-2");
});
