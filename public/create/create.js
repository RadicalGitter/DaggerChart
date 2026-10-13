// Character creation wizard. Each step tables its choices into the draft;
// the finished draft becomes the character sheet.
import { t, term, termify, initI18n } from "/shared/i18n.js";
import { DEFAULT_SHELL } from "/shared/shells.js";
import { PENS } from "/shared/pens.js";
import { covenantArticlesHtml } from "/shared/paper.js";
import { traitAccent, traitGraphic } from "/shared/traits.js";
import { classColor, DEFAULT_FAVORITE_COLOR, validDetailColor } from "/shared/class-colors.js";
import { setTelemetryMode } from "/shared/telemetry.js";
import { setPlayerFeatureContext } from "/shared/player-features.js";
import { domainCardEntitlement } from "/shared/domain-card-rules.js";
import { stagePortrait, keepPortraitEdit, discardPortraitEdit, restoreOriginalPortrait } from "/shared/portrait-review.js";
import "/shared/feedback.js";

const $ = (sel) => document.querySelector(sel);
const esc = (s) =>
  String(s ?? "").replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

let REF = null;
let PARTY = [];
let CAMPAIGNS = [];
let CURRENT_CAMPAIGN_ID = null;
let ART_STATUS = { workflows: { portrait: { ready: false } }, suggestions: { ready: false } };
let step = 0;
let part = 0;
let moving = false;
let draftSaveTimer = null;
let draftComplete = false;
let portraitBusy = false;
let workshopPc = null;
let preferenceSave = Promise.resolve();

const DRAFT_KEY = "settlement-create-draft";
const DRAFT_ID_KEY = "settlement-create-draft-id";
const draftParams = new URLSearchParams(location.search);
const isPortraitWorkshop = location.pathname.startsWith("/portrait") || draftParams.has("pc");
const portraitPcId = draftParams.get("pc") || (isPortraitWorkshop ? localStorage.getItem("settlement-pc") : null);
if (!isPortraitWorkshop && draftParams.get("new") === "1") {
  localStorage.removeItem(DRAFT_KEY);
  localStorage.removeItem(DRAFT_ID_KEY);
  // `new=1` is a one-shot command. Leaving it in the address makes any later
  // reload, including the language switch, discard the draft a second time.
  draftParams.delete("new");
  const query = draftParams.toString();
  history.replaceState(null, "", `${location.pathname}${query ? `?${query}` : ""}${location.hash}`);
}
const draftId = draftParams.get("draft") || localStorage.getItem(DRAFT_ID_KEY) || `draft_${crypto.randomUUID?.() || `${Date.now()}_${Math.random().toString(36).slice(2, 10)}`}`;
if (!isPortraitWorkshop) localStorage.setItem(DRAFT_ID_KEY, draftId);

const draft = {
  campaignId: null,
  name: "", player: "", pronouns: "",
  classId: null, subclassId: null, classItem: null,
  ancestryId: null, communityId: null,
  traits: { Agility: null, Strength: null, Finesse: null, Instinct: null, Presence: null, Knowledge: null },
  primaryId: null, secondaryId: null, armorId: null, potion: null,
  experiences: ["", ""],
  background: {},   // question -> answer
  domainCardIds: [],
  connections: {},  // question/name -> note
  shell: DEFAULT_SHELL,
  pen: PENS[0].id,
  portrait: null,
  portraitPrompt: "",
  portraitNegativePrompt: "",
  portraitSeed: null,
  portraitFixSeed: false,
  portraitStepsModifier: 0,
  portraitCfgModifier: 0,
  portraitStyle: "workflow",
  portraitKeepLook: false,
  portraitReferenceUrl: "",
  portraitOriginal: null,
  portraitEditPending: null,
  portraitEmbellishPrompt: true,
  portraitAttempts: [],
  portraitSuggestion: "",
  portraitTextSource: "mine",
  portraitTags: [],
  portraitEquipment: { armor: true, mainHand: true, offHand: true },
  favoriteColor: DEFAULT_FAVORITE_COLOR,
  covenant: { read: false, warned: false, signed: false, signedAt: null }
};

const cls = () => REF.classes.find((c) => c.id === draft.classId) || null;
const sub = () => cls()?.subclasses.find((s) => s.id === draft.subclassId) || null;
const anc = () => REF.ancestries.find((a) => a.id === draft.ancestryId) || null;
const com = () => REF.communities.find((c) => c.id === draft.communityId) || null;
const wpn = (id) => REF.weapons.find((w) => w.id === id) || null;
const arm = () => REF.armors.find((a) => a.id === draft.armorId) || null;
const requiredDomainCardCount = () => domainCardEntitlement({
  level: 1,
  class: cls(),
  subclass: sub(),
  domainCards: draft.domainCardIds.map((id) => ({ id }))
}, REF).expected;

const PORTRAIT_TAGS = [
  { id: "masculine", label: "portrait.tag.masculine", prompt: "masculine" },
  { id: "feminine", label: "portrait.tag.feminine", prompt: "feminine" },
  { id: "androgynous", label: "portrait.tag.androgynous", prompt: "androgynous" },
  { id: "weathered", label: "portrait.tag.weathered", prompt: "weathered" },
  { id: "elegant", label: "portrait.tag.elegant", prompt: "elegant" },
  { id: "fierce", label: "portrait.tag.fierce", prompt: "fierce" },
  { id: "gentle", label: "portrait.tag.gentle", prompt: "gentle" },
  { id: "uncanny", label: "portrait.tag.uncanny", prompt: "uncanny" },
  { id: "practical", label: "portrait.tag.practical", prompt: "practical" }
];
const PORTRAIT_STEP_MODIFIERS = [-3, -2, -1, 0, 1, 2, 3];
const PORTRAIT_MODIFIERS = [-1, 0, 1, 2];
const PORTRAIT_STYLES = ["workflow", "style1"];

function portraitModifier(value, kind = "cfg") {
  const numeric = Number(value);
  return (kind === "steps" ? PORTRAIT_STEP_MODIFIERS : PORTRAIT_MODIFIERS).includes(numeric) ? numeric : 0;
}

function portraitModifierLabel(value, kind = "cfg") {
  const numeric = portraitModifier(value, kind);
  return `${numeric >= 0 ? "+" : ""}${numeric}`;
}

function portraitStyle(value) {
  return PORTRAIT_STYLES.includes(String(value)) ? String(value) : "workflow";
}

function portraitStyleLabel(value) {
  return t(`portrait.${portraitStyle(value)}`);
}

function normalizePortraitRequest(request = {}) {
  return {
    prompt: String(request.prompt || "").trim().slice(0, 6_000),
    negativePrompt: String(request.negativePrompt || "").trim().slice(0, 4_000),
    referenceImageUrl: String(request.referenceImageUrl || "").trim().slice(0, 2048),
    originalPortraitUrl: String(request.originalPortraitUrl || "").trim().slice(0, 2048),
    primaryColor: String(request.primaryColor || "").trim().slice(0, 32),
    secondaryColor: String(request.secondaryColor || "").trim().slice(0, 32),
    tags: Array.isArray(request.tags) ? request.tags.slice(0, 20).map((tag) => String(tag).slice(0, 80)) : [],
    armor: String(request.armor || "").trim().slice(0, 300),
    mainHand: String(request.mainHand || "").trim().slice(0, 300),
    offHand: String(request.offHand || "").trim().slice(0, 300),
    stepsModifier: portraitModifier(request.stepsModifier, "steps"),
    cfgModifier: portraitModifier(request.cfgModifier),
    style: portraitStyle(request.style),
    embellishPrompt: request.embellishPrompt !== false
  };
}

function normalizePortraitAttempts(value) {
  if (!Array.isArray(value)) return [];
  return value.flatMap((attempt, index) => {
    const url = String(attempt?.url || "");
    const seed = Number(attempt?.seed);
    if (!url.startsWith("/generated/art/portrait/") || !Number.isSafeInteger(seed)) return [];
    return [{
      id: String(attempt.id || `portrait_attempt_${index}_${seed}`).replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 100),
      url,
      seed,
      createdAt: String(attempt.createdAt || ""),
      originalUrl: String(attempt.originalUrl || (attempt.request?.referenceImageUrl ? "" : url)),
      request: normalizePortraitRequest(attempt.request)
    }];
  });
}

const featHtml = (f) => `<div class="featline"><strong>${esc(f.name)}</strong> ${termify(esc(f.text))}</div>`;
const campaignChoiceVisible = () => CAMPAIGNS.length > 1;
function traitValue(value) {
  return value === null ? "—" : `${value >= 0 ? "+" : ""}${value}`;
}

function traitImpact(value) {
  if (value === 2) return t("traits.impact.plus2");
  if (value === 1) return t("traits.impact.plus1");
  if (value === 0) return t("traits.impact.zero");
  if (value === -1) return t("traits.impact.minus1");
  return t("traits.unassigned");
}

function assignTrait(name, value) {
  const previous = draft.traits[name];
  if (previous === value) return;
  const limit = REF.traitArray.filter((candidate) => candidate === value).length;
  const occupied = REF.traits.filter((candidate) => candidate !== name && draft.traits[candidate] === value);
  if (occupied.length >= limit) draft.traits[occupied[0]] = previous;
  draft.traits[name] = value;
}

