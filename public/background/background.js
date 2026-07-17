import { t, lang, initI18n } from "/shared/i18n.js";
import { setTelemetryMode } from "/shared/telemetry.js";
import { setPlayerFeatureContext } from "/shared/player-features.js";
import "/shared/feedback.js";
import "/shared/player-tools.js";

const $ = (selector) => document.querySelector(selector);
const esc = (value) => String(value ?? "").replace(/[&<>"']/g, (char) =>
  ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]));

const FIELD_DEFINITIONS = [
  { id: "roots", title: "Where I come from", label: "background.field.roots", prompt: "background.prompt.roots" },
  { id: "early-memory", title: "An early memory", label: "background.field.early", prompt: "background.prompt.early" },
  { id: "turning-point", title: "The moment that changed me", label: "background.field.turning", prompt: "background.prompt.turning" },
  { id: "road", title: "Why I took the road", label: "background.field.road", prompt: "background.prompt.road" },
  { id: "beliefs", title: "What I believe", label: "background.field.beliefs", prompt: "background.prompt.beliefs" },
  { id: "longing", title: "What I want", label: "background.field.longing", prompt: "background.prompt.longing" },
  { id: "fear", title: "What I fear losing", label: "background.field.fear", prompt: "background.prompt.fear" },
  { id: "unfinished", title: "What remains unfinished", label: "background.field.unfinished", prompt: "background.prompt.unfinished" }
];

function routePcId() {
  const parts = location.pathname.split("/").filter(Boolean);
  if (parts[0] !== "background" || !parts[1]) return localStorage.getItem("settlement-pc");
  try { return decodeURIComponent(parts[1]); } catch { return parts[1]; }
}

let pc = null;
let fields = [...FIELD_DEFINITIONS];
let entries = new Map();
let selectedId = FIELD_DEFINITIONS[0].id;
let saveQueued = false;
let saveRunning = false;
let saveTimer = null;
let suggestionRequest = 0;

function fieldById(id) {
  return fields.find((field) => field.id === id) || fields[0];
}

function fieldLabel(field) {
  return field.label ? t(field.label) : field.title;
}

function payload() {
  return fields.map((field) => ({ id: field.id, q: field.title, a: entries.get(field.id) || "" }));
}

function renderIdentity() {
  const portrait = pc.portrait
    ? `<img src="${esc(pc.portrait)}" alt="">`
    : `<span class="portrait-fallback" aria-hidden="true">${esc(pc.name?.slice(0, 1) || "?")}</span>`;
  $("#character-mark").innerHTML = `${portrait}<strong>${esc(pc.name)}</strong>`;
  document.documentElement.style.setProperty("--memory-class", pc.appearance?.primaryColor || "#9b674d");
  document.documentElement.style.setProperty("--memory-detail", pc.appearance?.secondaryColor || "#78a999");
}

function renderThread() {
  $("#memory-thread").innerHTML = fields.map((field) => {
    const text = entries.get(field.id)?.trim();
    return `<button class="memory-choice ${text ? "has-text" : ""} ${field.id === selectedId ? "selected" : ""}" type="button" data-memory="${esc(field.id)}" aria-pressed="${field.id === selectedId}"><span>${esc(fieldLabel(field))}</span></button>`;
  }).join("");
  for (const button of document.querySelectorAll("[data-memory]")) button.onclick = () => selectField(button.dataset.memory);
}

function hideSuggestion() {
  suggestionRequest += 1;
  $("#suggestion-leaf").hidden = true;
  $("#suggestion-text").textContent = "";
}

function selectField(id) {
  if (!fieldById(id)) return;
  selectedId = id;
  hideSuggestion();
  renderThread();
  renderEditor();
  requestAnimationFrame(() => $("#memory-text").focus());
}

function renderEditor() {
  const field = fieldById(selectedId);
  const text = entries.get(selectedId) || "";
  $("#memory-count").textContent = t("background.memoryCount", { current: fields.indexOf(field) + 1, total: fields.length });
  $("#memory-title").textContent = fieldLabel(field);
  $("#memory-prompt").textContent = field.prompt ? t(field.prompt) : t("background.prompt.legacy");
  $("#memory-text").value = text;
  $("#character-count").textContent = `${text.length} / 6000`;
  $("#ask-expansion").disabled = !text.trim();
}

