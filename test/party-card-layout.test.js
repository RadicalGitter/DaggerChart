import assert from "node:assert/strict";
import test from "node:test";
import {
  normalizePartyCardLayout,
  partyCardHeight,
  partyCardPosition,
  partyCardWidthBounds
} from "../public/shared/party-card-layout.js";

test("party portrait defaults stay inside desktop and phone viewports", () => {
  for (const viewport of [{ width: 1366, height: 768 }, { width: 390, height: 844 }]) {
    for (let index = 0; index < 6; index += 1) {
      const position = partyCardPosition({ index, viewportWidth: viewport.width, viewportHeight: viewport.height });
      assert.ok(position.left >= 0);
      assert.ok(position.top >= 0);
      assert.ok(position.left + position.width <= viewport.width);
      assert.ok(position.top + partyCardHeight(position.width) <= viewport.height);
    }
  }
  assert.equal(partyCardWidthBounds(390).fallback, 108);
  assert.equal(partyCardWidthBounds(1366).fallback, 148);
});

test("party portrait layouts normalize and restore across viewport sizes", () => {
  const saved = normalizePartyCardLayout({
    left: 600,
    top: 240,
    width: 148,
    viewportWidth: 1366,
    viewportHeight: 768
  });
  const restored = partyCardPosition({ saved, index: 0, viewportWidth: 390, viewportHeight: 844 });

  assert.equal(saved.size, 148);
  assert.ok(saved.x > 0 && saved.x < 1);
  assert.ok(saved.y > 0 && saved.y < 1);
  assert.equal(restored.width, 148);
  assert.ok(restored.left + restored.width <= 390);
  assert.ok(restored.top + partyCardHeight(restored.width) <= 844);
});

test("party portrait sizes are clamped to the active viewport profile", () => {
  const phone = partyCardPosition({ saved: { x: 1, y: 1, size: 900 }, index: 0, viewportWidth: 320, viewportHeight: 568 });
  const desktop = partyCardPosition({ saved: { x: -2, y: 4, size: 20 }, index: 0, viewportWidth: 1920, viewportHeight: 1080 });

  assert.equal(phone.width, 220);
  assert.equal(phone.left, 100);
  assert.equal(desktop.width, 104);
  assert.equal(desktop.left, 0);
  assert.equal(desktop.top, 1080 - partyCardHeight(104));
});
