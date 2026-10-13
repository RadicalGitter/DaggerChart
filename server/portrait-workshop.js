import { randomUUID } from "node:crypto";

export class PortraitWorkshopError extends Error {
  constructor(key, message) { super(message); this.errorKey = `portrait.workshop.${key}`; }
}

const text = (value, max) => String(value || "").trim().slice(0, max);
const seed = (value) => value !== null && value !== undefined && value !== "" && Number.isSafeInteger(Number(value)) ? Number(value) : null;
const modifier = (value) => [-1, 0, 1, 2].includes(Number(value)) ? Number(value) : 0;

export function portraitRequest(value = {}) {
  return {
    prompt: text(value.prompt, 6000), negativePrompt: text(value.negativePrompt, 4000),
    referenceImageUrl: text(value.referenceImageUrl, 2048),
    primaryColor: text(value.primaryColor, 32), secondaryColor: text(value.secondaryColor, 32),
    tags: Array.isArray(value.tags) ? value.tags.slice(0, 20).map((tag) => text(tag, 80)) : [],
    armor: text(value.armor, 300), mainHand: text(value.mainHand, 300), offHand: text(value.offHand, 300),
    stepsModifier: [-3, -2, -1, 0, 1, 2, 3].includes(Number(value.stepsModifier)) ? Number(value.stepsModifier) : 0, cfgModifier: modifier(value.cfgModifier),
    style: ["workflow", "style1"].includes(value.style) ? value.style : "workflow",
    embellishPrompt: value.embellishPrompt !== false
  };
}

// An explicit whitelist. Never return a stored request or workshop verbatim.
export function portraitWorkshopData(pc) {
  const stored = pc.portraitWorkshop || {};
  const attempts = (Array.isArray(stored.attempts) ? stored.attempts : []).slice(-30).flatMap((attempt) => {
    const url = text(attempt?.url, 2048);
    const imageSeed = seed(attempt?.seed);
    if (!url.startsWith("/generated/art/portrait/") || imageSeed === null) return [];
    return [{ id: text(attempt.id, 100), url, seed: imageSeed, createdAt: text(attempt.createdAt, 40),
      originalUrl: text(attempt.originalUrl || url, 2048), request: portraitRequest(attempt.request) }];
  });
  const pending = stored.pending;
  return {
    portrait: text(pc.portrait, 2048) || null,
    originalUrl: text(stored.originalUrl || pc.portrait, 2048) || null,
    lastSeed: seed(stored.lastSeed),
    prompt: text(stored.sourcePrompt ?? pc.portraitPrompt, 6000),
    request: portraitRequest(stored.request || { ...stored, negativePrompt: pc.portraitNegativePrompt }),
    fixSeed: stored.fixSeed === true,
    editMode: stored.editMode === undefined ? Boolean(pc.portrait) : stored.editMode === true,
    attempts,
    pending: pending && attempts.some((attempt) => attempt.url === pending.url) ? {
      id: text(pending.id, 100), url: text(pending.url, 2048), seed: seed(pending.seed),
      originalUrl: text(pending.originalUrl, 2048), baselineUrl: text(pending.baselineUrl, 2048) || null
    } : null
  };
}

export function savePortraitPreferences(pc, input) {
  pc.portraitWorkshop = {
    ...(pc.portraitWorkshop || {}), request: portraitRequest(input),
    sourcePrompt: text(input.sourcePrompt ?? input.prompt, 6000),
    fixSeed: input.fixSeed === true, editMode: input.editMode === true
  };
}

export function stagePcPortrait(pc, result, request, sourcePrompt) {
  const data = portraitWorkshopData(pc);
  if (data.pending) throw new PortraitWorkshopError("pending", "Keep or discard the pending portrait first.");
  const resultSeed = seed(result.seed);
  const urls = (result.urls?.length ? result.urls : [result.url]).map((url) => text(url, 2048))
    .filter((url) => /^\/generated\/art\/portrait\/[^/]+\.(png|jpe?g|webp)$/i.test(url));
  if (!urls.length || resultSeed === null) throw new PortraitWorkshopError("invalidResult", "The portrait workshop returned an invalid result.");
  const origin = request.referenceImageUrl
    ? request.referenceImageUrl === pc.portrait ? data.originalUrl || pc.portrait
      : data.attempts.find((attempt) => attempt.url === request.referenceImageUrl)?.originalUrl || request.referenceImageUrl
    : urls[0];
  const attempts = urls.map((url) => ({ id: `portrait_attempt_${randomUUID()}`, url, seed: resultSeed,
    createdAt: new Date().toISOString(), originalUrl: origin, request: portraitRequest(request) }));
  pc.portraitWorkshop = {
    ...(pc.portraitWorkshop || {}), sourcePrompt: text(sourcePrompt || request.prompt, 6000),
    request: portraitRequest(request), attempts: [...data.attempts, ...attempts].slice(-30),
    pending: { id: attempts[0].id, url: attempts[0].url, seed: resultSeed, originalUrl: origin, baselineUrl: data.portrait }
  };
}

export function reviewPcPortrait(pc, input) {
  const data = portraitWorkshopData(pc);
  const stored = pc.portraitWorkshop || {};
  if (input.action === "discard") {
    if (!data.pending || input.pendingId !== data.pending.id) throw new PortraitWorkshopError("previewChanged", "That portrait preview has changed. Reload the workshop.");
    pc.portraitWorkshop = { ...stored, pending: null };
    return;
  }
  let chosen;
  if (input.action === "keep") {
    if (!data.pending || input.pendingId !== data.pending.id) throw new PortraitWorkshopError("previewChanged", "That portrait preview has changed. Reload the workshop.");
    if (data.portrait !== data.pending.baselineUrl) throw new PortraitWorkshopError("baselineChanged", "The accepted portrait has changed. Discard this preview and try again.");
    chosen = data.pending;
  } else {
    if (data.pending) throw new PortraitWorkshopError("pending", "Keep or discard the pending portrait first.");
    if (input.action === "restore") {
      if (!data.originalUrl) throw new PortraitWorkshopError("noOriginal", "There is no original portrait to restore.");
      chosen = { url: data.originalUrl, originalUrl: data.originalUrl, seed: data.attempts.find((attempt) => attempt.url === data.originalUrl)?.seed ?? null };
    } else if (input.action === "select") {
      chosen = data.attempts.find((attempt) => attempt.id === input.attemptId);
      if (!chosen) throw new PortraitWorkshopError("noAttempt", "No such portrait attempt.");
    } else throw new PortraitWorkshopError("invalidAction", "Choose a portrait review action.");
  }
  pc.portrait = chosen.url;
  pc.portraitPrompt = data.prompt;
  pc.portraitWorkshop = { ...stored, originalUrl: chosen.originalUrl, lastSeed: chosen.seed, pending: null,
    request: { ...data.request, referenceImageUrl: chosen.url } };
}
