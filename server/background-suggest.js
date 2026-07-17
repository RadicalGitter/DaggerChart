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

function fieldId(value) {
  return clip(value, 60).toLowerCase().replace(/[^a-z0-9-]/g, "");
}

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
Name: ${clip(pc.name, 120) || "Unnamed"}
Pronouns: ${clip(pc.pronouns, 120) || "Unspecified"}
Ancestry: ${clip(pc.ancestry?.name, 120) || "Unspecified"}
Community: ${clip(pc.community?.name, 120) || "Unspecified"}
Class: ${clip(pc.class?.name, 120) || "Unspecified"}
Subclass: ${clip(pc.subclass?.name, 120) || "Unspecified"}

MEMORY FIELD
${clip(field.title, 120)}

PLAYER'S SEED
${clip(currentText, 6000)}

OTHER MEMORIES ALREADY WRITTEN — CONTINUITY ONLY
${otherMemories || "None."}

Write in ${locale === "sv" ? "Swedish" : "English"}.`;
}

function providerError(status) {
  if (status === 401 || status === 403) return new Error("The memory guide's key was refused.");
  if (status === 429) return new Error("The memory guide is occupied. Try again shortly.");
  if (status >= 500) return new Error("The memory guide could not answer. Try again shortly.");
  return new Error("The memory guide refused the request.");
}

export async function suggestBackground(input, options = {}) {
  const apiKey = options.apiKey || process.env.ANTHROPIC_API_KEY;
  const model = options.model || process.env.BACKGROUND_SUGGEST_MODEL || process.env.PORTRAIT_SUGGEST_MODEL || process.env.RETELL_MODEL || DEFAULT_MODEL;
  const fetchImpl = options.fetchImpl || globalThis.fetch;
  if (!apiKey) throw new Error("The memory guide is not engaged — set ANTHROPIC_API_KEY.");
  const prompt = buildBackgroundSuggestionPrompt(input);

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
        max_tokens: 700,
        system: BACKGROUND_SUGGEST_SYSTEM_PROMPT,
        messages: [{ role: "user", content: prompt }]
      }),
      signal: controller.signal
    });
    if (!response.ok) throw providerError(response.status);
    const body = await response.json();
    const suggestion = (body.content || [])
      .filter((block) => block?.type === "text")
      .map((block) => block.text)
      .join("\n")
      .trim();
    if (!suggestion) throw new Error("The memory guide returned an empty passage.");
    return { suggestion: suggestion.slice(0, 6000), model: String(body.model || model) };
  } catch (error) {
    if (error?.name === "AbortError") throw new Error("The memory guide took too long to answer.");
    throw error;
  } finally {
    clearTimeout(timer);
  }
}
