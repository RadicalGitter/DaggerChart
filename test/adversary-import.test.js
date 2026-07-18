import test from "node:test";
import assert from "node:assert/strict";
import {
  convertAdversary,
  mergeAdversaryDocument,
  parseExperiences,
  parseFeature,
  parseThresholds
} from "../scripts/import-srd-adversaries.mjs";
import { convertCommunityAdversary } from "../scripts/import-julias-arsenal-adversaries.mjs";

const srdRow = {
  name: "Test Herald",
  tier: "2",
  type: "Horde (3/HP)",
  description: "A testing formation.",
  motives_and_tactics: "Advance, surround, endure",
  difficulty: "14",
  thresholds: "10/20",
  hp: "6",
  stress: "3",
  atk: "+2d4",
  attack: "Hooked Spear",
  range: "Very Close",
  damage: "2d8+3 phy",
  experience: "Formation Fighting +2, Heraldry +1",
  feature: [
    { name: "Closing Net - Action", text: "Make an attack against all targets within range." },
    { name: "Signal - Reaction: Countdown (Loop 1d6)", text: "Spend a Fear to move the formation." }
  ]
};

test("SRD normalization retains irregular attack and feature timing fields", () => {
  assert.deepEqual(parseThresholds("4/None"), { major: 4, severe: null });
  assert.deepEqual(parseExperiences("Formation Fighting +2, Heraldry +1"), [
    { name: "Formation Fighting", bonus: 2 },
    { name: "Heraldry", bonus: 1 }
  ]);
  assert.deepEqual(parseFeature({ name: "Signal - Reaction: Countdown (Loop 1d6)", text: "Tick down." }), {
    name: "Signal",
    kind: "Reaction",
    timing: "Countdown (Loop 1d6)",
    text: "Tick down."
  });

  const card = convertAdversary(srdRow);
  assert.equal(card.id, "srd_test_herald");
  assert.equal(card.type, "Horde");
  assert.equal(card.typeDetail, "Horde (3/HP)");
  assert.equal(card.atk, "+2d4");
  assert.equal(card.features[1].timing, "Countdown (Loop 1d6)");
});

test("the SRD merge is idempotent and preserves cards from other sources", () => {
  const initial = {
    sources: [],
    adversaries: [{ id: "campaign_card", name: "Campaign Card", sourceId: "vesserin" }]
  };
  const first = mergeAdversaryDocument(initial, [srdRow]);
  const second = mergeAdversaryDocument(first, [srdRow]);
  assert.deepEqual(second, first);
  assert.deepEqual(second.adversaries.map((card) => card.id), ["campaign_card", "srd_test_herald"]);
});

test("Julia's Arsenal Markdown is normalized without presentation markup", () => {
  const markdown = `---
tier: 1
role: support
difficulty: 12
thresholds: [5, 9]
healthPoints: 4
stress: 5
attack: +2
weapon: Greatstaff
range: Far
damage: 1d8+2
damageType: magic
experience: [Magical Knowledge +2]
---

# Test Arcanist

A robed [spellbreaker](https://example.com) trained to unravel magic.

## Motives & Tactics

Protect allies, disrupt spellcasters

## Features

### Spellward - Passive

The Arcanist has resistance to magic damage.

### Veil - Action

Spend a Fear and choose a target within Far range.
`;
  const card = convertCommunityAdversary(markdown);
  assert.equal(card.id, "julia_test_arcanist");
  assert.equal(card.description, "A robed spellbreaker trained to unravel magic.");
  assert.equal(card.weapon.damage, "1d8+2 mag");
  assert.equal(card.features.length, 2);
  assert.equal(card.features[0].text, "The Arcanist has resistance to magic damage.");
  assert.equal(card.features[1].text, "Spend a Fear and choose a target within Far range.");
  assert.deepEqual(card.experiences, [{ name: "Magical Knowledge", bonus: 2 }]);
});
