import { t } from "/shared/i18n.js";
import { playerFeatureEnabled } from "/shared/player-features.js";
import {
  clampPartyCardValue,
  normalizePartyCardLayout,
  partyCardHeight,
  partyCardPosition,
  partyCardWidthBounds
} from "/shared/party-card-layout.js";

const LAYOUT_KEY = "settlement-party-card-layouts";
const OPEN_KEY = "settlement-party-cards-open";
const esc = (value) => String(value ?? "").replace(/[&<>"']/g, (char) =>
  ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]));
const selectedPcId = () => localStorage.getItem("settlement-pc") || localStorage.getItem("settlement-journal-pc") || null;

function loadLayouts() {
  try {
    const value = JSON.parse(localStorage.getItem(LAYOUT_KEY) || "{}");
    return value && typeof value === "object" && !Array.isArray(value) ? value : {};
  } catch {
    return {};
  }
}

function install() {
  if (new URLSearchParams(location.search).get("embed") === "1" || document.querySelector(".party-cards-root")) return;
  const style = document.createElement("link");
  style.rel = "stylesheet";
  style.href = "/shared/party-cards.css";
  document.head.append(style);

  const root = document.createElement("div");
  root.className = `party-cards-root${location.pathname.startsWith("/tome") ? " party-cards-context-tome" : ""}`;
  root.hidden = true;
  root.innerHTML = `
    <button class="party-cards-trigger" type="button" aria-expanded="false" data-i18n-aria="partyCards.open" aria-label="${esc(t("partyCards.open"))}">
      <span aria-hidden="true">♙♙</span><strong data-i18n="partyCards.short">Party</strong>
    </button>
    <div class="party-cards-overlay" aria-live="polite" hidden></div>
    <div class="party-cards-status" role="status" hidden></div>`;
  document.body.append(root);

  const trigger = root.querySelector(".party-cards-trigger");
  const overlay = root.querySelector(".party-cards-overlay");
  const status = root.querySelector(".party-cards-status");
  const layouts = loadLayouts();
  let peers = [];
  let viewerId = null;
  let open = localStorage.getItem(OPEN_KEY) === "true";
  let loading = false;
  let drag = null;
  let topZ = 1;
  let statusTimer = null;
  let streamTimer = null;

  function layoutKey(peerId) {
    return `${viewerId || "none"}:${peerId}`;
  }

  function showStatus(key) {
    clearTimeout(statusTimer);
    status.textContent = t(key);
    status.hidden = false;
    statusTimer = setTimeout(() => { status.hidden = true; }, 2600);
  }

  function saveLayout(card) {
    const width = card.getBoundingClientRect().width;
    layouts[layoutKey(card.dataset.peer)] = normalizePartyCardLayout({
      left: parseFloat(card.style.left),
      top: parseFloat(card.style.top),
      width,
      viewportWidth: innerWidth,
      viewportHeight: innerHeight
    });
    localStorage.setItem(LAYOUT_KEY, JSON.stringify(layouts));
  }

  function placeCard(card, index) {
    const saved = layouts[layoutKey(card.dataset.peer)];
    const position = partyCardPosition({ saved, index, viewportWidth: innerWidth, viewportHeight: innerHeight });
    card.style.setProperty("--party-card-width", `${position.width}px`);
    card.style.left = `${position.left}px`;
    card.style.top = `${position.top}px`;
  }

  function renderCards() {
    overlay.innerHTML = peers.map((peer, index) => `
      <article class="party-floating-card" data-peer="${esc(peer.id)}" aria-label="${esc(peer.name)}" style="--party-primary:${esc(peer.appearance?.primaryColor || "#8b7653")};--party-secondary:${esc(peer.appearance?.secondaryColor || "#9fcdb7")};--party-drift:${6 + index % 4}s">
        <div class="party-card-float"><div class="party-card-surface">
          <div class="party-portrait-frame ${peer.portrait ? "" : "no-image"}">
            ${peer.portrait ? `<img src="${esc(peer.portrait)}" alt="">` : ""}
            <span class="party-portrait-fallback" aria-hidden="true">${esc(peer.name?.slice(0, 1) || "?")}</span>
          </div>
          <strong class="party-name-banner">${esc(peer.name)}</strong>
          <button class="party-card-resize" type="button" data-i18n-aria="partyCards.resize" data-i18n-title="partyCards.resize" aria-label="${esc(t("partyCards.resize"))}" title="${esc(t("partyCards.resize"))}">↘</button>
        </div></div>
      </article>`).join("");

    const cards = [...overlay.querySelectorAll(".party-floating-card")];
    cards.forEach(placeCard);
    for (const card of cards) {
      const surface = card.querySelector(".party-card-surface");
      const resize = card.querySelector(".party-card-resize");
      const image = card.querySelector("img");
      if (image) image.onerror = () => image.closest(".party-portrait-frame").classList.add("no-image");
      surface.onpointerdown = (event) => {
        if (event.button !== 0 || event.target.closest(".party-card-resize")) return;
        startDrag(event, card, "move");
      };
      resize.onpointerdown = (event) => {
        if (event.button !== 0) return;
        startDrag(event, card, "resize");
      };
      surface.onpointermove = (event) => {
        if (drag) return;
        const rect = surface.getBoundingClientRect();
        const x = (event.clientX - rect.left) / rect.width - .5;
        const y = (event.clientY - rect.top) / rect.height - .5;
        surface.style.setProperty("--party-tilt-x", `${(-y * 7).toFixed(2)}deg`);
        surface.style.setProperty("--party-tilt-y", `${(x * 9).toFixed(2)}deg`);
      };
      surface.onpointerleave = () => {
        if (drag) return;
        surface.style.removeProperty("--party-tilt-x");
        surface.style.removeProperty("--party-tilt-y");
      };
    }
  }

  function startDrag(event, card, mode) {
    const rect = card.getBoundingClientRect();
    drag = { card, mode, pointerId: event.pointerId, startX: event.clientX, startY: event.clientY, left: rect.left, top: rect.top, width: rect.width };
    card.style.zIndex = String(++topZ);
    card.classList.add(mode === "resize" ? "resizing" : "dragging");
    card.setPointerCapture(event.pointerId);
    event.preventDefault();
  }

  function moveDrag(event) {
    if (!drag || drag.pointerId !== event.pointerId) return;
    const dx = event.clientX - drag.startX;
    const dy = event.clientY - drag.startY;
    if (drag.mode === "resize") {
      const bounds = partyCardWidthBounds(innerWidth);
      const width = clampPartyCardValue(drag.width + Math.max(dx, dy * .75), bounds.min, bounds.max);
      drag.card.style.setProperty("--party-card-width", `${width}px`);
      const maxX = Math.max(0, innerWidth - width);
      const maxY = Math.max(0, innerHeight - partyCardHeight(width));
      drag.card.style.left = `${clampPartyCardValue(drag.left, 0, maxX)}px`;
      drag.card.style.top = `${clampPartyCardValue(drag.top, 0, maxY)}px`;
    } else {
      const rect = drag.card.getBoundingClientRect();
      drag.card.style.left = `${clampPartyCardValue(drag.left + dx, 0, Math.max(0, innerWidth - rect.width))}px`;
      drag.card.style.top = `${clampPartyCardValue(drag.top + dy, 0, Math.max(0, innerHeight - rect.height))}px`;
    }
    event.preventDefault();
  }

  function endDrag(event) {
    if (!drag || drag.pointerId !== event.pointerId) return;
    const { card } = drag;
    card.classList.remove("dragging", "resizing");
    card.releasePointerCapture?.(event.pointerId);
    drag = null;
    saveLayout(card);
  }

  async function loadPeers() {
    if (loading) return;
    viewerId = selectedPcId();
    if (!viewerId) return refresh();
    loading = true;
    try {
      const response = await fetch("/api/party");
      const party = await response.json();
      if (!response.ok || !Array.isArray(party)) throw new Error("party");
      const viewer = party.find((entry) => entry.id === viewerId);
      peers = viewer ? party.filter((entry) => entry.id !== viewerId && entry.campaignId === viewer.campaignId) : [];
      if (!peers.length) showStatus("partyCards.empty");
      renderCards();
    } catch {
      peers = [];
      renderCards();
      showStatus("partyCards.error");
    } finally {
      loading = false;
    }
  }

  function setOpen(next) {
    open = Boolean(next && selectedPcId() && playerFeatureEnabled("partyCards"));
    localStorage.setItem(OPEN_KEY, String(open));
    overlay.hidden = !open;
    trigger.setAttribute("aria-expanded", String(open));
    trigger.setAttribute("aria-label", t(open ? "partyCards.close" : "partyCards.open"));
    if (open) {
      window.dispatchEvent(new CustomEvent("settlement:close-notes"));
      window.dispatchEvent(new CustomEvent("settlement:close-dice"));
      window.dispatchEvent(new CustomEvent("settlement:close-shadow"));
      void loadPeers();
    }
  }

  function refresh() {
    const nextViewer = selectedPcId();
    const changed = nextViewer !== viewerId;
    viewerId = nextViewer;
    const enabled = playerFeatureEnabled("partyCards");
    root.hidden = !viewerId || !enabled;
    trigger.hidden = !enabled;
    if (!viewerId || !enabled) setOpen(false);
    else if (changed && open) void loadPeers();
  }

  trigger.onclick = () => setOpen(!open);
  document.addEventListener("pointermove", moveDrag, { passive: false });
  document.addEventListener("pointerup", endDrag);
  document.addEventListener("pointercancel", endDrag);
  window.addEventListener("resize", () => {
    for (const [index, card] of [...overlay.querySelectorAll(".party-floating-card")].entries()) {
      placeCard(card, index);
      saveLayout(card);
    }
  });
  window.addEventListener("storage", (event) => {
    if (["settlement-pc", "settlement-journal-pc"].includes(event.key)) refresh();
  });
  window.addEventListener("settlement:identity", refresh);
  window.addEventListener("settlement:player-features", refresh);
  window.addEventListener("settlement:close-party", () => setOpen(false));

  const stream = new EventSource("/api/stream");
  stream.onmessage = () => {
    if (!open) return;
    clearTimeout(streamTimer);
    streamTimer = setTimeout(loadPeers, 220);
  };

  refresh();
  if (open) setOpen(true);
}

if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", install, { once: true });
else install();
