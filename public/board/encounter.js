// The Encounter Stage — a GM-board module for building RAW combat encounters.
// Adversaries come from the bestiary (data/adversaries.json); each entity is
// one floating card on a 16:9 stage that mirrors the projector exactly.
// Dragging an enemy card up against a player card puts them in melee.

import { ENCOUNTER_STAGE_ASPECT, encounterEngagements, engagedIds } from "/shared/encounter-stage.js";

const esc = (s) =>
  String(s ?? "").replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

// RAW battle points: budget is (3 × party size) + 2; a group of minions equal
// to the party size costs 1 point, other types cost by their role.
const TYPE_COST = { Minion: 1, Social: 1, Support: 1, Horde: 2, Ranged: 2, Skulk: 2, Standard: 2, Leader: 3, Bruiser: 4, Solo: 5 };

let BESTIARY = [];
let IDENTITIES = [];
let encounters = [];
let current = null;        // the open encounter (local source of truth while editing)
let projectedId = null;    // which encounter id is on the table screen, if any
let selectedEntityId = null;
let previewAdversaryId = null;
let overlayOpen = false;
let saveTimer = null;
let drag = null;

const uid = () => `en_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
const adversary = (id) => BESTIARY.find((a) => a.id === id) || null;
const identity = (id) => IDENTITIES.find((p) => p.id === id) || null;

// ---------- chrome ----------
const style = document.createElement("style");
style.textContent = `
  #enc-overlay { position: fixed; inset: 0; z-index: 900; display: flex; flex-direction: column; background: var(--paper); }
  #enc-overlay[hidden] { display: none; }
  #enc-top { display: flex; align-items: center; gap: 0.5rem; flex-wrap: wrap; padding: 0.5rem 0.8rem; background: var(--paper-inset); border-bottom: 1px solid var(--rule-strong); }
  #enc-top .title { font-weight: 600; margin-right: 0.4rem; }
  #enc-top select, #enc-top input[type=text] { padding: 0.25rem 0.4rem; font-size: 0.85rem; }
  #enc-top button { padding: 0.3rem 0.8rem; font-size: 0.85rem; }
  #enc-top .sep { width: 1px; height: 22px; background: var(--rule-strong); margin: 0 0.3rem; }
  #enc-bp { font-size: 0.82rem; color: var(--ink-soft); border: 1px solid var(--rule-strong); border-radius: 12px; padding: 0.2rem 0.7rem; background: var(--paper-raised); }
  #enc-bp b { color: var(--ink); }
  #enc-bp.over b { color: var(--oxblood); }
  #enc-project[aria-pressed="true"] { color: var(--paper-raised); background: var(--oxblood); border-color: var(--oxblood); }
  #enc-main { flex: 1; display: flex; min-height: 0; }
  #enc-bestiary { width: 250px; flex: none; overflow-y: auto; border-right: 1px solid var(--rule-strong); background: var(--paper-raised); }
  #enc-bestiary h3 { font-variant: small-caps; letter-spacing: 0.06em; font-size: 0.8rem; color: var(--ink-faint); margin: 0.7rem 0.8rem 0.2rem; }
  .enc-row { display: flex; align-items: center; gap: 0.4rem; padding: 0.3rem 0.8rem; cursor: pointer; font-size: 0.86rem; }
  .enc-row:hover, .enc-row.previewing { background: var(--paper-inset); }
  .enc-row .who { flex: 1; min-width: 0; }
  .enc-row .who small { display: block; color: var(--ink-faint); font-size: 0.72rem; }
  .enc-row .add { flex: none; padding: 0.05rem 0.5rem; font-size: 0.95rem; }
  #enc-stage-wrap { flex: 1; display: grid; place-items: center; min-width: 0; background: #0e0b07; padding: 10px; }
  #enc-stage { border-radius: 6px; box-shadow: 0 0 0 1px #3a3022, 0 14px 50px rgba(0,0,0,0.5) inset; }
  #enc-inspector { width: 300px; flex: none; overflow-y: auto; border-left: 1px solid var(--rule-strong); background: var(--paper-raised); padding: 0.8rem; font-size: 0.88rem; }
  #enc-inspector h2 { margin: 0 0 0.1rem; font-size: 1.05rem; }
  #enc-inspector .muted { color: var(--ink-faint); font-size: 0.78rem; }
  #enc-inspector .statline { margin: 0.5rem 0; }
  #enc-inspector .feature { margin: 0.5rem 0; line-height: 1.4; font-size: 0.84rem; }
  #enc-inspector .feature b { font-size: 0.86rem; }
  #enc-inspector .feature .cost { color: var(--oxblood); font-variant: small-caps; font-size: 0.76rem; }
  #enc-inspector .viterow .dot { cursor: pointer; width: 13px; height: 13px; }
  #enc-inspector .actions { display: flex; gap: 0.4rem; flex-wrap: wrap; margin-top: 0.8rem; }
  #enc-inspector .actions button { font-size: 0.82rem; padding: 0.28rem 0.7rem; }
  #enc-empty-note { color: var(--ink-faint); font-style: italic; font-size: 0.84rem; }
  @media (max-width: 900px) { #enc-bestiary { width: 200px; } #enc-inspector { width: 240px; } }
`;
document.head.append(style);

const cssLink = document.createElement("link");
cssLink.rel = "stylesheet";
cssLink.href = "/shared/encounter-cards.css";
document.head.append(cssLink);

const overlay = document.createElement("div");
overlay.id = "enc-overlay";
overlay.hidden = true;
overlay.innerHTML = `
  <div id="enc-top">
    <span class="title">The Encounter Stage</span>
    <select id="enc-pick"></select>
    <button class="quiet" id="enc-new">+ New encounter</button>
    <input type="text" id="enc-name" placeholder="Name the encounter" style="width: 170px;">
    <span class="sep"></span>
    <span id="enc-bp"></span>
    <span style="flex:1"></span>
    <button id="enc-project" aria-pressed="false">Show at the table</button>
    <button class="quiet" id="enc-delete">Remove encounter</button>
    <button class="quiet" id="enc-close">Back to the board</button>
  </div>
  <div id="enc-main">
    <div id="enc-bestiary"></div>
    <div id="enc-stage-wrap"><div id="enc-stage" class="enc-stage"></div></div>
    <div id="enc-inspector"></div>
  </div>`;
document.body.append(overlay);

const $ = (sel) => overlay.querySelector(sel);
const stage = $("#enc-stage");

// ---------- data ----------
async function loadStatic() {
  const [adv, party] = await Promise.all([
    fetch("/api/adversaries").then((r) => r.json()),
    fetch("/api/party").then((r) => r.json())
  ]);
  BESTIARY = adv.adversaries || [];
  IDENTITIES = Array.isArray(party) ? party : [];
}

async function loadEncounters() {
  const doc = await fetch("/api/encounters").then((r) => r.json());
  encounters = doc.encounters || [];
  if (current) current = encounters.find((e) => e.id === current.id) || null;
}

async function loadProjection() {
  const state = await fetch("/api/state").then((r) => r.json());
  projectedId = state.screen?.type === "encounter" ? state.screen.refId : null;
}

function queueSave() {
  if (!current) return;
  clearTimeout(saveTimer);
  saveTimer = setTimeout(async () => {
    saveTimer = null;
    try {
      const response = await fetch(`/api/encounters/${current.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: current.name, entities: current.entities })
      });
      if (!response.ok) throw new Error("The encounter could not be saved.");
    } catch (error) {
      console.error(error.message);
    }
  }, 450);
}

