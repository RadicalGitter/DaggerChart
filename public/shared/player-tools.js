import { t } from "/shared/i18n.js";
import { playerFeatureEnabled } from "/shared/player-features.js";
// Re-enable the duality-dice import after the physical roller passes live UX review.

const esc = (value) => String(value ?? "").replace(/[&<>"']/g, (char) =>
  ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]));

function routePcId() {
  const parts = location.pathname.split("/").filter(Boolean);
  if (parts[0] !== "character" || !parts[1]) return null;
  try { return decodeURIComponent(parts[1]); } catch { return parts[1]; }
}

function selectedPcId() {
  return routePcId()
    || localStorage.getItem("settlement-pc")
    || localStorage.getItem("settlement-journal-pc")
    || null;
}

function install() {
  if (new URLSearchParams(location.search).get("embed") === "1" || document.querySelector(".player-tools")) return;
  const style = document.createElement("link");
  style.rel = "stylesheet";
  style.href = "/shared/player-tools.css";
  document.head.append(style);

  const root = document.createElement("div");
  root.className = `player-tools${location.pathname.startsWith("/tome") ? " player-tools-context-tome" : ""}`;
  root.hidden = true;
  root.innerHTML = `
    <button class="player-tools-trigger" type="button" aria-expanded="false" aria-controls="player-tools-drawer">
      <span aria-hidden="true">✎</span><strong>${esc(t("player.notes.open"))}</strong>
    </button>
    <aside class="player-tools-drawer" id="player-tools-drawer" role="dialog" aria-labelledby="player-tools-title" hidden>
      <header><div><span class="player-tools-kicker">${esc(t("player.notes.kicker"))}</span><h2 id="player-tools-title">${esc(t("player.notes.title"))}</h2></div><button class="player-tools-close" type="button" aria-label="${esc(t("player.notes.close"))}">×</button></header>
      <form class="player-note-form">
        <div class="player-note-scope" role="group" aria-label="${esc(t("player.notes.scope"))}">
          <button type="button" data-note-scope="personal">${esc(t("journal.scope.me"))}</button>
          <button type="button" data-note-scope="group">${esc(t("journal.scope.group"))}</button>
        </div>
        <textarea maxlength="4000" rows="5" required placeholder="${esc(t("journal.placeholder"))}"></textarea>
        <div class="player-note-actions"><span class="player-note-status" role="status"></span><button type="submit">${esc(t("journal.write"))}</button></div>
      </form>
      <section class="player-note-recent" aria-labelledby="player-note-recent-title">
        <h3 id="player-note-recent-title">${esc(t("player.notes.recent"))}</h3>
        <div class="player-note-recent-list"><p>${esc(t("player.notes.loading"))}</p></div>
      </section>
      <nav class="player-tools-links" aria-label="${esc(t("player.notes.atHand"))}">
        <a data-player-tool="character" data-player-feature="character">${esc(t("table.character"))}</a>
        <a data-player-tool="journal" data-player-feature="journal">${esc(t("journal.title"))}</a>
        <a data-player-tool="inventory" data-player-feature="inventory">${esc(t("table.inventory"))}</a>
        <a href="/rules" data-player-feature="rules">${esc(t("rules.title"))}</a>
      </nav>
    </aside>`;
  document.body.append(root);

  const trigger = root.querySelector(".player-tools-trigger");
  const drawer = root.querySelector(".player-tools-drawer");
  const close = root.querySelector(".player-tools-close");
  const form = root.querySelector(".player-note-form");
  const textarea = form.querySelector("textarea");
  const status = root.querySelector(".player-note-status");
  const recent = root.querySelector(".player-note-recent-list");
  let currentPcId = null;
  let scope = localStorage.getItem("settlement-quick-note-scope") === "group" ? "group" : "personal";
  let recentRequest = 0;

  function renderScope() {
    for (const button of root.querySelectorAll("[data-note-scope]")) {
      const selected = button.dataset.noteScope === scope;
      button.classList.toggle("selected", selected);
      button.setAttribute("aria-pressed", String(selected));
    }
  }

  function renderLinks() {
    if (!currentPcId) return;
    root.querySelector('[data-player-tool="character"]').href = `/character/${encodeURIComponent(currentPcId)}`;
    root.querySelector('[data-player-tool="journal"]').href = `/journal/?pc=${encodeURIComponent(currentPcId)}`;
    root.querySelector('[data-player-tool="inventory"]').href = "/tome?open=1&section=inventory";
    for (const link of root.querySelectorAll("[data-player-feature]")) {
      link.hidden = !playerFeatureEnabled(link.dataset.playerFeature);
    }
  }

  function renderRecent(notes) {
    const mine = (Array.isArray(notes) ? notes : [])
      .filter((note) => note.pcId === currentPcId)
      .sort((a, b) => String(b.ts || "").localeCompare(String(a.ts || "")))
      .slice(0, 3);
    recent.innerHTML = mine.length ? mine.map((note) => `
      <article><div><span>${esc(note.scope === "personal" ? t("journal.scope.me") : t("journal.scope.group"))}</span><time>${esc(note.season || "")}</time></div><p>${esc(note.text)}</p></article>`).join("")
      : `<p>${esc(t("player.notes.empty"))}</p>`;
  }

  async function loadRecent() {
    if (!currentPcId) return;
    const request = ++recentRequest;
    recent.innerHTML = `<p>${esc(t("player.notes.loading"))}</p>`;
    try {
      const response = await fetch(`/api/lore?pc=${encodeURIComponent(currentPcId)}`);
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || t("player.notes.error"));
      if (request === recentRequest && currentPcId === selectedPcId()) renderRecent(body.notes);
    } catch (error) {
      if (request === recentRequest) recent.innerHTML = `<p>${esc(error.message)}</p>`;
    }
  }

  function closeDrawer({ restoreFocus = true } = {}) {
    drawer.hidden = true;
    trigger.setAttribute("aria-expanded", "false");
    document.body.classList.remove("player-notes-open");
    if (!currentPcId || !playerFeatureEnabled("notes")) root.hidden = true;
    if (restoreFocus && !trigger.hidden) trigger.focus();
  }

  function openDrawer() {
    if (!playerFeatureEnabled("notes")) return;
    window.dispatchEvent(new CustomEvent("settlement:close-dice"));
    refresh();
    if (!currentPcId) return;
    drawer.hidden = false;
    trigger.setAttribute("aria-expanded", "true");
    document.body.classList.add("player-notes-open");
    status.textContent = "";
    loadRecent();
    requestAnimationFrame(() => textarea.focus());
  }

  function refresh() {
    const next = selectedPcId();
    const changed = next !== currentPcId;
    currentPcId = next;
    const enabled = playerFeatureEnabled("notes");
    trigger.hidden = !enabled;
    root.hidden = !currentPcId || (!enabled && drawer.hidden);
    if (!currentPcId) closeDrawer({ restoreFocus: false });
    else renderLinks();
    if (changed && !drawer.hidden) loadRecent();
  }

  trigger.onclick = () => drawer.hidden ? openDrawer() : closeDrawer();
  close.onclick = () => closeDrawer();
  for (const button of root.querySelectorAll("[data-note-scope]")) button.onclick = () => {
    scope = button.dataset.noteScope;
    localStorage.setItem("settlement-quick-note-scope", scope);
    renderScope();
  };
  form.onsubmit = async (event) => {
    event.preventDefault();
    refresh();
    const text = textarea.value.trim();
    if (!currentPcId || !text) return;
    const submit = form.querySelector('button[type="submit"]');
    submit.disabled = true;
    status.classList.remove("is-error");
    status.textContent = t("player.notes.saving");
    try {
      const response = await fetch("/api/notes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind: "journal", refId: null, scope, pcId: currentPcId, text })
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || t("player.notes.error"));
      textarea.value = "";
      status.textContent = t("player.notes.saved");
      await loadRecent();
    } catch (error) {
      status.classList.add("is-error");
      status.textContent = error.message;
    } finally {
      submit.disabled = false;
    }
  };
  textarea.addEventListener("keydown", (event) => {
    if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) form.requestSubmit();
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !drawer.hidden) closeDrawer();
  });
  window.addEventListener("storage", (event) => {
    if (["settlement-pc", "settlement-journal-pc"].includes(event.key)) refresh();
  });
  window.addEventListener("settlement:identity", refresh);
  window.addEventListener("settlement:player-features", refresh);
  window.addEventListener("settlement:open-notes", openDrawer);
  window.addEventListener("settlement:close-notes", () => closeDrawer({ restoreFocus: false }));
  renderScope();
  refresh();
}

if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", install, { once: true });
else install();
