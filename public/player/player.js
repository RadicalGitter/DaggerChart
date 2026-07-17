import { t, initI18n } from "/shared/i18n.js";
import { SHELLS, DEFAULT_SHELL, shellEntryRoute, validShell } from "/shared/shells.js";
import { setTelemetryMode } from "/shared/telemetry.js";
import { playerFeatureEnabled, setPlayerFeatureContext } from "/shared/player-features.js";
import "/shared/feedback.js";
import "/shared/player-tools.js";

const $ = (selector) => document.querySelector(selector);
const esc = (value) => String(value ?? "").replace(/[&<>"']/g, (char) =>
  ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]));

let data = null;
const currentPCId = () => localStorage.getItem("settlement-pc") || localStorage.getItem("settlement-journal-pc");
const identities = () => data?.identities || data?.party || [];
const currentPC = () => identities().find((pc) => pc.id === currentPCId()) || null;

function setPC(id) {
  localStorage.setItem("settlement-pc", id);
  localStorage.removeItem("settlement-journal-pc");
  window.dispatchEvent(new Event("settlement:identity"));
}

function clearStalePC() {
  if (!currentPCId() || currentPC()) return;
  localStorage.removeItem("settlement-pc");
  localStorage.removeItem("settlement-journal-pc");
  window.dispatchEvent(new Event("settlement:identity"));
}

function artifactHtml(id) {
  if (id === "tome") return `<span class="aged-tome-art" aria-hidden="true"><i></i><i></i></span>`;
  if (id === "book") return `<span class="folio-art" aria-hidden="true"><i class="folio-page left"></i><i class="folio-page right"></i><i class="folio-spine"></i></span>`;
  return `<span class="deck-art" aria-hidden="true"><i class="arcana-card"></i><i class="arcana-card"></i><i class="arcana-card"></i></span>`;
}

function preferredShell(pc) {
  const stored = localStorage.getItem("settlement-shell");
  if (validShell(stored)) return stored;
  return validShell(pc?.shell) ? pc.shell : DEFAULT_SHELL;
}

function renderIdentity() {
  const pc = currentPC();
  $("#identity-name").textContent = pc?.name || t("player.hub.choosepc");
  $("#identity-mark").innerHTML = pc?.portrait
    ? `<img src="${esc(pc.portrait)}" alt="">`
    : esc(pc?.name?.slice(0, 1) || "?");
  $("#identity-menu").innerHTML = [
    ...identities().map((entry) => `<button type="button" data-pc="${esc(entry.id)}">${esc(entry.name)}${entry.player ? ` · ${esc(entry.player)}` : ""}</button>`),
    ...(playerFeatureEnabled("characterCreation") ? [`<a href="/create/?return=/player">${esc(t("login.create"))}</a>`] : [])
  ].join("");
  for (const button of document.querySelectorAll("[data-pc]")) {
    button.onclick = () => {
      setPC(button.dataset.pc);
      closeIdentityMenu();
      render();
    };
  }
}

function renderViews() {
  const pc = currentPC();
  const availableShells = SHELLS.filter((shell) => !shell.feature || playerFeatureEnabled(shell.feature));
  const requested = preferredShell(pc);
  const preferred = availableShells.some((shell) => shell.id === requested) ? requested : DEFAULT_SHELL;
  $("#view-shelf").innerHTML = availableShells.map((shell) => `
    <a class="view-artifact" href="${esc(shellEntryRoute(shell.id))}" data-shell="${esc(shell.id)}">
      ${shell.id === preferred ? `<span class="preferred-mark">${esc(t("player.hub.preferred"))}</span>` : ""}
      <span class="artifact-stage">${artifactHtml(shell.id)}</span>
      <span class="artifact-copy"><strong>${esc(t(shell.name))}</strong><span class="artifact-scope">${esc(t(shell.scope))}</span></span>
    </a>`).join("");
  for (const link of document.querySelectorAll("[data-shell]")) {
    link.onclick = () => localStorage.setItem("settlement-shell", link.dataset.shell);
  }
}