// ---------- battle points ----------
function battlePoints() {
  const pcs = current.entities.filter((e) => e.kind === "pc");
  const budget = pcs.length ? pcs.length * 3 + 2 : 0;
  let spent = 0;
  let minions = 0;
  for (const entity of current.entities) {
    if (entity.kind !== "adversary") continue;
    const block = adversary(entity.refId);
    if (!block) continue;
    if (block.type === "Minion") minions += 1;
    else spent += TYPE_COST[block.type] ?? 2;
  }
  if (minions) spent += Math.ceil(minions / Math.max(1, pcs.length));
  return { budget, spent };
}

// ---------- stage ----------
function stageSize() {
  const wrap = $("#enc-stage-wrap");
  const availW = wrap.clientWidth - 20;
  const availH = wrap.clientHeight - 20;
  let w = availW;
  let h = w / ENCOUNTER_STAGE_ASPECT;
  if (h > availH) { h = availH; w = h * ENCOUNTER_STAGE_ASPECT; }
  return { w: Math.max(200, w), h: Math.max(112, h) };
}

function renderStage() {
  const { w, h } = stageSize();
  stage.style.width = `${w}px`;
  stage.style.height = `${h}px`;
  if (!current) {
    stage.innerHTML = `<div style="position:absolute; inset:0; display:grid; place-items:center; color:#a89877; font-style:italic;">No encounter yet. Begin one, and the party takes the stage.</div>`;
    return;
  }
  const engaged = engagedIds(current.entities);
  const byId = Object.fromEntries(current.entities.map((e) => [e.id, e]));

  stage.innerHTML = `
    <svg class="enc-tethers" viewBox="0 0 ${w} ${h}">${tetherSvgInner(w, h)}</svg>
    ${current.entities.map((entity) => cardHtml(entity, w, engaged)).join("")}`;

  for (const el of stage.querySelectorAll(".enc-card")) wireCard(el, byId[el.dataset.entity]);
}