function portraitRequestContext() {
  const primaryColor = workshopPc?.primaryColor || classColor(draft.classId);
  const secondaryColor = validDetailColor(draft.favoriteColor);
  const selectedTags = PORTRAIT_TAGS.filter((tag) => draft.portraitTags.includes(tag.id)).map((tag) => tag.prompt);
  const equipment = {
    armor: draft.portraitEquipment.armor ? workshopPc?.armor || arm()?.name || "" : "",
    mainHand: draft.portraitEquipment.mainHand ? workshopPc?.mainHand || wpn(draft.primaryId)?.name || "" : "",
    offHand: draft.portraitEquipment.offHand ? workshopPc?.offHand || wpn(draft.secondaryId)?.name || "" : ""
  };
  const equipmentText = [
    equipment.armor && `armor: ${equipment.armor}`,
    equipment.mainHand && `main hand: ${equipment.mainHand}`,
    equipment.offHand && `off hand: ${equipment.offHand}`
  ].filter(Boolean);
  const sourceText = draft.portraitTextSource === "suggestion" && draft.portraitSuggestion
    ? draft.portraitSuggestion
    : draft.portraitPrompt;
  if (draft.portraitKeepLook) return {
    prompt: sourceText.trim(), primaryColor: "", secondaryColor: "", selectedTags: [],
    armor: "", mainHand: "", offHand: ""
  };
  const prompt = [
    "A character portrait balancing atmosphere and concrete physical specifics equally.",
    sourceText.trim(),
    selectedTags.length ? `Visual identity: ${selectedTags.join(", ")}.` : "",
    `Use ${primaryColor} as the primary class detail color and ${secondaryColor} as the secondary favorite-color accent.`,
    equipmentText.length ? `Visible equipment: ${equipmentText.join("; ")}.` : "Do not feature equipment."
  ].filter(Boolean).join(" ");
  return { prompt, primaryColor, secondaryColor, selectedTags, ...equipment };
}

function portraitRequestSnapshot(context = portraitRequestContext()) {
  return normalizePortraitRequest({
    prompt: context.prompt,
    negativePrompt: draft.portraitNegativePrompt,
    referenceImageUrl: draft.portraitKeepLook ? draft.portraitReferenceUrl : "",
    originalPortraitUrl: draft.portraitKeepLook
      ? draft.portraitReferenceUrl === draft.portrait ? draft.portraitOriginal || draft.portrait : draft.portraitReferenceUrl
      : "",
    primaryColor: context.primaryColor,
    secondaryColor: context.secondaryColor,
    tags: context.selectedTags,
    armor: context.armor,
    mainHand: context.mainHand,
    offHand: context.offHand,
    stepsModifier: draft.portraitStepsModifier,
    cfgModifier: draft.portraitCfgModifier,
    style: draft.portraitStyle,
    embellishPrompt: draft.portraitEmbellishPrompt
  });
}

function collectPortraitFields(root = document) {
  const prompt = root.querySelector("#portrait-prompt");
  const negative = root.querySelector("#portrait-negative");
  const favorite = root.querySelector("#portrait-favorite-color");
  const fixSeed = root.querySelector("#portrait-fix-seed");
  const embellishPrompt = root.querySelector("#portrait-embellish-prompt");
  const reference = root.querySelector("#portrait-reference-url");
  if (prompt) draft.portraitPrompt = prompt.value.trim();
  if (negative) draft.portraitNegativePrompt = negative.value.trim();
  if (favorite) draft.favoriteColor = validDetailColor(favorite.value);
  if (fixSeed) draft.portraitFixSeed = fixSeed.checked;
  if (embellishPrompt) draft.portraitEmbellishPrompt = embellishPrompt.checked;
  if (reference) draft.portraitReferenceUrl = reference.value.trim();
  for (const input of root.querySelectorAll("[data-portrait-equipment]")) {
    draft.portraitEquipment[input.dataset.portraitEquipment] = input.checked;
  }
}

function portraitHistoryHtml() {
  if (!draft.portraitAttempts.length) return "";
  const attempts = draft.portraitAttempts.map((attempt, index) => ({ ...attempt, number: index + 1 })).reverse();
  return `<section class="portrait-history" aria-labelledby="portrait-history-title">
    <header><h3 id="portrait-history-title">${t("portrait.history")}</h3><p>${t("portrait.historyHelp")}</p></header>
    <div class="portrait-history-grid">${attempts.map((attempt) => `<article class="portrait-attempt ${attempt.url === draft.portrait ? "selected" : ""}">
      <img src="${esc(attempt.url)}" alt="${esc(t("portrait.attempt", { number: attempt.number }))}" loading="lazy" draggable="false">
      <div class="portrait-attempt-copy">
        <strong>${t("portrait.attempt", { number: attempt.number })}</strong>
        <small>${t("portrait.attemptSettings", { style: portraitStyleLabel(attempt.request.style), steps: portraitModifierLabel(attempt.request.stepsModifier, "steps"), cfg: portraitModifierLabel(attempt.request.cfgModifier), promptMode: t(attempt.request.embellishPrompt === false ? "portrait.promptModeVerbatim" : "portrait.promptModeEmbellished") })}</small>
        <span>${t("portrait.seedArchived")}</span>
        ${attempt.request.referenceImageUrl ? `<span>${t("portrait.editedAttempt")}</span>` : ""}
      </div>
      <div class="portrait-attempt-actions">
        <button class="quiet" type="button" data-portrait-use="${esc(attempt.id)}" ${draft.portraitEditPending ? "disabled" : ""}>${t("portrait.useAttempt")}</button>
        <button type="button" data-portrait-retry="${esc(attempt.id)}" ${draft.portraitEditPending ? "disabled" : ""}>${t("portrait.goAgain")}</button>
      </div>
    </article>`).join("")}</div>
  </section>`;
}

