import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { domainCardEntitlement, isEligibleDomainCard } from "../public/shared/domain-card-rules.js";
import { claimOwedDomainCard, updateOwnedDomainCards } from "../server/domain-cards.js";

const reference = JSON.parse(await readFile(new URL("../data/daggerheart/reference.json", import.meta.url), "utf8"));
const wizard = reference.classes.find((entry) => entry.id === "core_class_wizard");
const knowledge = wizard.subclasses.find((entry) => entry.id === "core_subclass_school_of_knowledge");
const wizardCards = reference.domainCards.filter((card) => wizard.domains.includes(card.domain));

function character(overrides = {}) {
  return {
    level: 1,
    class: { id: wizard.id, name: wizard.name, domains: wizard.domains },
    subclass: { id: knowledge.id, name: knowledge.name },
    features: { foundation: knowledge.foundation },
    domainCards: wizardCards.filter((card) => card.level === 1).slice(0, 2).map((card) => ({ ...card, location: "loadout" })),
    ...overrides
  };
}

test("domain-card entitlement follows level and active subclass grants", () => {
  const levelOne = domainCardEntitlement(character(), reference);
  assert.equal(levelOne.base, 2);
  assert.equal(levelOne.expected, 3);
  assert.equal(levelOne.missing, 1);
  assert.deepEqual(levelOne.subclassGrants.map((grant) => grant.name), ["Prepared"]);

  const levelFour = domainCardEntitlement(character({ level: 4 }), reference);
  assert.equal(levelFour.base, 5);
  assert.equal(levelFour.expected, 6);
});

test("specialization grants count only after that subclass tier is active", () => {
  const foundationOnly = domainCardEntitlement(character({ level: 5 }), reference);
  const specialized = domainCardEntitlement(character({
    level: 5,
    features: { foundation: knowledge.foundation, specialization: knowledge.specialization }
  }), reference);
  assert.equal(specialized.expected, foundationOnly.expected + 1);
  assert.equal(specialized.subclassGrants.at(-1).name, "Accomplished");
});

test("owed card claims enforce domain, level, ownership, and loadout capacity", () => {
  const pc = character();
  const eligible = wizardCards.find((card) => card.level === 1 && !pc.domainCards.some((owned) => owned.id === card.id));
  assert.equal(isEligibleDomainCard(pc, eligible), true);
  const claimed = claimOwedDomainCard(pc, reference, eligible.id);
  assert.equal(claimed.location, "loadout");
  assert.equal(domainCardEntitlement(pc, reference).missing, 0);
  assert.throws(() => claimOwedDomainCard(pc, reference, eligible.id), /no unclaimed domain cards/);

  const highLevel = wizardCards.find((card) => card.level > 1);
  assert.equal(isEligibleDomainCard(character(), highLevel), false);
  const otherDomain = reference.domainCards.find((card) => !wizard.domains.includes(card.domain));
  assert.equal(isEligibleDomainCard(character(), otherDomain), false);

  const fullLoadout = character({
    domainCards: wizardCards.filter((card) => card.level === 1).slice(0, 5).map((card) => ({ ...card, location: "loadout" })),
    advancements: { additionalDomainCards: 3 }
  });
  const vaultChoice = wizardCards.find((card) => card.level === 1 && !fullLoadout.domainCards.some((owned) => owned.id === card.id));
  assert.equal(claimOwedDomainCard(fullLoadout, reference, vaultChoice.id).location, "vault");
});

test("ordinary sheet updates cannot smuggle in a new or rewritten card", () => {
  const pc = character();
  const moved = updateOwnedDomainCards(pc, [{ ...pc.domainCards[0], name: "Changed", location: "vault" }]);
  assert.equal(moved[0].name, pc.domainCards[0].name);
  assert.equal(moved[0].location, "vault");
  assert.throws(() => updateOwnedDomainCards(pc, [{ id: "unknown", location: "loadout" }]), /acquire a new card/);
});
