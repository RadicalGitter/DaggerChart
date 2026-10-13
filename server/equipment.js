// Players change their own arms and armor. Catalog entries come from the SRD
// reference; anything found or forged in play can be written in by hand.
// Damage thresholds are armor base + level, so they follow the armor, and any
// bonus the character had on top of that (a feature, a GM ruling) is kept.

import { gearEvasion } from "../public/shared/gear-modifiers.js";

export const WEAPON_TRAITS = ["Agility", "Strength", "Finesse", "Instinct", "Presence", "Knowledge"];
export const WEAPON_RANGES = ["Melee", "Very Close", "Close", "Far", "Very Far"];
export const WEAPON_BURDENS = ["One Handed", "Two Handed"];

const DAMAGE_RE = /^(\d{1,2})?d(4|6|8|10|12|20)(?:\s*([+-])\s*(\d{1,2}))?\s+(phy|mag)$/i;
const SLOTS = ["primary", "secondary", "armor"];

const cleanText = (value, max) => String(value ?? "").replace(/\s+/g, " ").trim().slice(0, max);

function wholeNumber(value, label, min, max) {
  const number = Number(value);
  if (!Number.isInteger(number) || number < min || number > max) {
    throw new Error(`${label} must be a whole number from ${min} to ${max}.`);
  }
  return number;
}

function normalizeDamage(value) {
  const match = DAMAGE_RE.exec(cleanText(value, 24));
  if (!match) throw new Error("Write damage like “d8 phy” or “d10+2 mag”.");
  const [, count, die, sign, bonus, type] = match;
  return `${count || ""}d${die}${sign ? `${sign}${bonus}` : ""} ${type.toLowerCase()}`;
}

function customWeapon(input, slot) {
  const name = cleanText(input?.name, 80);
  if (!name) throw new Error(`Name the ${slot} weapon.`);
  const trait = WEAPON_TRAITS.find((candidate) => candidate === input?.trait);
  if (!trait) throw new Error("Choose the weapon's trait.");
  const range = WEAPON_RANGES.find((candidate) => candidate === input?.range);
  if (!range) throw new Error("Choose the weapon's range.");
  const burden = WEAPON_BURDENS.find((candidate) => candidate === input?.burden);
  if (!burden) throw new Error("Choose whether the weapon is one- or two-handed.");
  if (slot === "secondary" && burden !== "One Handed") throw new Error("A secondary weapon must be one-handed.");
  const damage = normalizeDamage(input?.damage);
  const type = slot === "secondary" ? "SECONDARY" : damage.endsWith("mag") ? "PRIMARY_MAGIC" : "PRIMARY_PHYSICAL";
  return { id: "custom", name, type, trait, range, damage, burden, feature: cleanText(input?.feature, 400) };
}

function catalogWeapon(id, slot, reference) {
  const weapon = (reference?.weapons || []).find((candidate) => candidate.id === id);
  if (!weapon) throw new Error("That weapon is not in the reference.");
  const fits = slot === "secondary" ? weapon.type === "SECONDARY" : weapon.type.startsWith("PRIMARY");
  if (!fits) throw new Error(`${weapon.name} cannot be carried as a ${slot} weapon.`);
  return { ...weapon };
}

function customArmor(input) {
  const name = cleanText(input?.name, 80);
  if (!name) throw new Error("Name the armor.");
  const score = wholeNumber(input?.score, "Armor Score", 0, 12);
  const baseMajorThreshold = wholeNumber(input?.baseMajorThreshold, "The base Major threshold", 1, 60);
  const baseSevereThreshold = wholeNumber(input?.baseSevereThreshold, "The base Severe threshold", 2, 90);
  if (baseSevereThreshold <= baseMajorThreshold) throw new Error("The Severe threshold must be higher than the Major threshold.");
  return { id: "custom", name, score, feature: cleanText(input?.feature, 400), baseMajorThreshold, baseSevereThreshold };
}

function catalogArmor(id, reference) {
  const armor = (reference?.armors || []).find((candidate) => candidate.id === id);
  if (!armor) throw new Error("That armor is not in the reference.");
  return {
    id: armor.id,
    name: armor.name,
    score: armor.baseScore,
    feature: armor.feature || "",
    baseMajorThreshold: armor.baseMajorThreshold,
    baseSevereThreshold: armor.baseSevereThreshold
  };
}

function resolveSlot(slot, input, reference) {
  if (input === null) {
    if (slot === "primary") throw new Error("Choose a primary weapon.");
    return null;
  }
  if (typeof input !== "object" || Array.isArray(input)) throw new Error(`Choose a ${slot}.`);
  if (input.custom) return slot === "armor" ? customArmor(input.custom) : customWeapon(input.custom, slot);
  const id = String(input.id || "");
  return slot === "armor" ? catalogArmor(id, reference) : catalogWeapon(id, slot, reference);
}