function portraitStudioHtml() {
  const ready = ART_STATUS.workflows?.portrait?.ready === true;
  const adviserReady = ART_STATUS.suggestions?.ready === true;
  const primaryColor = workshopPc?.primaryColor || classColor(draft.classId);
  const secondaryColor = validDetailColor(draft.favoriteColor);
  const offHandAvailable = Boolean(workshopPc?.offHand || wpn(draft.secondaryId));
  const textSource = draft.portraitTextSource === "suggestion" && draft.portraitSuggestion ? "suggestion" : "mine";
  const previewUrl = draft.portraitEditPending?.url || draft.portrait;
  const preview = previewUrl
    ? `<img src="${esc(previewUrl)}" alt="">`
    : `<span aria-hidden="true">${esc((draft.name || "?").slice(0, 1).toUpperCase())}</span><small>${t("portrait.empty")}</small>`;
  return `<div class="portrait-studio">
    <div><div class="portrait-canvas ${previewUrl ? "has-image" : ""}" style="--portrait-primary:${primaryColor};--portrait-secondary:${secondaryColor}">${preview}</div>
      ${draft.portraitEditPending ? `<div class="portrait-edit-review" role="status"><p>${t("portrait.reviewEdit")}</p><div class="portrait-actions"><button id="portrait-keep-edit" type="button">${t("portrait.keepEdit")}</button><button id="portrait-discard-edit" class="quiet" type="button">${t("portrait.discardEdit")}</button></div></div>` : ""}
      ${draft.portraitOriginal && draft.portrait !== draft.portraitOriginal ? `<button id="portrait-restore-original" class="quiet" type="button" ${draft.portraitEditPending ? "disabled" : ""}>${t("portrait.restoreOriginal")}</button>` : ""}
    </div>
    <div class="portrait-controls">
      <label for="portrait-prompt">${t(draft.portraitKeepLook ? "portrait.changes" : "portrait.prompt")}</label>
      <p class="portrait-balance">${t(draft.portraitKeepLook ? "portrait.changeHelp" : "portrait.balance")}</p>
      <textarea id="portrait-prompt" rows="5" placeholder="${esc([draft.name, anc()?.name, cls()?.name].filter(Boolean).join(", "))}">${esc(draft.portraitPrompt)}</textarea>
      ${ART_STATUS.workflows?.portrait?.referenceImage ? `<fieldset class="portrait-reference">
        <legend>${t("portrait.mode")}</legend>
        <div class="portrait-source-buttons" role="group" aria-label="${t("portrait.mode")}">${["generate", "edit"].map((mode) => `<button type="button" data-portrait-mode="${mode}" class="${draft.portraitKeepLook === (mode === "edit") ? "selected" : ""}" aria-pressed="${draft.portraitKeepLook === (mode === "edit")}" ${draft.portraitEditPending ? "disabled" : ""}>${t(`portrait.mode.${mode}`)}</button>`).join("")}</div>
        ${draft.portraitKeepLook ? `<p class="portrait-balance">${t("portrait.editHelp")}</p><label for="portrait-reference-url">${t("portrait.referenceUrl")}</label><input id="portrait-reference-url" type="text" value="${esc(draft.portraitReferenceUrl)}" maxlength="2048" placeholder="https://…" ${draft.portraitEditPending ? "disabled" : ""}>` : ""}
      </fieldset>` : ""}
      <div class="portrait-writing-tools">
        <div class="portrait-source-buttons" role="group" aria-label="${t("portrait.textSource")}">
          <button id="portrait-use-own" type="button" class="${textSource === "mine" ? "selected" : ""}" aria-pressed="${textSource === "mine"}">${t("portrait.useOwn")}</button>
          <button id="portrait-use-suggestion" type="button" class="${textSource === "suggestion" ? "selected" : ""}" aria-pressed="${textSource === "suggestion"}" ${draft.portraitSuggestion ? "" : "disabled"}>${t("portrait.useSuggestion")}</button>
        </div>
        <button class="quiet" id="portrait-suggest" type="button" ${adviserReady ? "" : "disabled"}>${t("portrait.suggest")}</button>
        <small>${adviserReady ? t("portrait.suggestReady") : t("portrait.suggestAwaiting")}</small>
      </div>
      ${draft.portraitSuggestion ? `<aside class="portrait-suggestion"><p>${esc(draft.portraitSuggestion)}</p></aside>` : ""}
      <div class="portrait-pigments" ${draft.portraitKeepLook ? "hidden" : ""}>
        <span class="portrait-pigment"><i style="--pigment:${primaryColor}" aria-hidden="true"></i><span><small>${t("portrait.classColor")}</small><strong>${esc(cls()?.name || "")}</strong></span></span>
        <label class="portrait-pigment" for="portrait-favorite-color"><input id="portrait-favorite-color" type="color" value="${secondaryColor}" aria-label="${t("portrait.favoriteColor")}"><span><small>${t("portrait.favoriteColor")}</small><strong id="portrait-favorite-value">${secondaryColor}</strong></span></label>
      </div>
      <fieldset class="portrait-tag-field" ${draft.portraitKeepLook ? "hidden" : ""}>
        <legend>${t("portrait.tags")}</legend>
        <div class="portrait-tags">${PORTRAIT_TAGS.map((tag) => `<button type="button" data-portrait-tag="${tag.id}" class="${draft.portraitTags.includes(tag.id) ? "selected" : ""}" aria-pressed="${draft.portraitTags.includes(tag.id)}">${t(tag.label)}</button>`).join("")}</div>
      </fieldset>
      <fieldset class="portrait-equipment" ${draft.portraitKeepLook ? "hidden" : ""}>
        <legend>${t("portrait.equipment")}</legend>
        <label><input type="checkbox" data-portrait-equipment="armor" ${draft.portraitEquipment.armor ? "checked" : ""}> <span>${t("portrait.includeArmor")}</span></label>
        <label><input type="checkbox" data-portrait-equipment="mainHand" ${draft.portraitEquipment.mainHand ? "checked" : ""}> <span>${t("portrait.includeMain")}</span></label>
        <label class="${offHandAvailable ? "" : "unavailable"}"><input type="checkbox" data-portrait-equipment="offHand" ${offHandAvailable && draft.portraitEquipment.offHand ? "checked" : ""} ${offHandAvailable ? "" : "disabled"}> <span>${t("portrait.includeOffhand")}</span></label>
      </fieldset>
      <fieldset class="portrait-tuning">
        <legend>${t("portrait.tuning")}</legend>
        <div class="portrait-style-group">
          <span>${t("portrait.style")}</span>
          <div class="portrait-style-buttons" role="group" aria-label="${t("portrait.style")}">${PORTRAIT_STYLES.map((style) => `<button type="button" data-portrait-style="${style}" class="${portraitStyle(draft.portraitStyle) === style ? "selected" : ""}" aria-pressed="${portraitStyle(draft.portraitStyle) === style}">${portraitStyleLabel(style)}</button>`).join("")}</div>
        </div>
        <div class="portrait-tuning-row">
          ${[["steps", "portrait.steps", draft.portraitStepsModifier], ["cfg", "portrait.cfg", draft.portraitCfgModifier]].map(([kind, label, current]) => `<div class="portrait-modifier-group">
            <span>${t(label)}</span>
            <div class="portrait-modifier-buttons" style="grid-template-columns:repeat(${kind === "steps" ? 7 : 4},minmax(0,1fr))" role="group" aria-label="${t(label)}">${(kind === "steps" ? PORTRAIT_STEP_MODIFIERS : PORTRAIT_MODIFIERS).map((value) => `<button type="button" data-portrait-modifier="${kind}" data-value="${value}" class="${portraitModifier(current, kind) === value ? "selected" : ""} ${value === 0 ? "recommended" : ""}" aria-pressed="${portraitModifier(current, kind) === value}">${portraitModifierLabel(value, kind)}${value === 0 ? `<small>${t("portrait.recommended")}</small>` : ""}</button>`).join("")}</div>
          </div>`).join("")}
        </div>
        <label class="portrait-seed-toggle"><input id="portrait-embellish-prompt" type="checkbox" ${draft.portraitEmbellishPrompt ? "checked" : ""}><span><strong>${t("portrait.embellish")}</strong><small>${t("portrait.embellishHelp")}</small></span></label>
        <label class="portrait-seed-toggle"><input id="portrait-fix-seed" type="checkbox" ${draft.portraitFixSeed ? "checked" : ""}><span><strong>${t("portrait.fixSeed")}</strong><small>${t("portrait.fixSeedHelp")}</small></span></label>
      </fieldset>
      <details class="portrait-advanced">
        <summary>${t("portrait.negative")}</summary>
        <textarea id="portrait-negative" rows="2">${esc(draft.portraitNegativePrompt)}</textarea>
      </details>
      <div class="portrait-actions">
        <button id="portrait-generate" type="button" ${ready && !draft.portraitEditPending ? "" : "disabled"}>${t(draft.portraitKeepLook ? "portrait.edit" : "portrait.generate")}</button>
        ${draft.portrait ? `<button class="quiet" id="portrait-clear" type="button" ${draft.portraitEditPending ? "disabled" : ""}>${t("portrait.clear")}</button>` : ""}
      </div>
      <p class="portrait-status ${ready && ART_STATUS.generation?.ready ? "ready" : ""}" role="status">${ART_STATUS.generation?.ready ? t("portrait.ready") : t("portrait.unavailable")}</p>
    </div>
  </div>${portraitHistoryHtml()}`;
}

async function generatePortrait(button, request, seed) {
  if (portraitBusy || draft.portraitEditPending) return;
  const payload = normalizePortraitRequest(request);
  if (!payload.prompt) { $("#warn").textContent = t("portrait.prompt"); return; }
  const originalLabel = button.textContent;
  portraitBusy = true;
  for (const control of document.querySelectorAll(".portrait-studio button, .portrait-studio input, .portrait-studio textarea, .portrait-history button, #btn-next, #btn-back")) control.disabled = true;
  button.disabled = true;
  button.textContent = t("portrait.generating");
  $("#warn").textContent = "";
  try {
    clearTimeout(draftSaveTimer);
    await preferenceSave;
    const body = { ...(isPortraitWorkshop ? { sourcePrompt: draft.portraitPrompt } : { draftId }), ...payload };
    if (Number.isSafeInteger(seed)) body.seed = seed;
    const response = await fetch(isPortraitWorkshop ? `/api/party/${encodeURIComponent(portraitPcId)}/portrait-workshop` : "/api/art/portrait", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });
    const result = await response.json();
    if (!response.ok) {
      if (result.errorKey === "portrait.unavailable") {
        ART_STATUS.generation = { ready: false, reason: result.reason };
        const status = document.querySelector(".portrait-status");
        if (status) {
          status.classList.remove("ready");
          status.textContent = t("portrait.unavailable");
        }
      }
      throw new Error(result.errorKey ? t(result.errorKey) : result.error || t("error.generic"));
    }
    if (isPortraitWorkshop) {
      applyWorkshop(result);
      ART_STATUS.generation = { ready: true, reason: null };
      rerender();
      return;
    }
    const resultSeed = Number(result.seed);
    const urls = (Array.isArray(result.urls) && result.urls.length ? result.urls : [result.url])
      .map((url) => String(url || ""))
      .filter((url) => url.startsWith("/generated/art/portrait/"));
    if (!urls.length || !Number.isSafeInteger(resultSeed)) throw new Error(t("portrait.invalidResult"));
    const createdAt = new Date().toISOString();
    const requestCopy = normalizePortraitRequest(payload);
    const additions = urls.map((url, index) => ({
      id: `portrait_attempt_${crypto.randomUUID?.() || `${Date.now()}_${index}`}`,
      url,
      seed: resultSeed,
      createdAt,
      originalUrl: payload.referenceImageUrl ? payload.originalPortraitUrl || payload.referenceImageUrl : url,
      request: { ...requestCopy, tags: [...requestCopy.tags] }
    }));
    draft.portraitAttempts.push(...additions);
    stagePortrait(draft, { url: String(result.url || additions[0].url), seed: resultSeed }, payload.referenceImageUrl, additions[0].originalUrl);
    ART_STATUS.generation = { ready: true, reason: null };
    rerender();
  } catch (error) {
    rerender();
    $("#warn").textContent = error.message;
    button.disabled = false;
    button.textContent = originalLabel;
  } finally {
    portraitBusy = false;
    $("#btn-next").disabled = false;
    $("#btn-back").disabled = false;
  }
}

