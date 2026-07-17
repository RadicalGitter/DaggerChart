import { t } from "/shared/i18n.js";

const esc = (value) => String(value ?? "").replace(/[&<>"']/g, (char) =>
  ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]));

const messageIcon = () => `<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a4 4 0 0 1-4 4H8l-5 3 1.7-5.1A7 7 0 0 1 3 12V8a5 5 0 0 1 5-5h8a5 5 0 0 1 5 5z"/></svg>`;

export function mountPlayerChat({ slot, getPcId }) {
  const host = typeof slot === "string" ? document.querySelector(slot) : slot;
  if (!host || host.dataset.chatMounted) return { refresh: async () => {} };
  host.dataset.chatMounted = "true";
  host.innerHTML = `<button class="player-chat-trigger" type="button">${messageIcon()}<span class="player-chat-badge" hidden></span></button>`;

  const backdrop = document.createElement("div");
  backdrop.className = "player-chat-backdrop";
  backdrop.hidden = true;
  backdrop.innerHTML = `<section class="player-chat-panel" role="dialog" aria-modal="true" aria-labelledby="player-chat-title">
    <header class="player-chat-head">
      <div><span class="player-chat-kicker">${esc(t("messages.keeper"))}</span><h2 id="player-chat-title">${esc(t("messages.title"))}</h2></div>
      <button class="player-chat-close" type="button" aria-label="${esc(t("messages.close"))}" title="${esc(t("messages.close"))}">×</button>
    </header>
    <div class="player-chat-thread" aria-live="polite"></div>
    <form class="player-chat-composer">
      <textarea maxlength="4000" rows="3" required placeholder="${esc(t("messages.placeholder"))}"></textarea>
      <div class="player-chat-compose-row"><span class="player-chat-status" role="status"></span><button type="submit">${esc(t("messages.send"))}</button></div>
    </form>
  </section>`;
  document.body.append(backdrop);

  const trigger = host.querySelector(".player-chat-trigger");
  const badge = host.querySelector(".player-chat-badge");
  const threadRoot = backdrop.querySelector(".player-chat-thread");
  const form = backdrop.querySelector("form");
  const textarea = backdrop.querySelector("textarea");
  const status = backdrop.querySelector(".player-chat-status");
  let thread = null;
  let currentPcId = null;
  let open = false;
  let busy = false;
  let lastFocus = null;
  let markReadPromise = null;

  async function api(path, options = {}) {
    const response = await fetch(path, {
      headers: { "Content-Type": "application/json" },
      ...options,
      body: options.body ? JSON.stringify(options.body) : undefined
    });
    const result = await response.json();
    if (!response.ok) throw new Error(response.status >= 500 ? t("messages.error") : (result.error || t("messages.error")));
    return result;
  }

  const unreadCount = () => (thread?.messages || []).filter((message) => message.read?.player !== true).length;

  function renderTrigger() {
    const unread = unreadCount();
    host.hidden = !thread?.pc;
    badge.hidden = unread === 0;
    badge.textContent = unread > 9 ? "9+" : String(unread);
    const label = unread
      ? t(unread === 1 ? "messages.openUnreadOne" : "messages.openUnread", { n: unread })
      : t("messages.open");
    trigger.setAttribute("aria-label", label);
    trigger.setAttribute("title", label);
  }

  function messageHtml(message) {
    const sender = message.from === "gm" ? t("messages.keeper") : t("messages.you");
    const time = message.ts ? new Date(message.ts).toLocaleString([], { dateStyle: "medium", timeStyle: "short" }) : "";
    return `<article class="player-chat-message is-${message.from}"><header><strong>${esc(sender)}</strong><time>${esc(time)}</time></header><p>${esc(message.text)}</p></article>`;
  }

  function renderThread() {
    const messages = thread?.messages || [];
    threadRoot.innerHTML = messages.length
      ? messages.map(messageHtml).join("")
      : `<p class="player-chat-empty">${esc(t("messages.empty"))}</p>`;
    if (open) requestAnimationFrame(() => { threadRoot.scrollTop = threadRoot.scrollHeight; });
    renderTrigger();
  }

  async function markRead() {
    if (!currentPcId || !unreadCount()) return;
    if (markReadPromise) return markReadPromise;
    const readPcId = currentPcId;
    const readThread = thread;
    markReadPromise = (async () => {
      await api("/api/messages/read", { method: "PUT", body: { pcId: readPcId, side: "player" } });
      if (thread !== readThread || currentPcId !== readPcId) return;
      readThread.messages = readThread.messages.map((message) => ({ ...message, read: { ...message.read, player: true } }));
      renderThread();
    })();
    try {
      await markReadPromise;
    } finally {
      markReadPromise = null;
    }
  }

  async function refresh() {
    const pcId = getPcId?.() || null;
    if (!pcId) {
      currentPcId = null;
      thread = null;
      closePanel();
      renderTrigger();
      return;
    }
    if (currentPcId && currentPcId !== pcId) closePanel();
    currentPcId = pcId;
    const response = await fetch(`/api/messages?pc=${encodeURIComponent(pcId)}`);
    if (!response.ok) {
      currentPcId = null;
      thread = null;
      closePanel();
      renderTrigger();
      return;
    }
    thread = await response.json();
    renderThread();
    if (open) await markRead();
  }

  async function openPanel() {
    lastFocus = document.activeElement;
    open = true;
    backdrop.hidden = false;
    document.body.classList.add("player-chat-open");
    renderThread();
    try { await markRead(); } catch (error) { status.textContent = error.message; }
    textarea.focus();
  }

  function closePanel() {
    if (!open) return;
    open = false;
    backdrop.hidden = true;
    document.body.classList.remove("player-chat-open");
    status.textContent = "";
    lastFocus?.focus?.();
  }

  async function send() {
    if (busy || !currentPcId) return;
    const text = textarea.value.trim();
    if (!text) return;
    busy = true;
    textarea.disabled = true;
    form.querySelector("button[type=submit]").disabled = true;
    status.textContent = t("messages.sending");
    try {
      await api("/api/messages", { method: "POST", body: { pcId: currentPcId, from: "player", text } });
      textarea.value = "";
      status.textContent = "";
      await refresh();
    } catch (error) {
      status.textContent = error.message || t("messages.error");
    } finally {
      busy = false;
      textarea.disabled = false;
      form.querySelector("button[type=submit]").disabled = false;
      textarea.focus();
    }
  }

  trigger.addEventListener("click", openPanel);
  backdrop.querySelector(".player-chat-close").addEventListener("click", closePanel);
  backdrop.addEventListener("pointerdown", (event) => { if (event.target === backdrop) closePanel(); });
  form.addEventListener("submit", (event) => { event.preventDefault(); void send(); });
  textarea.addEventListener("keydown", (event) => {
    if (event.key === "Enter" && event.ctrlKey) { event.preventDefault(); void send(); }
  });
  document.addEventListener("keydown", (event) => { if (event.key === "Escape" && open) closePanel(); });

  renderTrigger();
  return { refresh };
}
