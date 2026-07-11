import { t, initI18n, seasonLabel } from "/shared/i18n.js";

const $ = (selector) => document.querySelector(selector);
const esc = (value) => String(value ?? "").replace(/[&<>"']/g, (char) =>
  ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]));

let data = null;
const currentPC = () => localStorage.getItem("settlement-pc") || localStorage.getItem("settlement-journal-pc");

function portraitHtml(person) {
  return `<span class="player-portrait">${person.portrait
    ? `<img src="${esc(person.portrait)}" alt="">`
    : esc(person.name?.slice(0, 1) || "?")}</span>`;
}

function realPlayerCard(pc) {
  const current = pc.id === currentPC();
  return `<a class="player-card${current ? " current" : ""}" href="/table" data-pc="${esc(pc.id)}">
    ${portraitHtml(pc)}<span class="player-shade"></span>
    ${current ? `<span class="player-tag">${t("login.current")}</span>` : ""}
    <span class="player-copy"><strong>${esc(pc.name)}</strong><span>${esc(pc.player || t("login.players"))}</span></span>
  </a>`;
}

function placeholderCard(person) {
  return `<a class="player-card placeholder-card" href="/create/?return=/table">
    ${portraitHtml(person)}<span class="player-shade"></span>
    <span class="player-tag">${t("login.placeholder")}</span>
    <span class="player-copy"><strong>${esc(person.name)}</strong><span>${t("login.create")}</span></span>
  </a>`;
}

function createCard() {
  return `<a class="player-card create-card" href="/create/?return=/table">
    <span class="player-copy"><span class="create-mark" aria-hidden="true">+</span>
      <strong>${t("login.create")}</strong><span>${t("login.create.sub")}</span>
    </span>
  </a>`;
}

function render() {
  if (!data) return;
  document.title = `${t("login.subtitle")} — ${data.settlement.name}`;
  $("#settlement-name").textContent = data.settlement.name;
  $("#settlement-season").textContent = seasonLabel(data.settlement.seasonLabel);

  const realPlayers = data.party || [];
  const standIns = realPlayers.length
    ? []
    : (data.characters || []).filter((person) => person.status === "alive");
  $("#player-grid").innerHTML = [
    ...realPlayers.map(realPlayerCard),
    ...standIns.map(placeholderCard),
    createCard()
  ].join("");

  for (const card of document.querySelectorAll("[data-pc]")) {
    card.addEventListener("click", () => {
      localStorage.setItem("settlement-pc", card.dataset.pc);
      localStorage.removeItem("settlement-journal-pc");
    });
  }
}

async function refresh() {
  const response = await fetch("/api/table");
  if (!response.ok) throw new Error("The table ledger could not be opened.");
  data = await response.json();
  render();
}

window.addEventListener("storage", (event) => {
  if (event.key === "settlement-pc") render();
});

initI18n();
refresh().catch((error) => {
  $("#player-grid").innerHTML = `<p class="trust-note">${esc(error.message)}</p>`;
});

const stream = new EventSource("/api/stream");
let refreshTimer = null;
stream.onmessage = () => {
  clearTimeout(refreshTimer);
  refreshTimer = setTimeout(() => refresh().catch(() => {}), 180);
};
