import { TERMS } from "/shared/i18n.js";
import { prepareRuleNodes, searchRuleNodes } from "/shared/rules-search.js";

const root = document.querySelector("#gm-tools-root");

if (root) {
  const esc = (value) => String(value ?? "").replace(/[&<>"']/g, (char) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]));
  const bounded = (value, min, max, fallback = 0) =>
    Number.isFinite(value) ? Math.max(min, Math.min(max, value)) : fallback;
  const icon = (name) => {
    const paths = {
      minus: `<path d="M5 12h14"/>`,
      plus: `<path d="M12 5v14M5 12h14"/>`,
      eye: `<path d="M2.8 12s3.4-5.2 9.2-5.2 9.2 5.2 9.2 5.2-3.4 5.2-9.2 5.2S2.8 12 2.8 12z"/><circle cx="12" cy="12" r="2.3"/>`,
      message: `<path d="M21 15a4 4 0 0 1-4 4H8l-5 3 1.7-5.1A7 7 0 0 1 3 12V8a5 5 0 0 1 5-5h8a5 5 0 0 1 5 5z"/>`,
      book: `<path d="M4 4.5A2.5 2.5 0 0 1 6.5 2H11a3 3 0 0 1 3 3v16a3 3 0 0 0-3-3H6.5A2.5 2.5 0 0 0 4 20.5z"/><path d="M20 4.5A2.5 2.5 0 0 0 17.5 2H14v19a3 3 0 0 1 3-3h.5a2.5 2.5 0 0 1 2.5 2.5z"/>`,
      grid: `<rect x="4" y="4" width="6" height="6"/><rect x="14" y="4" width="6" height="6"/><rect x="4" y="14" width="6" height="6"/><rect x="14" y="14" width="6" height="6"/>`,
      close: `<path d="M5 5l14 14M19 5L5 19"/>`
    };
    return `<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">${paths[name] || ""}</svg>`;
  };

  root.innerHTML = `
    <div class="gm-tools-bar" aria-label="GM quick tools">
      <span class="gm-tools-handle" aria-hidden="true"></span>
      <div class="gm-tools-fear" role="group" aria-label="Fear pool">
        <button type="button" id="gm-tool-fear-down" aria-label="Spend one Fear" title="Spend one Fear">${icon("minus")}</button>
        <div class="gm-tools-fear-readout"><span>Fear</span><output id="gm-tool-fear-count">0 / 12</output></div>
        <button type="button" id="gm-tool-fear-up" aria-label="Gain one Fear" title="Gain one Fear">${icon("plus")}</button>
        <button type="button" class="gm-tools-visibility" id="gm-tool-fear-visibility" aria-label="Hide Fear from players" title="Fear is visible to players" aria-pressed="true">${icon("eye")}</button>
      </div>
      <span class="gm-tools-divider" aria-hidden="true"></span>
      <button type="button" class="gm-tools-messages-open" id="gm-tools-messages-open" aria-label="Open private messages" title="Open private messages">${icon("message")}<span class="gm-tools-message-badge" id="gm-tools-message-badge" hidden></span></button>
      <button type="button" class="gm-tools-rules-open" id="gm-tools-rules-open" aria-label="Search rules" title="Search rules">${icon("book")}</button>
      <button type="button" class="gm-tools-overlay-open" id="gm-tools-overlay-open">${icon("grid")}<span>Quick table</span></button>
      <span class="gm-tools-notice" id="gm-tools-notice" role="status" hidden></span>
    </div>
    <section class="gm-tools-messages" id="gm-tools-messages" role="dialog" aria-modal="true" aria-labelledby="gm-tools-messages-title" hidden>
      <div class="gm-tools-messages-panel">
        <header class="gm-tools-messages-head">
          <div><span class="gm-tools-kicker">Private correspondence</span><h1 id="gm-tools-messages-title">Messages at the table</h1></div>
          <button type="button" id="gm-tools-messages-close" aria-label="Close private messages" title="Close private messages">${icon("close")}</button>
        </header>
        <div class="gm-tools-messages-body">
          <nav class="gm-tools-thread-list" id="gm-tools-thread-list" aria-label="Character threads"></nav>
          <section class="gm-tools-conversation" aria-labelledby="gm-tools-conversation-title">
            <header class="gm-tools-conversation-head"><div><h2 id="gm-tools-conversation-title">Choose a character</h2><p id="gm-tools-conversation-meta"></p></div></header>
            <div class="gm-tools-message-list" id="gm-tools-message-list" aria-live="polite"></div>
            <form class="gm-tools-message-form" id="gm-tools-message-form">
              <textarea id="gm-tools-message-copy" maxlength="4000" rows="3" required placeholder="Write a private message…"></textarea>
              <div><span id="gm-tools-message-status" role="status"></span><button type="submit">Send</button></div>
            </form>
          </section>
        </div>
      </div>
    </section>
    <section class="gm-tools-overlay" id="gm-tools-overlay" role="dialog" aria-modal="true" aria-labelledby="gm-tools-overlay-title" hidden>
      <header class="gm-tools-overlay-head">
        <div><span class="gm-tools-kicker">At the Keeper's hand</span><h1 id="gm-tools-overlay-title">Session quick table</h1></div>
        <div class="gm-tools-overlay-actions">
          <a href="/board/?board=hud">Arrange overlay</a>
          <button type="button" id="gm-tools-overlay-close" aria-label="Close quick table" title="Close quick table">${icon("close")}</button>
        </div>
      </header>
      <div class="gm-tools-overlay-body">
        <div class="gm-tools-overlay-column">
          <section class="gm-tools-section" aria-labelledby="gm-tools-party-title">
            <div class="gm-tools-section-head"><h2 id="gm-tools-party-title">Party at a glance</h2><span id="gm-tools-party-count"></span></div>
            <div class="gm-tools-party" id="gm-tools-party"></div>
          </section>
          <section class="gm-tools-section" aria-labelledby="gm-tools-hud-title">
            <div class="gm-tools-section-head"><h2 id="gm-tools-hud-title">Pinned HUD</h2><a href="/board/?board=hud">Edit board</a></div>
            <div class="gm-tools-hud" id="gm-tools-hud"></div>
          </section>
        </div>
        <section class="gm-tools-section gm-tools-reference" aria-labelledby="gm-tools-reference-title">
          <div class="gm-tools-section-head"><h2 id="gm-tools-reference-title">Rules at hand</h2><a id="gm-tools-rule-open" href="/rules/" target="_blank" rel="noreferrer">Open full reference</a></div>
          <div class="gm-tools-rule-search">
            <label for="gm-tools-rule-query">Search the rules</label>
            <input id="gm-tools-rule-query" type="search" autocomplete="off" spellcheck="false" placeholder="Attack, rest, Hope…">
          </div>
          <div class="gm-tools-rule-workbench" id="gm-tools-rule-workbench" hidden>
            <nav class="gm-tools-rule-results" id="gm-tools-rule-results" aria-label="Matching rules"></nav>
            <article class="gm-tools-rule-preview" id="gm-tools-rule-preview" aria-live="polite"></article>
          </div>
          <div class="gm-tools-flat-reference" id="gm-tools-flat-reference">
            <div class="gm-tools-reference-meta"><span>Quick tables</span><span class="gm-tools-reference-source" id="gm-tools-reference-source"></span></div>
            <div class="gm-tools-reference-grid" id="gm-tools-reference-grid"></div>
          </div>
        </section>
      </div>
    </section>`;

  const $ = (selector) => root.querySelector(selector);
  let state = null;
  let screen = { sections: [] };
  let hud = { items: [], pins: [] };
  let messageData = { totalUnread: 0, threads: [] };
  let reference = null;
  let rulesCorpus = null;
  let ruleNodes = [];
  let selectedRuleId = null;
  let fearBusy = false;
  let overlayOpen = false;
  let messagesOpen = false;
  let selectedMessagePcId = null;
  let messageBusy = false;
  let lastFocus = null;
  let messagesLastFocus = null;
  let noticeTimer = null;

  async function api(path, options = {}) {
    const response = await fetch(path, {
      headers: { "Content-Type": "application/json" },
      ...options,
      body: options.body ? JSON.stringify(options.body) : undefined
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || "The quick tools could not be updated.");
    return result;
  }

  function showNotice(message) {
    const notice = $("#gm-tools-notice");
    notice.textContent = message;
    notice.hidden = false;
    clearTimeout(noticeTimer);
    noticeTimer = setTimeout(() => { notice.hidden = true; }, 3200);
  }

  function renderFear() {
    const session = state?.session || { fear: 0, showFearToPlayers: true };
    const fear = bounded(session.fear, 0, 12);
    $("#gm-tool-fear-count").textContent = `${fear} / 12`;
    $("#gm-tool-fear-down").disabled = fearBusy || fear === 0;
    $("#gm-tool-fear-up").disabled = fearBusy || fear === 12;
    const visibility = $("#gm-tool-fear-visibility");
    const visible = session.showFearToPlayers !== false;
    visibility.disabled = fearBusy;
    visibility.setAttribute("aria-pressed", String(visible));
    visibility.setAttribute("aria-label", visible ? "Hide Fear from players" : "Show Fear to players");
    visibility.setAttribute("title", visible ? "Fear is visible to players" : "Fear is hidden from players");
    visibility.classList.toggle("is-hidden", !visible);
  }

  async function updateFear(patch) {
    if (fearBusy || !state?.session) return;
    const previous = { ...state.session };
    state.session = { ...state.session, ...patch };
    fearBusy = true;
    renderFear();
    try {
      state.session = await api("/api/session", { method: "PUT", body: patch });
    } catch (error) {
      state.session = previous;
      showNotice(error.message);
    } finally {
      fearBusy = false;
      renderFear();
    }
  }

  const sortedThreads = () => [...(messageData.threads || [])].sort((a, b) =>
    Number(b.pc?.active !== false) - Number(a.pc?.active !== false)
    || (b.unread || 0) - (a.unread || 0)
    || String(a.pc?.name || "").localeCompare(String(b.pc?.name || "")));

  function renderMessageBadge() {
    const unread = bounded(messageData.totalUnread, 0, 999);
    const badge = $("#gm-tools-message-badge");
    badge.hidden = unread === 0;
    badge.textContent = unread > 9 ? "9+" : String(unread);
    const label = unread ? `Open private messages, ${unread} unread` : "Open private messages";
    $("#gm-tools-messages-open").setAttribute("aria-label", label);
    $("#gm-tools-messages-open").setAttribute("title", label);
  }

  function gmMessageHtml(message, pcName) {
    const sender = message.from === "gm" ? "Keeper" : pcName;
    const time = message.ts ? new Date(message.ts).toLocaleString([], { dateStyle: "medium", timeStyle: "short" }) : "";
    return `<article class="gm-tools-message is-${message.from}"><header><strong>${esc(sender)}</strong><time>${esc(time)}</time></header><p>${esc(message.text)}</p></article>`;
  }

  function renderMessagePanel() {
    const threads = sortedThreads();
    if (!threads.some((thread) => thread.pc?.id === selectedMessagePcId)) {
      selectedMessagePcId = threads.find((thread) => thread.unread)?.pc?.id
        || threads.find((thread) => thread.pc?.active !== false)?.pc?.id
        || threads[0]?.pc?.id
        || null;
    }
    $("#gm-tools-thread-list").innerHTML = threads.length ? threads.map((thread) => {
      const pc = thread.pc || {};
      const current = pc.id === selectedMessagePcId;
      const portrait = pc.portrait
        ? `<img src="${esc(pc.portrait)}" alt="">`
        : `<span>${esc((pc.name || "?").slice(0, 1).toUpperCase())}</span>`;
      return `<button type="button" data-message-pc="${esc(pc.id)}" ${current ? `aria-current="true"` : ""}>
        <span class="gm-tools-thread-portrait">${portrait}</span>
        <span class="gm-tools-thread-copy"><strong>${esc(pc.name)}</strong><small>${esc(pc.player || (pc.active === false ? "Retired" : ""))}</small></span>
        ${thread.unread ? `<span class="gm-tools-thread-unread">${bounded(thread.unread, 0, 99)}</span>` : ""}
      </button>`;
    }).join("") : `<p class="gm-tools-empty">No character threads.</p>`;

    for (const button of $("#gm-tools-thread-list").querySelectorAll("[data-message-pc]")) {
      button.addEventListener("click", () => { void selectMessageThread(button.dataset.messagePc); });
    }

    const selected = threads.find((thread) => thread.pc?.id === selectedMessagePcId) || null;
    const title = $("#gm-tools-conversation-title");
    const meta = $("#gm-tools-conversation-meta");
    const copy = $("#gm-tools-message-copy");
    const send = $("#gm-tools-message-form button[type=submit]");
    if (!selected) {
      title.textContent = "Choose a character";
      meta.textContent = "";
      $("#gm-tools-message-list").innerHTML = `<p class="gm-tools-empty">No conversation selected.</p>`;
      copy.disabled = true;
      send.disabled = true;
      return;
    }
    title.textContent = selected.pc.name;
    meta.textContent = selected.pc.active === false ? "Retired thread" : (selected.pc.player || "Active character");
    const messages = selected.messages || [];
    $("#gm-tools-message-list").innerHTML = messages.length
      ? messages.map((message) => gmMessageHtml(message, selected.pc.name)).join("")
      : `<p class="gm-tools-empty">No words have passed yet.</p>`;
    copy.disabled = messageBusy || selected.pc.active === false;
    send.disabled = messageBusy || selected.pc.active === false;
    if (messagesOpen) requestAnimationFrame(() => {
      const list = $("#gm-tools-message-list");
      list.scrollTop = list.scrollHeight;
    });
  }

  async function markGmRead() {
    const thread = (messageData.threads || []).find((candidate) => candidate.pc?.id === selectedMessagePcId);
    if (!thread?.unread) return;
    await api("/api/messages/read", { method: "PUT", body: { pcId: selectedMessagePcId, side: "gm" } });
    thread.unread = 0;
    thread.messages = (thread.messages || []).map((message) => ({ ...message, read: { ...message.read, gm: true } }));
    messageData.totalUnread = (messageData.threads || []).reduce((sum, candidate) => sum + (candidate.unread || 0), 0);
    renderMessageBadge();
    renderMessagePanel();
  }

  async function selectMessageThread(pcId) {
    selectedMessagePcId = pcId;
    renderMessagePanel();
    try { await markGmRead(); } catch (error) { showNotice(error.message); }
    if (!$("#gm-tools-message-copy").disabled) $("#gm-tools-message-copy").focus();
  }

  async function sendMessage() {
    if (messageBusy || !selectedMessagePcId) return;
    const copy = $("#gm-tools-message-copy");
    const text = copy.value.trim();
    if (!text) return;
    messageBusy = true;
    $("#gm-tools-message-status").textContent = "Sending…";
    renderMessagePanel();
    try {
      await api("/api/messages", { method: "POST", body: { pcId: selectedMessagePcId, from: "gm", text } });
      copy.value = "";
      $("#gm-tools-message-status").textContent = "";
      await refreshData();
    } catch (error) {
      $("#gm-tools-message-status").textContent = error.message;
    } finally {
      messageBusy = false;
      renderMessagePanel();
      if (!copy.disabled) copy.focus();
    }
  }

  const pipRow = (value, max, kind, label) => {
    const safeMax = bounded(max, 0, 12);
    const safeValue = bounded(value, 0, safeMax);
    const pips = Array.from({ length: safeMax }, (_, index) =>
      `<span class="gm-tools-pip ${kind}${index < safeValue ? " is-filled" : ""}"></span>`
    ).join("");
    return `<div class="gm-tools-vital" aria-label="${esc(label)} ${safeValue} of ${safeMax}"><span>${esc(label)}</span><span class="gm-tools-pips" aria-hidden="true">${pips}</span><strong>${safeValue}/${safeMax}</strong></div>`;
  };

  function partyPlate(pc) {
    const meta = [pc.class && `${pc.class}${pc.level ? ` ${pc.level}` : ""}`, pc.ancestry, pc.player].filter(Boolean).join(" · ");
    const portrait = pc.portrait
      ? `<img src="${esc(pc.portrait)}" alt="">`
      : `<span>${esc((pc.name || "?").slice(0, 1).toUpperCase())}</span>`;
    const conditions = (pc.conditions || []).map((condition) => `<span class="gm-tools-condition">${esc(condition)}</span>`).join("");
    return `<article class="gm-tools-pc">
      <header><div class="gm-tools-pc-portrait">${portrait}</div><div><h3>${esc(pc.name)}</h3><p>${esc(meta)}</p></div></header>
      <div class="gm-tools-pc-facts"><span><strong>${bounded(pc.evasion, 0, 99)}</strong>Evasion</span><span><strong>${bounded(pc.thresholds?.major, 0, 999)} / ${bounded(pc.thresholds?.severe, 0, 999)}</strong>Thresholds</span><span><strong>${bounded(pc.armor?.score, 0, 99)}</strong>Armor</span></div>
      <div class="gm-tools-vitals">
        ${pipRow(pc.hp, pc.hpMax, "is-harm", "HP marked")}
        ${pipRow(pc.stress, pc.stressMax, "is-stress", "Stress")}
        ${pipRow(pc.hope, pc.hopeMax, "is-hope", "Hope")}
        ${pc.armor?.score ? pipRow(pc.armor.marked, pc.armor.score, "is-armor", "Armor marked") : ""}
      </div>
      ${conditions ? `<div class="gm-tools-conditions">${conditions}</div>` : ""}
    </article>`;
  }

  function renderParty() {
    const party = (state?.party || []).filter((pc) => pc.active !== false);
    $("#gm-tools-party-count").textContent = `${party.length} active`;
    $("#gm-tools-party").innerHTML = party.length
      ? party.map(partyPlate).join("")
      : `<p class="gm-tools-empty">No active characters.</p>`;
  }

  function compactCharacter(pc) {
    if (!pc) return `<p class="gm-tools-empty">Choose a character on the HUD board.</p>`;
    return `<h3>${esc(pc.name)}</h3><p>${esc([pc.class, pc.ancestry].filter(Boolean).join(" · "))}</p><div class="gm-tools-mini-facts"><span>Eva ${bounded(pc.evasion, 0, 99)}</span><span>HP ${bounded(pc.hp, 0, 12)}/${bounded(pc.hpMax, 0, 12)}</span><span>Hope ${bounded(pc.hope, 0, 12)}/${bounded(pc.hopeMax, 0, 12)}</span></div>`;
  }

  function hudItemHtml(item) {
    const props = item.props || {};
    if (item.type === "note") return `<article class="gm-tools-hud-item"><span class="gm-tools-hud-kind">Note</span><h3>${esc(props.title || "Untitled note")}</h3><p class="gm-tools-pre">${esc(props.text || "")}</p></article>`;
    if (item.type === "counter") return `<article class="gm-tools-hud-item gm-tools-counter"><span class="gm-tools-hud-kind">Counter</span><h3>${esc(props.label || "Counter")}</h3><strong>${bounded(props.value, -9999, 9999)}</strong></article>`;
    if (item.type === "character") return `<article class="gm-tools-hud-item"><span class="gm-tools-hud-kind">Character</span>${compactCharacter((state?.party || []).find((pc) => pc.id === props.pcId))}</article>`;
    if (item.type === "folk") {
      const person = (state?.characters || []).find((candidate) => candidate.id === props.charId);
      return `<article class="gm-tools-hud-item"><span class="gm-tools-hud-kind">Folk</span>${person ? `<h3>${esc(person.name)}</h3><p>${esc([person.role, person.status !== "alive" ? person.status : ""].filter(Boolean).join(" · "))}</p>` : `<p class="gm-tools-empty">Choose a settler on the HUD board.</p>`}</article>`;
    }
    if (item.type === "stores") return `<article class="gm-tools-hud-item"><span class="gm-tools-hud-kind">Stores</span><div class="gm-tools-stores">${Object.entries(state?.resources || {}).map(([name, value]) => `<span><em>${esc(name)}</em><strong>${bounded(value, -9999, 9999)}</strong></span>`).join("")}</div></article>`;
    if (item.type === "term") {
      const term = TERMS[props.termKey]?.en;
      return `<article class="gm-tools-hud-item"><span class="gm-tools-hud-kind">Term</span><h3>${esc(term?.[0] || "Choose a term")}</h3>${term?.[1] ? `<p>${esc(term[1])}</p>` : ""}</article>`;
    }
    if (item.type === "card") {
      const card = reference?.domainCards?.find((candidate) => candidate.id === props.cardId);
      return `<article class="gm-tools-hud-item"><span class="gm-tools-hud-kind">Domain card</span><h3>${esc(card?.name || "Choose a card")}</h3>${card ? `<p>${esc(card.domain)} · Level ${bounded(card.level, 0, 10)}</p><p>${esc(card.text || "")}</p>` : ""}</article>`;
    }
    return `<article class="gm-tools-hud-item"><span class="gm-tools-hud-kind">${esc(item.type || "Item")}</span></article>`;
  }

  function renderHud() {
    const items = [...(hud.items || [])].sort((a, b) => (a.y || 0) - (b.y || 0) || (a.x || 0) - (b.x || 0));
    $("#gm-tools-hud").innerHTML = items.length
      ? items.map(hudItemHtml).join("")
      : `<p class="gm-tools-empty">The HUD board is empty. Place only the notes and counters you need during play.</p>`;
  }

  function renderReference() {
    $("#gm-tools-reference-source").innerHTML = screen.sourceUrl
      ? `<a href="${esc(screen.sourceUrl)}" target="_blank" rel="noreferrer">${esc(screen.source || "SRD")}</a>`
      : esc(screen.source || "");
    $("#gm-tools-reference-grid").innerHTML = (screen.sections || []).map((section) => `<section class="gm-tools-reference-block">
      <h3>${esc(section.title)}</h3>
      <div>${(section.rows || []).map((row) => `<div class="gm-tools-reference-row"><strong>${esc(row.label)}</strong><span><b>${esc(row.value)}</b>${row.note ? `<small>${esc(row.note)}</small>` : ""}</span></div>`).join("")}</div>
    </section>`).join("") || `<p class="gm-tools-empty">No quick reference is available.</p>`;
  }

  function ruleBodyHtml(body) {
    return String(body || "").split(/\n{2,}/).map((block) => {
      const lines = block.split("\n").map((line) => line.trim()).filter(Boolean);
      if (lines.length && lines.every((line) => line.startsWith("- "))) {
        return `<ul>${lines.map((line) => `<li>${esc(line.slice(2))}</li>`).join("")}</ul>`;
      }
      return `<p>${esc(lines.join(" "))}</p>`;
    }).join("");
  }

  function renderRuleSearch() {
    const query = $("#gm-tools-rule-query").value.trim();
    const workbench = $("#gm-tools-rule-workbench");
    const flatReference = $("#gm-tools-flat-reference");
    const open = $("#gm-tools-rule-open");
    if (!query) {
      workbench.hidden = true;
      flatReference.hidden = false;
      open.href = "/rules/";
      return;
    }

    const matches = searchRuleNodes(ruleNodes, query).slice(0, 8);
    if (!matches.some((node) => node.id === selectedRuleId)) selectedRuleId = matches[0]?.id || null;
    workbench.hidden = false;
    flatReference.hidden = true;
    $("#gm-tools-rule-results").innerHTML = matches.length
      ? matches.map((node) => `<button type="button" data-rule-result="${esc(node.id)}" ${node.id === selectedRuleId ? `aria-current="true"` : ""}><strong>${esc(node.title)}</strong><span>${(node.path || []).map(esc).join(" / ")}</span></button>`).join("")
      : `<p class="gm-tools-empty">No matching rules.</p>`;

    const selected = matches.find((node) => node.id === selectedRuleId) || null;
    $("#gm-tools-rule-preview").innerHTML = selected
      ? `<div class="gm-tools-rule-path">${(selected.path || []).map(esc).join(" / ")}</div><h3>${esc(selected.title)}</h3><div class="gm-tools-rule-body">${ruleBodyHtml(selected.body)}</div>`
      : `<p class="gm-tools-empty">Try another rule or table term.</p>`;
    open.href = selected ? `/rules/#${encodeURIComponent(selected.id)}` : "/rules/";

    for (const button of $("#gm-tools-rule-results").querySelectorAll("[data-rule-result]")) {
      button.addEventListener("click", () => {
        selectedRuleId = button.dataset.ruleResult;
        renderRuleSearch();
        $("#gm-tools-rule-query").focus();
      });
    }
  }

  async function ensureRules() {
    if (rulesCorpus) return;
    rulesCorpus = await api("/api/rules");
    ruleNodes = prepareRuleNodes(rulesCorpus);
    selectedRuleId = ruleNodes[0]?.id || null;
  }

  function renderOverlay() {
    renderParty();
    renderHud();
    renderReference();
    renderRuleSearch();
  }

  async function refreshData() {
    const [nextState, nextScreen, nextHud, nextMessages] = await Promise.all([
      api("/api/state"),
      api("/api/gm-screen"),
      api("/api/board/hud"),
      api("/api/messages/gm")
    ]);
    state = nextState;
    screen = nextScreen;
    hud = nextHud;
    messageData = nextMessages;
    if ((hud.items || []).some((item) => item.type === "card") && !reference) reference = await api("/api/reference");
    renderFear();
    renderMessageBadge();
    if (messagesOpen) renderMessagePanel();
    if (overlayOpen) renderOverlay();
  }

  async function openMessages() {
    if (overlayOpen) closeOverlay();
    messagesLastFocus = document.activeElement;
    messagesOpen = true;
    $("#gm-tools-messages").hidden = false;
    document.body.classList.add("gm-tools-messages-visible");
    try {
      await refreshData();
      renderMessagePanel();
      await markGmRead();
    } catch (error) {
      showNotice(error.message);
    }
    if (!$("#gm-tools-message-copy").disabled) $("#gm-tools-message-copy").focus();
    else $("#gm-tools-messages-close").focus();
  }

  function closeMessages() {
    if (!messagesOpen) return;
    messagesOpen = false;
    $("#gm-tools-messages").hidden = true;
    document.body.classList.remove("gm-tools-messages-visible");
    $("#gm-tools-message-status").textContent = "";
    messagesLastFocus?.focus?.();
  }

  async function openOverlay({ focusRules = false } = {}) {
    if (messagesOpen) closeMessages();
    lastFocus = document.activeElement;
    overlayOpen = true;
    $("#gm-tools-overlay").hidden = false;
    document.body.classList.add("gm-tools-overlay-visible");
    try {
      await refreshData();
      await ensureRules();
      renderOverlay();
    } catch (error) {
      showNotice(error.message);
    }
    if (focusRules) $("#gm-tools-rule-query").focus();
    else $("#gm-tools-overlay-close").focus();
  }

  function closeOverlay() {
    overlayOpen = false;
    $("#gm-tools-overlay").hidden = true;
    document.body.classList.remove("gm-tools-overlay-visible");
    lastFocus?.focus?.();
  }

  $("#gm-tool-fear-down").addEventListener("click", () => updateFear({ fear: bounded(state?.session?.fear, 0, 12) - 1 }));
  $("#gm-tool-fear-up").addEventListener("click", () => updateFear({ fear: bounded(state?.session?.fear, 0, 12) + 1 }));
  $("#gm-tool-fear-visibility").addEventListener("click", () => updateFear({ showFearToPlayers: state?.session?.showFearToPlayers === false }));
  $("#gm-tools-messages-open").addEventListener("click", openMessages);
  $("#gm-tools-messages-close").addEventListener("click", closeMessages);
  $("#gm-tools-messages").addEventListener("pointerdown", (event) => { if (event.target === $("#gm-tools-messages")) closeMessages(); });
  $("#gm-tools-message-form").addEventListener("submit", (event) => { event.preventDefault(); void sendMessage(); });
  $("#gm-tools-message-copy").addEventListener("keydown", (event) => {
    if (event.key === "Enter" && event.ctrlKey) { event.preventDefault(); void sendMessage(); }
  });
  $("#gm-tools-rules-open").addEventListener("click", () => openOverlay({ focusRules: true }));
  $("#gm-tools-overlay-open").addEventListener("click", () => openOverlay());
  $("#gm-tools-overlay-close").addEventListener("click", closeOverlay);
  $("#gm-tools-rule-query").addEventListener("input", renderRuleSearch);
  $("#gm-tools-rule-query").addEventListener("keydown", (event) => {
    if (event.key !== "Escape" || !event.currentTarget.value) return;
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.value = "";
    renderRuleSearch();
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && messagesOpen) closeMessages();
    else if (event.key === "Escape" && overlayOpen) closeOverlay();
  });

  let refreshTimer = null;
  const stream = new EventSource("/api/stream");
  stream.onmessage = () => {
    clearTimeout(refreshTimer);
    refreshTimer = setTimeout(() => refreshData().catch((error) => showNotice(error.message)), 140);
  };
  refreshData().catch((error) => showNotice(error.message));
}
