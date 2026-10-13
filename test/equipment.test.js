import test from "node:test";
import assert from "node:assert/strict";
import { equipCharacter, thresholdsForArmor } from "../server/equipment.js";
import { requiresGm } from "../server/access.js";

const reference = {
  weapons: [
    { id: "core_weapon_longsword", name: "Longsword", type: "PRIMARY_PHYSICAL", trait: "Agility", range: "Melee", damage: "d10 phy", burden: "Two Handed", feature: "" },
    { id: "core_weapon_dagger", name: "Dagger", type: "PRIMARY_PHYSICAL", trait: "Finesse", range: "Melee", damage: "d8 phy", burden: "One Handed", feature: "" },
    { id: "core_weapon_round_shield", name: "Round Shield", type: "SECONDARY", trait: "Strength", range: "Melee", damage: "d4 phy", burden: "One Handed", feature: "Protective: +1 to Armor Score" }
  ],
  armors: [
    { id: "core_armor_leather_armor", name: "Leather Armor", baseScore: 3, baseMajorThreshold: 6, baseSevereThreshold: 13, feature: "" },
    { id: "core_armor_chainmail_armor", name: "Chainmail Armor", baseScore: 4, baseMajorThreshold: 7, baseSevereThreshold: 15, feature: "Heavy: -1 to Evasion" }
  ]
};

const legacyPc = () => ({
  name: "Kaya",
  level: 1,
  weapons: { primary: { ...reference.weapons[1] }, secondary: null },
  armor: { name: "Chainmail Armor", score: 4, feature: "Heavy: -1 to Evasion" },
  armorMarked: 4,
  thresholds: { major: 8, severe: 16 }
});

test("catalog armor moves thresholds with the armor base and clamps marked slots", () => {
  const pc = legacyPc();
  const summary = equipCharacter(pc, { armor: { id: "core_armor_leather_armor" } }, reference);
  assert.deepEqual(pc.thresholds, { major: 7, severe: 14 });
  assert.equal(pc.armor.score, 3);
  assert.equal(pc.armorMarked, 3);
  assert.equal(pc.armor.baseMajorThreshold, 6);
  assert.match(summary, /Kaya wears Leather Armor/);
});

test("a threshold bonus beyond armor + level survives a change of armor", () => {
  const pc = { ...legacyPc(), thresholds: { major: 9, severe: 18 } };
  assert.deepEqual(thresholdsForArmor(pc, { baseMajorThreshold: 6, baseSevereThreshold: 13 }, reference), { major: 8, severe: 16 });
});

test("going without armor uses the unarmored thresholds", () => {
  const pc = legacyPc();
  equipCharacter(pc, { armor: null }, reference);
  assert.equal(pc.armor, null);
  assert.equal(pc.armorMarked, 0);
  assert.deepEqual(pc.thresholds, { major: 1, severe: 2 });
});

test("custom weapons and armor are validated and normalized", () => {
  const pc = legacyPc();
  equipCharacter(pc, {
    primary: { custom: { name: " Ember  Brand ", trait: "Strength", range: "Melee", damage: "D8 + 2 MAG", burden: "One Handed", feature: "Glows." } },
    armor: { custom: { name: "Scaled Coat", score: 5, baseMajorThreshold: 9, baseSevereThreshold: 19, feature: "" } }
  }, reference);
  assert.equal(pc.weapons.primary.name, "Ember Brand");
  assert.equal(pc.weapons.primary.damage, "d8+2 mag");
  assert.equal(pc.weapons.primary.type, "PRIMARY_MAGIC");
  assert.deepEqual(pc.thresholds, { major: 10, severe: 20 });
  assert.throws(() => equipCharacter(pc, { primary: { custom: { name: "Bad", trait: "Strength", range: "Melee", damage: "lots", burden: "One Handed" } } }, reference), /damage/);
  assert.throws(() => equipCharacter(pc, { armor: { custom: { name: "Odd", score: 3, baseMajorThreshold: 9, baseSevereThreshold: 4 } } }, reference), /Severe/);
});

test("slot rules: two hands, secondaries, and a required primary", () => {
  const pc = legacyPc();
  equipCharacter(pc, { secondary: { id: "core_weapon_round_shield" } }, reference);
  assert.throws(() => equipCharacter(pc, { primary: { id: "core_weapon_longsword" } }, reference), /two-handed/);
  equipCharacter(pc, { primary: { id: "core_weapon_longsword" }, secondary: null }, reference);
  assert.equal(pc.weapons.secondary, null);
  assert.throws(() => equipCharacter(pc, { secondary: { id: "core_weapon_dagger" } }, reference), /secondary/);
  assert.throws(() => equipCharacter(pc, { primary: null }, reference), /primary/);
});

test("re-choosing what is already carried changes nothing", () => {
  const pc = legacyPc();
  const before = JSON.stringify(pc);
  assert.equal(equipCharacter(pc, { primary: { id: "core_weapon_dagger" }, armor: { id: "core_armor_chainmail_armor" } }, reference), "");
  assert.equal(JSON.stringify(pc), before);
});

test("players may reach the equipment control without Keeper access", () => {
  assert.equal(requiresGm("PUT", "/api/party/pc_1/equipment"), false);
});

test("Evasion follows the gear's printed modifiers, once", async () => {
  const { settleGearEvasion } = await import("../server/equipment.js");
  const { featureEvasion } = await import("../public/shared/gear-modifiers.js");
  assert.equal(featureEvasion("Barrier: +2 to Armor Score; -1 to Evasion"), -1);
  assert.equal(featureEvasion("Very Heavy: −2 to Evasion; −1 to Agility"), -2);
  assert.equal(featureEvasion("Flexible: +1 to Evasion"), 1);

  const pc = { ...legacyPc(), evasion: 10 };
  assert.equal(settleGearEvasion(pc), true);
  assert.equal(pc.evasion, 9);
  assert.equal(settleGearEvasion(pc), false);
  assert.equal(pc.evasion, 9);

  equipCharacter(pc, { armor: { id: "core_armor_leather_armor" } }, reference);
  assert.equal(pc.evasion, 10);
  equipCharacter(pc, { armor: { custom: { name: "Cloak", score: 1, baseMajorThreshold: 4, baseSevereThreshold: 9, feature: "Flexible: +1 to Evasion" } } }, reference);
  assert.equal(pc.evasion, 11);
  assert.equal(pc.gearEvasion, 1);
});

test("card titles keep short connecting words lower-case, as printed", async () => {
  const { cardTitle } = await import("../server/display-names.js");
  assert.equal(cardTitle("Warden Of Renewal"), "Warden of Renewal");
  assert.equal(cardTitle("Call Of The Brave"), "Call of the Brave");
  assert.equal(cardTitle("Lean On Me"), "Lean on Me");
  assert.equal(cardTitle("Goad Them On"), "Goad Them On");
  assert.equal(cardTitle("Of Mice"), "Of Mice");
});
