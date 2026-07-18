// Shared layout math for the encounter stage. Positions are normalized:
// x and y in 0..1 of the stage, w as a fraction of stage width. Engagement
// (melee) is derived purely from these numbers against a fixed reference
// aspect, so the GM board and the projector always agree on who is engaged
// even though their stages have different pixel sizes.

export const ENCOUNTER_STAGE_ASPECT = 16 / 9;
export const ENCOUNTER_CARD_ASPECT = 3 / 4; // width / height, like the party cards

// Two cards are engaged when they visibly touch: their centers are closer
// than the sum of their half-sizes (with a little forgiveness) in both axes.
// Only enemy-against-player contact counts as melee.
export function encounterEngagements(entities) {
  const alive = (entities || []).filter((e) => !e.defeated);
  const pcs = alive.filter((e) => e.kind === "pc");
  const foes = alive.filter((e) => e.kind === "adversary");
  const pairs = [];
  for (const pc of pcs) {
    for (const foe of foes) {
      if (cardsTouch(pc, foe)) pairs.push([pc.id, foe.id]);
    }
  }
  return pairs;
}

function cardsTouch(a, b) {
  // Work in width units: 1 unit = the stage width, so the stage is
  // 1 wide and 1/ASPECT tall and card heights are w / CARD_ASPECT.
  const dx = Math.abs(a.x - b.x);
  const dy = Math.abs(a.y - b.y) / ENCOUNTER_STAGE_ASPECT;
  const halfW = ((a.w || 0.09) + (b.w || 0.09)) / 2;
  const halfH = halfW / ENCOUNTER_CARD_ASPECT;
  return dx < halfW * 1.08 && dy < halfH * 0.92;
}

export function engagedIds(entities) {
  const ids = new Set();
  for (const [pcId, foeId] of encounterEngagements(entities)) {
    ids.add(pcId);
    ids.add(foeId);
  }
  return ids;
}