function tetherSvgInner(w, h) {
  const byId = Object.fromEntries(current.entities.map((e) => [e.id, e]));
  return encounterEngagements(current.entities).map(([a, b]) => {
    const ea = byId[a]; const eb = byId[b];
    return `<line x1="${ea.x * w}" y1="${ea.y * h}" x2="${eb.x * w}" y2="${eb.y * h}"></line>
      <text class="enc-melee-mark" x="${((ea.x + eb.x) / 2) * w}" y="${((ea.y + eb.y) / 2) * h}">⚔</text>`;
  }).join("");
}

// During a drag, the pointer is captured by the card's element, so the DOM
// must not be rebuilt. Move the one card and repaint only the tether layer
// and engagement rings.
function updateDragVisuals(el, entity) {
  el.style.left = `${(entity.x * 100).toFixed(2)}%`;
  el.style.top = `${(entity.y * 100).toFixed(2)}%`;
  const rect = stage.getBoundingClientRect();
  const svg = stage.querySelector(".enc-tethers");
  if (svg) svg.innerHTML = tetherSvgInner(rect.width, rect.height);
  const engaged = engagedIds(current.entities);
  for (const card of stage.querySelectorAll(".enc-card")) {
    card.classList.toggle("engaged", engaged.has(card.dataset.entity));
  }
}

function cardHtml(entity, stageW, engaged) {
  const hostile = entity.kind === "adversary";
  const pc = hostile ? null : identity(entity.refId);
  const primary = pc?.appearance?.primaryColor;
  const secondary = pc?.appearance?.secondaryColor;
  const classes = [
    "enc-card", "draggable",
    hostile ? "hostile" : "",
    engaged.has(entity.id) ? "engaged" : "",
    entity.defeated ? "defeated" : "",
    entity.id === selectedEntityId ? "selected" : ""
  ].filter(Boolean).join(" ");
  const styleVars = [
    `--enc-w:${(entity.w * stageW).toFixed(1)}px`,
    `left:${(entity.x * 100).toFixed(2)}%`,
    `top:${(entity.y * 100).toFixed(2)}%`,
    primary ? `--enc-primary:${esc(primary)}` : "",
    secondary ? `--enc-secondary:${esc(secondary)}` : ""
  ].filter(Boolean).join(";");
  const glyph = hostile ? "☠" : esc((pc?.name || entity.label || "?").slice(0, 1));
  return `
    <article class="${classes}" data-entity="${esc(entity.id)}" style="${styleVars}">
      <div class="enc-card-surface">
        <div class="enc-portrait">
          ${pc?.portrait ? `<img src="${esc(pc.portrait)}" alt="">` : `<span class="enc-glyph" aria-hidden="true">${glyph}</span>`}
        </div>
        <strong class="enc-name">${esc(entity.label || pc?.name || "?")}</strong>
      </div>
    </article>`;
}

