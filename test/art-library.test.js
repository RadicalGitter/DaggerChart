import assert from "node:assert/strict";
import test from "node:test";
import {
  SCENE_DIMENSIONS,
  SCENE_PROMPT_ENVELOPE,
  SCENE_ROOT_IDS,
  assertUniquePlaceName,
  compileSceneDirection,
  sceneInput,
  sceneLibraryView,
  scenePrompt,
  sceneRecords
} from "../server/art-library.js";

const places = [{ id: "place_keep", name: "Old Keep", kind: "ruin" }];

test("scene requests stay attached to a canonical location and compile inherited tags", () => {
  const input = sceneInput({
    placeId: "place_keep",
    name: "The flooded gate",
    sublocation: "Lower ward",
    description: "Rainwater covers the old approach.",
    selectedTagIds: ["ancient-ruin"],
    excludedTagIds: ["haunted"],
    castWhenReady: true
  }, places);
  const prompt = scenePrompt(input);

  assert.equal(input.place, places[0]);
  assert.equal(input.castWhenReady, true);
  assert.match(input.tagDirection, /ancient ruin/);
  assert.match(input.tagDirection, /fractured arches/);
  assert.doesNotMatch(input.tagDirection, /supernatural presence/);
  assert.match(prompt, /Canonical location: Old Keep/);
  assert.match(prompt, /Sub-location: Lower ward/);
  assert.match(prompt, /No typography/);
  assert.deepEqual(SCENE_DIMENSIONS, { width: 1536, height: 864, aspect: "16:9" });
  assert.equal(SCENE_ROOT_IDS.length, 7);
});

test("custom pins participate only when explicitly selected", () => {
  const pins = [{ id: "scene-pin-blue-hour", label: "Blue hour", payload: "cold blue light just before sunrise" }];
  assert.equal(compileSceneDirection([], [], pins), "");
  assert.equal(compileSceneDirection([pins[0].id], [], pins), pins[0].payload);

  const input = sceneInput({
    placeId: "place_keep",
    name: "Blue approach",
    pins,
    selectedTagIds: [pins[0].id],
    tagDirection: "an edited, colder interpretation"
  }, places);
  assert.equal(input.tagDirection, "an edited, colder interpretation");
});

test("scene records retain every returned variant without exposing duplicate location names", () => {
  assert.throws(() => assertUniquePlaceName("old keep", places), /already exists/);
  assert.equal(assertUniquePlaceName("River Shrine", places), "River Shrine");

  const input = sceneInput({ placeId: "place_keep", name: "Dawn", selectedTagIds: [] }, places);
  const records = sceneRecords(input, {
    url: "/generated/art/scenic/one.png",
    urls: ["/generated/art/scenic/one.png", "/generated/art/scenic/two.png"],
    seed: 42
  }, "2026-07-17T12:00:00.000Z");

  assert.equal(records.length, 2);
  assert.equal(records[0].batchId, records[1].batchId);
  assert.deepEqual(records.map((record) => record.variant), [1, 2]);
  assert.equal(records[1].seed, 42);
  assert.equal(records[0].width, 1536);
  assert.equal(records[0].height, 864);
  assert.equal(records[0].promptEnvelope, SCENE_PROMPT_ENVELOPE);
  assert.deepEqual(records[0].selectedTagIds, []);
  assert.equal("seed" in sceneLibraryView(records[0]), false);
});
