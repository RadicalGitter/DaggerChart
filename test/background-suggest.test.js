import assert from "node:assert/strict";
import test from "node:test";
import {
  buildBackgroundSuggestionPrompt,
  normalizeBackgroundEntries,
  suggestBackground
} from "../server/background-suggest.js";

test("background entries keep only bounded, filled, unique memories", () => {
  const entries = normalizeBackgroundEntries([
    { id: "roots", q: "Changed by the client", a: "  A village beneath black pines.  " },
    { id: "roots", q: "Duplicate", a: "Ignored" },
    { id: "fear", q: "Fear", a: "" },
    { id: "legacy-thread", q: "An older question", a: "An older answer." }
  ]);

  assert.deepEqual(entries, [
    { id: "roots", q: "Where I come from", a: "A village beneath black pines." },
    { id: "legacy-thread", q: "An older question", a: "An older answer." }
  ]);
});

test("background prompts contain only public character context and continuity", () => {
  const prompt = buildBackgroundSuggestionPrompt({
    pc: {
      name: "Liora",
      pronouns: "she/her",
      ancestry: { name: "Orc" },
      community: { name: "Wildborne" },
      class: { name: "Warrior" },
      subclass: { name: "Call of the Brave" },
      background: [{ id: "roots", q: "Where I come from", a: "A village beneath black pines." }]
    },
    field: { id: "road", title: "Why I took the road" },
    currentText: "I left before dawn.",
    locale: "sv"
  });

  assert.match(prompt, /Liora/);
  assert.match(prompt, /I left before dawn/);
  assert.match(prompt, /A village beneath black pines/);
  assert.match(prompt, /Write in Swedish/);
});

test("background adviser returns one editable expansion", async () => {
  let request = null;
  const result = await suggestBackground({
    pc: { name: "Liora" },
    field: { id: "road", title: "Why I took the road" },
    currentText: "I left before dawn."
  }, {
    apiKey: "test-key",
    model: "test-model",
    fetchImpl: async (_url, options) => {
      request = options;
      return {
        ok: true,
        json: async () => ({ model: "test-model", content: [{ type: "text", text: "  I left while the hearth was cold.  " }] })
      };
    }
  });

  const body = JSON.parse(request.body);
  assert.equal(body.model, "test-model");
  assert.equal(body.max_tokens, 700);
  assert.match(body.messages[0].content, /Why I took the road/);
  assert.equal(result.suggestion, "I left while the hearth was cold.");
});
