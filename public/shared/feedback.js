import { t } from "/shared/i18n.js";

if (new URLSearchParams(location.search).get("embed") !== "1") {
  const style = document.createElement("link");
  style.rel = "stylesheet";
  style.href = "/shared/feedback.css";
  document.head.append(style);

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", initFeedback, { once: true });
  else initFeedback();
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
    trigger.hidden = false;
    strokes.length = 0;
    overlay.querySelector("textarea").value = "";
    overlay.querySelector(".feedback-status").textContent = "";
  }
  overlay.querySelector(".feedback-close").onclick = close;
  overlay.addEventListener("click", (event) => { if (event.target === overlay) close(); });

  trigger.onclick = async () => {
    trigger.hidden = true;
    const status = overlay.querySelector(".feedback-status");
    try {
      const { default: html2canvas } = await import("/vendor/html2canvas/html2canvas.esm.js");
      const captured = await html2canvas(document.documentElement, {
        backgroundColor: getComputedStyle(document.body).backgroundColor || "#17120c",
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
        ignoreElements: (element) => !!element.closest?.("[data-feedback-ui]")
      });
      const ratio = Math.min(1, 1600 / captured.width);
      canvas.width = Math.max(1, Math.round(captured.width * ratio));
      canvas.height = Math.max(1, Math.round(captured.height * ratio));
      base = document.createElement("canvas");
      base.width = canvas.width;
      base.height = canvas.height;
      base.getContext("2d").drawImage(captured, 0, 0, base.width, base.height);
      strokes.length = 0;
      redraw();
      overlay.hidden = false;
      overlay.querySelector(".feedback-panel").scrollTop = 0;
    } catch (error) {
      trigger.hidden = false;
      alert(`${t("feedback.captureError")} ${error.message || ""}`.trim());
    }
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
}
