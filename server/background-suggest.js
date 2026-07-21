const ANTHROPIC_MESSAGES_URL = "https://api.anthropic.com/v1/messages";
const DEFAULT_MODEL = "claude-opus-4-8";

export const BACKGROUND_FIELD_DEFINITIONS = [
  { id: "roots", title: "Where I come from" },
  { id: "early-memory", title: "An early memory" },
  { id: "turning-point", title: "The moment that changed me" },
  { id: "road", title: "Why I took the road" },
  { id: "beliefs", title: "What I believe" },
  { id: "longing", title: "What I want" },
  { id: "fear", title: "What I fear losing" },
  { id: "unfinished", title: "What remains unfinished" }
];

const FIELD_TITLES = new Map(BACKGROUND_FIELD_DEFINITIONS.map((field) => [field.id, field.title]));
const clip = (value, limit) => String(value || "").trim().slice(0, limit);

export const BACKGROUND_SUGGEST_SYSTEM_PROMPT = `You are a careful fantasy character-writing partner for a tabletop player.
Expand the player's memory seed into one editable prose passage of 120 to 220 words. Preserve every supplied fact, name, relationship, uncertainty, point of view, tense, and language. Add sensory detail, emotional texture, and useful implications, but do not make major life decisions for the player or invent named people, places, possessions, supernatural truths, campaign lore, or events as settled fact. When the seed leaves something open, keep it suggestive rather than deciding it. Match the player's voice instead of making the prose ornate by default. Return only the expanded passage, with no heading, quotation marks, notes, alternatives, or explanation.`;

export const BACKGROUND_SPARK_SYSTEM_PROMPT = `You are a playful brainstorming partner for a tabletop player fleshing out one memory of their character.
Offer exactly three short sparks — divergent, concrete story seeds the player could riff on for the given memory. Each spark is a single sentence of at most 22 words, evocative and specific, and the three must pull in genuinely different directions (a person, an object, a place, a choice, a secret — vary them). If the player already wrote something, honour and build on those facts; if the field is empty, offer fresh openings. Never decide major life facts, invent named campaign lore, or settle supernatural truths — keep sparks suggestive questions or images, not verdicts. Write in the player's language. Return only the three sparks, each on its own line, with no numbering, bullets, headings, or commentary.`;

export const BACKGROUND_WEAVE_SYSTEM_PROMPT = `You are a warm, perceptive reader helping a tabletop player see their character whole.
Read the scattered memory fragments the player has written and reflect them back as one woven passage of 150 to 240 words. Find the throughline that connects the fragments, name one tension or contradiction that makes the character interesting, and end with a single open question the player might explore next. Preserve every supplied fact, name, relationship, point of view, and language; invent no new named people, places, or events as settled fact. This is a mirror, not a verdict: stay curious and suggestive, never authoritative, and match the player's voice. Return only the reflection, with no heading, quotation marks, or list.`;

function fieldId(value) {
  return clip(value, 60).toLowerCase().replace(/[^a-z0-9-]/g, "");
}

// Public, player-known identity only — never hidden fields. Shared by every
// prompt builder so no aid can widen the context beyond this.
function identityBlock(pc = {}) {
  return `Name: ${clip(pc.name, 120) || "Unnamed"}
Pronouns: ${clip(pc.pronouns, 120) || "Unspecified"}
Ancestry: ${clip(pc.ancestry?.name, 120) || "Unspecified"}
Community: ${clip(pc.community?.name, 120) || "Unspecified"}
Class: ${clip(pc.class?.name, 120) || "Unspecified"}
Subclass: ${clip(pc.subclass?.name, 120) || "Unspecified"}`;
}

const localeName = (locale) => (locale === "sv" ? "Swedish" : "English");

export function normalizeBackgroundEntries(value) {
  if (!Array.isArray(value)) throw new Error("Background memories must be a list.");
  const result = [];
  const seen = new Set();
  for (const entry of value.slice(0, 16)) {
    const id = fieldId(entry?.id);
    const text = clip(entry?.a, 6000);
    if (!id || !text || seen.has(id)) continue;
    const knownTitle = FIELD_TITLES.get(id);
    const q = knownTitle || clip(entry?.q, 120);
    if (!q) continue;
    seen.add(id);
    result.push({ id, q, a: text });
  }
  return result;
}

export function buildBackgroundSuggestionPrompt({ pc = {}, field = {}, currentText = "", locale = "en" } = {}) {
  const otherMemories = (pc.background || [])
    .filter((entry) => entry?.a && entry.id !== field.id)
    .slice(0, 6)
    .map((entry) => `${clip(entry.q, 120)}: ${clip(entry.a, 700)}`)
    .join("\n");
  return `CHARACTER — PUBLIC PLAYER-KNOWN CONTEXT ONLY
${identityBlock(pc)}

MEMORY FIELD
${clip(field.title, 120)}

PLAYER'S SEED
${clip(currentText, 6000)}

OTHER MEMORIES ALREADY WRITTEN — CONTINUITY ONLY
${otherMemories || "None."}

Write in ${localeName(locale)}.`;
}

