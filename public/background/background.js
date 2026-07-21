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

// The muse deck: free, offline nudges. A shuffled card is a prompt to think
// about, never inserted into the memory — pure play when a field feels blank.
const MUSE_DECK = [
  { en: "A smell that always means home.", sv: "En doft som alltid betyder hem." },
  { en: "An object you kept that you can't quite explain.", sv: "Ett föremål du behållit som du inte riktigt kan förklara." },
  { en: "The first time you feared a person, not a thing.", sv: "Första gången du fruktade en människa, inte en sak." },
  { en: "A door you were told never to open.", sv: "En dörr du fick veta att aldrig öppna." },
  { en: "Someone who believed in you before you did.", sv: "Någon som trodde på dig innan du själv gjorde det." },
  { en: "A debt no one else remembers.", sv: "En skuld som ingen annan minns." },
  { en: "The sound the world made the night everything changed.", sv: "Ljudet världen gav ifrån sig natten då allt förändrades." },
  { en: "A skill you learned for the wrong reasons.", sv: "En färdighet du lärde dig av fel skäl." },
  { en: "The last kind thing someone said to you back home.", sv: "Det sista snälla någon sa till dig där hemma." },
  { en: "A place you can never go back to.", sv: "En plats du aldrig kan återvända till." },
  { en: "A song, a scar, a name you don't say aloud.", sv: "En sång, ett ärr, ett namn du inte säger högt." },
  { en: "Something you carry that has no coin-value.", sv: "Något du bär på som saknar värde i mynt." },
  { en: "A promise you're not sure you can keep.", sv: "Ett löfte du inte är säker på att du kan hålla." },
  { en: "The weather on the worst day of your life.", sv: "Vädret den värsta dagen i ditt liv." },
  { en: "A stranger who changed your road with one sentence.", sv: "En främling som ändrade din väg med en enda mening." },
  { en: "What you'd grab first if the roof caught fire.", sv: "Det du skulle ta först om taket fattade eld." }
];
let lastMuse = -1;

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
let credits = null; // { granted, used, remaining, requested } — a courtesy meter

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
  hideSparks();
  $("#muse-line").hidden = true;
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
  refreshActionStates();
}

// An expansion needs something to expand; sparks work on a blank field; the
// weave needs at least one memory anywhere. All three need a remaining credit.
function outOfCredit() {
  return Boolean(credits) && credits.remaining <= 0;
}
function anyFilled() {
  return fields.some((field) => (entries.get(field.id) || "").trim());
}
function canAsk() {
  return Boolean((entries.get(selectedId) || "").trim()) && !outOfCredit();
}
function canSpark() {
  return !outOfCredit();
}
function canWeave() {
  return anyFilled() && !outOfCredit();
}
function refreshActionStates() {
  $("#ask-expansion").disabled = !canAsk();
  $("#kindle-sparks").disabled = !canSpark();
  $("#weave-button").disabled = !canWeave();
}

// The quiet meter beneath the editor: expansions left, and — when spent — a
// button to ask the steward for more.
function renderCredits() {
  const state = $("#credit-state");
  const requestButton = $("#request-credit");
  if (!credits) { state.hidden = true; requestButton.hidden = true; return; }
  state.hidden = false;
  state.textContent = t("background.credits.left", { n: credits.remaining });
  state.classList.toggle("is-low", credits.remaining <= 0);
  if (credits.remaining <= 0) {
    requestButton.hidden = false;
    requestButton.disabled = credits.requested;
    requestButton.textContent = credits.requested ? t("background.credits.requested") : t("background.credits.request");
  } else {
    requestButton.hidden = true;
  }
  refreshActionStates();
}

async function loadCredits() {
  if (!pc) return;
  try {
    const response = await fetch(`/api/llm-credits?owner=${encodeURIComponent(pc.id)}`);
    if (!response.ok) return;
    credits = await response.json();
    renderCredits();
  } catch {
    // The meter is a courtesy; never block the studio if it can't be read.
  }
}

async function requestMore() {
  const button = $("#request-credit");
  button.disabled = true;
  try {
    const response = await fetch("/api/llm-credits/request", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ owner: pc.id, note: "" })
    });
    if (!response.ok) throw new Error();
    credits = await response.json();
    renderCredits();
  } catch {
    button.disabled = false;
    setSaveState("background.credits.requestError", true);
  }
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
    if (body.credits) { credits = body.credits; renderCredits(); }
    if (response.status === 402) return; // out of credits: the meter now shows the ask-steward button
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
      refreshActionStates();
    }
  }
}

// --- sparks: three short seeds you can fold in; works on a blank field ---
function hideSparks() {
  $("#spark-tray").hidden = true;
  $("#spark-cards").innerHTML = "";
}

