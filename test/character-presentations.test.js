import test from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_CHARACTER_PRESENTATIONS,
  activatePresentation,
  applyBeastformSheet,
  beastformTierForLevel,
  normalizeCharacterPresentations,
  playerPresentationView,
  presentationIdentity,
  upsertPersona
} from "../server/character-presentations.js";

const bob = { id: DEFAULT_CHARACTER_PRESENTATIONS.roles.disguisePcId, name: "Bob Näslös", portrait: "/generated/art/portrait/bob.png", level: 1 };
const kaya = {
  id: DEFAULT_CHARACTER_PRESENTATIONS.roles.beastformPcId,
  name: "Kaya",
  portrait: "/generated/art/portrait/kaya.png",
  level: 1,
  stress: 1,
  stressMax: 6,
  hope: 5,
  evasion: 10,
  traits: { Agility: 1, Strength: 0, Finesse: 2, Instinct: 1, Presence: -1, Knowledge: 0 }
};
const forms = [{
  id: "agile-scout", tier: 1, name: "Agile Scout", examples: ["Fox"], trait: "Agility", traitBonus: 1, evasionBonus: 2,
  attack: { range: "Melee", trait: "Agility", damage: "d4 physical" }, advantages: ["sneak"], features: []
}, {
  id: "powerful-beast", tier: 2, name: "Powerful Beast", examples: ["Bear"], trait: "Strength", traitBonus: 3, evasionBonus: 1,
  attack: { range: "Melee", trait: "Strength", damage: "d10+4 physical" }, advantages: [], features: []
}];

const fresh = () => normalizeCharacterPresentations(structuredClone(DEFAULT_CHARACTER_PRESENTATIONS));

test("Bob's active persona replaces only his public presentation", () => {
  const document = fresh();
  const persona = upsertPersona(document, bob.id, { name: "Master Alder", description: "A patient clerk", prompt: "An elderly clerk" });
  persona.portrait = "/generated/art/portrait/alder.png";
  activatePresentation(bob, document, forms, { kind: "persona", refId: persona.id });
  const identity = presentationIdentity(bob, document, forms);
  assert.deepEqual(identity, { name: "Master Alder", portrait: "/generated/art/portrait/alder.png", presentation: { kind: "persona" } });
  assert.equal(bob.name, "Bob Näslös");
});

test("Beastform tier follows Daggerheart character tiers", () => {
  assert.deepEqual([1, 2, 4, 5, 7, 8, 10].map(beastformTierForLevel), [1, 2, 2, 3, 3, 4, 4]);
  const document = fresh();
  assert.deepEqual(playerPresentationView(kaya, document, forms).forms.map((form) => form.id), ["agile-scout"]);
});

test("standard Beastform marks Stress and overlays, rather than mutating, canonical stats", () => {
  const document = fresh();
  activatePresentation(kaya, document, forms, { kind: "beastform", refId: "agile-scout", method: "stress" });
  assert.equal(kaya.stress, 2);
  const sheet = applyBeastformSheet({ ...kaya, canonicalName: kaya.name, weapons: {} }, document, forms, kaya);
  assert.equal(sheet.evasion, 12);
  assert.equal(sheet.traits.Agility, 2);
  assert.equal(kaya.evasion, 10);
  assert.equal(kaya.traits.Agility, 1);
  activatePresentation(kaya, document, forms, { kind: "canonical" });
  assert.equal(document.active[kaya.id], undefined);
});

test("Evolution spends Hope and records its chosen trait", () => {
  const document = fresh();
  const beforeStress = kaya.stress;
  const beforeHope = kaya.hope;
  const active = activatePresentation(kaya, document, forms, { kind: "beastform", refId: "agile-scout", method: "evolution", evolutionTrait: "Instinct" });
  assert.equal(kaya.hope, beforeHope - 3);
  assert.equal(kaya.stress, beforeStress);
  assert.equal(active.evolutionTrait, "Instinct");
});

test("forms above Kaya's current tier cannot be activated", () => {
  const document = fresh();
  assert.throws(() => activatePresentation(kaya, document, forms, { kind: "beastform", refId: "powerful-beast" }), /not available/);
});
