import { TERMS } from "/shared/i18n.js";

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
      <button type="button" class="gm-tools-overlay-open" id="gm-tools-overlay-open">${icon("grid")}<span>Quick table</span></button>
      <span class="gm-tools-notice" id="gm-tools-notice" role="status" hidden></span>
    </div>
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
          <div class="gm-tools-section-head"><h2 id="gm-tools-reference-title">Rules at hand</h2><span id="gm-tools-reference-source"></span></div>
          <div class="gm-tools-reference-grid" id="gm-tools-reference-grid"></div>
        </section>
      </div>
    </section>`;

  const $ = (selector) => root.querySelector(selector);
  let state = null;
  let screen = { sections: [] };
  let hud = { items: [], pins: [] };
  let reference = null;
  let fearBusy = false;
  let overlayOpen = false;
  let lastFocus = null;
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

  function renderOverlay() {
    renderParty();
    renderHud();
    renderReference();
  }

  async function refreshData() {
    const [nextState, nextScreen, nextHud] = await Promise.all([
      api("/api/state"),
      api("/api/gm-screen"),
      api("/api/board/hud")
    ]);
    state = nextState;
    screen = nextScreen;
    hud = nextHud;
    if ((hud.items || []).some((item) => item.type === "card") && !reference) reference = await api("/api/reference");
    renderFear();
    if (overlayOpen) renderOverlay();
  }

  async function openOverlay() {
    lastFocus = document.activeElement;
    overlayOpen = true;
    $("#gm-tools-overlay").hidden = false;
    document.body.classList.add("gm-tools-overlay-visible");
    try {
      await refreshData();
      renderOverlay();
    } catch (error) {
      showNotice(error.message);
    }
    $("#gm-tools-overlay-close").focus();
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
  $("#gm-tools-overlay-open").addEventListener("click", openOverlay);
  $("#gm-tools-overlay-close").addEventListener("click", closeOverlay);
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && overlayOpen) closeOverlay();
  });

  let refreshTimer = null;
  const stream = new EventSource("/api/stream");
  stream.onmessage = () => {
    clearTimeout(refreshTimer);
    refreshTimer = setTimeout(() => refreshData().catch((error) => showNotice(error.message)), 140);
  };
  refreshData().catch((error) => showNotice(error.message));
}
