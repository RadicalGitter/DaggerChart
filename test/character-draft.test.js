import test from "node:test";
import assert from "node:assert/strict";
import { normalizeCharacterDraftVersion } from "../server/character-draft.js";

test("current character drafts keep their version across server saves", () => {
  assert.equal(normalizeCharacterDraftVersion(3), 3);
  assert.equal(normalizeCharacterDraftVersion("3"), 3);
});

test("legacy and unversioned character drafts retain version 2 migration", () => {
  assert.equal(normalizeCharacterDraftVersion(2), 2);
  assert.equal(normalizeCharacterDraftVersion(undefined), 2);
  assert.equal(normalizeCharacterDraftVersion(99), 2);
});
