function compactText(value, max) {
  return String(value || "").replace(/\s+/g, " ").trim().slice(0, max);
}

export function musicDescription(value, max = 500) {
  const raw = String(value ?? "");
  if (raw.length > max) throw new Error("The music description is too long.");
  return raw.trim() ? raw : "";
}

export function sunoGenerationPayload(song, { model, callBackUrl }) {
  const requestedInstrumental = song.settings.instrumental !== false;
  const description = musicDescription(song.description);
  const hasLyricsDirection = Boolean(description);
  const instrumental = hasLyricsDirection ? false : requestedInstrumental;
  const customMode = requestedInstrumental || hasLyricsDirection;
  const styleLimit = model === "V4" ? 200 : 1000;
  const direction = compactText([song.prompt, song.settings.style].filter(Boolean).join(", "), styleLimit);
  const base = { customMode, instrumental, model, callBackUrl };

  if (customMode) {
    base.style = direction;
    base.title = song.title.slice(0, model === "V4" || model === "V4_5ALL" ? 80 : 100);
    if (hasLyricsDirection) base.prompt = `[${description}]`;
    if (song.settings.negativeTags) base.negativeTags = compactText(song.settings.negativeTags, 200);
    for (const key of ["styleWeight", "weirdnessConstraint", "audioWeight"]) {
      const value = Number(song.settings[key]);
      if (Number.isFinite(value)) base[key] = Math.max(0, Math.min(1, value));
    }
  } else {
    base.prompt = compactText([song.prompt, song.settings.style].filter(Boolean).join(", "), 500);
  }
  return base;
}

const CONTINUATION_PROMPTS = {
  sustain: "Continue the composition in the same dramatic register. Preserve its recognizable motif, pacing, and musical identity while incorporating the requested influences.",
  escalate: "Continue the composition while steadily increasing urgency, force, and dramatic pressure. Preserve its recognizable motif and musical identity.",
  deescalate: "Continue the composition while steadily releasing tension into a quieter, safer, and more reflective passage. Preserve its recognizable motif and musical identity."
};

export function sunoExtensionPayload(source, direction, { model, callBackUrl, modifiers = [] }) {
  if (!source?.provider?.audioId) throw new Error("The source song has no Suno audio ID.");
  const influence = Array.isArray(modifiers) ? modifiers.filter(Boolean).join(", ") : "";
  if (direction === "sustain" && !influence) {
    return {
      defaultParamFlag: false,
      audioId: source.provider.audioId
    };
  }
  if (!CONTINUATION_PROMPTS[direction]) throw new Error("Choose sustain, escalate, or de-escalate.");
  const duration = Number(source.duration);
  if (!Number.isFinite(duration) || duration <= 1) throw new Error("The source duration is not available yet.");
  const styleLimit = model === "V4" ? 200 : 1000;
  const titleLimit = model === "V4" || model === "V4_5ALL" ? 80 : 100;
  const style = compactText([
    source.prompt,
    source.settings?.style,
    direction === "escalate" ? "rising intensity and momentum"
      : direction === "deescalate" ? "falling intensity and gentle resolution" : "steady dramatic intensity",
    influence
  ].filter(Boolean).join(", "), styleLimit);
  return {
    defaultParamFlag: true,
    audioId: source.provider.audioId,
    model,
    callBackUrl,
    prompt: CONTINUATION_PROMPTS[direction],
    style: style || (direction === "escalate" ? "rising dramatic score" : direction === "deescalate" ? "quiet reflective score" : "steady dramatic score"),
    title: compactText(`${source.title} - ${direction === "escalate" ? "Rising" : direction === "deescalate" ? "Receding" : "Continued"}`, titleLimit),
    continueAt: Math.max(1, Math.min(duration - 0.1, Math.floor(duration - 1)))
  };
}