function wireCard(el, entity) {
  el.addEventListener("pointerdown", (event) => {
    if (event.button !== 0) return;
    const rect = stage.getBoundingClientRect();
    drag = { entity, moved: false, startX: event.clientX, startY: event.clientY, ox: entity.x, oy: entity.y, rect };
    el.classList.add("dragging");
    try { el.setPointerCapture(event.pointerId); } catch { /* pointer already gone */ }
    event.preventDefault();
  });
  el.addEventListener("pointermove", (event) => {
    if (!drag || drag.entity !== entity) return;
    const dx = (event.clientX - drag.startX) / drag.rect.width;
    const dy = (event.clientY - drag.startY) / drag.rect.height;
    if (Math.abs(event.clientX - drag.startX) + Math.abs(event.clientY - drag.startY) > 4) drag.moved = true;
    entity.x = Math.min(1, Math.max(0, drag.ox + dx));
    entity.y = Math.min(1, Math.max(0, drag.oy + dy));
    updateDragVisuals(el, entity);
  });
  el.addEventListener("pointerup", () => {
    if (!drag || drag.entity !== entity) return;
    const wasDrag = drag.moved;
    drag = null;
    if (wasDrag) queueSave();
    else {
      selectedEntityId = selectedEntityId === entity.id ? null : entity.id;
      previewAdversaryId = null;
      renderInspector();
      renderBestiary();
    }
    renderStage();
  });
}

// ---------- bestiary rail ----------
function renderBestiary() {
  const rail = $("#enc-bestiary");
  const fronts = [...new Set(BESTIARY.map((a) => a.front || "Elsewhere"))];
  rail.innerHTML = fronts.map((front) => `
    <h3>${esc(front)}</h3>
    ${BESTIARY.filter((a) => (a.front || "Elsewhere") === front).map((a) => `
      <div class="enc-row ${a.id === previewAdversaryId ? "previewing" : ""}" data-preview="${esc(a.id)}">
        <span class="who">${esc(a.name)}<small>Tier ${a.tier} ${esc(a.type)} · ${TYPE_COST[a.type] ?? 2} pt${a.type === "Minion" ? "/group" : ""}</small></span>
        <button class="quiet add" data-summon="${esc(a.id)}" title="Add to the encounter">+</button>
      </div>`).join("")}`).join("");

  for (const row of rail.querySelectorAll("[data-preview]")) {
    row.addEventListener("click", (event) => {
      if (event.target.dataset.summon) return;
      previewAdversaryId = row.dataset.preview;
      selectedEntityId = null;
      renderBestiary();
      renderInspector();
      renderStage();
    });
  }
  for (const button of rail.querySelectorAll("[data-summon]")) {
    button.addEventListener("click", () => summon(button.dataset.summon));
  }
}

function summon(adversaryId) {
  if (!current) return;
  const block = adversary(adversaryId);
  if (!block) return;
  const count = current.entities.filter((e) => e.kind === "adversary" && e.refId === adversaryId).length;
  const entity = {
    id: uid(),
    kind: "adversary",
    refId: adversaryId,
    label: count ? `${block.name} ${count + 1}` : block.name,
    x: 0.72 + Math.random() * 0.12,
    y: 0.2 + Math.random() * 0.55,
    w: 0.09,
    hp: 0,
    stress: 0,
    defeated: false
  };
  current.entities.push(entity);
  selectedEntityId = entity.id;
  previewAdversaryId = null;
  renderAll();
  queueSave();
}

// ---------- inspector ----------
const dots = (marked, max, cls) =>
  Array.from({ length: max }, (_, i) =>
    `<span class="dot ${cls} ${i < marked ? "on harm" : ""}" data-dot-index="${i}"></span>`).join("");

