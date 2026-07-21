import test from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_SHEET_BEAUTY,
  commitSheetBeauty,
  normalizeSheetBeautyDocument,
  restoreSheetBeauty,
  sheetBeautyInternals,
  sheetBeautyView
} from "../server/sheet-beauty.js";

const background = [
  "roots", "early-memory", "turning-point", "road",
  "beliefs", "longing", "fear", "unfinished"
].map((id) => ({ id, a: `Memory: ${id}` }));

const pc = (overrides = {}) => ({
  id: "pc_sheet_beauty_test",
  name: "Kaya",
  level: 1,
  class: { id: "core_class_druid", name: "Druid" },
  portrait: "/generated/kaya.png",
  background: [],
  connections: [],
  domainCards: [{ id: "domain-1" }],
  inventory: [{ kind: "paper", paperType: "covenant" }],
  ...overrides
});

const fresh = () => normalizeSheetBeautyDocument(structuredClone(DEFAULT_SHEET_BEAUTY));

test("new characters have two beautifying tokens and gain one per level", () => {
  assert.equal(sheetBeautyView(pc(), fresh()).available, 2);
  assert.equal(sheetBeautyView(pc({ level: 4 }), fresh()).available, 5);
  assert.equal(sheetBeautyInternals.tierForLevel(1), 1);
  assert.equal(sheetBeautyInternals.tierForLevel(2), 2);
  assert.equal(sheetBeautyInternals.tierForLevel(5), 3);
  assert.equal(sheetBeautyInternals.tierForLevel(8), 4);
});

test("previews are deterministic and use each semantic slot at most once", () => {
  const document = fresh();
  const first = sheetBeautyView(pc(), document).candidates;
  const second = sheetBeautyView(pc(), document).candidates;
  assert.deepEqual(first, second);
  assert.notEqual(first[0].id, first[1].id);
  for (const candidate of first) {
    const slots = Object.keys(candidate.config.slots);
    assert.equal(slots.length, new Set(slots).size);
    assert.ok(slots.every((slot) => sheetBeautyInternals.KNOWN_SLOTS.has(slot)));
  }
});

test("a completed background unlocks its fixed memory margin", () => {
  const incomplete = sheetBeautyView(pc(), fresh()).candidates[0].config.slots;
  const complete = sheetBeautyView(pc({ background }), fresh()).candidates[0].config.slots;
  assert.equal(incomplete.memoryMargin, undefined);
  assert.equal(complete.memoryMargin.motif, "grove");
});

test("committing spends one token, invalidates the old preview, and restore is free", () => {
  const character = pc({ background });
  const document = fresh();
  const initial = sheetBeautyView(character, document);
  const version = commitSheetBeauty(character, document, initial.candidates[0].id, "2026-07-20T12:00:00.000Z");
  const committed = sheetBeautyView(character, document);
  assert.equal(committed.spent, 1);
  assert.equal(committed.available, 1);
  assert.equal(committed.activeVersionId, version.id);
  assert.throws(() => commitSheetBeauty(character, document, initial.candidates[1].id), /no longer current/i);

  restoreSheetBeauty(character, document, null);
  const baseline = sheetBeautyView(character, document);
  assert.equal(baseline.activeVersionId, null);
  assert.equal(baseline.available, 1);
  restoreSheetBeauty(character, document, version.id);
  assert.equal(sheetBeautyView(character, document).activeVersionId, version.id);
  assert.equal(sheetBeautyView(character, document).available, 1);
});

test("class identity and tier mature the recipe without random placement", () => {
  const druid = sheetBeautyView(pc({ level: 1 }), fresh()).candidates[0].config;
  const rogue = sheetBeautyView(pc({ level: 8, class: { id: "core_class_rogue", name: "Rogue" } }), fresh()).candidates[0].config;
  assert.equal(druid.motif, "grove");
  assert.equal(druid.grade, 1);
  assert.equal(rogue.motif, "veil");
  assert.equal(rogue.tier, 4);
  assert.equal(rogue.grade, 4);
});
