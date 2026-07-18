import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { buildCreatureTaxonomy, creatureRoleBand, filterCreatures } from "../public/shared/creature-explorer.js";

const creatures = [
  { id: "a", name: "Lackey", front: "Changed", type: "Minion", tier: 1, sourceId: "campaign" },
  { id: "b", name: "Captain", front: "Changed", type: "Leader", tier: 1, sourceId: "campaign" },
  { id: "c", name: "Priest", front: "Changed", type: "Support", tier: 2, sourceId: "community" },
  { id: "d", name: "Wolf", front: "Wilds", type: "Skulk", tier: 1, sourceId: "srd" }
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

test("source filtering composes with tier filtering", () => {
  assert.deepEqual(filterCreatures(creatures, "all", "campaign").map((creature) => creature.id), ["a", "b"]);
  assert.deepEqual(filterCreatures(creatures, 1, "srd").map((creature) => creature.id), ["d"]);
  assert.deepEqual(buildCreatureTaxonomy(creatures, "all", "community").fronts.map((front) => front.label), ["Changed"]);
});

test("known Daggerheart roles fall into stable exploratory bands", () => {
  assert.equal(creatureRoleBand("Bruiser"), "Ranks and force");
  assert.equal(creatureRoleBand("Ranged"), "Tactics and command");
  assert.equal(creatureRoleBand("Controller"), "Other roles");
});

test("every authored adversary points only to known practical rules", async () => {
  const document = JSON.parse(await readFile(new URL("../data/adversaries.json", import.meta.url), "utf8"));
  const adversaries = document.adversaries;
  const rules = JSON.parse(await readFile(new URL("../data/daggerheart/rules.json", import.meta.url), "utf8")).nodes;
  const known = new Set(rules.map((rule) => rule.id));
  for (const adversary of adversaries) {
    assert.ok(adversary.ruleRefs.length >= 2, `${adversary.name} needs useful rule references`);
    assert.deepEqual(adversary.ruleRefs.filter((id) => !known.has(id)), [], `${adversary.name} has an unknown rule reference`);
  }
});

test("the bestiary contains the complete audited source snapshots", async () => {
  const document = JSON.parse(await readFile(new URL("../data/adversaries.json", import.meta.url), "utf8"));
  const bySource = Map.groupBy(document.adversaries, (adversary) => adversary.sourceId);
  assert.equal(document.adversaries.length, 153);
  assert.equal(bySource.get("daggerheart-srd-1.0")?.length, 129);
  assert.equal(bySource.get("julias-arsenal-cc-by-4.0")?.length, 12);
  assert.equal(bySource.get("vesserin")?.length, 12);
  assert.equal(new Set(document.adversaries.map((adversary) => adversary.id)).size, document.adversaries.length);

  const srdTiers = Map.groupBy(bySource.get("daggerheart-srd-1.0"), (adversary) => adversary.tier);
  assert.deepEqual([1, 2, 3, 4].map((tier) => srdTiers.get(tier)?.length), [52, 36, 23, 18]);
  assert.deepEqual(document.sources.map((source) => source.id), [
    "vesserin",
    "daggerheart-srd-1.0",
    "julias-arsenal-cc-by-4.0"
  ]);

  for (const adversary of document.adversaries) {
    assert.ok(adversary.name && adversary.front && adversary.sourceId);
    assert.ok(["Bruiser", "Horde", "Leader", "Minion", "Ranged", "Skulk", "Social", "Solo", "Standard", "Support"].includes(adversary.type));
    assert.ok(adversary.weapon?.name && adversary.weapon?.range && adversary.weapon?.damage);
    assert.ok(Array.isArray(adversary.features) && adversary.features.length > 0);
  }
});
