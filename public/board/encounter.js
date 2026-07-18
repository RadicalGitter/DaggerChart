// The Encounter Stage — a GM-board module for building RAW combat encounters.
// Adversaries come from the bestiary (data/adversaries.json); each entity is
// one floating card on a 16:9 stage that mirrors the projector exactly.
// Dragging an enemy card up against a player card puts them in melee.

import { ENCOUNTER_STAGE_ASPECT, encounterEngagements, engagedIds } from "/shared/encounter-stage.js";
import { createCreatureExplorer } from "/shared/creature-explorer.js";
import { prepareRuleNodes, searchRuleNodes } from "/shared/rules-search.js";

const esc = (s) =>
  String(s ?? "").replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

// RAW battle points: budget is (3 × party size) + 2; a group of minions equal
// to the party size costs 1 point, other types cost by their role.
const TYPE_COST = { Minion: 1, Social: 1, Support: 1, Horde: 2, Ranged: 2, Skulk: 2, Standard: 2, Leader: 3, Bruiser: 4, Solo: 5 };

let BESTIARY = [];
let BESTIARY_SOURCES = [];
let IDENTITIES = [];
let RULE_NODES = [];
let GM_SCREEN = { sections: [] };
let encounters = [];
let current = null;        // the open encounter (local source of truth while editing)
let projectedId = null;    // which encounter id is on the table screen, if any
let projectedScreen = null;
let selectedEntityId = null;
let previewAdversaryId = null;
let creatureExplorer = null;
let inspectorMode = "details";
let focusedRuleId = null;
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
  #enc-pane-tabs { display: none; flex: none; border-bottom: 1px solid var(--rule-strong); background: var(--paper-inset); }
  #enc-pane-tabs button { flex: 1; border: 0; border-bottom: 3px solid transparent; border-radius: 0; background: transparent; }
  #enc-pane-tabs button[aria-selected="true"] { color: var(--ink); border-bottom-color: #d46d43; background: linear-gradient(180deg, rgba(212,109,67,.16), rgba(212,109,67,.03)); }
  #enc-main { flex: 1; min-height: 0; display: grid; grid-template-columns: minmax(250px, 290px) minmax(340px, 1fr) minmax(270px, 330px); }
  #enc-bestiary { min-width: 0; min-height: 0; overflow: hidden; border-right: 1px solid var(--rule-strong); background: var(--paper-raised); }
  #enc-bestiary.creature-explorer { height: 100%; }
  #enc-stage-wrap { display: grid; place-items: center; min-width: 0; min-height: 0; background: #0e0b07; padding: 10px; }
  #enc-stage { border-radius: 6px; box-shadow: 0 0 0 1px #3a3022, 0 14px 50px rgba(0,0,0,0.5) inset; }
  #enc-side { min-width: 0; min-height: 0; display: grid; grid-template-rows: auto minmax(0, 1fr); border-left: 1px solid var(--rule-strong); background: var(--paper-raised); }
  #enc-side-tabs { display: flex; border-bottom: 1px solid var(--rule-strong); }
  #enc-side-tabs button { flex: 1; padding: .55rem; border: 0; border-bottom: 3px solid transparent; border-radius: 0; background: transparent; font: inherit; font-size: .72rem; cursor: pointer; }
  #enc-side-tabs button[aria-selected="true"] { color: var(--ink); border-bottom-color: #d46d43; background: linear-gradient(180deg, rgba(212,109,67,.15), transparent); }
  #enc-inspector, #enc-rules { min-height: 0; overflow-y: auto; padding: 0.8rem; font-size: 0.88rem; }
  #enc-inspector[hidden], #enc-rules[hidden] { display: none; }
  #enc-inspector h2 { margin: 0 0 0.1rem; font-size: 1.05rem; }
  #enc-inspector .muted { color: var(--ink-faint); font-size: 0.78rem; }
  #enc-inspector .provenance { margin-top: .18rem; color: #8a482f; font-size: .64rem; font-variant: small-caps; }
  #enc-inspector .statline { margin: 0.5rem 0; }
  #enc-inspector .feature { margin: 0.5rem 0; line-height: 1.4; font-size: 0.84rem; }
  #enc-inspector .feature b { font-size: 0.86rem; }
  #enc-inspector .feature .cost { color: var(--oxblood); font-variant: small-caps; font-size: 0.76rem; }
  #enc-inspector .viterow .dot { cursor: pointer; width: 13px; height: 13px; }
  #enc-inspector .actions { display: flex; gap: 0.4rem; flex-wrap: wrap; margin-top: 0.8rem; }
  #enc-inspector .actions button { font-size: 0.82rem; padding: 0.28rem 0.7rem; }
  .enc-rule-tags { display: flex; flex-wrap: wrap; gap: .3rem; margin: .7rem 0; }
  .enc-rule-tags button { padding: .2rem .42rem; color: #8a482f; border: 1px solid #d48661; background: transparent; font: inherit; font-size: .65rem; cursor: pointer; }
  .enc-rule-tags button:hover { color: #3f281f; background: #f2c09f; }
  .enc-rules-head { position: sticky; z-index: 2; top: -.8rem; margin: -.8rem -.8rem .7rem; padding: .7rem .8rem; border-bottom: 1px solid var(--rule-strong); background: var(--paper-raised); }
  .enc-rules-head strong, .enc-rules-head span { display: block; }
  .enc-rules-head span { margin-top: .18rem; color: var(--ink-faint); font-size: .65rem; line-height: 1.35; }
  #enc-rule-search { width: 100%; margin-top: .55rem; }
  .enc-rule-section { margin: .85rem 0 1.1rem; }
  .enc-rule-section h3 { margin: 0 0 .4rem; color: var(--ink-faint); font-size: .68rem; font-variant: small-caps; text-transform: uppercase; }
  .enc-rule-entry { width: 100%; display: block; margin: 0 0 .4rem; padding: .55rem .6rem; color: var(--ink); border: 1px solid var(--rule); border-left: 3px solid var(--rule-strong); border-radius: 2px; background: var(--paper); text-align: left; cursor: pointer; }
  .enc-rule-entry.relevant { border-left-color: #d46d43; }
  .enc-rule-entry[aria-pressed="true"] { color: #3d281e; border-color: #d46d43; background: linear-gradient(135deg, #f6c49f, #e99a68); }
  .enc-rule-entry strong, .enc-rule-entry small { display: block; }
  .enc-rule-entry small { margin-top: .2rem; color: var(--ink-faint); font-size: .62rem; line-height: 1.35; }
  .enc-rule-entry[aria-pressed="true"] small { color: #674232; }
  .enc-rule-entry.focused { outline: 2px solid #e9a26f; outline-offset: 1px; }
  .enc-quick-table { margin: 0 0 .55rem; border-top: 1px solid var(--rule); }
  .enc-quick-table summary { padding: .45rem 0; cursor: pointer; font-size: .72rem; font-weight: 600; }
  .enc-quick-row { display: grid; grid-template-columns: minmax(70px, .7fr) minmax(0, 1fr); gap: .25rem .5rem; padding: .35rem 0; border-top: 1px dotted var(--rule); font-size: .65rem; }
  .enc-quick-row b { color: var(--oxblood); }
  .enc-quick-row small { grid-column: 1 / -1; color: var(--ink-faint); }
  #enc-empty-note { color: var(--ink-faint); font-style: italic; font-size: 0.84rem; }
  @media (max-width: 1150px) {
    #enc-pane-tabs { display: flex; }
    #enc-main { position: relative; display: block; }
    #enc-main > [data-enc-pane] { position: absolute; inset: 0; display: none; border: 0; }
    #enc-main[data-pane="creatures"] > [data-enc-pane="creatures"],
    #enc-main[data-pane="field"] > [data-enc-pane="field"],
    #enc-main[data-pane="inspect"] > [data-enc-pane="inspect"] { display: grid; }
    #enc-main[data-pane="creatures"] > [data-enc-pane="creatures"] { display: block; }
  }
`;
document.head.append(style);

const cssLink = document.createElement("link");
cssLink.rel = "stylesheet";
cssLink.href = "/shared/encounter-cards.css";
document.head.append(cssLink);
const explorerCss = document.createElement("link");
explorerCss.rel = "stylesheet";
explorerCss.href = "/shared/creature-explorer.css";
document.head.append(explorerCss);

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
  <nav id="enc-pane-tabs" aria-label="Encounter workspace">
    <button type="button" data-enc-pane-button="creatures" aria-selected="false">Creatures</button>
    <button type="button" data-enc-pane-button="field" aria-selected="true">Field</button>
    <button type="button" data-enc-pane-button="inspect" aria-selected="false">Details & rules</button>
  </nav>
  <div id="enc-main" data-pane="field">
    <aside id="enc-bestiary" data-enc-pane="creatures"></aside>
    <div id="enc-stage-wrap" data-enc-pane="field"><div id="enc-stage" class="enc-stage"></div></div>
    <aside id="enc-side" data-enc-pane="inspect">
      <nav id="enc-side-tabs" aria-label="Encounter reference">
        <button type="button" data-inspector-mode="details" aria-selected="true">Details</button>
        <button type="button" data-inspector-mode="rules" aria-selected="false">Rules</button>
      </nav>
      <div id="enc-inspector"></div>
      <div id="enc-rules" hidden></div>
    </aside>
  </div>`;
document.body.append(overlay);

const $ = (sel) => overlay.querySelector(sel);
const stage = $("#enc-stage");

// ---------- data ----------
async function loadStatic() {
  const [adv, party, rules, gmScreen] = await Promise.all([
    fetch("/api/adversaries").then((r) => r.json()),
    fetch("/api/party").then((r) => r.json()),
    fetch("/api/rules").then((r) => r.json()),
    fetch("/api/gm-screen").then((r) => r.json())
  ]);
  BESTIARY_SOURCES = adv.sources || [];
  const sourceNames = new Map(BESTIARY_SOURCES.map((source) => [source.id, source.name]));
  BESTIARY = (adv.adversaries || []).map((card) => ({ ...card, sourceName: sourceNames.get(card.sourceId) || "Unattributed" }));
  IDENTITIES = Array.isArray(party) ? party : [];
  RULE_NODES = prepareRuleNodes(rules);
  GM_SCREEN = gmScreen;
}

async function loadEncounters() {
  const doc = await fetch("/api/encounters").then((r) => r.json());
  encounters = doc.encounters || [];
  if (current) current = encounters.find((e) => e.id === current.id) || null;
}

async function loadProjection() {
  const state = await fetch("/api/state").then((r) => r.json());
  projectedScreen = state.screen || null;
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
  if (!creatureExplorer) {
    creatureExplorer = createCreatureExplorer({
      host: rail,
      creatures: BESTIARY,
      activeId: previewAdversaryId,
      pointCost: (creature) => `${TYPE_COST[creature.type] ?? 2} pt${creature.type === "Minion" ? "/group" : ""}`,
      onPreview: (id) => {
        previewAdversaryId = id;
        selectedEntityId = null;
        renderInspector();
        renderRules();
        renderStage();
        if (window.matchMedia("(max-width: 1150px)").matches) setCompactPane("inspect");
      },
      onAdd: summon
    });
  } else {
    creatureExplorer.update(BESTIARY, previewAdversaryId);
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
  if (window.matchMedia("(max-width: 1150px)").matches) setCompactPane("field");
  queueSave();
}

// ---------- inspector ----------
const dots = (marked, max, cls) =>
  Array.from({ length: max }, (_, i) =>
    `<span class="dot ${cls} ${i < marked ? "on harm" : ""}" data-dot-index="${i}"></span>`).join("");

const ruleById = (id) => RULE_NODES.find((node) => node.id === id) || null;

function activeRuleRefs() {
  const entity = current?.entities.find((candidate) => candidate.id === selectedEntityId);
  const block = entity?.kind === "adversary" ? adversary(entity.refId) : adversary(previewAdversaryId);
  return block?.ruleRefs || [];
}

function ruleTagsHtml(block) {
  const rules = (block?.ruleRefs || []).map(ruleById).filter(Boolean);
  return rules.length ? `<div class="enc-rule-tags" aria-label="Relevant rules">${rules.map((rule) =>
    `<button type="button" data-open-rule="${esc(rule.id)}" title="Open ${esc(rule.title)} in the rules pane">${esc(rule.title)}</button>`
  ).join("")}</div>` : "";
}

function thresholdLabel(thresholds) {
  if (!thresholds) return "—";
  return `${thresholds.major ?? "—"}/${thresholds.severe ?? "—"}`;
}

function attackLabel(modifier) {
  return typeof modifier === "number" && modifier >= 0 ? `+${modifier}` : String(modifier ?? "—");
}

function sourceLabel(block) {
  const source = BESTIARY_SOURCES.find((entry) => entry.id === block.sourceId);
  if (!source) return "Unattributed card";
  return source.author ? `${source.name} · ${source.author}` : source.name;
}

function statBlockHtml(block) {
  return `
    <h2>${esc(block.name)}</h2>
    <div class="muted">Tier ${block.tier} ${esc(block.typeDetail || block.type)} · ${esc(block.front || "")}</div>
    <div class="provenance">${esc(sourceLabel(block))}</div>
    <p style="font-size:0.83rem; line-height:1.45;">${esc(block.description)}</p>
    <div class="muted" style="font-style:italic;">${esc(block.motives)}</div>
    <div class="statline">
      <div class="s"><b>${block.difficulty}</b><span>Difficulty</span></div>
      <div class="s"><b>${esc(thresholdLabel(block.thresholds))}</b><span>Thresholds</span></div>
      <div class="s"><b>${esc(attackLabel(block.atk))}</b><span>ATK</span></div>
    </div>
    <div style="font-size:0.84rem;"><b>${esc(block.weapon.name)}</b> · ${esc(block.weapon.range)} · ${esc(block.weapon.damage)}</div>
    ${block.experiences?.length ? `<div class="muted" style="margin-top:0.25rem;">${block.experiences.map((e) => `${esc(e.name)} +${e.bonus}`).join(", ")}</div>` : ""}
    ${ruleTagsHtml(block)}
    ${block.features.map((f) => `
      <div class="feature"><b>${esc(f.name)}</b> — <span class="muted">${esc(f.kind)}${f.timing ? ` · ${esc(f.timing)}` : ""}</span>${f.cost ? ` <span class="cost">· spend a ${esc(f.cost)}</span>` : ""}<br>${esc(f.text)}</div>`).join("")}`;
}

function renderInspector() {
  const panel = $("#enc-inspector");
  const entity = current?.entities.find((e) => e.id === selectedEntityId);

  if (!entity && previewAdversaryId) {
    const block = adversary(previewAdversaryId);
    panel.innerHTML = block ? `${statBlockHtml(block)}
      <div class="actions"><button data-act="summon">Add to the encounter</button></div>` : "";
    panel.querySelector("[data-act=summon]")?.addEventListener("click", () => summon(previewAdversaryId));
    wireInspectorRuleTags(panel);
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
  wireInspectorRuleTags(panel);
}

function wireInspectorRuleTags(panel) {
  for (const button of panel.querySelectorAll("[data-open-rule]")) {
    button.addEventListener("click", () => {
      focusedRuleId = button.dataset.openRule;
      setInspectorMode("rules");
      renderRules();
      requestAnimationFrame(() => $("#enc-rules .enc-rule-entry.focused")?.scrollIntoView({ block: "nearest" }));
    });
  }
}

function setInspectorMode(mode) {
  inspectorMode = mode === "rules" ? "rules" : "details";
  $("#enc-inspector").hidden = inspectorMode !== "details";
  $("#enc-rules").hidden = inspectorMode !== "rules";
  for (const button of overlay.querySelectorAll("[data-inspector-mode]")) {
    button.setAttribute("aria-selected", String(button.dataset.inspectorMode === inspectorMode));
  }
}

function setCompactPane(pane) {
  const selected = ["creatures", "field", "inspect"].includes(pane) ? pane : "field";
  $("#enc-main").dataset.pane = selected;
  for (const button of overlay.querySelectorAll("[data-enc-pane-button]")) {
    button.setAttribute("aria-selected", String(button.dataset.encPaneButton === selected));
  }
  if (selected === "field") requestAnimationFrame(renderStage);
}

function ruleEntryHtml(rule, relevantIds) {
  const relevant = relevantIds.has(rule.id);
  const projected = projectedScreen?.type === "rule" && projectedScreen.refId === rule.id;
  return `<button type="button" class="enc-rule-entry${relevant ? " relevant" : ""}${focusedRuleId === rule.id ? " focused" : ""}"
    data-project-rule="${esc(rule.id)}" aria-pressed="${projected}">
    <strong>${esc(rule.title)}</strong>
    <small>${esc(rule.body)}</small>
  </button>`;
}

function screenPayload(screen) {
  if (!screen?.type) return { type: null };
  return {
    type: screen.type,
    refId: screen.refId || null,
    url: screen.url || null,
    caption: screen.caption || "",
    title: screen.title || "",
    body: screen.body || ""
  };
}

async function setProjectedScreen(payload) {
  const response = await fetch("/api/screen", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
  if (!response.ok) return false;
  const result = await response.json();
  projectedScreen = result.current || null;
  projectedId = projectedScreen?.type === "encounter" ? projectedScreen.refId : null;
  renderHeader();
  updateRuleProjectionState();
  return true;
}

function updateRuleProjectionState() {
  for (const button of overlay.querySelectorAll("[data-project-rule]")) {
    button.setAttribute("aria-pressed", String(projectedScreen?.type === "rule" && projectedScreen.refId === button.dataset.projectRule));
  }
}

async function toggleRuleProjection(ruleId) {
  const alreadyShowing = projectedScreen?.type === "rule" && projectedScreen.refId === ruleId;
  await setProjectedScreen(alreadyShowing ? { type: null } : { type: "rule", refId: ruleId });
}

function wireRuleProjection(button) {
  let press = null;
  const restore = async (active) => {
    if (!active || active.restored) return;
    active.restored = true;
    await active.projecting;
    await setProjectedScreen(active.prior);
  };

  button.addEventListener("pointerdown", (event) => {
    if (event.button !== 0) return;
    press = { prior: screenPayload(projectedScreen), temporary: false, released: false, restored: false, projecting: Promise.resolve() };
    try { button.setPointerCapture(event.pointerId); } catch { /* pointer capture is optional */ }
    press.timer = setTimeout(() => {
      if (!press) return;
      press.temporary = true;
      press.projecting = setProjectedScreen({ type: "rule", refId: button.dataset.projectRule });
      if (press.released) restore(press);
    }, 360);
  });
  button.addEventListener("pointerup", () => {
    const active = press;
    press = null;
    if (!active) return;
    active.released = true;
    clearTimeout(active.timer);
    if (active.temporary) restore(active);
    else toggleRuleProjection(button.dataset.projectRule);
  });
  button.addEventListener("pointercancel", () => {
    const active = press;
    press = null;
    if (!active) return;
    active.released = true;
    clearTimeout(active.timer);
    if (active.temporary) restore(active);
  });
  button.addEventListener("click", (event) => {
    event.preventDefault();
    if (event.detail === 0) toggleRuleProjection(button.dataset.projectRule);
  });
}

function renderRules() {
  const panel = $("#enc-rules");
  const previousQuery = panel.querySelector("#enc-rule-search")?.value || "";
  const relevantIds = new Set(activeRuleRefs());
  const relevant = [...relevantIds].map(ruleById).filter(Boolean);
  const commonIds = ["spotlight", "action-roll-outcomes", "attack-rolls", "damage-rolls", "damage-thresholds", "movement-under-pressure", "conditions", "fear", "quick-rulings"];
  const queryMatches = previousQuery ? searchRuleNodes(RULE_NODES, previousQuery).slice(0, 16) : [];
  const common = commonIds.map(ruleById).filter((rule) => rule && !relevantIds.has(rule.id));
  const quickTables = (GM_SCREEN.sections || []).map((section) => `<details class="enc-quick-table">
    <summary>${esc(section.title)}</summary>
    ${(section.rows || []).map((row) => `<div class="enc-quick-row"><span>${esc(row.label)}</span><b>${esc(row.value)}</b>${row.note ? `<small>${esc(row.note)}</small>` : ""}</div>`).join("")}
  </details>`).join("");

  panel.innerHTML = `<div class="enc-rules-head"><strong>Rules at hand</strong><span>Click to toggle on the projector. Hold to show only while pressed.</span>
      <input type="search" id="enc-rule-search" value="${esc(previousQuery)}" placeholder="Search rules" aria-label="Search combat rules"></div>
    ${relevant.length ? `<section class="enc-rule-section"><h3>Relevant to this creature</h3>${relevant.map((rule) => ruleEntryHtml(rule, relevantIds)).join("")}</section>` : ""}
    ${previousQuery ? `<section class="enc-rule-section"><h3>Search results</h3>${queryMatches.length ? queryMatches.map((rule) => ruleEntryHtml(rule, relevantIds)).join("") : `<p id="enc-empty-note">No matching rule.</p>`}</section>`
      : `<section class="enc-rule-section"><h3>Combat essentials</h3>${common.map((rule) => ruleEntryHtml(rule, relevantIds)).join("")}</section>`}
    <section class="enc-rule-section"><h3>Quick tables</h3>${quickTables}</section>`;

  const search = panel.querySelector("#enc-rule-search");
  search.addEventListener("input", () => {
    const cursor = search.selectionStart;
    renderRules();
    const next = panel.querySelector("#enc-rule-search");
    next.focus({ preventScroll: true });
    next.setSelectionRange(cursor, cursor);
  });
  for (const button of panel.querySelectorAll("[data-project-rule]")) wireRuleProjection(button);
  focusedRuleId = null;
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
  renderRules();
}

// ---------- wiring ----------
$("#enc-close").addEventListener("click", () => setOpen(false));
for (const button of overlay.querySelectorAll("[data-enc-pane-button]")) {
  button.addEventListener("click", () => setCompactPane(button.dataset.encPaneButton));
}
for (const button of overlay.querySelectorAll("[data-inspector-mode]")) {
  button.addEventListener("click", () => setInspectorMode(button.dataset.inspectorMode));
}
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
  await setProjectedScreen(projected ? { type: null } : { type: "encounter", refId: current.id });
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
    if (overlayOpen) {
      renderHeader();
      updateRuleProjectionState();
    }
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
    setCompactPane("field");
    setInspectorMode(inspectorMode);
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
if (new URLSearchParams(location.search).get("tool") === "encounter") setOpen(true);