function setSaveState(key, error = false) {
  const state = $("#save-state");
  state.textContent = key ? t(key) : "";
  state.classList.toggle("is-error", error);
}

function queueSave(immediate = false) {
  saveQueued = true;
  clearTimeout(saveTimer);
  setSaveState("background.saving");
  if (immediate) void flushSave();
  else saveTimer = setTimeout(flushSave, 650);
}

async function flushSave() {
  clearTimeout(saveTimer);
  if (saveRunning || !saveQueued || !pc) return;
  saveQueued = false;
  saveRunning = true;
  try {
    const response = await fetch(`/api/party/${encodeURIComponent(pc.id)}/background`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ background: payload() })
    });
    const body = await response.json();
    if (!response.ok) throw new Error(body.error || t("background.saveError"));
    setSaveState("background.saved");
  } catch {
    setSaveState("background.saveError", true);
  } finally {
    saveRunning = false;
    if (saveQueued) void flushSave();
  }
}

async function askForExpansion() {
  const field = fieldById(selectedId);
  const currentText = entries.get(selectedId)?.trim() || "";
  if (!currentText) return;
  const request = ++suggestionRequest;
  const button = $("#ask-expansion");
  button.disabled = true;
  button.textContent = t("background.asking");
  setSaveState("");
  try {
    await flushSave();
    const response = await fetch(`/api/party/${encodeURIComponent(pc.id)}/background/suggest`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fieldId: field.id, currentText, locale: lang() })
    });
    const body = await response.json();
    if (!response.ok) throw new Error(body.error || t("background.suggestError"));
    if (request !== suggestionRequest || field.id !== selectedId) return;
    $("#suggestion-text").textContent = body.suggestion;
    $("#suggestion-leaf").hidden = false;
    $("#use-suggestion").focus();
  } catch {
    if (request === suggestionRequest) setSaveState("background.suggestError", true);
  } finally {
    if (request === suggestionRequest) {
      button.textContent = t("background.ask");
      button.disabled = !(entries.get(selectedId) || "").trim();
    }
  }
}

$("#memory-text").addEventListener("input", () => {
  const text = $("#memory-text").value;
  entries.set(selectedId, text);
  $("#character-count").textContent = `${text.length} / 6000`;
  $("#ask-expansion").disabled = !text.trim();
  renderThread();
  queueSave();
});
$("#memory-text").addEventListener("blur", () => queueSave(true));
$("#ask-expansion").onclick = askForExpansion;
$("#dismiss-suggestion").onclick = () => {
  hideSuggestion();
  $("#memory-text").focus();
};
$("#use-suggestion").onclick = () => {
  const suggestion = $("#suggestion-text").textContent;
  entries.set(selectedId, suggestion);
  hideSuggestion();
  renderEditor();
  renderThread();
  queueSave(true);
  $("#memory-text").focus();
};

async function load() {
  const id = routePcId();
  if (!id) throw new Error("No character selected.");
  const response = await fetch(`/api/party/${encodeURIComponent(id)}`);
  const body = await response.json();
  if (!response.ok) throw new Error(body.error || "No such character.");
  pc = body;
  localStorage.setItem("settlement-pc", pc.id);
  setPlayerFeatureContext(pc, pc.id);
  const knownIds = new Set(FIELD_DEFINITIONS.map((field) => field.id));
  const legacy = (pc.background || [])
    .filter((entry) => entry.id && !knownIds.has(entry.id))
    .map((entry) => ({ id: entry.id, title: entry.q || t("background.field.legacy") }));
  fields = [...FIELD_DEFINITIONS, ...legacy];
  entries = new Map((pc.background || []).map((entry) => [entry.id, entry.a || ""]).filter(([id]) => id));
  selectedId = fields.find((field) => entries.get(field.id)?.trim())?.id || fields[0].id;
  renderIdentity();
  renderThread();
  renderEditor();
  $("#studio").hidden = false;
  setTelemetryMode("background-studio");
}

initI18n();
load().catch(() => { $("#load-error").hidden = false; });
