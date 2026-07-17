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