function renderEssentials() {
  const pc = currentPC();
  const section = $("#essential-tools");
  section.hidden = !pc;
  if (!pc) return;
  const id = encodeURIComponent(pc.id);
  const actions = [
    playerFeatureEnabled("character") ? `<a href="/character/${id}"><span aria-hidden="true">◇</span><strong>${esc(t("table.character"))}</strong></a>` : "",
    playerFeatureEnabled("notes") ? `<button type="button" data-open-notes><span aria-hidden="true">✎</span><strong>${esc(t("player.notes.open"))}</strong></button>` : "",
    playerFeatureEnabled("journal") ? `<a href="/journal/?pc=${id}"><span aria-hidden="true">▤</span><strong>${esc(t("journal.title"))}</strong></a>` : "",
    playerFeatureEnabled("inventory") ? `<a href="/tome?open=1&amp;section=inventory"><span aria-hidden="true">▧</span><strong>${esc(t("table.inventory"))}</strong></a>` : "",
    playerFeatureEnabled("rules") ? `<a href="/rules"><span aria-hidden="true">⌘</span><strong>${esc(t("rules.title"))}</strong></a>` : ""
  ].filter(Boolean);
  $("#essential-actions").innerHTML = actions.join("");
  section.hidden = actions.length === 0;
  section.querySelector("[data-open-notes]")?.addEventListener("click", () => window.dispatchEvent(new Event("settlement:open-notes")));
}

function renderGate() {
  const pc = currentPC();
  $("#view-choice").hidden = !pc;
  $("#identity-gate").hidden = Boolean(pc);
  if (pc) return;
  $("#identity-list").innerHTML = identities().map((entry) =>
    `<button type="button" data-gate-pc="${esc(entry.id)}">${esc(entry.name)}${entry.player ? ` · ${esc(entry.player)}` : ""}</button>`
  ).join("");
  $(".create-character").hidden = !playerFeatureEnabled("characterCreation");
  for (const button of document.querySelectorAll("[data-gate-pc]")) {
    button.onclick = () => {
      setPC(button.dataset.gatePc);
      render();
    };
  }
}

function render() {
  if (!data) return;
  clearStalePC();
  data.playerFeatures = setPlayerFeatureContext(data, currentPCId());
  setTelemetryMode(currentPC() ? "views" : "choose-character");
  document.title = t("player.hub.root");
  renderIdentity();
  renderEssentials();
  renderViews();
  renderGate();
}

function closeIdentityMenu() {
  $("#identity-menu").hidden = true;
  $("#identity-button").setAttribute("aria-expanded", "false");
}

$("#identity-button").onclick = () => {
  const menu = $("#identity-menu");
  menu.hidden = !menu.hidden;
  $("#identity-button").setAttribute("aria-expanded", String(!menu.hidden));
};
document.addEventListener("pointerdown", (event) => {
  if (!event.target.closest(".identity-wrap")) closeIdentityMenu();
});
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") closeIdentityMenu();
});
window.addEventListener("storage", (event) => {
  if (["settlement-pc", "settlement-shell"].includes(event.key)) render();
});

async function loadData() {
  const [tableResponse, partyResponse] = await Promise.all([fetch("/api/table"), fetch("/api/party")]);
  if (!tableResponse.ok || !partyResponse.ok) throw new Error(t("error.table"));
  const [table, party] = await Promise.all([tableResponse.json(), partyResponse.json()]);
  return { ...table, identities: party };
}

initI18n();
loadData()
  .then((payload) => { data = payload; render(); })
  .catch((error) => { $("#view-shelf").innerHTML = `<p>${esc(error.message)}</p>`; });

const stream = new EventSource("/api/stream");
let refreshTimer = null;
stream.onmessage = () => {
  clearTimeout(refreshTimer);
  refreshTimer = setTimeout(async () => {
    try { data = await loadData(); render(); } catch { /* keep the current hub */ }
  }, 180);
};