// ---------- steps ----------
const steps = [
  {
    title: (currentPart) => campaignChoiceVisible() && currentPart === 0 ? t("step.campaign.title") : t("step.who.title"),
    sub: (currentPart) => campaignChoiceVisible() && currentPart === 0 ? t("step.campaign.sub") : t("step.who.sub"),
    parts: () => campaignChoiceVisible() ? 2 : 1,
    render(currentPart) {
      if (campaignChoiceVisible() && currentPart === 0) return `<div class="campaign-options">${CAMPAIGNS.map((campaign, index) => `
        <button class="card pick campaign-pick ${draft.campaignId === campaign.id ? "selected" : ""}" type="button" data-campaign-pick="${esc(campaign.id)}" aria-pressed="${draft.campaignId === campaign.id}" style="--campaign-accent:${["#b08a50", "#668b78", "#8b6258", "#6b7895"][index % 4]}">
          <span class="campaign-sigil" aria-hidden="true"><i>${index + 1}</i></span>
          <span class="campaign-copy"><strong>${esc(campaign.name)}</strong><small>${campaign.id === CURRENT_CAMPAIGN_ID ? t("campaign.current") : t("campaign.available")}</small></span>
        </button>`).join("")}</div>`;
      return `<div class="identity-inscription">
        <div class="formrow identity-name"><label for="f-name">${t("label.charname")}</label><input type="text" id="f-name" value="${esc(draft.name)}" autocomplete="off"></div>
        <div class="formrow"><label for="f-pronouns">${t("label.pronouns")}</label><input type="text" id="f-pronouns" value="${esc(draft.pronouns)}" autocomplete="off"></div>
        <div class="formrow"><label for="f-player">${t("label.player")}</label><input type="text" id="f-player" value="${esc(draft.player)}" autocomplete="off"></div>
      </div>`;
    },
    wire(root) {
      for (const button of root.querySelectorAll("[data-campaign-pick]")) button.onclick = () => {
        draft.campaignId = button.dataset.campaignPick;
        rerender();
      };
    },
    collect(currentPart) {
      if (campaignChoiceVisible() && currentPart === 0) {
        if (!CAMPAIGNS.some((campaign) => campaign.id === draft.campaignId)) return t("warn.campaign");
        return;
      }
      draft.name = $("#f-name").value.trim();
      draft.pronouns = $("#f-pronouns").value.trim();
      draft.player = $("#f-player").value.trim();
      if (!draft.name) return t("warn.name");
    }
  },
  {
    title: () => t("step.class.title"),
    sub: () => t("step.class.sub"),
    render() {
      return `<div class="options">${REF.classes
        .map(
          (c) => `<button type="button" class="card pick class-pick ${draft.classId === c.id ? "selected" : ""}" data-pick="${c.id}" style="--class-pigment:${classColor(c.id)}">
            <h3>${esc(c.name)}</h3>
            <div class="smallcaps">${c.domains.map(esc).join(" · ")}</div>
            <div class="desc">${esc(c.description.split(". ")[0])}.</div>
            <div class="muted" style="font-size:0.82rem; margin-top:0.4rem;">${term("evasion", "Evasion")} ${c.startingEvasion} · ${term("hp", "Hit Points")} ${c.startingHitPoints}</div>
          </button>`
        )
        .join("")}</div>`;
    },
    onPick(id) {
      if (draft.classId !== id) {
        draft.subclassId = null;
        draft.classItem = null;
        draft.domainCardIds = [];
        draft.background = {};
        draft.connections = {};
      }
      draft.classId = id;
    },
    collect() {
      if (!draft.classId) return t("warn.class");
    }
  },
  {
    title: () => t("step.subclass.title"),
    sub: () => t("step.subclass.sub"),
    parts: () => cls()?.classItems.length ? 2 : 1,
    render(currentPart) {
      const c = cls();
      if (currentPart === 1) {
        return `<div class="smallcaps" style="text-align:center; margin-bottom:0.6rem;">${t("subclass.item")}</div>
          <div class="options">${c.classItems
             .map((it) => `<button type="button" class="card pick ${draft.classItem === it ? "selected" : ""}" data-item="${esc(it)}">${esc(it)}</button>`)
             .join("")}</div>`;
      }
      return `<div class="options wide">${c.subclasses
        .map(
          (s) => `<button type="button" class="card pick ${draft.subclassId === s.id ? "selected" : ""}" data-pick="${s.id}">
            <h3>${esc(s.name)}</h3>
            ${s.spellcastTrait ? `<div class="smallcaps">${term("spellcast", "Spellcast")}: ${esc(s.spellcastTrait)}</div>` : ""}
            ${s.foundation.map(featHtml).join("")}
          </button>`
        )
        .join("")}</div>`;
    },
    onPick(id) { draft.subclassId = id; },
    collect(currentPart) {
      if (currentPart === 0 && !draft.subclassId) return t("warn.subclass");
      if (currentPart === 1 && !draft.classItem) return t("warn.classitem");
    }
  },
  {
    title: () => t("step.heritage.title"),
    sub: () => t("step.heritage.sub"),
    parts: 2,
    render(currentPart) {
      if (currentPart === 0) return `<div class="smallcaps" style="text-align:center; margin-bottom:0.6rem;">${t("heritage.ancestry")}</div>
        <div class="options">${REF.ancestries
          .map(
            (a) => `<button type="button" class="card pick ${draft.ancestryId === a.id ? "selected" : ""}" data-anc="${a.id}">
              <h3>${esc(a.name)}</h3>
              ${draft.ancestryId === a.id ? a.features.map(featHtml).join("") : `<div class="desc">${esc(a.description.split(". ")[0])}.</div>`}
            </button>`
          )
          .join("")}</div>`;
      return `<div class="smallcaps" style="text-align:center; margin-bottom:0.6rem;">${t("heritage.community")}</div>
        <div class="options">${REF.communities
          .map(
            (c) => `<button type="button" class="card pick ${draft.communityId === c.id ? "selected" : ""}" data-com="${c.id}">
              <h3>${esc(c.name)}</h3>
              ${draft.communityId === c.id ? c.features.map(featHtml).join("") : `<div class="desc">${esc(c.description.split(". ")[0])}.</div>`}
            </button>`
          )
          .join("")}</div>`;
    },
    wire(root) {
      for (const el of root.querySelectorAll("[data-anc]")) el.onclick = () => { draft.ancestryId = el.dataset.anc; rerender(); };
      for (const el of root.querySelectorAll("[data-com]")) el.onclick = () => { draft.communityId = el.dataset.com; rerender(); };
    },
    collect(currentPart) {
      if (currentPart === 0 && !draft.ancestryId) return t("warn.ancestry");
      if (currentPart === 1 && !draft.communityId) return t("warn.community");
    }
  },
  {
    title: () => t("step.traits.title"),
    sub: () => t("step.traits.sub"),
    render() {
      const values = [...new Set(REF.traitArray)].sort((a, b) => b - a);
      const budget = values.map((value) => {
        const total = REF.traitArray.filter((candidate) => candidate === value).length;
        const used = Object.values(draft.traits).filter((candidate) => candidate === value).length;
        return `<span class="trait-budget-token ${used === total ? "filled" : ""}"><strong>${traitValue(value)}</strong><small>${used}/${total}</small></span>`;
      }).join("");
      return `<div class="trait-budget"><span>${t("traits.array")}</span><div>${budget}</div></div>
        <div class="trait-grid">${REF.traits
        .map(
          (tr) => `<article class="trait-cell ${draft.traits[tr] === null ? "unassigned" : ""}" style="--trait-accent:${traitAccent(tr)}">
            <header><span class="trait-symbol">${traitGraphic(tr)}</span><div><h3>${term("trait-" + tr.toLowerCase(), tr)}</h3><strong class="trait-current">${traitValue(draft.traits[tr])}</strong></div></header>
            <p class="trait-blurb">${t(`trait.${tr.toLowerCase()}.blurb`)}</p>
            <div class="trait-values" role="group" aria-label="${esc(tr)}">${values.map((value) => `<button type="button" data-trait-name="${esc(tr)}" data-trait-value="${value}" class="${draft.traits[tr] === value ? "selected" : ""}" aria-pressed="${draft.traits[tr] === value}">${traitValue(value)}</button>`).join("")}</div>
            <p class="trait-impact">${traitImpact(draft.traits[tr])}</p>
          </article>`
        )
        .join("")}</div>`;
    },
    wire(root) {
      for (const button of root.querySelectorAll("[data-trait-value]")) {
        button.onclick = () => {
          assignTrait(button.dataset.traitName, Number(button.dataset.traitValue));
          rerender();
        };
      }
    },
    collect() {
      const vals = Object.values(draft.traits);
      if (vals.some((v) => v === null)) return t("warn.traits.all");
      const need = [...REF.traitArray].sort().join(",");
      const got = [...vals].sort().join(",");
      if (need !== got) return t("warn.traits.set");
    }
  },
  {
    title: () => t("step.arms.title"),
    sub: () => t("step.arms.sub"),
    parts: () => wpn(draft.primaryId)?.burden === "One Handed" ? 4 : 3,
    render(currentPart) {
      const equipmentPart = currentPart > 0 && wpn(draft.primaryId)?.burden !== "One Handed" ? currentPart + 1 : currentPart;
      const c = cls();
      const wcard = (w, key) => `<button type="button" class="card pick ${draft[key] === w.id ? "selected" : ""}" data-${key === "primaryId" ? "pri" : "sec"}="${w.id}">
        <h3>${esc(w.name)}</h3>
        <div class="muted" style="font-size:0.84rem;">${term("trait-" + w.trait.toLowerCase(), esc(w.trait))} · ${term("range", esc(w.range))} · ${term("damage", esc(w.damage))} · ${term("burden", esc(w.burden))}</div>
        ${w.feature ? `<div class="featline">${termify(esc(w.feature))}</div>` : ""}
      </div>`;
      const primaries = REF.weapons.filter((w) => w.type.startsWith("PRIMARY"));
      const secondaries = REF.weapons.filter((w) => w.type === "SECONDARY");
      if (equipmentPart === 0) return `<div class="statline">
          <div class="stat"><div class="value">${c.startingEvasion}</div><div class="smallcaps">${term("evasion", "Evasion")}</div></div>
          <div class="stat"><div class="value">${c.startingHitPoints}</div><div class="smallcaps">${term("hp", "Hit Points")}</div></div>
          <div class="stat"><div class="value">${REF.startingStress}</div><div class="smallcaps">${term("stress", "Stress")}</div></div>
          <div class="stat"><div class="value">${REF.startingHope}</div><div class="smallcaps">${term("hope", "Hope")}</div></div>
        </div>
        <div class="smallcaps" style="text-align:center; margin-bottom:0.6rem;">${t("arms.primary")}</div>
        <div class="options">${primaries.map((w) => wcard(w, "primaryId")).join("")}</div>`;
      if (equipmentPart === 1) return `<div class="smallcaps" style="text-align:center; margin-bottom:0.6rem;">${t("arms.secondary")}</div>
        <div class="options">${secondaries.map((w) => wcard(w, "secondaryId")).join("")}</div>`;
      if (equipmentPart === 2) return `<div class="smallcaps" style="text-align:center; margin-bottom:0.6rem;">${t("arms.armor")}</div>
        <div class="options">${REF.armors
          .map(
            (a) => `<button type="button" class="card pick ${draft.armorId === a.id ? "selected" : ""}" data-arm="${a.id}">
              <h3>${esc(a.name)}</h3>
              <div class="muted" style="font-size:0.84rem;">${term("armor-score", "Score")} ${a.baseScore} · ${term("thresholds", t("arms.thresholds"))} ${a.baseMajorThreshold}/${a.baseSevereThreshold} (+${t("sheet.level").toLowerCase()})</div>
              ${a.feature ? `<div class="featline">${termify(esc(a.feature))}</div>` : ""}
            </button>`
          )
          .join("")}</div>`;
      return `<div class="smallcaps" style="text-align:center; margin-bottom:0.6rem;">${t("arms.potion")}</div>
        <div class="options">${REF.potionChoice
          .map((p) => `<button type="button" class="card pick ${draft.potion === p ? "selected" : ""}" data-pot="${esc(p)}">${esc(p)}</button>`)
          .join("")}</div>
        <div class="count-note">${t("arms.alsocarry")} ${REF.startingInventory.map(esc).join(", ").toLowerCase()}.</div>`;
    },
    wire(root) {
      for (const el of root.querySelectorAll("[data-pri]")) el.onclick = () => {
        draft.primaryId = el.dataset.pri;
        if (wpn(draft.primaryId)?.burden !== "One Handed") draft.secondaryId = null;
        rerender();
      };
      for (const el of root.querySelectorAll("[data-sec]")) el.onclick = () => { draft.secondaryId = draft.secondaryId === el.dataset.sec ? null : el.dataset.sec; rerender(); };
      for (const el of root.querySelectorAll("[data-arm]")) el.onclick = () => { draft.armorId = el.dataset.arm; rerender(); };
      for (const el of root.querySelectorAll("[data-pot]")) el.onclick = () => { draft.potion = el.dataset.pot; rerender(); };
    },
    collect(currentPart) {
      const equipmentPart = currentPart > 0 && wpn(draft.primaryId)?.burden !== "One Handed" ? currentPart + 1 : currentPart;
      if (equipmentPart === 0 && !draft.primaryId) return t("warn.primary");
      if (equipmentPart === 1 && draft.secondaryId && wpn(draft.primaryId)?.burden !== "One Handed") return t("warn.secondary");
      if (equipmentPart === 2 && !draft.armorId) return t("warn.armor");
      if (equipmentPart === 3 && !draft.potion) return t("warn.potion");
    }
  },
  {
    title: () => t("step.cards.title"),
    sub() {
      return t("step.cards.sub", {
        count: requiredDomainCardCount(),
        domains: cls().domains.map((d) => title(d)).join(" & ")
      });
    },
    render() {
      const required = requiredDomainCardCount();
      const cards = REF.domainCards.filter((d) => d.level === 1 && cls().domains.includes(d.domain));
      return `<div class="options wide">${cards
        .map(
          (d) => `<button type="button" class="card pick ${draft.domainCardIds.includes(d.id) ? "selected" : ""}" data-pick="${d.id}">
            <h3>${esc(d.name)}</h3>
            <div class="smallcaps">${term("domain", esc(title(d.domain)))} · ${esc(d.type)} · ${term("recall", "Recall")} ${d.recallCost}</div>
            <div class="featline">${termify(esc(d.text))}</div>
          </button>`
        )
        .join("")}</div>
        <div class="count-note">${t("cards.count", { n: draft.domainCardIds.length, count: required })}</div>`;
    },
    onPick(id) {
      if (draft.domainCardIds.includes(id)) {
        draft.domainCardIds = draft.domainCardIds.filter((x) => x !== id);
      } else if (draft.domainCardIds.length < requiredDomainCardCount()) {
        draft.domainCardIds.push(id);
      }
    },
    collect() {
      const required = requiredDomainCardCount();
      if (draft.domainCardIds.length !== required) return t("warn.cards", { count: required });
    }
  },
  {
    title: (currentPart) => t(currentPart === 0 ? "step.pen.title" : "step.portrait.title"),
    sub: (currentPart) => t(currentPart === 0 ? "step.pen.sub" : "step.portrait.sub"),
    parts: 2,
    render(currentPart) {
      if (currentPart === 1) return portraitStudioHtml();
      return `<div class="options shell-options pen-options">${PENS
        .map(
          (p) => `<button type="button" class="card pick shell-pick ${draft.pen === p.id ? "selected" : ""}" data-pen="${esc(p.id)}">
            <div class="pick-thumb">${p.thumb}</div>
            <h3>${esc(t(p.name))}</h3>
          </button>`
        )
        .join("")}</div>`;
    },
    wire(root, currentPart = part) {
      if (currentPart === 1) {
        if (draft.portraitEditPending) for (const control of root.querySelectorAll(".portrait-controls button, .portrait-controls input, .portrait-controls textarea")) control.disabled = true;
        root.querySelector("#portrait-keep-edit")?.addEventListener("click", () => reviewPortrait("keep", root));
        root.querySelector("#portrait-discard-edit")?.addEventListener("click", () => reviewPortrait("discard", root));
        root.querySelector("#portrait-restore-original")?.addEventListener("click", () => reviewPortrait("restore", root));
        for (const mode of root.querySelectorAll("[data-portrait-mode]")) mode.onclick = () => {
          collectPortraitFields(root);
          draft.portraitKeepLook = mode.dataset.portraitMode === "edit";
          if (draft.portraitKeepLook && !draft.portraitReferenceUrl) draft.portraitReferenceUrl = draft.portrait || "";
          rerender();
        };
        for (const tag of root.querySelectorAll("[data-portrait-tag]")) tag.onclick = () => {
          collectPortraitFields(root);
          const id = tag.dataset.portraitTag;
          draft.portraitTags = draft.portraitTags.includes(id)
            ? draft.portraitTags.filter((candidate) => candidate !== id)
            : [...draft.portraitTags, id];
          rerender();
        };
        const favorite = root.querySelector("#portrait-favorite-color");
        favorite.oninput = () => {
          draft.favoriteColor = validDetailColor(favorite.value);
          document.documentElement.style.setProperty("--favorite-color", draft.favoriteColor);
          root.querySelector("#portrait-favorite-value").textContent = draft.favoriteColor;
          root.querySelector(".portrait-canvas").style.setProperty("--portrait-secondary", draft.favoriteColor);
        };
        const ownText = root.querySelector("#portrait-use-own");
        const suggestedText = root.querySelector("#portrait-use-suggestion");
        const promptInput = root.querySelector("#portrait-prompt");
        const selectTextSource = (source) => {
          draft.portraitTextSource = source === "suggestion" && draft.portraitSuggestion ? "suggestion" : "mine";
          ownText.classList.toggle("selected", draft.portraitTextSource === "mine");
          ownText.setAttribute("aria-pressed", String(draft.portraitTextSource === "mine"));
          suggestedText.classList.toggle("selected", draft.portraitTextSource === "suggestion");
          suggestedText.setAttribute("aria-pressed", String(draft.portraitTextSource === "suggestion"));
        };
        ownText.onclick = () => { collectPortraitFields(root); selectTextSource("mine"); };
        suggestedText.onclick = () => { collectPortraitFields(root); selectTextSource("suggestion"); };
        promptInput.oninput = () => {
          draft.portraitPrompt = promptInput.value;
          selectTextSource("mine");
        };
        const suggest = root.querySelector("#portrait-suggest");
        suggest.onclick = async () => {
          collectPortraitFields(root);
          const context = portraitRequestContext();
          suggest.disabled = true;
          suggest.textContent = t("portrait.suggesting");
          try {
            const response = await fetch("/api/art/portrait/suggest", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                ...(isPortraitWorkshop ? { pcId: portraitPcId } : { draftId }),
                context: {
                  name: draft.name,
                  ancestry: anc()?.name || "",
                  className: cls()?.name || "",
                  subclass: sub()?.name || "",
                  description: draft.portraitPrompt,
                  tags: context.selectedTags,
                  primaryColor: context.primaryColor,
                  secondaryColor: context.secondaryColor,
                  armor: context.armor,
                  mainHand: context.mainHand,
                  offHand: context.offHand
                }
              })
            });
            const result = await response.json();
            if (!response.ok) throw new Error(result.error || t("error.generic"));
            draft.portraitSuggestion = result.suggestion;
            rerender();
          } catch (error) {
            $("#warn").textContent = error.message;
            suggest.disabled = false;
            suggest.textContent = t("portrait.suggest");
          }
        };
        for (const modifier of root.querySelectorAll("[data-portrait-modifier]")) modifier.onclick = () => {
          collectPortraitFields(root);
          const value = portraitModifier(modifier.dataset.value, modifier.dataset.portraitModifier);
          if (modifier.dataset.portraitModifier === "steps") draft.portraitStepsModifier = value;
          if (modifier.dataset.portraitModifier === "cfg") draft.portraitCfgModifier = value;
          rerender();
        };
        for (const style of root.querySelectorAll("[data-portrait-style]")) style.onclick = () => {
          collectPortraitFields(root);
          draft.portraitStyle = portraitStyle(style.dataset.portraitStyle);
          rerender();
        };
        const generate = root.querySelector("#portrait-generate");
        generate.onclick = async () => {
          collectPortraitFields(root);
          if (draft.portraitKeepLook && !draft.portraitReferenceUrl) { $("#warn").textContent = t("portrait.referenceRequired"); return; }
          const sourceText = draft.portraitTextSource === "suggestion" && draft.portraitSuggestion
            ? draft.portraitSuggestion
            : draft.portraitPrompt;
          if (!sourceText.trim()) { $("#warn").textContent = t("portrait.prompt"); return; }
          const context = portraitRequestContext();
          const seed = draft.portraitFixSeed && Number.isSafeInteger(draft.portraitSeed) ? draft.portraitSeed : undefined;
          await generatePortrait(generate, portraitRequestSnapshot(context), seed);
        };
        const clear = root.querySelector("#portrait-clear");
        if (clear) clear.onclick = () => { draft.portrait = null; rerender(); };
        for (const use of root.querySelectorAll("[data-portrait-use]")) use.onclick = () => {
          if (draft.portraitEditPending) return;
          const attempt = draft.portraitAttempts.find((candidate) => candidate.id === use.dataset.portraitUse);
          if (!attempt) return;
          if (isPortraitWorkshop) { void reviewPortrait("select", root, attempt.id); return; }
          collectPortraitFields(root);
          draft.portrait = attempt.url;
          draft.portraitSeed = attempt.seed;
          draft.portraitOriginal = attempt.originalUrl || attempt.url;
          draft.portraitReferenceUrl = attempt.url;
          rerender();
        };
        for (const retry of root.querySelectorAll("[data-portrait-retry]")) retry.onclick = async () => {
          const attempt = draft.portraitAttempts.find((candidate) => candidate.id === retry.dataset.portraitRetry);
          if (!attempt) return;
          await generatePortrait(retry, attempt.request, attempt.seed);
        };
        return;
      }
      for (const el of root.querySelectorAll("[data-pen]")) el.onclick = () => { draft.pen = el.dataset.pen; rerender(); };
    },
    collect(currentPart) {
      if (currentPart === 0 && !PENS.some((p) => p.id === draft.pen)) return t("warn.pen");
      if (currentPart === 1) collectPortraitFields();
      if (draft.portraitEditPending) return t("portrait.reviewRequired");
    }
  },
  {
    title: () => t("step.review.title"),
    sub: () => t("step.review.sub"),
    render() {
      const c = cls(), s = sub(), a = anc(), k = com();
      const p = wpn(draft.primaryId), sc = wpn(draft.secondaryId), ar = arm();
      const portrait = draft.portrait
        ? `<img src="${esc(draft.portrait)}" alt="">`
        : `<span>${esc((draft.name || "?").slice(0, 1).toUpperCase())}</span>`;
      return `<div class="review-stage"><div class="review-portrait" aria-hidden="true">${portrait}</div><div class="card review">
        <h3>${esc(draft.name)}</h3>
        <p>${esc(draft.pronouns || "")}${draft.player ? ` · ${t("review.playedby", { player: esc(draft.player) })}` : ""}</p>
        <p>${t("review.of", { ancestry: esc(a.name), class: esc(c.name), subclass: esc(s.name), community: esc(k.name) })}</p>
        <h3>${t("review.traits")}</h3>
        <p>${REF.traits.map((tr) => `${tr} ${draft.traits[tr] >= 0 ? "+" : ""}${draft.traits[tr]}`).join(" · ")}</p>
        <h3>${t("review.arms")}</h3>
        <p>${esc(p.name)}${sc ? ` & ${esc(sc.name)}` : ""}, ${esc(ar.name)}</p>
        ${draft.experiences.some(Boolean) ? `<h3>${t("review.exp")}</h3><p>${draft.experiences.filter(Boolean).map((e) => `${esc(e)} +2`).join(" · ")}</p>` : ""}
        <h3>${t("review.cards")}</h3>
        <p>${draft.domainCardIds.map((id) => esc(REF.domainCards.find((d) => d.id === id).name)).join(" · ")}</p>
        ${draft.classItem ? `<h3>${t("review.carried")}</h3><p>${esc(draft.classItem)}</p>` : ""}
        <h3>${t("review.pen")}</h3>
        <p>${esc(t((PENS.find((p) => p.id === draft.pen) || PENS[0]).name))}</p>
      </div></div>`;
    },
    collect() {}
  },
  {
    title: () => t("step.contract.title"),
    sub: () => t("step.contract.sub"),
    render() {
      const pen = PENS.find((candidate) => candidate.id === draft.pen) || PENS[0];
      return `<div class="covenant-step">
        <article class="paper-sheet paper-covenant">
          <div class="paper-kicker">${esc(t("contract.kicker"))}</div>
          <h2>${esc(t("contract.title"))}</h2>
          <p class="paper-decree">${esc(t("contract.decree"))}</p>
          <details class="contract-terms" id="contract-terms" ${draft.covenant.read ? "open" : ""}>
            <summary>${esc(t("contract.read"))}</summary>
            <div class="contract-copy">${covenantArticlesHtml()}</div>
          </details>
          <div class="contract-warning" id="contract-warning" role="status" ${draft.covenant.warned && !draft.covenant.signed ? "" : "hidden"}>
            <strong>${esc(t("contract.warning.title"))}</strong>
            <span>${esc(t("contract.warning.body"))}</span>
          </div>
          <button class="signature-field ${draft.covenant.signed ? "is-signing" : ""}" id="contract-signature" type="button">
            <span class="signature-name">${esc(draft.name)}</span>
            <span class="signature-prompt">${esc(t("contract.signline", { name: draft.name }))}</span>
            <span class="signing-pen" aria-hidden="true">${pen.thumb}</span>
          </button>
          <p class="paper-foot">${esc(t("contract.foot"))}</p>
        </article>
      </div>`;
    },
    wire(root) {
      const terms = root.querySelector("#contract-terms");
      terms.ontoggle = () => { if (terms.open) draft.covenant.read = true; };
      root.querySelector("#contract-signature").onclick = signCovenant;
    },
    collect() {}
  }
];

