import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

// state.js binds DATA_DIR at load; point it at a throwaway directory before
// importing so this test never reads or writes real campaign data.
const dir = fs.mkdtempSync(path.join(os.tmpdir(), "screen-cards-"));
process.env.DATA_DIR = dir;
const { state } = await import("../server/state.js");
const { screenView } = await import("../server/views.js");

const SENTINEL = "SCREEN_CARD_SENTINEL";

function project(current) {
  state.screen = { ...(state.screen || {}), current };
  return screenView();
}

test("a projected folk card carries only the portrait and the name", () => {
  state.characters = [{ id: "folk_a", name: "Test Folk", role: SENTINEL, description: SENTINEL, status: "dead", portrait: "/generated/folk.png", hidden: { notes: SENTINEL } }];
  const view = project({ type: "folk", refId: "folk_a" });
  assert.deepEqual(view, { type: "card", name: "Test Folk", portrait: "/generated/folk.png" });
  assert.ok(!JSON.stringify(view).includes(SENTINEL));
});

test("a projected person card hides role, status, place and description", () => {
  state.places = [{ id: "place_a", name: "Test Place", revealed: true }];
  state.people = [{ id: "person_a", name: "Test Person", role: SENTINEL, description: SENTINEL, status: "missing", placeId: "place_a", portrait: null, hidden: { notes: SENTINEL } }];
  const view = project({ type: "person", refId: "person_a" });
  assert.deepEqual(view, { type: "card", name: "Test Person", portrait: null });
  assert.ok(!JSON.stringify(view).includes(SENTINEL));
  assert.ok(!JSON.stringify(view).includes("Test Place"));
});

test("a projected place card keeps its wide picture and drops the kind and description", () => {
  state.places = [{ id: "place_b", name: "Test Hollow", kind: SENTINEL, description: SENTINEL, portrait: "/generated/place.png", revealed: false }];
  const view = project({ type: "place", refId: "place_b" });
  assert.deepEqual(view, { type: "card", name: "Test Hollow", portrait: "/generated/place.png", wide: true });
  assert.ok(!JSON.stringify(view).includes(SENTINEL));
});

test("a card whose entry no longer exists falls back to the idle screen", () => {
  state.characters = [];
  assert.equal(project({ type: "folk", refId: "folk_gone" }).type, "idle");
});
