import { t } from "/shared/i18n.js";

const excluded = new Set(["/", "/login", "/create", "/gm", "/gm-remote", "/board", "/screen"]);
const path = location.pathname.replace(/\/$/, "") || "/";
const embedded = new URLSearchParams(location.search).get("embed") === "1" || window.self !== window.top;

if (!embedded && !excluded.has(path)) {
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", initScreenRequests, { once: true });
  else initScreenRequests();
}

function initScreenRequests() {
  const style = document.createElement("link");
  style.rel = "stylesheet";
  style.href = "/shared/player-share.css";
  document.head.append(style);

  const dialog = document.createElement("dialog");
  dialog.className = "screen-request-dialog";
  dialog.innerHTML = `<form method="dialog">
    <header><h2></h2><p></p></header>
    <div class="screen-request-preview"></div>
    <div class="screen-request-status" role="status"></div>
    <div class="screen-request-actions">
      <button type="button" class="quiet" data-screen-request-cancel></button>
      <button type="button" data-screen-request-send></button>
    </div>
  </form>`;
  document.body.append(dialog);
  dialog.querySelector("h2").textContent = t("screenRequest.title");
  dialog.querySelector("header p").textContent = t("screenRequest.body");
  dialog.querySelector("[data-screen-request-cancel]").textContent = t("screenRequest.cancel");
  dialog.querySelector("[data-screen-request-send]").textContent = t("screenRequest.send");

  let pendingPayload = null;
  let holdTimer = null;
  let holdStart = null;
  let suppressClickUntil = 0;

  const candidate = (target) => {
    const image = target.closest?.("img");
    if (image) return image;
    if (target.closest?.("input, textarea, select, button, nav, [data-no-screen-request]")) return null;
    return target.closest?.("[data-screen-request], figure, article, .card, .paper-sheet, .paper-artifact") || null;
  };

  const visibleText = (element) => {
    const clone = element.cloneNode(true);
    clone.querySelectorAll("button, input, textarea, select, nav, script, style").forEach((node) => node.remove());
    return String(clone.innerText || clone.textContent || "").replace(/\s+/g, " ").trim().slice(0, 4000);
  };

  const payloadFor = (element) => {
    const pcId = localStorage.getItem("settlement-pc");
    if (!pcId) throw new Error(t("screenRequest.noCharacter"));
    const marked = element.closest?.("[data-screen-request]") || element;
    const image = element.matches?.("img") ? element : marked.querySelector?.("img");
    const label = marked.dataset?.screenRequestLabel
      || image?.alt
      || marked.querySelector?.("h1, h2, h3, strong")?.textContent
      || document.title;
    const source = { route: `${location.pathname}${location.search}`, label: String(label || "").trim().slice(0, 180) };
    if (image?.currentSrc || image?.src) {
      const url = new URL(image.currentSrc || image.src, location.href);
      if (url.origin !== location.origin) throw new Error(t("screenRequest.error"));
      source.kind = "image";
      return {
        pcId,
        source,
        projection: { type: "image", url: `${url.pathname}${url.search}`, caption: source.label }
      };
    }
    const body = marked.dataset?.screenRequestText || visibleText(marked);
    if (!body) throw new Error(t("screenRequest.error"));
    source.kind = "text";
    return { pcId, source, projection: { type: "text", title: source.label, body } };
  };

  const openRequest = (element) => {
    if (dialog.open) return;
    const status = dialog.querySelector(".screen-request-status");
    const preview = dialog.querySelector(".screen-request-preview");
    try {
      pendingPayload = payloadFor(element);
      status.textContent = "";
      preview.replaceChildren();
      if (pendingPayload.projection.type === "image") {
        const image = document.createElement("img");
        image.src = pendingPayload.projection.url;
        image.alt = pendingPayload.projection.caption;
        preview.append(image);
      } else {
        const text = document.createElement("div");
        text.className = "text";
        text.textContent = pendingPayload.projection.body;
        preview.append(text);
      }
      dialog.showModal();
    } catch (error) {
      pendingPayload = null;
      showTransient(error.message || t("screenRequest.error"));
    }
  };

  const clearHold = () => {
    clearTimeout(holdTimer);
    holdTimer = null;
    holdStart = null;
  };

  document.addEventListener("contextmenu", (event) => {
    const target = candidate(event.target);
    if (!target) return;
    event.preventDefault();
    openRequest(target);
  });

  document.addEventListener("pointerdown", (event) => {
    if (event.pointerType === "mouse") return;
    const target = candidate(event.target);
    if (!target) return;
    clearHold();
    holdStart = { x: event.clientX, y: event.clientY, target };
    holdTimer = setTimeout(() => {
      suppressClickUntil = Date.now() + 700;
      navigator.vibrate?.(18);
      openRequest(target);
      clearHold();
    }, 560);
  }, { passive: true });
  document.addEventListener("pointermove", (event) => {
    if (!holdStart || Math.hypot(event.clientX - holdStart.x, event.clientY - holdStart.y) < 12) return;
    clearHold();
  }, { passive: true });
  document.addEventListener("pointerup", clearHold, { passive: true });
  document.addEventListener("pointercancel", clearHold, { passive: true });
  document.addEventListener("click", (event) => {
    if (Date.now() <= suppressClickUntil) {
      event.preventDefault();
      event.stopPropagation();
    }
  }, true);

  dialog.querySelector("[data-screen-request-cancel]").onclick = () => dialog.close();
  dialog.querySelector("[data-screen-request-send]").onclick = async () => {
    if (!pendingPayload) return;
    const send = dialog.querySelector("[data-screen-request-send]");
    const status = dialog.querySelector(".screen-request-status");
    send.disabled = true;
    status.textContent = t("screenRequest.sending");
    try {
      const response = await fetch("/api/gm-notifications/screen-requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(pendingPayload)
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || t("screenRequest.error"));
      status.textContent = t("screenRequest.sent");
      setTimeout(() => dialog.close(), 700);
    } catch (error) {
      status.textContent = error.message || t("screenRequest.error");
    } finally {
      send.disabled = false;
    }
  };
}

function showTransient(message) {
  const notice = document.createElement("div");
  notice.textContent = message;
  Object.assign(notice.style, {
    position: "fixed", left: "50%", bottom: "5rem", zIndex: 9999,
    transform: "translateX(-50%)", maxWidth: "min(88vw, 420px)", padding: ".65rem .9rem",
    color: "#f4ead8", border: "1px solid #7d6747", background: "#1c1b17", font: ".85rem Georgia, serif"
  });
  document.body.append(notice);
  setTimeout(() => notice.remove(), 2800);
}
