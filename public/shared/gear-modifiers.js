// What a character's arms and armor do to Evasion, read from the printed
// feature text ("Heavy: -1 to Evasion", "Flexible: +1 to Evasion",
// "Barrier: +2 to Armor Score; -1 to Evasion"). Shared by the server (which
// keeps the stored Evasion in step) and the arms dialog (which previews it).

const EVASION_RE = /([+\-−–])\s*(\d{1,2})\s+to\s+Evasion\b/gi;

export function featureEvasion(feature) {
  let total = 0;
  for (const [, sign, amount] of String(feature || "").matchAll(EVASION_RE)) {
    total += (sign === "+" ? 1 : -1) * Number(amount);
  }
  return total;
}

export function gearEvasion({ armor = null, weapons = {} } = {}) {
  return [armor, weapons?.primary, weapons?.secondary]
    .reduce((sum, item) => sum + featureEvasion(item?.feature), 0);
}
