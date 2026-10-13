import assert from "node:assert/strict";
import test from "node:test";
import { portraitRequest, portraitWorkshopData, savePortraitPreferences, stagePcPortrait, reviewPcPortrait } from "../server/portrait-workshop.js";

const image = (name) => `/generated/art/portrait/${name}.png`;
const result = (name, seed = 42) => ({ url: image(name), urls: [image(name)], seed });

test("portrait preferences retain the full steps range while CFG keeps its existing range", () => {
  for (const stepsModifier of [-3, -2, -1, 0, 1, 2, 3]) {
    assert.equal(portraitRequest({ stepsModifier }).stepsModifier, stepsModifier);
  }
  assert.equal(portraitRequest({ stepsModifier: 4 }).stepsModifier, 0);
  assert.equal(portraitRequest({ cfgModifier: 3 }).cfgModifier, 0);
});

test("removed Style 2 requests resume with the original workflow style", () => {
  assert.equal(portraitRequest({ style: "style2" }).style, "workflow");
});

test("post-creation portraits remain proposals until Keep; edits advance the baseline and restore the original", () => {
  const pc = { id: "pc_test", portrait: image("original"), hp: 3, inventory: [{ name: "Keepsake" }] };
  const immutable = { hp: pc.hp, inventory: structuredClone(pc.inventory) };
  const request = portraitRequest({ prompt: "Change the cloak", referenceImageUrl: pc.portrait });
  stagePcPortrait(pc, result("edit-one"), request);
  assert.equal(pc.portrait, image("original"));
  let pending = portraitWorkshopData(pc).pending;
  reviewPcPortrait(pc, { action: "keep", pendingId: pending.id });
  assert.equal(pc.portrait, image("edit-one"));
  assert.equal(portraitWorkshopData(pc).request.referenceImageUrl, pc.portrait);
  stagePcPortrait(pc, result("edit-two"), { ...request, referenceImageUrl: pc.portrait });
  pending = portraitWorkshopData(pc).pending;
  reviewPcPortrait(pc, { action: "keep", pendingId: pending.id });
  assert.equal(portraitWorkshopData(pc).originalUrl, image("original"));
  reviewPcPortrait(pc, { action: "restore" });
  assert.equal(pc.portrait, image("original"));
  assert.deepEqual({ hp: pc.hp, inventory: pc.inventory }, immutable);
});

test("missing portraits can be generated and discarded without creating or changing a character", () => {
  const pc = { id: "pc_test", level: 3 };
  stagePcPortrait(pc, result("first"), portraitRequest({ prompt: "A traveler" }));
  assert.equal(pc.portrait, undefined);
  const pending = portraitWorkshopData(pc).pending;
  reviewPcPortrait(pc, { action: "discard", pendingId: pending.id });
  assert.equal(pc.portrait, undefined);
  stagePcPortrait(pc, result("second"), portraitRequest({ prompt: "A traveler" }));
  reviewPcPortrait(pc, { action: "keep", pendingId: pc.portraitWorkshop.pending.id });
  assert.equal(pc.portrait, image("second"));
  assert.equal(pc.level, 3);
});

test("whitelists exclude stored administrative fields, including fields inside archived requests and pending previews", () => {
  const pc = { hidden: { notes: "PRIVATE_SENTINEL" }, portrait: image("old") };
  savePortraitPreferences(pc, { prompt: "A traveler", hp: 999, hidden: { notes: "PRIVATE_SENTINEL" } });
  stagePcPortrait(pc, result("new"), portraitRequest({ prompt: "A traveler" }));
  pc.portraitWorkshop.hidden = "PRIVATE_SENTINEL";
  pc.portraitWorkshop.attempts[0].request.hidden = "PRIVATE_SENTINEL";
  pc.portraitWorkshop.pending.hidden = "PRIVATE_SENTINEL";
  assert.ok(!JSON.stringify(portraitWorkshopData(pc)).includes("PRIVATE_SENTINEL"));
  assert.equal(pc.hp, undefined);
});

test("review survives persistence and rejects stale decisions or changed portraits", () => {
  let pc = { portrait: image("old") };
  stagePcPortrait(pc, result("new"), portraitRequest({ prompt: "A traveler" }));
  pc = JSON.parse(JSON.stringify(pc));
  const pending = portraitWorkshopData(pc).pending;
  assert.throws(() => reviewPcPortrait(pc, { action: "keep", pendingId: "stale" }), /changed/);
  assert.throws(() => reviewPcPortrait(pc, { action: "restore" }), /pending/);
  pc.portrait = image("changed-elsewhere");
  assert.throws(() => reviewPcPortrait(pc, { action: "keep", pendingId: pending.id }), /accepted portrait has changed/);
  reviewPcPortrait(pc, { action: "discard", pendingId: pending.id });
  assert.equal(pc.portrait, image("changed-elsewhere"));
});