function title(s) {
  return String(s).toLowerCase().replace(/(^|\s)(\w)/g, (m, a, b) => a + b.toUpperCase());
}

// ---------- assembly ----------
function buildCharacter() {
  const c = cls(), s = sub(), a = anc(), k = com();
  const ar = arm();
  const level = 1;
  return {
    campaignId: draft.campaignId,
    name: draft.name,
    pronouns: draft.pronouns,
    player: draft.player,
    shell: draft.shell,
    pen: draft.pen,
    level,
    class: { id: c.id, name: c.name, domains: c.domains },
    subclass: { id: s.id, name: s.name, spellcastTrait: s.spellcastTrait },
    ancestry: { id: a.id, name: a.name },
    community: { id: k.id, name: k.name },
    traits: { ...draft.traits },
    evasion: c.startingEvasion,
    hpMax: c.startingHitPoints,
    hp: 0,
    stressMax: REF.startingStress,
    stress: 0,
    hopeMax: 6,
    hope: REF.startingHope,
    armor: ar ? { name: ar.name, score: ar.baseScore, feature: ar.feature } : null,
    armorMarked: 0,
    thresholds: ar
      ? { major: ar.baseMajorThreshold + level, severe: ar.baseSevereThreshold + level }
      : { major: level, severe: 2 * level },
    weapons: {
      primary: wpn(draft.primaryId),
      secondary: wpn(draft.secondaryId)
    },
    inventory: [
      ...REF.startingInventory,
      draft.potion,
      ...(draft.classItem ? [draft.classItem] : []),
      {
        id: `paper_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        kind: "paper",
        paperType: "covenant",
        name: t("contract.inventory.name"),
        body: "",
        author: t("contract.inventory.author"),
        createdAt: draft.covenant.signedAt,
        signedName: draft.name,
        signedAt: draft.covenant.signedAt,
        covenantVersion: 1,
        quantity: 1
      }
    ],
    experiences: draft.experiences.filter(Boolean).map((name) => ({ name, bonus: 2 })),
    background: Object.entries(draft.background)
      .filter(([, v]) => v)
      .map(([q, aText]) => ({ q, a: aText })),
    connections: Object.entries(draft.connections)
      .filter(([, v]) => v)
      .map(([q, note]) => ({ q, note })),
    domainCards: draft.domainCardIds.map((id) => ({
      ...REF.domainCards.find((d) => d.id === id),
      location: "loadout"
    })),
    features: {
      hopeFeature: c.hopeFeature,
      classFeatures: c.classFeatures,
      foundation: s.foundation,
      ancestry: a.features,
      community: k.features
    },
    portrait: draft.portrait,
    portraitPrompt: draft.portraitPrompt,
    appearance: {
      primaryColor: classColor(draft.classId),
      secondaryColor: validDetailColor(draft.favoriteColor)
    },
    portraitDirection: {
      tags: [...draft.portraitTags],
      includeArmor: draft.portraitEquipment.armor,
      includeMainHand: draft.portraitEquipment.mainHand,
      includeOffHand: draft.portraitEquipment.offHand
    },
    portraitWorkshop: {
      fixSeed: draft.portraitFixSeed,
      stepsModifier: draft.portraitStepsModifier,
      cfgModifier: draft.portraitCfgModifier,
      style: draft.portraitStyle,
      embellishPrompt: draft.portraitEmbellishPrompt,
      referenceImageUrl: draft.portraitKeepLook ? draft.portraitReferenceUrl : "",
      originalUrl: draft.portraitOriginal,
      lastSeed: Number.isSafeInteger(draft.portraitSeed) ? draft.portraitSeed : null,
      attempts: draft.portraitAttempts.map((attempt) => ({
        ...attempt,
        request: { ...attempt.request, tags: [...attempt.request.tags] }
      }))
    },
    notes: ""
  };
}

// ---------- render loop ----------
function partTotal(st = steps[step]) {
  const total = typeof st.parts === "function" ? st.parts() : (st.parts || 1);
  return Math.max(1, total);
}

function renderSubprogress(st) {
  const total = partTotal(st);
  const el = $("#subprogress");
  el.hidden = total <= 1;
  el.setAttribute("aria-label", t("create.part", { n: part + 1, total }));
  el.innerHTML = `<span class="subprogress-track" aria-hidden="true">${Array.from({ length: total }, (_, i) =>
    `<span class="subprogress-mark ${i < part ? "done" : i === part ? "now" : ""}"></span>`
  ).join("")}</span><span class="subprogress-count">${part + 1} / ${total}</span>`;
}

function renderCreatorIdentity() {
  const target = $("#creator-identity");
  if (!target) return;
  document.documentElement.style.setProperty("--class-color", classColor(draft.classId));
  document.documentElement.style.setProperty("--favorite-color", validDetailColor(draft.favoriteColor));
  const image = draft.portrait
    ? `<img src="${esc(draft.portrait)}" alt="">`
    : `<span>${esc((draft.name || "?").slice(0, 1).toUpperCase())}</span>`;
  const details = [anc()?.name, cls()?.name].filter(Boolean).join(" · ");
  target.innerHTML = `<span class="creator-identity-portrait" aria-hidden="true">${image}</span><span><strong>${esc(draft.name || t("create.title"))}</strong><small>${esc(details || t("create.subtitle"))}</small></span>`;
}

function rerender(direction = null) {
  const previousScrollY = window.scrollY;
  const st = steps[step];
  setTelemetryMode(isPortraitWorkshop ? "portrait-workshop" : `step-${step + 1}:part-${part + 1}`);
  part = Math.min(part, partTotal(st) - 1);
  $("#progress").innerHTML = steps
    .map((_, i) => `<span class="dot ${i < step ? "done" : i === step ? "now" : ""}" aria-hidden="true"><i>${i + 1}</i></span>`)
    .join("");
  const sub = isPortraitWorkshop ? t("portrait.workshopHelp") : typeof st.sub === "function" ? st.sub(part) : st.sub;
  const heading = isPortraitWorkshop ? t("portrait.workshopTitle") : typeof st.title === "function" ? st.title(part) : st.title;
  const enter = direction === "next" ? " enter-right" : direction === "back" ? " enter-left" : "";
  $("#step").innerHTML = `<div class="step-panel${enter}" data-step="${step + 1}"><header class="step-heading"><span class="step-number">${step + 1}</span><span><h2 class="step-title">${heading}</h2><span class="step-sub">${sub}</span></span></header>${st.render(part)}</div>`;
  $("#warn").textContent = "";
  $("#btn-back").style.visibility = step === 0 && part === 0 ? "hidden" : "visible";
  $("#btn-back").textContent = t("btn.back");
  $("#btn-next").hidden = step === steps.length - 1;
  $("#btn-next").textContent = t("btn.next");
  renderSubprogress(st);
  if (isPortraitWorkshop) {
    $("#progress").hidden = true;
    $("#subprogress").hidden = true;
    $("#btn-back").hidden = true;
    $("#btn-next").hidden = true;
    document.querySelector(".navbtns").hidden = true;
    document.querySelector(".step-number").hidden = true;
  }
  renderCreatorIdentity();
  const root = $("#step");
  if (st.onPick) {
    for (const el of root.querySelectorAll("[data-pick]")) {
      el.onclick = () => { st.onPick(el.dataset.pick); rerender(); };
    }
  }
  for (const el of root.querySelectorAll("[data-item]")) {
    el.onclick = () => { draft.classItem = el.dataset.item; rerender(); };
  }
  if (st.wire) st.wire(root, part);
  root.addEventListener("input", scheduleDraftSave);
  root.addEventListener("change", scheduleDraftSave);
  scheduleDraftSave();
  if (direction) window.scrollTo(0, 0);
  else requestAnimationFrame(() => window.scrollTo(0, previousScrollY));
}

function animateMove(direction, update) {
  if (moving) return;
  moving = true;
  const panel = $(".step-panel");
  const finish = () => {
    update();
    rerender(direction);
    moving = false;
  };
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches || !panel) {
    finish();
    return;
  }
  panel.classList.add(direction === "next" ? "leave-left" : "leave-right");
  let finished = false;
  const once = () => {
    if (finished) return;
    finished = true;
    finish();
  };
  panel.addEventListener("animationend", once, { once: true });
  setTimeout(once, 260);
}

$("#btn-back").onclick = () => {
  if (moving || (step === 0 && part === 0)) return;
  if (draft.portraitEditPending) { $("#warn").textContent = t("portrait.reviewRequired"); return; }
  steps[step].collect?.(part);
  animateMove("back", () => {
    if (part > 0) part -= 1;
    else {
      step -= 1;
      part = partTotal(steps[step]) - 1;
    }
  });
};
$("#btn-next").onclick = async () => {
  if (moving) return;
  const err = steps[step].collect?.(part);
  if (err) { $("#warn").textContent = err; return; }
  if (part < partTotal() - 1 || step < steps.length - 1) {
    animateMove("next", () => {
      if (part < partTotal() - 1) part += 1;
      else { step += 1; part = 0; }
    });
    return;
  }
};

async function finishCharacter() {
  if (isPortraitWorkshop) return;
  try {
    const res = await fetch("/api/party", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(buildCharacter())
    });
    const pc = await res.json();
    if (!res.ok) throw new Error(pc.error || t("error.generic"));
    draftComplete = true;
    clearTimeout(draftSaveTimer);
    localStorage.removeItem(DRAFT_KEY); // signed — the stash has served
    localStorage.removeItem(DRAFT_ID_KEY);
    // Character persistence already succeeded; stale-draft cleanup must not
    // turn that success into a retry that creates a duplicate PC.
    await fetch(`/api/character-drafts/${encodeURIComponent(draftId)}`, { method: "DELETE" }).catch(() => {});
    // This device now knows who its player is (shared with the shell & journal).
    localStorage.setItem("settlement-pc", pc.id);
    window.top.location.href = "/player";
  } catch (e) {
    $("#warn").textContent = e.message;
    moving = false;
    draft.covenant.signed = false;
    draft.covenant.signedAt = null;
    $("#btn-back").disabled = false;
    rerender();
  }
}

function signCovenant(event) {
  if (moving || draft.covenant.signed) return;
  const signature = event.currentTarget;
  if (!draft.covenant.read && !draft.covenant.warned) {
    draft.covenant.warned = true;
    signature.classList.add("is-hesitating");
    const warning = $("#contract-warning");
    warning.hidden = false;
    setTimeout(() => signature.classList.remove("is-hesitating"), 760);
    warning.scrollIntoView({ block: "nearest", behavior: "smooth" });
    return;
  }
  moving = true;
  draft.covenant.signed = true;
  draft.covenant.signedAt = new Date().toISOString();
  signature.classList.add("is-signing");
  signature.disabled = true;
  $("#btn-back").disabled = true;
  const delay = window.matchMedia("(prefers-reduced-motion: reduce)").matches ? 80 : 1400;
  setTimeout(finishCharacter, delay);
}

// ---------- draft stash ----------
// Character drafts survive reloads and closed tabs on this device. Signing is
// the only automatic deletion point; Start over is the explicit escape hatch.
function stashDraft() {
  if (!REF || draftComplete) return;
  try { steps[step].collect?.(part); } catch { /* half-filled steps still stash */ }
  if (isPortraitWorkshop) {
    if (portraitBusy) return;
    const settings = { ...portraitRequestSnapshot(), sourcePrompt: draft.portraitPrompt, fixSeed: draft.portraitFixSeed, editMode: draft.portraitKeepLook };
    preferenceSave = preferenceSave.then(async () => {
      const response = await fetch(`/api/party/${encodeURIComponent(portraitPcId)}/portrait-workshop`, {
        method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(settings)
      });
      if (!response.ok) {
        const result = await response.json();
        throw new Error(result.errorKey ? t(result.errorKey) : result.error || t("error.generic"));
      }
      $("#draft-status").textContent = t("portrait.saved");
    }).catch((error) => { $("#warn").textContent = error.message; });
    return;
  }
  const saved = { id: draftId, version: 3, savedAt: new Date().toISOString(), step, part, draft };
  localStorage.setItem(DRAFT_KEY, JSON.stringify(saved));
  fetch(`/api/character-drafts/${encodeURIComponent(draftId)}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(saved)
  }).catch(() => {});
  $("#draft-status").textContent = t("create.draftSaved");
}

function scheduleDraftSave() {
  clearTimeout(draftSaveTimer);
  draftSaveTimer = setTimeout(stashDraft, 220);
}

window.addEventListener("beforeunload", stashDraft);

function restoreDraft(serverSaved = null) {
  try {
    const localSaved = JSON.parse(localStorage.getItem(DRAFT_KEY));
    const saved = serverSaved || (localSaved?.id === draftId ? localSaved : null);
    if (!saved || ![2, 3].includes(saved.version) || typeof saved.step !== "number") return;
    Object.assign(draft, saved.draft);
    draft.portraitTags = Array.isArray(draft.portraitTags)
      ? draft.portraitTags.filter((id) => PORTRAIT_TAGS.some((tag) => tag.id === id))
      : [];
    draft.portraitEquipment = {
      armor: draft.portraitEquipment?.armor !== false,
      mainHand: draft.portraitEquipment?.mainHand !== false,
      offHand: draft.portraitEquipment?.offHand !== false
    };
    draft.portraitFixSeed = draft.portraitFixSeed === true;
    draft.portraitStepsModifier = portraitModifier(draft.portraitStepsModifier, "steps");
    draft.portraitCfgModifier = portraitModifier(draft.portraitCfgModifier);
    draft.portraitStyle = portraitStyle(draft.portraitStyle);
    draft.portraitEmbellishPrompt = draft.portraitEmbellishPrompt !== false;
    draft.portraitKeepLook = draft.portraitKeepLook === true;
    draft.portraitReferenceUrl = String(draft.portraitReferenceUrl || "").slice(0, 2048);
    draft.portraitAttempts = normalizePortraitAttempts(draft.portraitAttempts);
    draft.portraitOriginal = String(draft.portraitOriginal || draft.portrait || "") || null;
    const pending = draft.portraitEditPending;
    draft.portraitEditPending = pending && draft.portraitAttempts.some((attempt) => attempt.url === pending.url)
      ? { url: pending.url, seed: Number(pending.seed), originalUrl: String(pending.originalUrl || draft.portraitOriginal || "") }
      : null;
    draft.portraitTextSource = draft.portraitTextSource === "suggestion" && draft.portraitSuggestion ? "suggestion" : "mine";
    draft.portraitSeed = draft.portraitSeed !== null && draft.portraitSeed !== "" && Number.isSafeInteger(Number(draft.portraitSeed))
      ? Number(draft.portraitSeed)
      : null;
    draft.favoriteColor = validDetailColor(draft.favoriteColor);
    const migratedStep = saved.version === 2
      ? (saved.step <= 5 ? saved.step : saved.step <= 9 ? 6 : saved.step - 3)
      : saved.step;
    step = Math.max(0, Math.min(steps.length - 1, migratedStep));
    part = Math.max(0, Math.min(partTotal(steps[step]) - 1, Number(saved.part) || 0));
  } catch { /* a bad stash never blocks creation */ }
}

// ---------- boot ----------
function applyWorkshop(view, initial = false) {
  workshopPc = view.pc;
  const data = view.workshop;
  const request = data.request;
  Object.assign(draft, {
    name: view.pc.name, classId: view.pc.classId, subclassId: view.pc.subclassId,
    ancestryId: view.pc.ancestryId, communityId: view.pc.communityId,
    portrait: data.portrait, portraitPrompt: data.prompt,
    portraitNegativePrompt: request.negativePrompt, portraitOriginal: data.originalUrl,
    portraitReferenceUrl: request.referenceImageUrl || data.portrait || "",
    portraitKeepLook: initial && !data.pending ? Boolean(data.portrait) : data.editMode,
    portraitSeed: data.lastSeed, portraitFixSeed: data.fixSeed,
    portraitStepsModifier: request.stepsModifier, portraitCfgModifier: request.cfgModifier,
    portraitStyle: request.style, portraitEmbellishPrompt: request.embellishPrompt,
    portraitAttempts: normalizePortraitAttempts(data.attempts), portraitEditPending: data.pending,
    favoriteColor: view.pc.secondaryColor
  });
}

async function reviewPortrait(action, root, attemptId) {
  if (portraitBusy) return;
  collectPortraitFields(root);
  if (!isPortraitWorkshop) {
    if (action === "keep") keepPortraitEdit(draft);
    if (action === "discard") discardPortraitEdit(draft);
    if (action === "restore") restoreOriginalPortrait(draft);
    rerender();
    return;
  }
  portraitBusy = true;
  clearTimeout(draftSaveTimer);
  for (const button of root.querySelectorAll("button")) button.disabled = true;
  try {
    await preferenceSave;
    const response = await fetch(`/api/party/${encodeURIComponent(portraitPcId)}/portrait-workshop`, {
      method: "PUT", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, pendingId: draft.portraitEditPending?.id, attemptId })
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.errorKey ? t(result.errorKey) : result.error || t("error.generic"));
    applyWorkshop(result);
    rerender();
  } catch (error) { rerender(); $("#warn").textContent = error.message; }
  finally { portraitBusy = false; }
}

