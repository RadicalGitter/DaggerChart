import test from "node:test";
import assert from "node:assert/strict";
import { characterClassChoiceView, confirmCharacterClassChoice } from "../server/character-class-choice.js";
import { INVENTOR } from "../server/inventor-definition.js";
import { CLASS_CHOICE_DEFINITIONS, privateClassIdentity } from "../server/class-choice-definitions.js";

const offer = { id: "test-offer", pcId: "pc_target", version: "1", definitions: [{ id: INVENTOR.id, version: INVENTOR.version }], expectedClassId: "core_class_seraph", expectedSubclassId: "core_subclass_winged_sentinel", expectedLevel: 1, recommendedTrait: "Presence" };
const document = { offers: [offer] };
const character = () => ({
  id: "pc_target", name: "Synthetic inventor", campaignId: "cmp_test", level: 1,
  class: { id: "core_class_seraph", name: "Seraph", domains: ["SPLENDOR", "VALOR"] },
  subclass: { id: "core_subclass_winged_sentinel", name: "Winged Sentinel", spellcastTrait: "Strength" },
  traits: { Agility: 1, Strength: 0, Finesse: 0, Instinct: 1, Presence: 2, Knowledge: -1 },
  evasion: 8, hpMax: 8, hp: 3, stressMax: 6, stress: 4, hopeMax: 6, hope: 2,
  armorMarked: 2, thresholds: { major: 8, severe: 16 },
  weapons: { primary: { id: "dummy-scepter", damage: "d6", trait: "Presence" } },
  armor: { score: 3, feature: "Dummy gear modifier" },
  domainCards: [{ id: "dummy-mending", location: "vault" }, { id: "dummy-push", location: "loadout" }],
  inventory: [{ id: "dummy-paper", kind: "paper", text: "PRIVATE_INVENTORY" }],
  features: { hopeFeature: { name: "Life Support" }, classFeatures: [{ name: "Prayer Dice" }], foundation: [{ name: "Wings of Light" }], ancestry: [{ name: "Thick Skin" }], community: [{ name: "Steady" }] },
  hidden: { notes: "PRIVATE_PC_SENTINEL" }
});
const selection = (choiceId = INVENTOR.subclasses[0].id) => ({ offerId: offer.id, version: offer.version, confirmed: true, choiceId, trait: "Presence", familiarMaterials: ["Aspträ", "Smidesjärn"] });

test("offers are targeted, versioned, read-only and exclude stored private data", () => {
  const pc = character();
  const before = structuredClone(pc);
  const view = characterClassChoiceView(pc, document);
  assert.equal(view.status, "pending");
  assert.equal(view.definitions[0].subclasses.length, 2);
  assert.ok(view.definitions[0].classFeatures.every((f) => f.sv.text));
  assert.equal(JSON.stringify(view).includes("PRIVATE_"), false);
  assert.deepEqual(pc, before);
  assert.equal(characterClassChoiceView({ ...pc, id: "pc_other" }, document), null);
  assert.equal(characterClassChoiceView({ ...pc, level: 2 }, document), null);
  assert.equal(characterClassChoiceView(pc, { offers: [{ ...offer, active: false }] }), null);
  assert.throws(() => characterClassChoiceView(pc, { offers: [{ ...offer, definitions: [{ id: INVENTOR.id, version: "stale" }] }] }), /GM review/);
});

for (const subclass of INVENTOR.subclasses) {
  test(`${subclass.name} adoption replaces only class rules and preserves played state`, () => {
    const pc = character();
    const before = structuredClone(pc);
    const next = confirmCharacterClassChoice(pc, document, selection(subclass.id), "2026-10-13T12:00:00Z");
    assert.deepEqual(pc, before);
    assert.equal(next.class.id, INVENTOR.id);
    assert.equal(next.subclass.id, subclass.id);
    assert.equal(next.subclass.spellcastTrait, "Presence");
    assert.equal(next.subclass.tier, "foundation");
    assert.deepEqual(next.features.foundation, subclass.foundation);
    assert.deepEqual(next.features.specialization, []);
    assert.deepEqual(next.features.mastery, []);
    assert.deepEqual(next.features.ancestry, before.features.ancestry);
    assert.deepEqual(next.features.community, before.features.community);
    for (const key of ["id", "name", "campaignId", "level", "traits", "evasion", "hpMax", "hp", "stressMax", "stress", "hopeMax", "hope", "armorMarked", "thresholds", "weapons", "armor", "inventory", "domainCards", "hidden"]) assert.deepEqual(next[key], before[key], key);
    assert.deepEqual(next.classChoice.previous.features, before.features);
    assert.equal(next.classChoiceHistory.length, 1);
    assert.equal(characterClassChoiceView(next, document).status, "confirmed");
    const played = { ...next, hp: 4, hope: 1 };
    assert.equal(confirmCharacterClassChoice(played, document, selection(subclass.id)), played);
    assert.equal(played.hp, 4);
    assert.throws(() => confirmCharacterClassChoice(next, document, selection("keep-current")), /already been confirmed/);
  });
}

