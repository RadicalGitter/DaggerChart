const ANTHROPIC_MESSAGES_URL = "https://api.anthropic.com/v1/messages";
const DEFAULT_MODEL = "claude-opus-4-8";

export const PORTRAIT_SUGGEST_SYSTEM_PROMPT = `You are a restrained fantasy portrait art director helping a tabletop player write an image brief.
Return one polished prose paragraph of 60 to 100 words. Balance atmosphere and personality equally with concrete physical specifics. Preserve supplied facts and do not invent named possessions, history, ancestry features, or equipment. Mention only equipment present in the supplied context. Weave the two supplied colors in as accents rather than flooding the whole image. Do not use headings, bullet points, quotation marks, prompt syntax, camera metadata, or explanations.`;

const clip = (value, limit) => String(value || "").trim().slice(0, limit);

export function buildPortraitSuggestionPrompt(context = {}) {
  const tags = Array.isArray(context.tags) ? context.tags.slice(0, 20).map((tag) => clip(tag, 40)).filter(Boolean) : [];
  return `CHARACTER
Name: ${clip(context.name, 120) || "Unnamed"}
Ancestry: ${clip(context.ancestry, 120) || "Unspecified"}
Class: ${clip(context.className, 120) || "Unspecified"}
Subclass: ${clip(context.subclass, 120) || "Unspecified"}

PLAYER'S CURRENT DESCRIPTION
${clip(context.description, 1800) || "No prose has been written yet."}

VISUAL TAGS
${tags.join(", ") || "None selected"}

DETAIL COLORS
Primary class pigment: ${clip(context.primaryColor, 32) || "Unspecified"}
Secondary favorite color: ${clip(context.secondaryColor, 32) || "Unspecified"}

VISIBLE EQUIPMENT
Armor: ${clip(context.armor, 180) || "Omitted"}
Main hand: ${clip(context.mainHand, 180) || "Omitted"}
Offhand: ${clip(context.offHand, 180) || "Omitted"}`;
}

function providerError(status) {
  if (status === 401 || status === 403) return new Error("The portrait adviser's key was refused.");
  if (status === 429) return new Error("The portrait adviser is occupied. Try again shortly.");
  if (status >= 500) return new Error("The portrait adviser could not answer. Try again shortly.");
  return new Error("The portrait adviser refused the request.");
}

export async function suggestPortrait(context, options = {}) {
  const apiKey = options.apiKey || process.env.ANTHROPIC_API_KEY;
  const model = options.model || process.env.PORTRAIT_SUGGEST_MODEL || process.env.RETELL_MODEL || DEFAULT_MODEL;
  const fetchImpl = options.fetchImpl || globalThis.fetch;
  if (!apiKey) throw new Error("The portrait adviser is not engaged — set ANTHROPIC_API_KEY.");

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 30_000);
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
        max_tokens: 300,
        system: PORTRAIT_SUGGEST_SYSTEM_PROMPT,
        messages: [{ role: "user", content: buildPortraitSuggestionPrompt(context) }]
      }),
      signal: controller.signal
    });
    if (!response.ok) throw providerError(response.status);
    const body = await response.json();
    const suggestion = (body.content || [])
      .filter((block) => block?.type === "text")
      .map((block) => block.text)
      .join(" ")
      .replace(/\s+/g, " ")
      .trim();
    if (!suggestion) throw new Error("The portrait adviser returned an empty suggestion.");
    return { suggestion: suggestion.slice(0, 1800), model: String(body.model || model) };
  } catch (error) {
    if (error?.name === "AbortError") throw new Error("The portrait adviser took too long to answer.");
    throw error;
  } finally {
    clearTimeout(timer);
  }
}
