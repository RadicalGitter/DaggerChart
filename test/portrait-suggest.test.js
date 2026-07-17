import assert from "node:assert/strict";
import test from "node:test";
import { buildPortraitSuggestionPrompt, suggestPortrait } from "../server/portrait-suggest.js";

test("portrait suggestions contain only bounded selected context", () => {
  const prompt = buildPortraitSuggestionPrompt({
    name: "Liora",
    ancestry: "Orc",
    className: "Warrior",
    subclass: "Call of the Brave",
    description: "A watchful caravan guard with a patient expression.",
    tags: ["feminine", "weathered"],
    primaryColor: "#a44336",
    secondaryColor: "#40c9c2",
    armor: "Gambeson",
    mainHand: "Longsword",
    offHand: ""
  });

  assert.match(prompt, /Liora/);
  assert.match(prompt, /feminine, weathered/);
  assert.match(prompt, /Offhand: Omitted/);
  assert.match(prompt, /#a44336/);
});

test("portrait adviser returns one editable prose suggestion", async () => {
  let request = null;
  const result = await suggestPortrait({ name: "Liora", className: "Warrior" }, {
    apiKey: "test-key",
    model: "test-model",
    fetchImpl: async (_url, options) => {
      request = options;
      return {
        ok: true,
        json: async () => ({ model: "test-model", content: [{ type: "text", text: "  A steady figure in ember-red details.  " }] })
      };
    }
  });

  const body = JSON.parse(request.body);
  assert.equal(request.headers["x-api-key"], "test-key");
  assert.equal(body.model, "test-model");
  assert.equal(body.max_tokens, 300);
  assert.match(body.messages[0].content, /Name: Liora/);
  assert.equal(result.suggestion, "A steady figure in ember-red details.");
});