test("keeping the existing class resolves the offer without changing rules or resources", () => {
  const pc = character();
  const next = confirmCharacterClassChoice(pc, document, selection("keep-current"));
  const { classChoice, classChoiceHistory, ...rest } = next;
  assert.deepEqual(rest, pc);
  assert.equal(classChoice.selection.choiceId, "keep-current");
  assert.equal(characterClassChoiceView(next, document), null);
  assert.equal(confirmCharacterClassChoice(next, document, selection("keep-current")), next);
});

test("unconfirmed, stale, unoffered and malformed choices never mutate the PC", () => {
  const pc = character();
  const before = structuredClone(pc);
  for (const input of [
    { ...selection(), confirmed: false }, { ...selection(), confirmed: "true" },
    { ...selection(), offerId: "other" }, { ...selection(), version: "old" },
    { ...selection(), choiceId: "core_subclass_other" }, { ...selection(), trait: "Luck" },
    { ...selection(), familiarMaterials: ["Aspträ", " aspträ "] },
    { ...selection(), familiarMaterials: ["", "Iron"] },
    { ...selection(), familiarMaterials: ["x".repeat(81), "Iron"] },
    { ...selection(), familiarMaterials: [12, "Iron"] },
    { ...selection(), familiarMaterials: ["Iron"] }
  ]) assert.throws(() => confirmCharacterClassChoice(pc, document, input));
  assert.throws(() => confirmCharacterClassChoice({ ...pc, id: "pc_other" }, document, selection()));
  assert.throws(() => confirmCharacterClassChoice({ ...pc, level: 2 }, document, selection()), /has changed/);
  assert.deepEqual(pc, before);
});

test("all six main traits are permitted without reallocating their values", () => {
  const pc = character();
  for (const trait of INVENTOR.setup.traits) {
    const next = confirmCharacterClassChoice(pc, document, { ...selection(), trait });
    assert.equal(next.subclass.spellcastTrait, trait);
    assert.deepEqual(next.traits, pc.traits);
  }
});

test("the same engine offers several definitions and runs a future class's own migration", () => {
  const nextDefinition = { id: "future_class", version: "2", name: "Future class", subclasses: [{ id: "future_path", name: "Future path" }] };
  const registry = new Map([...CLASS_CHOICE_DEFINITIONS, [nextDefinition.id, {
    definition: nextDefinition,
    normalize: (_input, subclass) => ({ choiceId: subclass.id, definitionId: nextDefinition.id, definitionVersion: "2" }),
    apply: (pc) => { pc.class = { id: nextDefinition.id, name: nextDefinition.name }; pc.subclass = { id: "future_path" }; }
  }]]);
  const futureOffer = { ...offer, id: "future-offer", version: "2", definitions: [...offer.definitions, { id: nextDefinition.id, version: "2" }] };
  const offers = { offers: [{ ...offer, active: false }, futureOffer] };
  const pc = character();
  assert.equal(characterClassChoiceView(pc, offers, registry).definitions.length, 2);
  assert.equal(characterClassChoiceView(pc, offers, registry).definitions[1].name, "Future class");
  const next = confirmCharacterClassChoice(pc, offers, { offerId: "future-offer", version: "2", choiceId: "future_path", confirmed: true }, "now", registry);
  assert.equal(next.class.id, "future_class");
  assert.equal(next.hp, pc.hp);
  assert.equal(characterClassChoiceView(next, offers, registry).status, "confirmed");
  assert.equal(privateClassIdentity(nextDefinition.id, null, registry), true);
  assert.equal(privateClassIdentity(null, "future_path", registry), true);
});

test("a later keep-current offer preserves the adopted rule guide and prior confirmation", () => {
  const adopted = confirmCharacterClassChoice(character(), document, selection());
  const nextOffer = { ...offer, id: "second-offer", expectedClassId: adopted.class.id, expectedSubclassId: adopted.subclass.id };
  const offers = { offers: [offer, nextOffer] };
  assert.equal(characterClassChoiceView(adopted, offers).status, "pending");
  const kept = confirmCharacterClassChoice(adopted, offers, { ...selection("keep-current"), offerId: nextOffer.id });
  assert.equal(kept.classChoiceHistory.length, 2);
  assert.equal(characterClassChoiceView(kept, offers).status, "confirmed");
  assert.equal(characterClassChoiceView(kept, { offers: [] }).definitions[0].id, INVENTOR.id);
  assert.equal(characterClassChoiceView(kept, { offers: [ { ...nextOffer, active: false } ] }).status, "confirmed");
});