initI18n();
if (isPortraitWorkshop) {
  document.body.classList.add("portrait-workshop");
  $("#draft-reset").hidden = true;
  const title = document.querySelector('[data-i18n="create.title"]');
  title.dataset.i18n = "portrait.workshopTitle";
  title.textContent = t("portrait.workshopTitle");
  const subtitle = document.querySelector('[data-i18n="create.subtitle"]');
  subtitle.dataset.i18n = "portrait.workshopHelp";
  subtitle.textContent = t("portrait.workshopHelp");
  document.title = t("portrait.workshopTitle");
  if (!portraitPcId) location.replace("/player");
  else Promise.all([
    fetch("/api/reference").then((r) => r.json()),
    fetch(`/api/party/${encodeURIComponent(portraitPcId)}/portrait-workshop`).then((r) => r.json()),
    fetch("/api/art/status").then((r) => r.json())
  ]).then(([ref, view, status]) => {
    if (view.error || ref.error) throw new Error(view.error || ref.error);
    REF = ref; ART_STATUS = status; applyWorkshop(view, true);
    step = 7; part = 1; rerender();
  }).catch((error) => { $("#warn").textContent = error.message; });
} else {
$("#draft-reset").onclick = () => {
  if (!confirm(t("create.startOverConfirm"))) return;
  localStorage.removeItem(DRAFT_KEY);
  localStorage.removeItem(DRAFT_ID_KEY);
  fetch(`/api/character-drafts/${encodeURIComponent(draftId)}`, { method: "DELETE" })
    .finally(() => { location.href = "/create/?new=1"; });
};
Promise.all([
  fetch("/api/reference").then((r) => r.json()),
  fetch("/api/party").then((r) => r.json()),
  fetch(`/api/character-drafts/${encodeURIComponent(draftId)}`).then((r) => r.ok ? r.json() : null),
  fetch("/api/table").then((r) => r.json()),
  fetch("/api/art/status").then((r) => r.ok ? r.json() : ART_STATUS).catch(() => ART_STATUS)
]).then(([ref, party, saved, table, artStatus]) => {
  if (ref.error) { $("#step").innerHTML = `<p class="warn">${esc(ref.error)}</p>`; return; }
  REF = ref;
  PARTY = party;
  CAMPAIGNS = Array.isArray(table.campaigns) ? table.campaigns : [];
  CURRENT_CAMPAIGN_ID = table.currentCampaignId || CAMPAIGNS[0]?.id || null;
  ART_STATUS = artStatus;
  restoreDraft(saved);
  if (!draft.campaignId) draft.campaignId = CURRENT_CAMPAIGN_ID;
  else if (!CAMPAIGNS.some((campaign) => campaign.id === draft.campaignId)) {
    draftComplete = true;
    $("#step").innerHTML = `<p class="warn">${esc(t("error.campaignInactive"))}</p>`;
    $("#btn-back").hidden = true;
    $("#btn-next").hidden = true;
    $("#subprogress").hidden = true;
    return;
  }
  setPlayerFeatureContext({ playerFeatures: CAMPAIGNS.find((campaign) => campaign.id === draft.campaignId)?.playerFeatures });
  rerender();
});
}