export function buildSparkPrompt({ pc = {}, field = {}, currentText = "", locale = "en" } = {}) {
  const seed = clip(currentText, 2000);
  return `CHARACTER — PUBLIC PLAYER-KNOWN CONTEXT ONLY
${identityBlock(pc)}

MEMORY FIELD
${clip(field.title, 120)}

WHAT THE PLAYER HAS SO FAR
${seed || "Nothing yet — the field is blank."}

Offer three divergent sparks for this memory. Write in ${localeName(locale)}.`;
}

export function buildWeavePrompt({ pc = {}, memories = [], locale = "en" } = {}) {
  const written = memories
    .filter((entry) => entry?.a)
    .slice(0, 12)
    .map((entry) => `${clip(entry.q, 120)}: ${clip(entry.a, 900)}`)
    .join("\n\n");
  return `CHARACTER — PUBLIC PLAYER-KNOWN CONTEXT ONLY
${identityBlock(pc)}

MEMORIES THE PLAYER HAS WRITTEN
${written || "None."}

Reflect these fragments back as one woven passage. Write in ${localeName(locale)}.`;
}

// Split the model's spark reply into at most three clean, bounded lines.
export function parseSparks(text) {
  return String(text || "")
    .split(/\n+/)
    .map((line) => line.replace(/^\s*(?:[-*•–—]|\d+[.)])\s*/, "").trim())
    .filter(Boolean)
    .slice(0, 3)
    .map((line) => line.slice(0, 240));
}

function providerError(status) {
  if (status === 401 || status === 403) return new Error("The memory guide's key was refused.");
  if (status === 429) return new Error("The memory guide is occupied. Try again shortly.");
  if (status >= 500) return new Error("The memory guide could not answer. Try again shortly.");
  return new Error("The memory guide refused the request.");
}

function resolveModel(options) {
  return options.model || process.env.BACKGROUND_SUGGEST_MODEL || process.env.PORTRAIT_SUGGEST_MODEL || process.env.RETELL_MODEL || DEFAULT_MODEL;
}

// The one Anthropic round-trip every background aid shares: key check, bounded
// timeout, provider-error mapping, text extraction.
async function callAnthropic({ system, prompt, maxTokens }, options = {}) {
  const apiKey = options.apiKey || process.env.ANTHROPIC_API_KEY;
  const model = resolveModel(options);
  const fetchImpl = options.fetchImpl || globalThis.fetch;
  if (!apiKey) throw new Error("The memory guide is not engaged — set ANTHROPIC_API_KEY.");

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 45_000);
  try {
    const response = await fetchImpl(ANTHROPIC_MESSAGES_URL, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01"
      },
      body: JSON.stringify({
        model,
        max_tokens: maxTokens,
        system,
        messages: [{ role: "user", content: prompt }]
      }),
      signal: controller.signal
    });
    if (!response.ok) throw providerError(response.status);
    const body = await response.json();
    const text = (body.content || [])
      .filter((block) => block?.type === "text")
      .map((block) => block.text)
      .join("\n")
      .trim();
    return { text, model: String(body.model || model) };
  } catch (error) {
    if (error?.name === "AbortError") throw new Error("The memory guide took too long to answer.");
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

export async function suggestBackground(input, options = {}) {
  const { text, model } = await callAnthropic(
    { system: BACKGROUND_SUGGEST_SYSTEM_PROMPT, prompt: buildBackgroundSuggestionPrompt(input), maxTokens: 700 },
    options
  );
  if (!text) throw new Error("The memory guide returned an empty passage.");
  return { suggestion: text.slice(0, 6000), model };
}

// Three short, divergent seeds for one memory field — works on an empty field.
export async function suggestSparks(input, options = {}) {
  const { text, model } = await callAnthropic(
    { system: BACKGROUND_SPARK_SYSTEM_PROMPT, prompt: buildSparkPrompt(input), maxTokens: 400 },
    options
  );
  const sparks = parseSparks(text);
  if (!sparks.length) throw new Error("No sparks caught just now.");
  return { sparks, model };
}

// A holistic reflection across every memory the player has written.
export async function weaveBackground(input = {}, options = {}) {
  const memories = (input.memories || []).filter((entry) => entry?.a);
  if (!memories.length) throw new Error("Write at least one memory before weaving.");
  const { text, model } = await callAnthropic(
    { system: BACKGROUND_WEAVE_SYSTEM_PROMPT, prompt: buildWeavePrompt({ ...input, memories }), maxTokens: 700 },
    options
  );
  if (!text) throw new Error("The weave came out empty.");
  return { weave: text.slice(0, 6000), model };
}
