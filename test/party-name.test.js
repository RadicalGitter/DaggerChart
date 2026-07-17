import test from "node:test";
import assert from "node:assert/strict";
import {
  CHARACTER_NAME_LIMIT,
  normalizeCharacterName,
  renameCharacter,
  renamedCharacterThemeTitle
} from "../server/party-name.js";

test("character names are trimmed and bounded", () => {
  assert.equal(normalizeCharacterName("  Isil Naslose  "), "Isil Naslose");
  assert.throws(() => normalizeCharacterName(""), /required/);
  assert.throws(() => normalizeCharacterName("x".repeat(CHARACTER_NAME_LIMIT + 1)), /at most/);
  assert.throws(() => normalizeCharacterName("line\nbreak"), /control characters/);
});

test("renaming requires explicit GM approval", () => {
  const pc = { name: "Old Name", inventory: [] };
  assert.throws(() => renameCharacter(pc, { name: "New Name", gmApproved: false }), /GM approved/);
  assert.equal(pc.name, "Old Name");
});

test("renaming updates editable self-authored papers but preserves the covenant", () => {
  const pc = {
    name: "Old Name",
    inventory: [
      { kind: "paper", paperType: "note", author: "Old Name" },
      { kind: "paper", paperType: "covenant", author: "Old Name", signedName: "Old Name" },
      { kind: "paper", paperType: "note", author: "The Keeper" }
    ]
  };
  const result = renameCharacter(pc, { name: "New Name", gmApproved: true });
  assert.deepEqual(result, { previousName: "Old Name", name: "New Name", changed: true });
  assert.equal(pc.name, "New Name");
  assert.equal(pc.inventory[0].author, "New Name");
  assert.equal(pc.inventory[1].author, "Old Name");
  assert.equal(pc.inventory[1].signedName, "Old Name");
  assert.equal(pc.inventory[2].author, "The Keeper");
});

test("renaming updates only automatic character theme titles", () => {
  assert.equal(renamedCharacterThemeTitle("Old Name's Overture", "Old Name", "New Name"), "New Name's Overture");
  assert.equal(renamedCharacterThemeTitle("Old Name's Overture II", "Old Name", "New Name"), "New Name's Overture II");
  assert.equal(renamedCharacterThemeTitle("Old Name's Overture 3", "Old Name", "New Name"), "New Name's Overture 3");
  assert.equal(renamedCharacterThemeTitle("A Custom Song", "Old Name", "New Name"), "A Custom Song");
  assert.equal(renamedCharacterThemeTitle("Old Name's Ballad", "Old Name", "New Name"), "Old Name's Ballad");
});
