import test from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_PLAYER_FEATURES,
  normalizePlayerFeatures,
  playerFeaturePatch
} from "../server/player-features.js";

test("legacy campaigns keep the unrevealed settlement folio closed", () => {
  assert.deepEqual(normalizePlayerFeatures(null), DEFAULT_PLAYER_FEATURES);
  assert.equal(DEFAULT_PLAYER_FEATURES.settlement, false);
  assert.equal(DEFAULT_PLAYER_FEATURES.journal, true);
  assert.equal(DEFAULT_PLAYER_FEATURES.partyCards, true);
});

test("campaign player features preserve explicit disabled values", () => {
  const features = normalizePlayerFeatures({ settlement: false, dice: false, unknown: false });
  assert.equal(features.settlement, false);
  assert.equal(features.dice, false);
  assert.equal(features.journal, true);
  assert.equal(Object.hasOwn(features, "unknown"), false);
});

test("feature patches reject unknown and non-boolean values", () => {
  assert.deepEqual(playerFeaturePatch({ settlement: false }), { settlement: false });
  assert.throws(() => playerFeaturePatch({ settlement: "no" }), /true or false/);
  assert.throws(() => playerFeaturePatch({ unreleased: false }), /Unknown player feature/);
});