function renderSparks(sparks) {
  const cards = $("#spark-cards");
  cards.innerHTML = sparks
    .map((spark, i) => `<button type="button" class="spark-card" data-spark="${i}">${esc(spark)}</button>`)
    .join("");
  for (const button of cards.querySelectorAll("[data-spark]")) {
    button.onclick = () => {
      adoptSpark(sparks[Number(button.dataset.spark)]);
      button.classList.add("adopted");
    };
  }
  $("#spark-tray").hidden = false;
}

// Folding a spark in appends it as a new paragraph (or seeds an empty field),
// so the player can gather several before writing over them.
function adoptSpark(text) {
  const existing = entries.get(selectedId) || "";
  const next = existing.trim() ? `${existing.trimEnd()}\n\n${text}` : text;
  entries.set(selectedId, next);
  renderEditor();
  renderThread();
  queueSave(true);
}

async function kindleSparks() {
  const field = fieldById(selectedId);
  const request = ++suggestionRequest;
  const button = $("#kindle-sparks");
  button.disabled = true;
  button.textContent = t("background.sparking");
  setSaveState("");
  try {
    await flushSave();
    const response = await fetch(`/api/party/${encodeURIComponent(pc.id)}/background/spark`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fieldId: field.id, currentText: entries.get(field.id) || "", locale: lang() })
    });
    const body = await response.json();
    if (body.credits) { credits = body.credits; renderCredits(); }
    if (response.status === 402) return;
    if (!response.ok) throw new Error(body.error || t("background.sparkError"));
    if (request !== suggestionRequest || field.id !== selectedId) return;
    renderSparks(body.sparks || []);
  } catch {
    if (request === suggestionRequest) setSaveState("background.sparkError", true);
  } finally {
    if (request === suggestionRequest) {
      button.textContent = t("background.sparks");
      refreshActionStates();
    }
  }
}

// --- weave: a holistic reflection across every memory (read-only) ---
function openWeavePanel() {
  $("#weave-text").textContent = "";
  $("#weave-loading").hidden = false;
  $("#weave-panel").hidden = false;
}
function closeWeavePanel() {
  $("#weave-panel").hidden = true;
}

async function weaveTogether() {
  const button = $("#weave-button");
  button.disabled = true;
  button.textContent = t("background.weaving");
  openWeavePanel();
  try {
    await flushSave();
    const response = await fetch(`/api/party/${encodeURIComponent(pc.id)}/background/weave`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ locale: lang() })
    });
    const body = await response.json();
    if (body.credits) { credits = body.credits; renderCredits(); }
    if (response.status === 402) { closeWeavePanel(); return; }
    if (!response.ok) throw new Error(body.error || t("background.weaveError"));
    $("#weave-loading").hidden = true;
    $("#weave-text").textContent = body.weave;
  } catch {
    $("#weave-loading").hidden = true;
    $("#weave-text").textContent = t("background.weaveError");
  } finally {
    button.textContent = t("background.weave");
    refreshActionStates();
  }
}

// --- muse: a free, offline nudge drawn from the deck ---
function drawMuse() {
  if (MUSE_DECK.length < 2) return;
  let pick = lastMuse;
  while (pick === lastMuse) pick = Math.floor(Math.random() * MUSE_DECK.length);
  lastMuse = pick;
  $("#muse-text").textContent = MUSE_DECK[pick][lang()] || MUSE_DECK[pick].en;
  $("#muse-line").hidden = false;
}

$("#memory-text").addEventListener("input", () => {
  const text = $("#memory-text").value;
  entries.set(selectedId, text);
  $("#character-count").textContent = `${text.length} / 6000`;
  refreshActionStates();
  renderThread();
  queueSave();
});
$("#memory-text").addEventListener("blur", () => queueSave(true));
$("#ask-expansion").onclick = askForExpansion;
$("#kindle-sparks").onclick = kindleSparks;
$("#weave-button").onclick = weaveTogether;
$("#draw-muse").onclick = drawMuse;
$("#muse-close").onclick = () => { $("#muse-line").hidden = true; };
$("#dismiss-sparks").onclick = hideSparks;
$("#weave-close").onclick = closeWeavePanel;
$("#weave-panel").addEventListener("click", (event) => { if (event.target === $("#weave-panel")) closeWeavePanel(); });
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && !$("#weave-panel").hidden) closeWeavePanel();
});
$("#request-credit").onclick = requestMore;
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
  $("#studio-actions").hidden = false;
  setTelemetryMode("background-studio");
  loadCredits();
  // The meter re-reads on any broadcast, so a steward's grant lands live.
  try {
    const stream = new EventSource("/api/stream");
    stream.onmessage = () => loadCredits();
  } catch {
    // No live updates without SSE; the meter still refreshes on each ask.
  }
}

initI18n();
load().catch(() => { $("#load-error").hidden = false; });