function statBlockHtml(block) {
  return `
    <h2>${esc(block.name)}</h2>
    <div class="muted">Tier ${block.tier} ${esc(block.type)} · ${esc(block.front || "")}</div>
    <p style="font-size:0.83rem; line-height:1.45;">${esc(block.description)}</p>
    <div class="muted" style="font-style:italic;">${esc(block.motives)}</div>
    <div class="statline">
      <div class="s"><b>${block.difficulty}</b><span>Difficulty</span></div>
      <div class="s"><b>${block.thresholds ? `${block.thresholds.major}/${block.thresholds.severe}` : "—"}</b><span>Thresholds</span></div>
      <div class="s"><b>${block.atk >= 0 ? "+" : ""}${block.atk}</b><span>ATK</span></div>
    </div>
    <div style="font-size:0.84rem;"><b>${esc(block.weapon.name)}</b> · ${esc(block.weapon.range)} · ${esc(block.weapon.damage)}</div>
    ${block.experiences?.length ? `<div class="muted" style="margin-top:0.25rem;">${block.experiences.map((e) => `${esc(e.name)} +${e.bonus}`).join(", ")}</div>` : ""}
    ${block.features.map((f) => `
      <div class="feature"><b>${esc(f.name)}</b> — <span class="muted">${esc(f.kind)}</span>${f.cost ? ` <span class="cost">· spend a ${esc(f.cost)}</span>` : ""}<br>${esc(f.text)}</div>`).join("")}`;
}

function renderInspector() {
  const panel = $("#enc-inspector");
  const entity = current?.entities.find((e) => e.id === selectedEntityId);

  if (!entity && previewAdversaryId) {
    const block = adversary(previewAdversaryId);
    panel.innerHTML = block ? `${statBlockHtml(block)}
      <div class="actions"><button data-act="summon">Add to the encounter</button></div>` : "";
    panel.querySelector("[data-act=summon]")?.addEventListener("click", () => summon(previewAdversaryId));
    return;
  }

  if (!entity) {
    panel.innerHTML = `<span id="enc-empty-note">Pick an adversary from the bestiary, or a card on the stage. Slide an enemy card against a character to put them in melee.</span>`;
    return;
  }

  if (entity.kind === "pc") {
    const pc = identity(entity.refId);
    panel.innerHTML = `
      <h2>${esc(pc?.name || entity.label)}</h2>
      <div class="muted">Player character — vitals live on their sheet and the quick table.</div>
      <div class="actions">
        <button class="quiet" data-act="defeat">${entity.defeated ? "Back on their feet" : "Down"}</button>
      </div>`;
  } else {
    const block = adversary(entity.refId);
    panel.innerHTML = `
      <input type="text" value="${esc(entity.label)}" data-act="label" style="width:100%; font-weight:600; font-size:1rem; border:none; background:transparent; padding:0;">
      ${block ? statBlockHtml(block) : `<div class="muted">This adversary is gone from the bestiary.</div>`}
      ${block ? `
        <div class="viterow" style="margin-top:0.6rem;"><span class="lbl">HP</span><span data-track="hp">${dots(entity.hp, block.hp, "")}</span></div>
        <div class="viterow"><span class="lbl">Stress</span><span data-track="stress">${dots(entity.stress, block.stress, "")}</span></div>` : ""}
      <div class="actions">
        <button class="quiet" data-act="defeat">${entity.defeated ? "Back up" : "Struck down"}</button>
        <button class="quiet" data-act="remove">Remove the card</button>
      </div>`;
    panel.querySelector("[data-act=label]")?.addEventListener("input", (event) => {
      entity.label = event.target.value.slice(0, 60);
      renderStage();
      queueSave();
    });
    for (const track of panel.querySelectorAll("[data-track]")) {
      track.addEventListener("click", (event) => {
        const index = event.target.dataset.dotIndex;
        if (index === undefined) return;
        const field = track.dataset.track;
        const clicked = parseInt(index, 10) + 1;
        entity[field] = entity[field] === clicked ? clicked - 1 : clicked;
        if (block && field === "hp" && entity.hp >= block.hp) entity.defeated = true;
        renderInspector();
        renderStage();
        queueSave();
      });
    }
  }
  panel.querySelector("[data-act=defeat]")?.addEventListener("click", () => {
    entity.defeated = !entity.defeated;
    renderAll();
    queueSave();
  });
  panel.querySelector("[data-act=remove]")?.addEventListener("click", () => {
    current.entities = current.entities.filter((e) => e.id !== entity.id);
    selectedEntityId = null;
    renderAll();
    queueSave();
  });
}

