import { t, initI18n, seasonLabel } from "/shared/i18n.js";
import { setTelemetryMode } from "/shared/telemetry.js";
import "/shared/feedback.js";

const $ = (selector) => document.querySelector(selector);
const esc = (value) => String(value ?? "").replace(/[&<>"']/g, (char) =>
  ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

const LAYOUT_KEY = "settlement-login-cards-v2";
const LEGACY_LAYOUT_KEY = "settlement-login-bubbles-v1";
const COLORS = [
  { value: "#f4a7b9", label: "login.color.roseMist", family: "pastel" },
  { value: "#9fcdb7", label: "login.color.mintGlass", family: "pastel" },
  { value: "#9db9e8", label: "login.color.rainBlue", family: "pastel" },
  { value: "#ef4c43", label: "login.color.emberRed", family: "primal" },
  { value: "#f2ca3a", label: "login.color.sunGold", family: "primal" },
  { value: "#3aa75d", label: "login.color.groveGreen", family: "primal" },
  { value: "#7e65d8", label: "login.color.spellViolet", family: "magical" },
  { value: "#40c9c2", label: "login.color.witchlight", family: "magical" },
  { value: "#d66bd6", label: "login.color.feyPink", family: "magical" }
];
let data = null;
let drafts = [];
let identities = [];
let paintColor = null;
let drag = null;
const cardState = (() => {
  try {
    const saved = localStorage.getItem(LAYOUT_KEY) || localStorage.getItem(LEGACY_LAYOUT_KEY) || "{}";
    return { positions: {}, colors: {}, ...JSON.parse(saved) };
  }
  catch { return { positions: {}, colors: {} }; }
})();

const currentPC = () => localStorage.getItem("settlement-pc") || localStorage.getItem("settlement-journal-pc");
const cardKey = (kind, id) => `${kind}:${id}`;
const saveCards = () => localStorage.setItem(LAYOUT_KEY, JSON.stringify(cardState));

function cardArtHtml(item, kind) {
  const initial = esc((item.name || "?").trim().slice(0, 1).toUpperCase() || "?");
  const art = kind === "pc" && item.portrait
    ? `<img src="${esc(item.portrait)}" alt="">`
    : `<span class="character-card-monogram">${initial}</span>`;
  return `<span class="character-card-art ${item.portrait ? "has-portrait" : ""}" aria-hidden="true">${art}</span>`;
}

function cardHtml(item, kind, index) {
  const key = cardKey(kind, item.id);
  const primaryColor = item.appearance?.primaryColor || "#8b7653";
  const color = cardState.colors[key] || item.appearance?.secondaryColor || (kind === "draft" ? "#d8b889" : "#9fcdb7");
  const detail = kind === "draft" ? t("login.resume") : (item.player || t("login.players"));
  const current = kind === "pc" && item.id === currentPC();
  return `<button class="character-card ${kind === "draft" ? "character-card-draft" : ""} ${current ? "current" : ""}" type="button"
    data-character-kind="${kind}" data-character-id="${esc(item.id)}" data-card-key="${esc(key)}"
    aria-label="${esc(item.name || t("login.unnamedDraft"))}, ${esc(detail)}"
    style="--card-paint:${color};--card-class:${primaryColor};--card-turn:${((index % 5) - 2) * 0.85}deg;--deal-delay:${(index % 7) * 42}ms">
    ${cardArtHtml(item, kind)}
    <span class="character-card-wash" aria-hidden="true"></span>
    ${current ? `<span class="character-card-status">${esc(t("login.current"))}</span>` : ""}
    <span class="character-card-copy">
      <strong>${esc(item.name || t("login.unnamedDraft"))}</strong>
      <span>${esc(detail)}</span>
    </span>
  </button>`;
}

function campaignGroupsHtml(items, kind) {
  const campaigns = Array.isArray(data?.campaigns) ? data.campaigns : [];
  return campaigns.map((campaign, campaignIndex) => {
    const members = items.filter((item) => item.campaignId === campaign.id);
    const current = campaign.id === data.currentCampaignId;
    return `<section class="login-campaign-group ${current ? "is-current" : ""}">
      <div class="campaign-group-heading"><span>${esc(campaign.name)}</span>${current ? `<small>${t("campaign.current")}</small>` : ""}<i aria-hidden="true"></i></div>
      <div class="character-card-stage ${kind === "draft" ? "unfinished-stage" : ""}" data-stage-kind="${kind}" data-campaign-id="${esc(campaign.id)}">
        ${members.length
          ? members.map((item, index) => cardHtml(item, kind, campaignIndex * 20 + index)).join("")
          : `<p class="trust-note campaign-empty">${kind === "draft" ? t("login.noDrafts") : t("login.noCampaignCharacters")}</p>`}
      </div>
    </section>`;
  }).join("");
}

function layoutCampaignStages() {
  for (const stage of document.querySelectorAll(".character-card-stage")) {
    positionStage(stage, stage.dataset.stageKind);
    wireStage(stage);
  }
  const views = $("#character-views");
  const activeView = views.dataset.view === "drafts" ? views.querySelector(".drafts-view") : views.querySelector(".finished-view");
  views.style.height = `${Math.max(320, activeView.scrollHeight)}px`;
}

function positionStage(stage, kind) {
  const cards = [...stage.querySelectorAll(".character-card")];
  if (!cards.length || !stage.clientWidth) return;
  const compact = stage.clientWidth < 520;
  const width = compact ? 116 : (kind === "draft" ? 138 : 156);
  const height = compact ? 164 : (kind === "draft" ? 186 : 210);
  const columns = Math.max(1, Math.floor((stage.clientWidth - 18) / (width + 18)));
  const rows = Math.max(1, Math.ceil(cards.length / columns));
  stage.style.minHeight = `${Math.max(kind === "draft" ? 220 : 270, rows * (height + 16) + 20)}px`;
  const stageHeight = stage.clientHeight;
  cards.forEach((card, index) => {
    const key = card.dataset.cardKey;
    const saved = cardState.positions[key];
    const column = index % columns;
    const row = Math.floor(index / columns);
    const rowMembers = Math.min(columns, cards.length - row * columns);
    const fallbackX = ((column + 0.5) / rowMembers) * stage.clientWidth;
    const fallbackY = ((row + 0.5) / rows) * stageHeight;
    const x = clamp((saved?.x ?? fallbackX / stage.clientWidth) * stage.clientWidth - width / 2, 3, Math.max(3, stage.clientWidth - width - 3));
    const y = clamp((saved?.y ?? fallbackY / stageHeight) * stageHeight - height / 2, 3, Math.max(3, stageHeight - height - 3));
    card.style.setProperty("--card-width", `${width}px`);
    card.style.setProperty("--card-height", `${height}px`);
    card.style.setProperty("--card-x", `${x}px`);
    card.style.setProperty("--card-y", `${y}px`);
    card.dataset.x = x;
    card.dataset.y = y;
  });
}

function wireStage(stage) {
  for (const card of stage.querySelectorAll(".character-card")) {
    card.onpointerdown = (event) => {
      if (paintColor) return;
      const rect = stage.getBoundingClientRect();
      drag = {
        card,
        stage,
        pointerId: event.pointerId,
        offsetX: event.clientX - rect.left - Number(card.dataset.x),
        offsetY: event.clientY - rect.top - Number(card.dataset.y),
        startX: event.clientX,
        startY: event.clientY,
        moved: false
      };
      card.setPointerCapture(event.pointerId);
    };
    card.onpointermove = (event) => {
      if (!drag || drag.card !== card || drag.pointerId !== event.pointerId) return;
      const rect = stage.getBoundingClientRect();
      const x = clamp(event.clientX - rect.left - drag.offsetX, 3, Math.max(3, stage.clientWidth - card.offsetWidth - 3));
      const y = clamp(event.clientY - rect.top - drag.offsetY, 3, Math.max(3, stage.clientHeight - card.offsetHeight - 3));
      drag.moved ||= Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY) > 5;
      card.dataset.x = x;
      card.dataset.y = y;
      card.style.setProperty("--card-x", `${x}px`);
      card.style.setProperty("--card-y", `${y}px`);
      if (drag.moved) card.classList.add("dragging");
    };
    card.onpointerup = (event) => {
      if (!drag || drag.card !== card || drag.pointerId !== event.pointerId) return;
      card.classList.remove("dragging");
      if (drag.moved) {
        cardState.positions[card.dataset.cardKey] = {
          x: (Number(card.dataset.x) + card.offsetWidth / 2) / stage.clientWidth,
          y: (Number(card.dataset.y) + card.offsetHeight / 2) / stage.clientHeight
        };
        card.dataset.suppressClick = "true";
        setTimeout(() => delete card.dataset.suppressClick, 0);
        saveCards();
      }
      drag = null;
    };
    card.onpointercancel = () => { card.classList.remove("dragging"); drag = null; };
    card.onclick = () => {
      if (card.dataset.suppressClick) return;
      if (paintColor) {
        if (paintColor === "clear") delete cardState.colors[card.dataset.cardKey];
        else cardState.colors[card.dataset.cardKey] = paintColor;
        card.style.setProperty("--card-paint", cardState.colors[card.dataset.cardKey] || (card.dataset.characterKind === "draft" ? "#d8b889" : "#9fcdb7"));
        saveCards();
        return;
      }
      if (card.dataset.characterKind === "draft") {
        location.href = `/create/?draft=${encodeURIComponent(card.dataset.characterId)}`;
        return;
      }
      localStorage.setItem("settlement-pc", card.dataset.characterId);
      localStorage.removeItem("settlement-journal-pc");
      location.href = "/player";
    };
  }
}

function renderPalette() {
  $("#character-palette").innerHTML = [...COLORS, { value: "clear", label: "login.clearPaint", family: "clear" }].map(({ value, label, family }) => `<button class="character-swatch ${family === "clear" ? "clear-swatch" : ""} ${paintColor === value ? "selected" : ""}" type="button" data-character-color="${value}" data-color-family="${family}" style="--swatch:${value === "clear" ? "transparent" : value}" aria-label="${esc(t(label))}" title="${esc(t(label))}"></button>`).join("");
  for (const swatch of document.querySelectorAll("[data-character-color]")) swatch.onclick = () => {
    paintColor = swatch.dataset.characterColor;
    renderPalette();
  };
}

function render() {
  if (!data) return;
  document.title = `${t("login.subtitle")} — ${data.settlement.name}`;
  $("#settlement-name").textContent = data.settlement.name;
  $("#settlement-season").textContent = seasonLabel(data.settlement.seasonLabel);

  $("#finished-characters").innerHTML = campaignGroupsHtml(identities, "pc");
  $("#unfinished-characters").innerHTML = campaignGroupsHtml(drafts, "draft");
  if (!drafts.length && $("#character-views").dataset.view === "drafts") {
    $("#character-views").dataset.view = "finished";
    $("#character-views").querySelector(".finished-view").inert = false;
    $("#character-views").querySelector(".drafts-view").inert = true;
  }
  setTelemetryMode($("#character-views").dataset.view === "drafts" ? "drafts" : "finished");
  $("#draft-view-toggle").hidden = drafts.length === 0;
  $("#draft-view-label").textContent = $("#character-views").dataset.view === "drafts" ? t("login.backFinished") : t("login.showDrafts", { n: drafts.length });
  requestAnimationFrame(layoutCampaignStages);
}

async function refresh() {
  const [tableResponse, draftResponse, partyResponse] = await Promise.all([fetch("/api/table"), fetch("/api/character-drafts"), fetch("/api/party")]);
  if (!tableResponse.ok || !draftResponse.ok || !partyResponse.ok) throw new Error(t("error.characters"));
  [data, drafts, identities] = await Promise.all([tableResponse.json(), draftResponse.json(), partyResponse.json()]);
  render();
}

$("#draft-view-toggle").onclick = () => {
  const views = $("#character-views");
  const showDrafts = views.dataset.view !== "drafts";
  views.dataset.view = showDrafts ? "drafts" : "finished";
  views.querySelector(".finished-view").inert = showDrafts;
  views.querySelector(".drafts-view").inert = !showDrafts;
  $("#draft-view-toggle").setAttribute("aria-pressed", String(showDrafts));
  $("#draft-view-label").textContent = showDrafts ? t("login.backFinished") : t("login.showDrafts", { n: drafts.length });
  setTelemetryMode(showDrafts ? "drafts" : "finished");
  requestAnimationFrame(layoutCampaignStages);
};

$("#character-paint").onclick = () => {
  const palette = $("#character-palette");
  palette.hidden = !palette.hidden;
  $("#character-paint").setAttribute("aria-expanded", String(!palette.hidden));
  if (palette.hidden) paintColor = null;
  renderPalette();
};

window.addEventListener("resize", () => {
  layoutCampaignStages();
});
window.addEventListener("storage", (event) => { if (event.key === "settlement-pc") render(); });

initI18n();
renderPalette();
refresh().catch((error) => { $("#finished-characters").innerHTML = `<p class="trust-note">${esc(error.message)}</p>`; });

const stream = new EventSource("/api/stream");
let refreshTimer = null;
stream.onmessage = () => {
  clearTimeout(refreshTimer);
  refreshTimer = setTimeout(() => refresh().catch(() => {}), 180);
};
