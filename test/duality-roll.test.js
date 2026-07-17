import assert from "node:assert/strict";
import test from "node:test";
import { resolveDualityRoll } from "../server/duality-roll.js";

test("duality rolls total both dice and the modifier", () => {
  assert.deepEqual(resolveDualityRoll({ hope: 9, fear: 4, modifier: 2 }), {
    hope: 9,
    fear: 4,
    modifier: 2,
    total: 15,
    outcome: "hope"
  });
});

test("matching duality dice are critical regardless of modifier", () => {
  assert.equal(resolveDualityRoll({ hope: 7, fear: 7, modifier: -3 }).outcome, "critical");
});

test("fear is reported when the Fear die is higher", () => {
  assert.equal(resolveDualityRoll({ hope: 2, fear: 11 }).outcome, "fear");
});

test("duality rolls reject invalid dice and modifiers", () => {
  assert.throws(() => resolveDualityRoll({ hope: 0, fear: 8 }), /Hope/);
  assert.throws(() => resolveDualityRoll({ hope: 8, fear: 13 }), /Fear/);
  assert.throws(() => resolveDualityRoll({ hope: 8, fear: 3, modifier: 21 }), /modifier/);
  assert.throws(() => resolveDualityRoll({ hope: "8", fear: 3 }), /Hope/);
});
