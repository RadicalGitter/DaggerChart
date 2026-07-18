import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { buildCreatureTaxonomy, creatureRoleBand, filterCreatures } from "../public/shared/creature-explorer.js";

const creatures = [
  { id: "a", name: "Lackey", front: "Changed", type: "Minion", tier: 1 },
  { id: "b", name: "Captain", front: "Changed", type: "Leader", tier: 1 },
  { id: "c", name: "Priest", front: "Changed", type: "Support", tier: 2 },
  { id: "d", name: "Wolf", front: "Wilds", type: "Skulk", tier: 1 }
];

test("creature taxonomy descends from fronts through existing adversary roles", () => {
  const tree = buildCreatureTaxonomy(creatures);
  assert.deepEqual(tree.fronts.map((front) => front.label), ["Changed", "Wilds"]);
  const changed = tree.fronts[0];
  assert.equal(changed.count, 3);
  assert.deepEqual(changed.roles.map((role) => role.label), ["Minion", "Leader", "Support"]);
  assert.deepEqual(changed.groups.map((group) => group.label), ["Ranks and force", "Tactics and command"]);
});

test("tier filtering preserves authored front and role categories", () => {
  assert.deepEqual(filterCreatures(creatures, 2).map((creature) => creature.id), ["c"]);
  const tree = buildCreatureTaxonomy(creatures, 2);
  assert.deepEqual(tree.fronts.map((front) => front.label), ["Changed"]);
  assert.deepEqual(tree.fronts[0].roles.map((role) => role.label), ["Support"]);
  assert.deepEqual(tree.tiers, [1, 2]);
});

test("known Daggerheart roles fall into stable exploratory bands", () => {
  assert.equal(creatureRoleBand("Bruiser"), "Ranks and force");
  assert.equal(creatureRoleBand("Ranged"), "Tactics and command");
  assert.equal(creatureRoleBand("Controller"), "Other roles");
});

test("every authored adversary points only to known practical rules", async () => {
  const adversaries = JSON.parse(await readFile(new URL("../data/adversaries.json", import.meta.url), "utf8")).adversaries;
  const rules = JSON.parse(await readFile(new URL("../data/daggerheart/rules.json", import.meta.url), "utf8")).nodes;
  const known = new Set(rules.map((rule) => rule.id));
  for (const adversary of adversaries) {
    assert.ok(adversary.ruleRefs.length >= 2, `${adversary.name} needs useful rule references`);
    assert.deepEqual(adversary.ruleRefs.filter((id) => !known.has(id)), [], `${adversary.name} has an unknown rule reference`);
  }
});
