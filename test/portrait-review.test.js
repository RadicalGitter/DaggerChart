import assert from "node:assert/strict";
import test from "node:test";
import { stagePortrait, keepPortraitEdit, discardPortraitEdit, restoreOriginalPortrait } from "../public/shared/portrait-review.js";

test("edits require Keep, promote the baseline, and retain the original across edits", () => {
  const model = { portraitAttempts: [{ url: "original.png", seed: 10 }] };
  stagePortrait(model, { url: "original.png", seed: 10 });
  stagePortrait(model, { url: "edit-one.png", seed: 11 }, model.portraitReferenceUrl);
  assert.equal(model.portrait, "original.png");
  assert.equal(model.portraitReferenceUrl, "original.png");
  assert.equal(model.portraitEditPending.url, "edit-one.png");
  // Unfinished review survives the same JSON round trip as a saved draft.
  const restored = JSON.parse(JSON.stringify(model));
  keepPortraitEdit(restored);
  assert.equal(restored.portrait, "edit-one.png");
  assert.equal(restored.portraitReferenceUrl, "edit-one.png");
  stagePortrait(restored, { url: "edit-two.png", seed: 12 }, restored.portraitReferenceUrl);
  keepPortraitEdit(restored);
  assert.equal(restored.portraitOriginal, "original.png");
  restoreOriginalPortrait(restored);
  assert.equal(restored.portrait, "original.png");
  assert.equal(restored.portraitReferenceUrl, "original.png");
  assert.equal(restored.portraitSeed, 10);
});

test("discard leaves the accepted portrait, baseline, seed and original intact", () => {
  const model = {};
  stagePortrait(model, { url: "original.png", seed: 10 });
  const accepted = { ...model };
  stagePortrait(model, { url: "edit.png", seed: 11 }, model.portraitReferenceUrl);
  restoreOriginalPortrait(model);
  assert.ok(model.portraitEditPending);
  discardPortraitEdit(model);
  assert.deepEqual(model, accepted);
});

test("an external baseline can be restored and fresh generation starts a new original", () => {
  const model = {};
  stagePortrait(model, { url: "edit.png", seed: 20 }, "https://example.test/portrait.png");
  assert.equal(model.portrait, undefined);
  keepPortraitEdit(model);
  restoreOriginalPortrait(model);
  assert.equal(model.portrait, "https://example.test/portrait.png");
  stagePortrait(model, { url: "fresh.png", seed: 30 });
  assert.equal(model.portraitOriginal, "fresh.png");
  assert.equal(model.portraitReferenceUrl, "fresh.png");
});