// ---------- header ----------
function renderHeader() {
  const pick = $("#enc-pick");
  pick.innerHTML = encounters.length
    ? encounters.map((e) => `<option value="${esc(e.id)}" ${current?.id === e.id ? "selected" : ""}>${esc(e.name)}</option>`).join("")
    : `<option value="">— no encounters yet —</option>`;
  $("#enc-name").value = current?.name || "";
  $("#enc-name").disabled = !current;
  $("#enc-delete").disabled = !current;

  const project = $("#enc-project");
  const projected = current && projectedId === current.id;
  project.disabled = !current;
  project.setAttribute("aria-pressed", String(Boolean(projected)));
  project.textContent = projected ? "Showing at the table — take it down" : "Show at the table";

  const bp = $("#enc-bp");
  if (!current) { bp.textContent = ""; return; }
  const { budget, spent } = battlePoints();
  bp.classList.toggle("over", spent > budget);
  bp.innerHTML = `Battle points <b>${spent}</b> of ${budget}`;
}

function renderAll() {
  renderHeader();
  renderBestiary();
  renderStage();
  renderInspector();
}

// ---------- wiring ----------
$("#enc-close").addEventListener("click", () => setOpen(false));
$("#enc-new").addEventListener("click", async () => {
  const response = await fetch("/api/encounters", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: "Unnamed encounter" })
  });
  if (!response.ok) return;
  const encounter = await response.json();
  encounters.push(encounter);
  current = encounter;
  selectedEntityId = null;
  renderAll();
  $("#enc-name").focus();
  $("#enc-name").select();
});
$("#enc-pick").addEventListener("change", (event) => {
  current = encounters.find((e) => e.id === event.target.value) || null;
  selectedEntityId = null;
  previewAdversaryId = null;
  renderAll();
});
$("#enc-name").addEventListener("input", (event) => {
  if (!current) return;
  current.name = event.target.value.slice(0, 80);
  queueSave();
  renderHeader();
});
$("#enc-project").addEventListener("click", async () => {
  if (!current) return;
  const projected = projectedId === current.id;
  const response = await fetch("/api/screen", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(projected ? { type: null } : { type: "encounter", refId: current.id })
  });
  if (response.ok) {
    projectedId = projected ? null : current.id;
    renderHeader();
  }
});
$("#enc-delete").addEventListener("click", async () => {
  if (!current) return;
  if (!confirm(`Remove the encounter "${current.name}"? This clears its cards and takes it off the screen if shown.`)) return;
  const response = await fetch(`/api/encounters/${current.id}`, { method: "DELETE" });
  if (!response.ok) return;
  encounters = encounters.filter((e) => e.id !== current.id);
  if (projectedId === current.id) projectedId = null;
  current = encounters[0] || null;
  selectedEntityId = null;
  renderAll();
});

window.addEventListener("resize", () => { if (overlayOpen && current) renderStage(); });

// The GM board is the editor of truth while open: SSE refreshes only the
// projection marker, never the entities mid-drag.
let streamTimer = null;
const stream = new EventSource("/api/stream");
stream.onmessage = () => {
  clearTimeout(streamTimer);
  streamTimer = setTimeout(async () => {
    await loadProjection().catch(() => {});
    if (overlayOpen) renderHeader();
  }, 500);
};

async function setOpen(next) {
  overlayOpen = next;
  overlay.hidden = !next;
  if (!next) return;
  try {
    if (!BESTIARY.length) await loadStatic();
    await Promise.all([loadEncounters(), loadProjection()]);
    if (!current) current = encounters[0] || null;
    renderAll();
  } catch (error) {
    console.error(error);
  }
}

const openButton = document.createElement("button");
openButton.className = "quiet";
openButton.textContent = "⚔ Encounter";
const bar = document.getElementById("bar");
const anchor = bar?.querySelector("#pin-add");
if (bar) bar.insertBefore(openButton, anchor || null);
openButton.addEventListener("click", () => setOpen(true));
