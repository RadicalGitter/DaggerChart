import assert from "node:assert/strict";
import test from "node:test";
import {
  buildBackgroundSuggestionPrompt,
  buildSparkPrompt,
  buildWeavePrompt,
  normalizeBackgroundEntries,
  parseSparks,
  suggestBackground,
  suggestSparks,
  weaveBackground
} from "../server/background-suggest.js";

const stubFetch = (text) => async (_url, options) => ({
  ok: true,
  json: async () => ({ model: "test-model", content: [{ type: "text", text }] }),
  _options: options
});

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

test("parseSparks strips bullets and numbering and caps at three", () => {
  const sparks = parseSparks("1. A locked chest\n- The smell of tar\n* A brother's name\n4) A fourth ignored");
  assert.deepEqual(sparks, ["A locked chest", "The smell of tar", "A brother's name"]);
});

test("spark prompts carry the field and note that the field may be blank", () => {
  const prompt = buildSparkPrompt({ pc: { name: "Liora" }, field: { id: "fear", title: "What I fear losing" }, currentText: "", locale: "en" });
  assert.match(prompt, /Liora/);
  assert.match(prompt, /What I fear losing/);
  assert.match(prompt, /blank/i);
  assert.match(prompt, /Write in English/);
});

test("sparks are parsed from the model reply", async () => {
  const result = await suggestSparks(
    { pc: { name: "Liora" }, field: { id: "fear", title: "What I fear losing" }, currentText: "" },
    { apiKey: "k", model: "test-model", fetchImpl: stubFetch("A vow unspoken\nA sibling's whereabouts\nThe last coin of a dead king") }
  );
  assert.equal(result.sparks.length, 3);
  assert.equal(result.sparks[0], "A vow unspoken");
});

test("weave prompts include every written memory and reject an empty set", () => {
  const prompt = buildWeavePrompt({
    pc: { name: "Liora" },
    memories: [
      { id: "roots", q: "Where I come from", a: "A village beneath black pines." },
      { id: "fear", q: "What I fear losing", a: "My sister's trust." }
    ],
    locale: "sv"
  });
  assert.match(prompt, /black pines/);
  assert.match(prompt, /sister's trust/);
  assert.match(prompt, /Write in Swedish/);

  return assert.rejects(
    () => weaveBackground({ pc: { name: "Liora" }, memories: [] }, { apiKey: "k", fetchImpl: stubFetch("x") }),
    /at least one memory/i
  );
});

test("weave returns one reflective passage", async () => {
  const result = await weaveBackground(
    { pc: { name: "Liora" }, memories: [{ id: "roots", q: "Where I come from", a: "Black pines." }] },
    { apiKey: "k", model: "test-model", fetchImpl: stubFetch("  Everything you wrote circles one loss.  ") }
  );
  assert.equal(result.weave, "Everything you wrote circles one loss.");
});
