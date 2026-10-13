import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { requiresGm } from "../server/access.js";

test("prepared adventures have usable Folk, encounter and map references", () => {
  const read = (file) => JSON.parse(fs.readFileSync(new URL(`../data/${file}`, import.meta.url), "utf8"));
  const adventures = read("adventures.json").adventures;
  const folkIds = new Set(read("characters.json").map((entry) => entry.id));
  const presetIds = new Set(read("encounter-presets.json").presets.map((entry) => entry.id));
  assert.equal(new Set(adventures.map((entry) => entry.id)).size, adventures.length);
  for (const adventure of adventures) {
    assert.ok(adventure.name && adventure.overview && adventure.hook.text);
    for (const person of adventure.characters || []) assert.ok(folkIds.has(person.folkId), person.name);
    for (const encounter of adventure.encounters || []) {
      if (encounter.presetId) assert.ok(presetIds.has(encounter.presetId), encounter.name);
    }
    assert.match(adventure.map.file, /^[a-z0-9][a-z0-9_-]*\.(png|jpe?g|webp)$/i);
    assert.ok(fs.existsSync(new URL(`../data/adventure-maps/${adventure.map.file}`, import.meta.url)));
  }
});

test("adventure preparation and preset previews are GM-only, including image reads", () => {
  for (const route of ["/api/adventures", "/api/adventures/example", "/api/adventures/example/map", "/api/encounters/presets/example"]) {
    assert.equal(requiresGm("GET", route), true, route);
    assert.equal(requiresGm("HEAD", route), true, route);
  }
  assert.equal(requiresGm("GET", "/api/screen/adventure-map/example"), false);
  assert.equal(requiresGm("POST", "/api/screen/adventure-map/example"), true);
});
