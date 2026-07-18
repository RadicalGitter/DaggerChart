import assert from "node:assert/strict";
import test from "node:test";
import { encounterEngagements, engagedIds } from "../public/shared/encounter-stage.js";

const pc = (id, x, y, extra = {}) => ({ id, kind: "pc", x, y, w: 0.09, ...extra });
const foe = (id, x, y, extra = {}) => ({ id, kind: "adversary", x, y, w: 0.09, ...extra });

test("an enemy card put up against a player is in melee", () => {
  const entities = [pc("en_a", 0.5, 0.5), foe("en_b", 0.58, 0.5)];
  assert.deepEqual(encounterEngagements(entities), [["en_a", "en_b"]]);
});

test("cards apart on the stage are not engaged", () => {
  const entities = [pc("en_a", 0.2, 0.5), foe("en_b", 0.8, 0.5)];
  assert.deepEqual(encounterEngagements(entities), []);
});

test("vertical distance counts in stage proportions, not raw normals", () => {
  // Same normalized offset reads much larger vertically on a 16:9 stage.
  const beside = [pc("en_a", 0.5, 0.5), foe("en_b", 0.5, 0.55)];
  assert.equal(encounterEngagements(beside).length, 1);
  const stackedFar = [pc("en_a", 0.5, 0.2), foe("en_b", 0.5, 0.6)];
  assert.equal(encounterEngagements(stackedFar).length, 0);
});

test("defeated cards and same-side contact never count as melee", () => {
  const entities = [
    pc("en_a", 0.5, 0.5),
    foe("en_b", 0.56, 0.5, { defeated: true }),
    pc("en_c", 0.55, 0.52)
  ];
  assert.deepEqual(encounterEngagements(entities), []);
  assert.equal(engagedIds(entities).size, 0);
});

test("one enemy can hold several players in melee at once", () => {
  const entities = [pc("en_a", 0.46, 0.5), pc("en_b", 0.6, 0.5), foe("en_x", 0.53, 0.5)];
  assert.equal(encounterEngagements(entities).length, 2);
  assert.deepEqual([...engagedIds(entities)].sort(), ["en_a", "en_b", "en_x"]);
});
