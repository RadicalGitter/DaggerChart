import { lang } from "/shared/i18n.js";

const phrase = (en, sv) => lang === "sv" ? sv : en;
const esc = (value) => String(value ?? "").replace(/[&<>"']/g, (char) =>
  ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]));

function selectedPcId() {
  const parts = location.pathname.split("/").filter(Boolean);
  if (parts[0] === "character" && parts[1]) {
    try { return decodeURIComponent(parts[1]); } catch { return parts[1]; }
  }
  return localStorage.getItem("settlement-pc") || localStorage.getItem("settlement-journal-pc") || null;
}

function duration(ms) {
  const minutes = Math.floor(Math.max(0, ms) / 60000);
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  return hours ? `${hours}h ${String(remainder).padStart(2, "0")}m` : `${remainder}m`;
}

function install() {
  if (new URLSearchParams(location.search).get("embed") === "1" || document.querySelector(".shadow-balance")) return;
  const style = document.createElement("link");
  style.rel = "stylesheet";
  style.href = "/shared/shadow-balance.css";
  document.head.append(style);

  const root = document.createElement("div");
  root.className = `shadow-balance${location.pathname.startsWith("/tome") ? " shadow-context-tome" : ""}`;
  root.hidden = true;
  root.innerHTML = `
    <button class="shadow-trigger" type="button" aria-expanded="false" aria-controls="shadow-panel" title="${esc(phrase("Balance of light and shadow", "Balansen mellan ljus och skugga"))}">
      <span aria-hidden="true">◐</span><strong>${esc(phrase("Balance", "Balans"))}</strong>
    </button>
    <aside class="shadow-panel" id="shadow-panel" role="dialog" aria-labelledby="shadow-title" hidden>
      <header><div><span>${esc(phrase("Seen by Erik alone", "Synlig endast för Erik"))}</span><h2 id="shadow-title">${esc(phrase("The heart's balance", "Hjärtats balans"))}</h2></div><button class="shadow-close" type="button" aria-label="${esc(phrase("Close", "Stäng"))}">×</button></header>
      <div class="shadow-heart" aria-hidden="true"><i></i></div>
      <div class="shadow-position" role="group" aria-label="${esc(phrase("Current balance", "Nuvarande balans"))}">
        <button type="button" data-shadow-position="light">${esc(phrase("In Light", "I ljus"))}</button>
        <button type="button" data-shadow-position="neutral">${esc(phrase("Neutral", "Neutral"))}</button>
        <button type="button" data-shadow-position="shadow">${esc(phrase("In Shadow", "I skugga"))}</button>
      </div>
      <section class="shadow-reading"></section>
      <button class="shadow-invoke" type="button">${esc(phrase("Invoke the shadow", "Åkalla skuggan"))}</button>
      <div class="shadow-time"></div>
      <p class="shadow-status" role="status"></p>
    </aside>`;
  document.body.append(root);

  const trigger = root.querySelector(".shadow-trigger");
  const panel = root.querySelector(".shadow-panel");
  const status = root.querySelector(".shadow-status");
  let pcId = null;
  let state = null;
  let loadedAt = Date.now();
  let requestVersion = 0;

  function projectedTotals() {
    const totals = { ...(state?.totalsMs || {}) };
    if (state?.liveSession?.status === "running" && state.liveSession.participating) {
      totals[state.position] = (totals[state.position] || 0) + Math.max(0, Date.now() - loadedAt);
    }
    return totals;
  }

  function reading() {
    if (state.position === "shadow") return phrase(
      "Shadowward acts gain +1; lightward acts take -1. Invoking the shadow costs 0 Hope and always gives the GM 1 Fear.",
      "Skuggriktade handlingar får +1; ljusriktade handlingar får -1. Att åkalla skuggan kostar 0 Hopp och ger alltid SL 1 Fruktan."
    );
    if (state.position === "light") return phrase(
      "Lightward acts gain +1; shadowward acts take -1. The shadow cannot be invoked from here.",
      "Ljusriktade handlingar får +1; skuggriktade handlingar får -1. Skuggan kan inte åkallas härifrån."
    );
    return phrase("No bonus and no penalty. Erik stands between the two pulls.", "Ingen bonus och inget avdrag. Erik står mellan de två krafterna.");
  }

  function render() {
    if (!state) return;
    root.dataset.position = state.position;
    if (location.pathname.startsWith("/character/")) document.body.dataset.shadowPosition = state.position;
    for (const button of root.querySelectorAll("[data-shadow-position]")) {
      const selected = button.dataset.shadowPosition === state.position;
      button.classList.toggle("selected", selected);
      button.setAttribute("aria-pressed", String(selected));
    }
    root.querySelector(".shadow-reading").textContent = reading();
    const active = state.liveSession?.status === "running" && state.liveSession.participating;
    const paused = state.liveSession?.status === "paused" && state.liveSession.participating;
    root.querySelector(".shadow-invoke").disabled = state.position !== "shadow" || !active;
    root.querySelector(".shadow-invoke").innerHTML = state.position === "shadow"
      ? `${esc(phrase("Invoke the shadow", "Åkalla skuggan"))}<small>+1 · 0 Hope · +1 Fear</small>`
      : esc(phrase("The shadow is out of reach", "Skuggan är utom räckhåll"));
    const totals = projectedTotals();
    root.querySelector(".shadow-time").innerHTML = `
      <strong>${active ? esc(phrase("In active play · time is counting", "I aktivt spel · tiden räknas")) : paused ? esc(phrase("Session paused · time is still", "Sessionen är pausad · tiden står still")) : esc(phrase("Outside active play · time is not counted", "Utanför aktivt spel · tiden räknas inte"))}</strong>
      <div><span>${esc(phrase("Light", "Ljus"))}<b>${duration(totals.light || 0)}</b></span><span>${esc(phrase("Neutral", "Neutral"))}<b>${duration(totals.neutral || 0)}</b></span><span>${esc(phrase("Shadow", "Skugga"))}<b>${duration(totals.shadow || 0)}</b></span></div>`;
  }

  function closePanel() {
    panel.hidden = true;
    trigger.setAttribute("aria-expanded", "false");
  }

  function openPanel() {
    window.dispatchEvent(new CustomEvent("settlement:close-notes"));
    window.dispatchEvent(new CustomEvent("settlement:close-party"));
    panel.hidden = false;
    trigger.setAttribute("aria-expanded", "true");
    status.textContent = "";
    render();
  }

  async function load() {
    const nextPcId = selectedPcId();
    const version = ++requestVersion;
    pcId = nextPcId;
    if (!pcId) {
      state = null;
      root.hidden = true;
      closePanel();
      return;
    }
    try {
      const response = await fetch(`/api/party/${encodeURIComponent(pcId)}/shadow`);
      const body = await response.json().catch(() => ({}));
      if (version !== requestVersion || pcId !== nextPcId) return;
      if (!response.ok) throw new Error(body.error || "unavailable");
      state = body;
      loadedAt = Date.now();
      root.hidden = false;
      render();
    } catch {
      if (version !== requestVersion) return;
      state = null;
      root.hidden = true;
      closePanel();
      if (location.pathname.startsWith("/character/")) delete document.body.dataset.shadowPosition;
    }
  }

  async function setPosition(next) {
    status.textContent = phrase("Moving the balance…", "Flyttar balansen…");
    try {
      const response = await fetch(`/api/party/${encodeURIComponent(pcId)}/shadow`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ position: next })
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || phrase("The balance did not move.", "Balansen rörde sig inte."));
      state = body;
      loadedAt = Date.now();
      status.textContent = phrase("The heart settles into its new weight.", "Hjärtat sjunker in i sin nya tyngd.");
      render();
    } catch (error) { status.textContent = error.message; }
  }

  async function invokeShadow() {
    const button = root.querySelector(".shadow-invoke");
    button.disabled = true;
    status.textContent = phrase("The shadow answers…", "Skuggan svarar…");
    try {
      const response = await fetch(`/api/party/${encodeURIComponent(pcId)}/shadow/invoke`, { method: "POST" });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || phrase("The shadow did not answer.", "Skuggan svarade inte."));
      state = body.shadow;
      loadedAt = Date.now();
      status.textContent = phrase("Take +1. No Hope was spent; the GM gained 1 Fear.", "Ta +1. Inget Hopp spenderades; SL fick 1 Fruktan.");
      render();
    } catch (error) {
      status.textContent = error.message;
      render();
    }
  }

  trigger.onclick = () => panel.hidden ? openPanel() : closePanel();
  root.querySelector(".shadow-close").onclick = closePanel;
  for (const button of root.querySelectorAll("[data-shadow-position]")) button.onclick = () => setPosition(button.dataset.shadowPosition);
  root.querySelector(".shadow-invoke").onclick = invokeShadow;
  window.addEventListener("settlement:close-shadow", closePanel);
  window.addEventListener("settlement:identity", load);
  window.addEventListener("storage", (event) => { if (["settlement-pc", "settlement-journal-pc"].includes(event.key)) load(); });
  setInterval(() => { if (!panel.hidden && state) render(); }, 1000);
  setInterval(load, 15000);
  load();
}

if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", install, { once: true });
else install();