// Older characters store only name/score/feature: recover the base from the
// reference by name. Unknown armor has no recoverable base.
function armorBase(armor, reference) {
  if (!armor) return { major: 0, severe: 0, unarmored: true };
  if (Number.isInteger(armor.baseMajorThreshold) && Number.isInteger(armor.baseSevereThreshold)) {
    return { major: armor.baseMajorThreshold, severe: armor.baseSevereThreshold };
  }
  const known = (reference?.armors || []).find((candidate) => candidate.id === armor.id || candidate.name === armor.name);
  return known ? { major: known.baseMajorThreshold, severe: known.baseSevereThreshold } : null;
}

function expectedThresholds(base, level) {
  if (base.unarmored) return { major: level, severe: 2 * level };
  return { major: base.major + level, severe: base.severe + level };
}

export function thresholdsForArmor(pc, nextArmor, reference) {
  const level = Number.isInteger(pc.level) ? pc.level : 1;
  const previousBase = armorBase(pc.armor || null, reference);
  const current = pc.thresholds || {};
  const extra = previousBase && Number.isFinite(current.major) && Number.isFinite(current.severe)
    ? (() => {
      const expected = expectedThresholds(previousBase, level);
      return { major: current.major - expected.major, severe: current.severe - expected.severe };
    })()
    : { major: 0, severe: 0 };
  const next = expectedThresholds(armorBase(nextArmor, reference) || { major: 0, severe: 0 }, level);
  return { major: next.major + extra.major, severe: next.severe + extra.severe };
}

/**
 * Keeps stored Evasion in step with the Evasion modifiers printed on the
 * character's gear. `gearEvasion` records what has already been applied, so
 * this is idempotent; characters saved before it existed (marker missing)
 * receive their gear's modifier once. Returns true when anything changed.
 */
export function settleGearEvasion(pc) {
  if (!pc || !Number.isFinite(pc.evasion)) return false;
  const target = gearEvasion(pc);
  const applied = Number.isInteger(pc.gearEvasion) ? pc.gearEvasion : 0;
  if (Number.isInteger(pc.gearEvasion) && target === applied) return false;
  pc.evasion += target - applied;
  pc.gearEvasion = target;
  return true;
}

// Compare what matters at the table, not storage shape: older records lack
// ids and base thresholds but are still the same piece of kit.
const fingerprint = (item, fields) => item ? fields.map((field) => String(item[field] ?? "")).join("|") : "";
const sameWeapon = (left, right) =>
  fingerprint(left, ["name", "trait", "range", "damage", "burden", "feature"]) === fingerprint(right, ["name", "trait", "range", "damage", "burden", "feature"]);
const sameArmor = (left, right) =>
  fingerprint(left, ["name", "score", "feature"]) === fingerprint(right, ["name", "score", "feature"]);

/**
 * Applies a player's arms change in place. `input` names only the slots that
 * change: { primary?, secondary?, armor? }, each `null` (empty — not allowed
 * for primary), `{ id }` for a reference entry, or `{ custom: {...} }`.
 * Returns a GM-ledger summary of what changed, or "" when nothing did.
 */
export function equipCharacter(pc, input, reference) {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error("Choose what to carry.");
  const keys = Object.keys(input).filter((key) => SLOTS.includes(key));
  if (!keys.length) throw new Error("Choose what to carry.");

  const weapons = { primary: pc.weapons?.primary || null, secondary: pc.weapons?.secondary || null };
  let armor = pc.armor || null;
  for (const slot of keys) {
    const value = resolveSlot(slot, input[slot], reference);
    if (slot === "armor") armor = value;
    else weapons[slot] = value;
  }
  if (weapons.primary?.burden === "Two Handed" && weapons.secondary) {
    throw new Error("A two-handed primary weapon leaves no hand free for a secondary weapon.");
  }

  const changes = [];
  if (!sameWeapon(weapons.primary, pc.weapons?.primary)) changes.push(`takes up ${weapons.primary?.name || "no primary weapon"}`);
  if (!sameWeapon(weapons.secondary, pc.weapons?.secondary)) {
    changes.push(weapons.secondary ? `carries ${weapons.secondary.name} as a secondary weapon` : "sets aside their secondary weapon");
  }
  const armorChanged = !sameArmor(armor, pc.armor);
  if (armorChanged) changes.push(armor ? `wears ${armor.name}` : "goes without armor");
  if (!changes.length) return "";

  if (armorChanged) {
    pc.thresholds = thresholdsForArmor(pc, armor, reference);
    // Marked slots belong to the armor; never hand out free repairs, never exceed the new score.
    pc.armorMarked = Math.min(Number(pc.armorMarked) || 0, armor?.score || 0);
  }
  pc.weapons = weapons;
  pc.armor = armor;
  settleGearEvasion(pc);
  const last = changes.pop();
  return `${pc.name} ${changes.length ? `${changes.join(", ")} and ${last}` : last}.`;
}
