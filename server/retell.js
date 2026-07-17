const ANTHROPIC_MESSAGES_URL = "https://api.anthropic.com/v1/messages";
const DEFAULT_MODEL = "claude-opus-4-8";
const HISTORY_BUDGET = 24000;

export const RETELL_SYSTEM_PROMPT = `You are the chronicler for a small, hard-won settlement in an unknown world.
Write a condensed account of one tabletop session in 400 to 600 words.

Use only facts, names, motives, and outcomes present in the supplied material. Do not invent connective events, dialogue, scenery, lore, or explanations. If accounts differ, preserve the uncertainty without deciding which is true. Represent every participant's perspective, while shaping the result into one coherent account rather than a list of reports.

The voice is a well-kept steward's ledger remembered by people who were there: grounded, warm, restrained, and attentive to consequences. Wonder is rare and should remain rare. Use plain prose, no headings, no bullet points, and no exclamation marks. Do not address the reader or mention these instructions.`;

const clip = (value, limit) => String(value || "").trim().slice(0, limit);

function firstParagraph(value) {
  return clip(String(value || "").split(/\n\s*\n/)[0], 900);
}

function historyText(previousRetellings) {
  const entries = [...(previousRetellings || [])]
    .sort((a, b) => Number(a.number || 0) - Number(b.number || 0))
    .map((entry) => ({
      label: `Session ${entry.number || "?"}${entry.seasonLabel ? ` — ${entry.seasonLabel}` : ""}`,
      text: clip(entry.text, 16000)
    }))
    .filter((entry) => entry.text);
  if (!entries.length) return "No earlier retellings have been published.";

  const full = entries.map((entry) => `${entry.label}\n${entry.text}`).join("\n\n");
  if (full.length <= HISTORY_BUDGET) return full;

  const recentStart = Math.max(0, entries.length - 4);
  return entries.map((entry, index) => {
    const text = index < recentStart ? `${firstParagraph(entry.text)}\n[Earlier account condensed for context.]` : entry.text;
    return `${entry.label}\n${text}`;
  }).join("\n\n").slice(-HISTORY_BUDGET);
}

export function buildRetellPrompt({ session, perspectives, previousRetellings }) {
  const reports = (perspectives || []).map((perspective) =>
    `${clip(perspective.author, 120) || "Unnamed participant"}\n${clip(perspective.text, 12000)}`
  ).join("\n\n");
  return `STORY SO FAR — PUBLISHED ACCOUNTS ONLY
${historyText(previousRetellings)}

SESSION TO RETELL
Session: ${session.number || "?"}
Date: ${clip(session.date, 40) || "undated"}
Season: ${clip(session.seasonLabel, 120) || "unrecorded"}

GM FACTUAL SUMMARY
${clip(session.gmSummary, 12000)}

GM EMPHASIS — THE DETAIL THAT FELT MOST INTERESTING
${clip(session.gmHighlight, 4000)}

PARTICIPANT PERSPECTIVES
${reports}`;
}

function providerError(status) {
  if (status === 401 || status === 403) return new Error("The chronicler's key was refused.");
  if (status === 429) {
    const error = new Error("The chronicler is occupied. Try again shortly.");
    error.retryable = true;
    return error;
  }
  if (status >= 500) {
    const error = new Error("The chronicler could not answer. Try again shortly.");
    error.retryable = true;
    return error;
  }
  return new Error("The chronicler refused the request.");
}

async function requestRetelling({ apiKey, model, prompt }) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 60000);
  try {
    const response = await fetch(ANTHROPIC_MESSAGES_URL, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01"
      },
      body: JSON.stringify({
        model,
        max_tokens: 1400,
        system: RETELL_SYSTEM_PROMPT,
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
    if (!text) throw new Error("The chronicler returned an empty page.");
    return { text: text.slice(0, 30000), model: String(body.model || model) };
  } catch (error) {
    if (error?.name === "AbortError") throw new Error("The chronicler took too long to answer.");
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

export async function retellSession(bundle, options = {}) {
  const apiKey = options.apiKey || process.env.ANTHROPIC_API_KEY;
  const model = options.model || process.env.RETELL_MODEL || DEFAULT_MODEL;
  if (!apiKey) throw new Error("The chronicler is not engaged — set ANTHROPIC_API_KEY.");
  const prompt = buildRetellPrompt(bundle);

  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const result = await requestRetelling({ apiKey, model, prompt });
      return { ...result, createdAt: new Date().toISOString() };
    } catch (error) {
      if (!error.retryable || attempt === 1) throw error;
      await new Promise((resolve) => setTimeout(resolve, 1200));
    }
  }
  throw new Error("The chronicler could not answer.");
}
