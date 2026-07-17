import { t, initI18n, seasonLabel } from "/shared/i18n.js";
import { setTelemetryMode } from "/shared/telemetry.js";
import "/shared/feedback.js";

const $ = (selector) => document.querySelector(selector);
const esc = (value) => String(value ?? "").replace(/[&<>"']/g, (char) =>
  ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

const LAYOUT_KEY = "settlement-login-bubbles-v1";
const COLORS = ["#f4a7b9", "#9fcdb7", "#9db9e8", "#ef4c43", "#f2ca3a", "#3aa75d", "#7e65d8", "#40c9c2", "#d66bd6"];
let data = null;
let drafts = [];
let paintColor = null;
let drag = null;
const bubbleState = (() => {
  try { return { positions: {}, colors: {}, ...JSON.parse(localStorage.getItem(LAYOUT_KEY) || "{}") }; }
  catch { return { positions: {}, colors: {} }; }
})();

const currentPC = () => localStorage.getItem("settlement-pc") || localStorage.getItem("settlement-journal-pc");
const bubbleKey = (kind, id) => `${kind}:${id}`;
const saveBubbles = () => localStorage.setItem(LAYOUT_KEY, JSON.stringify(bubbleState));

function portraitHtml(person) {
  return person.portrait ? `<span class="bubble-portrait"><img src="${esc(person.portrait)}" alt=""></span>` : "";
}

function bubbleHtml(item, kind, index) {
  const key = bubbleKey(kind, item.id);
  const color = bubbleState.colors[key] || (kind === "draft" ? "#d8b889" : "#a9cfc3");
  const detail = kind === "draft" ? t("login.resume") : (item.player || t("login.players"));
  return `<button class="character-bubble ${kind === "draft" ? "bubble-resume" : ""} ${kind === "pc" && item.id === currentPC() ? "current" : ""}" type="button"
    data-character-kind="${kind}" data-character-id="${esc(item.id)}" data-bubble-key="${esc(key)}"
    style="--bubble-paint:${color};--bubble-turn:${((index % 5) - 2) * 1.2}deg">
    ${kind === "pc" ? portraitHtml(item) : ""}
    <strong class="bubble-name">${esc(item.name || t("login.unnamedDraft"))}</strong>
    <span class="bubble-detail">${esc(detail)}</span>
  </button>`;
}

function positionStage(stage, kind) {
  const bubbles = [...stage.querySelectorAll(".character-bubble")];
  if (!bubbles.length || !stage.clientWidth || !stage.clientHeight) return;
  const size = stage.clientWidth < 520 ? 116 : (kind === "draft" ? 128 : 142);
  const columns = Math.max(1, Math.floor(stage.clientWidth / (size + 20)));
  const rows = Math.max(1, Math.ceil(bubbles.length / columns));
  bubbles.forEach((bubble, index) => {
    const key = bubble.dataset.bubbleKey;
    const saved = bubbleState.positions[key];
    const column = index % columns;
    const row = Math.floor(index / columns);
    const fallbackX = ((column + 0.5) / Math.min(columns, bubbles.length)) * stage.clientWidth;
    const fallbackY = ((row + 0.5) / rows) * stage.clientHeight;
    const x = clamp((saved?.x ?? fallbackX / stage.clientWidth) * stage.clientWidth - size / 2, 2, Math.max(2, stage.clientWidth - size - 2));
    const y = clamp((saved?.y ?? fallbackY / stage.clientHeight) * stage.clientHeight - size / 2, 2, Math.max(2, stage.clientHeight - size - 2));
    bubble.style.setProperty("--bubble-size", `${size}px`);
    bubble.style.setProperty("--bubble-x", `${x}px`);
    bubble.style.setProperty("--bubble-y", `${y}px`);
    bubble.dataset.x = x;
    bubble.dataset.y = y;
  });
}

function wireStage(stage) {
  for (const bubble of stage.querySelectorAll(".character-bubble")) {
    bubble.onpointerdown = (event) => {
      if (paintColor) return;
      const rect = stage.getBoundingClientRect();
      drag = {
        bubble,
        stage,
        pointerId: event.pointerId,
        offsetX: event.clientX - rect.left - Number(bubble.dataset.x),
        offsetY: event.clientY - rect.top - Number(bubble.dataset.y),
        startX: event.clientX,
        startY: event.clientY,
        moved: false
      };
      bubble.setPointerCapture(event.pointerId);
    };
    bubble.onpointermove = (event) => {
      if (!drag || drag.bubble !== bubble || drag.pointerId !== event.pointerId) return;
      const rect = stage.getBoundingClientRect();
      const size = bubble.offsetWidth;
      const x = clamp(event.clientX - rect.left - drag.offsetX, 2, Math.max(2, stage.clientWidth - size - 2));
      const y = clamp(event.clientY - rect.top - drag.offsetY, 2, Math.max(2, stage.clientHeight - size - 2));
      drag.moved ||= Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY) > 5;
      bubble.dataset.x = x;
      bubble.dataset.y = y;
      bubble.style.setProperty("--bubble-x", `${x}px`);
      bubble.style.setProperty("--bubble-y", `${y}px`);
      if (drag.moved) bubble.classList.add("dragging");
    };
    bubble.onpointerup = (event) => {
      if (!drag || drag.bubble !== bubble || drag.pointerId !== event.pointerId) return;
      bubble.classList.remove("dragging");
      if (drag.moved) {
        const size = bubble.offsetWidth;
        bubbleState.positions[bubble.dataset.bubbleKey] = {
          x: (Number(bubble.dataset.x) + size / 2) / stage.clientWidth,
          y: (Number(bubble.dataset.y) + size / 2) / stage.clientHeight
        };
        bubble.dataset.suppressClick = "true";
        setTimeout(() => delete bubble.dataset.suppressClick, 0);
        saveBubbles();
      }
      drag = null;
    };
    bubble.onpointercancel = () => { bubble.classList.remove("dragging"); drag = null; };
    bubble.onclick = () => {
      if (bubble.dataset.suppressClick) return;
      if (paintColor) {
        if (paintColor === "clear") delete bubbleState.colors[bubble.dataset.bubbleKey];
        else bubbleState.colors[bubble.dataset.bubbleKey] = paintColor;
        bubble.style.setProperty("--bubble-paint", bubbleState.colors[bubble.dataset.bubbleKey] || (bubble.dataset.characterKind === "draft" ? "#d8b889" : "#a9cfc3"));
        saveBubbles();
        return;
      }
      if (bubble.dataset.characterKind === "draft") {
        location.href = `/create/?draft=${encodeURIComponent(bubble.dataset.characterId)}`;
        return;
      }
      localStorage.setItem("settlement-pc", bubble.dataset.characterId);
      localStorage.removeItem("settlement-journal-pc");
      location.href = "/player";
    };
  }
}

function renderPalette() {
  $("#character-palette").innerHTML = [...COLORS, "clear"].map((color) => `<button class="character-swatch ${paintColor === color ? "selected" : ""}" type="button" data-character-color="${color}" style="--swatch:${color === "clear" ? "transparent" : color}" aria-label="${color === "clear" ? t("login.clearPaint") : t("login.paint")}"></button>`).join("");
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

  const finished = data.party || [];
  $("#finished-characters").innerHTML = finished.length
    ? finished.map((pc, index) => bubbleHtml(pc, "pc", index)).join("")
    : `<p class="trust-note">${t("login.noFinished")}</p>`;
  $("#unfinished-characters").innerHTML = drafts.length
    ? drafts.map((entry, index) => bubbleHtml(entry, "draft", index)).join("")
    : `<p class="trust-note">${t("login.noDrafts")}</p>`;
  if (!drafts.length && $("#character-views").dataset.view === "drafts") {
    $("#character-views").dataset.view = "finished";
    $("#character-views").querySelector(".finished-view").inert = false;
    $("#character-views").querySelector(".drafts-view").inert = true;
  }
  setTelemetryMode($("#character-views").dataset.view === "drafts" ? "drafts" : "finished");
  $("#draft-view-toggle").hidden = drafts.length === 0;
  $("#draft-view-label").textContent = $("#character-views").dataset.view === "drafts" ? t("login.backFinished") : t("login.showDrafts", { n: drafts.length });
  requestAnimationFrame(() => {
    positionStage($("#finished-characters"), "pc");
    positionStage($("#unfinished-characters"), "draft");
    wireStage($("#finished-characters"));
    wireStage($("#unfinished-characters"));
  });
}

async function refresh() {
  const [tableResponse, draftResponse] = await Promise.all([fetch("/api/table"), fetch("/api/character-drafts")]);
  if (!tableResponse.ok || !draftResponse.ok) throw new Error(t("error.characters"));
  [data, drafts] = await Promise.all([tableResponse.json(), draftResponse.json()]);
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
  requestAnimationFrame(() => positionStage(showDrafts ? $("#unfinished-characters") : $("#finished-characters"), showDrafts ? "draft" : "pc"));
};

$("#character-paint").onclick = () => {
  const palette = $("#character-palette");
  palette.hidden = !palette.hidden;
  $("#character-paint").setAttribute("aria-expanded", String(!palette.hidden));
  if (palette.hidden) paintColor = null;
  renderPalette();
};

window.addEventListener("resize", () => {
  positionStage($("#finished-characters"), "pc");
  positionStage($("#unfinished-characters"), "draft");
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
