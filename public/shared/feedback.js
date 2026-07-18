import { t } from "/shared/i18n.js";
import { playerFeatureEnabled } from "/shared/player-features.js";
import "/shared/player-home.js";

if (new URLSearchParams(location.search).get("embed") !== "1") {
  const style = document.createElement("link");
  style.rel = "stylesheet";
  style.href = "/shared/feedback.css";
  document.head.append(style);

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", initFeedback, { once: true });
  else initFeedback();
}

const COLOR_PROPERTIES = [
  ["color", "#201a14"],
  ["background-color", "transparent"],
  ["border-top-color", "transparent"],
  ["border-right-color", "transparent"],
  ["border-bottom-color", "transparent"],
  ["border-left-color", "transparent"],
  ["outline-color", "transparent"],
  ["text-decoration-color", "transparent"],
  ["column-rule-color", "transparent"],
  ["-webkit-text-stroke-color", "transparent"],
  ["fill", "#201a14"],
  ["stroke", "transparent"],
  ["stop-color", "transparent"],
  ["flood-color", "transparent"],
  ["lighting-color", "transparent"]
];
const MODERN_COLOR = /(?:color-mix|oklab|oklch|lab|lch|color)\(/i;
const SRGB_COLOR = /^color\(srgb\s+([+-]?(?:\d*\.)?\d+)\s+([+-]?(?:\d*\.)?\d+)\s+([+-]?(?:\d*\.)?\d+)(?:\s*\/\s*([+-]?(?:\d*\.)?\d+))?\)$/i;
const CAPTURE_STYLE = `
  *, *::before, *::after { animation: none !important; transition: none !important; }
  *::before, *::after {
    content: none !important;
    color: rgb(32, 26, 20) !important;
    background: none !important;
    border-color: transparent !important;
    box-shadow: none !important;
    text-shadow: none !important;
  }
`;
function legacyColor(value, fallback) {
  if (!value || value === "none") return value || fallback;
  if (value === "transparent") return "rgba(0, 0, 0, 0)";
  if (/^(?:rgba?|hsla?)\(/i.test(value) || /^#[\da-f]{3,8}$/i.test(value)) return value;
  const srgb = value.match(SRGB_COLOR);
  if (!srgb) return fallback;
  const channel = (part) => Math.round(Math.max(0, Math.min(1, Number(part))) * 255);
  const alpha = srgb[4] === undefined ? 1 : Math.max(0, Math.min(1, Number(srgb[4])));
  return `rgba(${channel(srgb[1])}, ${channel(srgb[2])}, ${channel(srgb[3])}, ${alpha.toFixed(3)})`;
}

function applyLegacyStyles(sourceElements, targetElements) {
  const count = Math.min(sourceElements.length, targetElements.length);
  for (let index = 0; index < count; index += 1) {
    const computed = getComputedStyle(sourceElements[index]);
    const targetStyle = targetElements[index].style;
    for (const [property, fallback] of COLOR_PROPERTIES) {
      const value = computed.getPropertyValue(property);
      if (MODERN_COLOR.test(value)) targetStyle.setProperty(property, legacyColor(value, fallback), "important");
    }
    for (const property of ["background-image", "border-image-source", "box-shadow", "text-shadow"]) {
      if (MODERN_COLOR.test(computed.getPropertyValue(property))) targetStyle.setProperty(property, "none", "important");
    }
  }
}

function addCaptureStyle(targetDocument) {
  const captureStyle = targetDocument.createElement("style");
  captureStyle.dataset.feedbackCaptureStyle = "";
  captureStyle.textContent = CAPTURE_STYLE;
  targetDocument.head.append(captureStyle);
  return captureStyle;
}

function prepareFeedbackSource() {
  const elements = [document.documentElement, ...document.documentElement.querySelectorAll("*")];
  const inlineStyles = elements.map((element) => element.getAttribute("style"));
  applyLegacyStyles(elements, elements);
  const captureStyle = addCaptureStyle(document);

  return () => {
    captureStyle.remove();
    elements.forEach((element, index) => {
      const original = inlineStyles[index];
      if (original === null) element.removeAttribute("style");
      else element.setAttribute("style", original);
    });
  };
}

function sanitizeFeedbackClone(clonedDocument) {
  const sourceElements = [document.documentElement, ...document.documentElement.querySelectorAll("*")];
  const clonedElements = [clonedDocument.documentElement, ...clonedDocument.documentElement.querySelectorAll("*")];
  applyLegacyStyles(sourceElements, clonedElements);

  if (!clonedDocument.querySelector("[data-feedback-capture-style]")) addCaptureStyle(clonedDocument);
}

function createFallbackCapture() {
  const fallback = document.createElement("canvas");
  const scale = Math.min(window.devicePixelRatio || 1, 1.5, 1600 / Math.max(1, window.innerWidth));
  fallback.width = Math.max(1, Math.round(window.innerWidth * scale));
  fallback.height = Math.max(1, Math.round(window.innerHeight * scale));
  const context = fallback.getContext("2d");
  context.fillStyle = legacyColor(getComputedStyle(document.body).backgroundColor, "#17120c");
  context.fillRect(0, 0, fallback.width, fallback.height);

  const padding = Math.max(24, Math.round(fallback.width * 0.035));
  context.fillStyle = "rgba(240, 221, 176, .82)";
  context.font = `${Math.max(20, Math.round(fallback.width / 38))}px Georgia, serif`;
  context.fillText(document.title || location.pathname, padding, padding * 1.8, fallback.width - padding * 2);
  context.fillStyle = "rgba(240, 221, 176, .48)";
  context.font = `${Math.max(13, Math.round(fallback.width / 70))}px sans-serif`;
  context.fillText(location.pathname, padding, padding * 2.7, fallback.width - padding * 2);
  return fallback;
}

function initFeedback() {
  const trigger = document.createElement("button");
  trigger.type = "button";
  trigger.className = "feedback-trigger";
  trigger.dataset.feedbackUi = "";
  trigger.title = t("feedback.open");
  trigger.setAttribute("aria-label", t("feedback.open"));
  trigger.innerHTML = '<span aria-hidden="true">🪲</span>';

  const overlay = document.createElement("div");
  overlay.className = "feedback-overlay";
  overlay.dataset.feedbackUi = "";
  overlay.hidden = true;
  overlay.innerHTML = `<section class="feedback-panel" role="dialog" aria-modal="true" aria-labelledby="feedback-title">
    <div class="feedback-head"><h2 id="feedback-title">${t("feedback.title")}</h2><button class="feedback-close" type="button" aria-label="${t("feedback.close")}">×</button></div>
    <div class="feedback-canvas-wrap"><canvas></canvas></div>
    <div class="feedback-tools">
      <button class="quiet" type="button" data-feedback-undo title="${t("feedback.undo")}" aria-label="${t("feedback.undo")}">↶</button>
      <button class="quiet" type="button" data-feedback-clear>${t("feedback.clear")}</button>
      <span class="feedback-hint">${t("feedback.drawHint")}</span>
    </div>
    <form class="feedback-form">
      <textarea maxlength="4000" required placeholder="${t("feedback.placeholder")}"></textarea>
      <div class="feedback-actions"><div class="feedback-status" role="status"></div><button type="submit">${t("feedback.send")}</button></div>
    </form>
  </section>`;
  document.body.append(trigger, overlay);

  const canvas = overlay.querySelector("canvas");
  const context = canvas.getContext("2d");
  const strokes = [];
  let base = null;
  let current = null;

  const refreshFeature = () => {
    if (overlay.hidden) trigger.hidden = !playerFeatureEnabled("feedback");
  };

  function redraw() {
    if (!base) return;
    context.clearRect(0, 0, canvas.width, canvas.height);
    context.drawImage(base, 0, 0);
    context.strokeStyle = "#d32323";
    context.lineCap = "round";
    context.lineJoin = "round";
    context.lineWidth = Math.max(4, canvas.width / 280);
    for (const stroke of strokes) {
      if (stroke.length < 2) continue;
      context.beginPath();
      context.moveTo(stroke[0][0], stroke[0][1]);
      for (const point of stroke.slice(1)) context.lineTo(point[0], point[1]);
      context.stroke();
    }
  }

  function point(event) {
    const rect = canvas.getBoundingClientRect();
    return [(event.clientX - rect.left) * canvas.width / rect.width, (event.clientY - rect.top) * canvas.height / rect.height];
  }

  canvas.addEventListener("pointerdown", (event) => {
    current = [point(event)];
    strokes.push(current);
    canvas.setPointerCapture(event.pointerId);
  });
  canvas.addEventListener("pointermove", (event) => {
    if (!current) return;
    current.push(point(event));
    redraw();
  });
  const finishStroke = () => { current = null; };
  canvas.addEventListener("pointerup", finishStroke);
  canvas.addEventListener("pointercancel", finishStroke);

  overlay.querySelector("[data-feedback-undo]").onclick = () => { strokes.pop(); redraw(); };
  overlay.querySelector("[data-feedback-clear]").onclick = () => { strokes.length = 0; redraw(); };

  function close() {
    overlay.hidden = true;
    trigger.hidden = !playerFeatureEnabled("feedback");
    strokes.length = 0;
    overlay.querySelector("textarea").value = "";
    const status = overlay.querySelector(".feedback-status");
    status.classList.remove("is-error");
    delete status.dataset.captureError;
    status.textContent = "";
  }
  overlay.querySelector(".feedback-close").onclick = close;
  overlay.addEventListener("click", (event) => { if (event.target === overlay) close(); });

  trigger.onclick = async () => {
    if (!playerFeatureEnabled("feedback")) return;
    trigger.hidden = true;
    const status = overlay.querySelector(".feedback-status");
    let captured;
    let captureFailed = false;
    try {
      const { default: html2canvas } = await import("/vendor/html2canvas/html2canvas.esm.js");
      const restoreSource = prepareFeedbackSource();
      try {
        captured = await html2canvas(document.body, {
          backgroundColor: legacyColor(getComputedStyle(document.body).backgroundColor, "#17120c"),
          useCORS: true,
          logging: false,
          scale: Math.min(window.devicePixelRatio || 1, 1.5),
          x: window.scrollX,
          y: window.scrollY,
          width: window.innerWidth,
          height: window.innerHeight,
          scrollX: window.scrollX,
          scrollY: window.scrollY,
          windowWidth: window.innerWidth,
          windowHeight: window.innerHeight,
          onclone: sanitizeFeedbackClone,
          ignoreElements: (element) => !!element.closest?.("[data-feedback-ui]")
        });
      } finally {
        restoreSource();
      }
    } catch (error) {
      captured = createFallbackCapture();
      captureFailed = true;
      status.dataset.captureError = error.message || error.name;
      console.error("Feedback screenshot capture failed:", error);
    }

    const ratio = Math.min(1, 1600 / captured.width);
    canvas.width = Math.max(1, Math.round(captured.width * ratio));
    canvas.height = Math.max(1, Math.round(captured.height * ratio));
    base = document.createElement("canvas");
    base.width = canvas.width;
    base.height = canvas.height;
    base.getContext("2d").drawImage(captured, 0, 0, base.width, base.height);
    strokes.length = 0;
    redraw();
    status.classList.toggle("is-error", captureFailed);
    status.textContent = captureFailed ? t("feedback.captureError") : "";
    if (!captureFailed) delete status.dataset.captureError;
    overlay.hidden = false;
    overlay.querySelector(".feedback-panel").scrollTop = 0;
  };

  overlay.querySelector("form").onsubmit = async (event) => {
    event.preventDefault();
    const submit = overlay.querySelector("button[type=submit]");
    const status = overlay.querySelector(".feedback-status");
    status.classList.remove("is-error");
    status.textContent = t("feedback.sending");
    submit.disabled = true;
    try {
      const response = await fetch("/api/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: overlay.querySelector("textarea").value,
          screenshot: canvas.toDataURL("image/jpeg", 0.78),
          sourceUrl: `${location.pathname}${location.search}${location.hash}`,
          viewport: { width: window.innerWidth, height: window.innerHeight },
          pcId: localStorage.getItem("settlement-pc")
        })
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || t("feedback.sendError"));
      status.textContent = t("feedback.sent");
      setTimeout(close, 650);
    } catch (error) {
      status.classList.add("is-error");
      status.textContent = error.message || t("feedback.sendError");
    } finally {
      submit.disabled = false;
    }
  };
  window.addEventListener("settlement:player-features", refreshFeature);
  refreshFeature();
}
