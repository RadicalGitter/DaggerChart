// GM Console. Renders from /api/state; every mutation round-trips the server.
import { CONDITIONS, conditionIcon } from "/shared/conditions.js";
import { prepareRuleNodes, searchRuleNodes } from "/shared/rules-search.js";
import { folkPortraitGridHtml, wireFolkPortraitCards } from "/shared/folk-cards.js";

let S = null; // last fetched gm state
let selectedBuilding = null;
let CONSUMABLES = [];
let FEEDBACK = [];
let TELEMETRY = { pages: {} };
let ART_STATUS = { workflows: { portrait: { ready: false, reason: "missing" }, scenic: { ready: false, reason: "missing" } } };
let ART_LIBRARY = { dimensions: { width: 1536, height: 864, aspect: "16:9" }, taxonomy: { rootIds: [], tags: [] }, characters: [], places: [], scenes: [] };
let selectedUxRoute = null;
let imageLibraryView = "characters";
let selectedFolkId = null;

const FOLK_AGE_BANDS = [
  ["unknown", "Unknown"], ["child", "Child"], ["young", "Young"], ["adult", "Adult"],
  ["middle-aged", "Middle-aged"], ["elder", "Elder"], ["ancient", "Ancient"]
];
const FOLK_CONNECTION_KINDS = ["family", "partner", "friend", "mentor", "student", "ally", "rival", "obligation", "other"];
const FOLK_EXPERIENCE_PRESETS = ["Known loss", "Military service", "Long journey", "Practiced craft", "Hardship endured", "Led others", "Life in exile", "Formal study", "Raised a family"];

const artEmbellishKey = (kind) => `settlement-art-embellish-${kind}`;
const artEmbellishPreference = (kind) => localStorage.getItem(artEmbellishKey(kind)) !== "false";
const rememberArtEmbellish = (kind, enabled) => localStorage.setItem(artEmbellishKey(kind), String(enabled));

function storedScenePins() {
  try {
    const pins = JSON.parse(localStorage.getItem("settlement-scene-pins") || "[]");
    return Array.isArray(pins) ? pins.filter((pin) => pin?.id && pin?.label) : [];
  } catch {
    return [];
  }
}

const sceneTagState = {
  route: [],
  explicit: new Set(),
  excluded: new Set(),
  pins: storedScenePins(),
  clickTimer: null
};

const $ = (sel) => document.querySelector(sel);
const esc = (s) =>
  String(s ?? "").replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

function toast(msg, grave = false) {
  const t = $("#toast");
  t.textContent = msg;
  t.style.background = grave ? "var(--grave)" : "var(--ink)";
  t.classList.add("show");
  clearTimeout(t._h);
  t._h = setTimeout(() => t.classList.remove("show"), 3500);
}

async function api(path, opts = {}) {
  const res = await fetch(path, {
    headers: { "Content-Type": "application/json" },
    ...opts,
    body: opts.body ? JSON.stringify(opts.body) : undefined
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Something went wrong.");
  return data;
}

async function refresh() {
  const [nextState, items, feedback, telemetry, artStatus, artLibrary] = await Promise.all([
    api("/api/state"),
    api("/api/items/consumables"),
    api("/api/feedback"),
    api("/api/telemetry").catch(() => ({ pages: {} })),
    api("/api/art/status").catch(() => ART_STATUS),
    api("/api/art/library").catch(() => ART_LIBRARY)
  ]);
  S = nextState;
  CONSUMABLES = items;
  FEEDBACK = feedback;
  TELEMETRY = telemetry;
  ART_STATUS = artStatus;
  ART_LIBRARY = artLibrary;
  renderNav();
  renderDowntimePicker();
  renderStores();
  renderBuildings();
  renderFolk();
  renderPeople();
  renderPlaces();
  renderImageLibrary();
  renderParty();
  renderSessions();
  renderLedger();
  renderCampaigns();
  renderTown();
  renderScreen();
  renderFeedback();
  renderUx();
}

function renderFeedback() {
  const grid = $("#feedback-grid");
  if (!grid) return;
  grid.innerHTML = FEEDBACK.length ? FEEDBACK.map((ticket) => `<article class="card feedback-ticket">
    <img src="${ticket.screenshot}" alt="Annotated screenshot for ${esc(ticket.id)}">
    <div class="feedback-meta">${esc(ticket.reporter?.name || "Unseated player")} · ${esc(ticket.sourceUrl)} · ${ticket.viewport?.width || 0}×${ticket.viewport?.height || 0} · ${esc(new Date(ticket.createdAt).toLocaleString())}</div>
    <p>${esc(ticket.text)}</p>
    <div class="formrow"><label>Status</label><select data-feedback-status="${esc(ticket.id)}"><option value="open" ${ticket.status === "open" ? "selected" : ""}>Open</option><option value="triaged" ${ticket.status === "triaged" ? "selected" : ""}>Triaged</option><option value="resolved" ${ticket.status === "resolved" ? "selected" : ""}>Resolved</option><option value="wont-fix" ${ticket.status === "wont-fix" ? "selected" : ""}>Won't fix</option></select></div>
    <div class="formrow"><label>Cluster</label><input data-feedback-cluster="${esc(ticket.id)}" value="${esc(ticket.cluster || "")}" placeholder="shared issue or theme"></div>
    <label class="muted">Agent notes<textarea data-feedback-notes="${esc(ticket.id)}" rows="4">${esc(ticket.agentNotes || "")}</textarea></label>
    <button class="quiet" type="button" data-feedback-save="${esc(ticket.id)}">Save triage</button>
  </article>`).join("") : `<p class="muted">No playtest tickets yet.</p>`;
  for (const button of document.querySelectorAll("[data-feedback-save]")) button.onclick = async () => {
    const id = button.dataset.feedbackSave;
    try {
      await api(`/api/feedback/${encodeURIComponent(id)}`, { method: "PUT", body: {
        status: document.querySelector(`[data-feedback-status="${CSS.escape(id)}"]`).value,
        cluster: document.querySelector(`[data-feedback-cluster="${CSS.escape(id)}"]`).value,
        agentNotes: document.querySelector(`[data-feedback-notes="${CSS.escape(id)}"]`).value
      } });
      toast("Ticket triage saved.");
      await refresh();
    } catch (error) { toast(error.message, true); }
  };
}

// --- local playtest UX evidence ---
const UX_SURFACE_NAMES = {
  "/login": "Character selection",
  "/player": "Player root",
  "/table": "Card table",
  "/table-book": "Folio",
  "/tome": "Leatherbound tome",
  "/create": "Character creation",
  "/character/:id": "Character sheet",
  "/journal": "Journal",
  "/music": "Music desk"
};

function uxSurfaceName(path) {
  const embedded = path.endsWith("@embed");
  const base = path.replace(/@embed$/, "");
  return `${UX_SURFACE_NAMES[base] || base}${embedded ? " (embedded)" : ""}`;
}

function durationLabel(ms = 0) {
  if (ms < 60_000) return `${Math.round(ms / 1_000)}s`;
  if (ms < 3_600_000) return `${Math.round(ms / 60_000)}m`;
  return `${(ms / 3_600_000).toFixed(ms < 36_000_000 ? 1 : 0)}h`;
}

function percent(part = 0, total = 0) {
  return total > 0 ? Math.round(part / total * 100) : 0;
}

function uxMetric(entry, viewport) {
  if (!entry) return {};
  return viewport === "all" ? entry : (entry.viewports?.[viewport] || {});
}

function uxRow(label, width, value, { dead = false, code = false } = {}) {
  const safeLabel = esc(label);
  return `<div class="ux-metric-row${dead ? " dead-row" : ""}">
    ${code ? `<code title="${safeLabel}">${safeLabel}</code>` : `<span>${safeLabel}</span>`}
    <span class="ux-bar" aria-hidden="true"><i style="--value:${Math.max(0, Math.min(100, width))}%"></i></span>
    <span class="ux-metric-value">${esc(value)}</span>
  </div>`;
}

function drawUxMap(page, viewport, deadOnly) {
  const canvas = $("#ux-canvas");
  if (!canvas || $("#sec-ux").hidden) return;
  const rect = canvas.getBoundingClientRect();
  if (rect.width < 10 || rect.height < 10) return;
  const ratio = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = Math.round(rect.width * ratio);
  canvas.height = Math.round(rect.height * ratio);
  const context = canvas.getContext("2d");
  context.setTransform(ratio, 0, 0, ratio, 0, 0);

  const width = rect.width;
  const height = rect.height;
  const inset = Math.max(16, width * .035);
  const top = inset + 22;
  const innerWidth = width - inset * 2;
  const innerHeight = height - top - inset;
  context.fillStyle = "#faf5ea";
  context.fillRect(0, 0, width, height);
  context.strokeStyle = "#b8ab8f";
  context.lineWidth = 1;
  context.strokeRect(inset, inset, innerWidth, height - inset * 2);
  context.beginPath();
  context.moveTo(inset, top);
  context.lineTo(width - inset, top);
  context.stroke();
  for (let i = 0; i < 3; i += 1) {
    context.beginPath();
    context.fillStyle = i === 0 ? "#9a5a49" : i === 1 ? "#b89b58" : "#68784d";
    context.arc(inset + 11 + i * 14, inset + 11, 3, 0, Math.PI * 2);
    context.fill();
  }

  const points = (page?.points || []).filter((point) =>
    (viewport === "all" || point.viewport === viewport) && (!deadOnly || point.dead));
  for (const point of points) {
    const x = inset + Math.max(0, Math.min(1, point.x)) * innerWidth;
    const y = top + Math.max(0, Math.min(1, point.y)) * innerHeight;
    const radius = point.dead ? Math.max(22, width * .036) : Math.max(17, width * .028);
    const color = point.dead ? [145, 52, 38] : [72, 106, 73];
    const gradient = context.createRadialGradient(x, y, 1, x, y, radius);
    gradient.addColorStop(0, `rgba(${color.join(",")},.34)`);
    gradient.addColorStop(.35, `rgba(${color.join(",")},.18)`);
    gradient.addColorStop(1, `rgba(${color.join(",")},0)`);
    context.fillStyle = gradient;
    context.fillRect(x - radius, y - radius, radius * 2, radius * 2);
  }

  if (!points.length) {
    context.fillStyle = "#8a7f6b";
    context.font = "italic 15px Georgia, serif";
    context.textAlign = "center";
    context.fillText(page ? "No clicks match this filter yet." : "Player activity will gather here.", width / 2, height / 2);
  }
}

function renderUx() {
  const routeSelect = $("#ux-route");
  if (!routeSelect) return;
  const pages = Object.values(TELEMETRY?.pages || {}).sort((a, b) =>
    (b.sessions || 0) - (a.sessions || 0) || a.path.localeCompare(b.path));
  if (!selectedUxRoute || !TELEMETRY.pages?.[selectedUxRoute]) selectedUxRoute = pages[0]?.path || null;
  routeSelect.disabled = pages.length === 0;
  routeSelect.innerHTML = pages.length
    ? pages.map((page) => `<option value="${esc(page.path)}" ${page.path === selectedUxRoute ? "selected" : ""}>${esc(uxSurfaceName(page.path))}</option>`).join("")
    : `<option>No player activity yet</option>`;

  const viewport = $("#ux-viewport").value;
  const deadOnly = $("#ux-dead-only").checked;
  const page = selectedUxRoute ? TELEMETRY.pages?.[selectedUxRoute] : null;
  const stats = uxMetric(page, viewport);
  const deadRate = percent(stats.deadClicks, stats.clicks);
  $("#ux-summary").innerHTML = `
    <div class="ux-stat"><strong>${stats.sessions || 0}</strong><span>sessions</span></div>
    <div class="ux-stat"><strong>${durationLabel(stats.activeMs || 0)}</strong><span>active time</span></div>
    <div class="ux-stat"><strong>${stats.clicks || 0}</strong><span>clicks</span></div>
    <div class="ux-stat"><strong>${deadRate}%</strong><span>dead candidates</span></div>`;

  const viewportEntries = ["mobile", "tablet", "desktop"].map((key) => [key, page?.viewports?.[key] || {}]);
  const maxViewportTime = Math.max(1, ...viewportEntries.map(([, entry]) => entry.activeMs || 0));
  $("#ux-viewports").innerHTML = page
    ? viewportEntries.map(([key, entry]) => uxRow(key[0].toUpperCase() + key.slice(1), (entry.activeMs || 0) / maxViewportTime * 100, `${durationLabel(entry.activeMs || 0)} / ${entry.sessions || 0}`)).join("")
    : `<div class="ux-empty">No visits recorded.</div>`;

  const modes = Object.entries(page?.modes || {})
    .map(([name, entry]) => [name, uxMetric(entry, viewport)])
    .filter(([, entry]) => (entry.entries || 0) + (entry.activeMs || 0) + (entry.clicks || 0) > 0)
    .sort((a, b) => (b[1].activeMs || 0) - (a[1].activeMs || 0) || (b[1].clicks || 0) - (a[1].clicks || 0))
    .slice(0, 10);
  const maxModeTime = Math.max(1, ...modes.map(([, entry]) => entry.activeMs || entry.clicks || 0));
  $("#ux-modes").innerHTML = modes.length
    ? modes.map(([name, entry]) => uxRow(name, (entry.activeMs || entry.clicks || 0) / maxModeTime * 100, `${durationLabel(entry.activeMs || 0)} / ${entry.clicks || 0}`, { code: true })).join("")
    : `<div class="ux-empty">No mode time recorded.</div>`;

  const targets = Object.entries(page?.targets || {})
    .map(([name, entry]) => [name, uxMetric(entry, viewport)])
    .filter(([, entry]) => (entry.deadClicks || 0) > 0)
    .sort((a, b) => (b[1].deadClicks || 0) - (a[1].deadClicks || 0) || (b[1].clicks || 0) - (a[1].clicks || 0))
    .slice(0, 10);
  const maxDead = Math.max(1, ...targets.map(([, entry]) => entry.deadClicks || 0));
  $("#ux-targets").innerHTML = targets.length
    ? targets.map(([name, entry]) => uxRow(name, (entry.deadClicks || 0) / maxDead * 100, `${entry.deadClicks || 0} / ${entry.clicks || 0}`, { dead: true, code: true })).join("")
    : `<div class="ux-empty">No dead-click candidates.</div>`;

  requestAnimationFrame(() => drawUxMap(page, viewport, deadOnly));
}

// --- the table screen ---
async function project(body) {
  try {
    await api("/api/screen", { method: "PUT", body });
    toast(body.type === null ? "Screen darkened." : "Shown on screen.");
    await refresh();
  } catch (e) {
    toast(e.message, true);
  }
}

function describeScreen(cur) {
  if (!cur) return "settlement title";
  switch (cur.type) {
    case "image": return `an image${cur.caption ? ` — “${cur.caption}”` : ""}`;
    case "text": return `words${cur.title ? ` — “${cur.title}”` : ""}`;
    case "paper": return "a carried paper";
    case "stores": return "the stores";
    case "buildings": return "the buildings";
    case "folk": return `${S.characters.find((c) => c.id === cur.refId)?.name ?? "someone"} (folk)`;
    case "person": return `${(S.people || []).find((p) => p.id === cur.refId)?.name ?? "someone"} (person)`;
    case "place": return `${(S.places || []).find((p) => p.id === cur.refId)?.name ?? "somewhere"} (place)`;
    default: return cur.type;
  }
}

function renderScreen() {
  $("#screen-now").textContent = describeScreen(S.screen);
}

$("#screen-clear").addEventListener("click", () => project({ type: null }));
$("#screen-img-show").addEventListener("click", () =>
  project({ type: "image", url: $("#screen-img-url").value, caption: $("#screen-img-cap").value }));
$("#screen-txt-show").addEventListener("click", () =>
  project({ type: "text", title: $("#screen-txt-title").value, body: $("#screen-txt-body").value }));
$("#screen-stores").addEventListener("click", () => project({ type: "stores" }));
$("#screen-buildings").addEventListener("click", () => project({ type: "buildings" }));

// --- nav ---
function renderNav() {
  $("#nav-name").textContent = S.settlement.name;
  $("#nav-season").textContent = S.settlement.seasonLabel;
  $("#ledger-season").textContent = S.settlement.seasonLabel;
}

function showSection(key) {
  for (const a of document.querySelectorAll("nav a[data-nav]")) {
    a.classList.toggle("active", a.dataset.nav === key);
  }
  for (const sec of document.querySelectorAll("main > section")) {
    sec.hidden = sec.id !== `sec-${key === "town" ? "town" : key}`;
  }
  document.body.classList.toggle("images-open", key === "images");
  document.body.classList.toggle("folk-open", key === "folk");
  document.body.classList.toggle("board-open", key === "board");
  document.body.classList.toggle("music-open", key === "music");
  if (key === "music") {
    requestAnimationFrame(() => {
      document.querySelector(".gm-music-frame")?.contentWindow?.postMessage(
        { type: "settlement:music-visible" },
        location.origin
      );
    });
  }
  if (key === "ux") requestAnimationFrame(renderUx);
  if (key === "almanac") setAlmanacView(almanacView);
  if (key === "images") requestAnimationFrame(renderImageLibrary);
}

function artHint(kind) {
  const workflow = ART_STATUS.workflows?.[kind];
  if (workflow?.ready) return `${workflow.file} is ready.`;
  if (workflow?.reason === "missing") return `Awaiting ${workflow.file || `${kind}-api-workflow.json`}.`;
  if (workflow?.reason === "prompt-token-missing") return `Add {{prompt}} to ${workflow.file}.`;
  return workflow?.reason || "The API workflow needs attention.";
}

// --- image library and scenery tag board ---
function sceneTags() {
  return Array.isArray(ART_LIBRARY.taxonomy?.tags) ? ART_LIBRARY.taxonomy.tags : [];
}

function sceneTagMap() {
  return new Map(sceneTags().map((tag) => [tag.id, tag]));
}

function directSceneChildren(id, tagsById = sceneTagMap()) {
  const tag = tagsById.get(id);
  return (tag?.groups || []).flatMap((group) => group.ids || []);
}

function sceneDescendants(id, tagsById = sceneTagMap()) {
  return directSceneChildren(id, tagsById).flatMap((childId) => [childId, ...sceneDescendants(childId, tagsById)]);
}

function effectiveSceneTagIds() {
  const tagsById = sceneTagMap();
  const effective = new Set();
  const visit = (id, blocked = false) => {
    const nextBlocked = blocked || sceneTagState.excluded.has(id);
    if (!nextBlocked) effective.add(id);
    for (const childId of directSceneChildren(id, tagsById)) visit(childId, nextBlocked);
  };
  for (const id of sceneTagState.explicit) {
    if (tagsById.has(id)) visit(id);
  }
  return sceneTags().map((tag) => tag.id).filter((id) => effective.has(id));
}

function sceneTagSelectionState(id) {
  if (sceneTagState.explicit.has(id)) return "explicit";
  if (sceneTagState.excluded.has(id)) return "excluded";
  return effectiveSceneTagIds().includes(id) ? "inherited" : "";
}

function compiledSceneDirection() {
  const tagsById = sceneTagMap();
  const authored = effectiveSceneTagIds().map((id) => tagsById.get(id)?.payload).filter(Boolean);
  const customPins = new Map(sceneTagState.pins.filter((pin) => !pin.authored).map((pin) => [pin.id, pin]));
  const custom = [...sceneTagState.explicit].map((id) => customPins.get(id)?.payload).filter(Boolean);
  return [...authored, ...custom].join("; ");
}

function syncSceneDirection() {
  const field = $("#scene-tag-direction");
  if (field) field.value = compiledSceneDirection();
}

function toggleSceneTag(id) {
  const tagsById = sceneTagMap();
  const state = sceneTagSelectionState(id);
  if (state === "explicit") {
    sceneTagState.explicit.delete(id);
    if (tagsById.has(id)) {
      const branch = new Set([id, ...sceneDescendants(id, tagsById)]);
      for (const excludedId of [...sceneTagState.excluded]) {
        if (branch.has(excludedId)) sceneTagState.excluded.delete(excludedId);
      }
    }
  } else if (state === "inherited") {
    sceneTagState.excluded.add(id);
  } else if (state === "excluded") {
    sceneTagState.excluded.delete(id);
  } else {
    sceneTagState.explicit.add(id);
    sceneTagState.excluded.delete(id);
  }
  syncSceneDirection();
  renderSceneTagBoard();
}

function sceneTagPath(id) {
  const tagsById = sceneTagMap();
  const path = [];
  let cursor = tagsById.get(id);
  while (cursor) {
    path.unshift(cursor.id);
    cursor = cursor.parentId ? tagsById.get(cursor.parentId) : null;
  }
  return path;
}

function openSceneTag(id) {
  if (!sceneTagMap().has(id)) return;
  sceneTagState.route = sceneTagPath(id);
  renderSceneTagBoard("forward");
}

function sceneTagBack() {
  if (!sceneTagState.route.length) return;
  sceneTagState.route.pop();
  renderSceneTagBoard("back");
}

function sceneTagBubble(tag, current = false) {
  const state = current ? "current" : sceneTagSelectionState(tag.id);
  const stateLabel = current ? "return" : state === "explicit" ? "chosen" : state === "inherited" ? "included" : state === "excluded" ? "left out" : "";
  return `<button type="button" class="scene-tag-bubble ${state}" data-scene-tag="${esc(tag.id)}" ${current ? "data-scene-current=\"true\"" : ""} aria-pressed="${state === "explicit" || state === "inherited"}">${esc(tag.label)}${stateLabel ? `<small>${esc(stateLabel)}</small>` : ""}</button>`;
}

function wireSceneTagButtons(root) {
  for (const button of root.querySelectorAll("[data-scene-tag]")) {
    const id = button.dataset.sceneTag;
    if (button.dataset.sceneCurrent) {
      button.onclick = sceneTagBack;
      continue;
    }
    button.onclick = () => {
      clearTimeout(sceneTagState.clickTimer);
      sceneTagState.clickTimer = setTimeout(() => toggleSceneTag(id), 230);
    };
    button.ondblclick = (event) => {
      event.preventDefault();
      clearTimeout(sceneTagState.clickTimer);
      openSceneTag(id);
    };
  }
}

function saveScenePins() {
  localStorage.setItem("settlement-scene-pins", JSON.stringify(sceneTagState.pins));
}

function renderScenePins() {
  const root = $("#scene-tag-pins");
  if (!root) return;
  root.innerHTML = sceneTagState.pins.length
    ? sceneTagState.pins.map((pin) => `<span class="scene-pin-wrap"><button type="button" class="scene-pin ${sceneTagState.explicit.has(pin.id) ? "selected" : ""}" data-scene-pin="${esc(pin.id)}">${esc(pin.label)}</button><button type="button" class="scene-pin-remove" data-scene-pin-remove="${esc(pin.id)}" aria-label="Remove ${esc(pin.label)}" title="Remove pin">×</button></span>`).join("")
    : `<span class="muted" style="font-size:.72rem;">No pinned directions.</span>`;
  for (const button of root.querySelectorAll("[data-scene-pin]")) {
    const pin = sceneTagState.pins.find((entry) => entry.id === button.dataset.scenePin);
    button.onclick = () => {
      clearTimeout(sceneTagState.clickTimer);
      sceneTagState.clickTimer = setTimeout(() => toggleSceneTag(pin.id), 230);
    };
    button.ondblclick = (event) => {
      event.preventDefault();
      clearTimeout(sceneTagState.clickTimer);
      if (pin.authored) openSceneTag(pin.id);
    };
  }
  for (const button of root.querySelectorAll("[data-scene-pin-remove]")) {
    button.onclick = () => {
      sceneTagState.pins = sceneTagState.pins.filter((pin) => pin.id !== button.dataset.scenePinRemove);
      sceneTagState.explicit.delete(button.dataset.scenePinRemove);
      saveScenePins();
      syncSceneDirection();
      renderSceneTagBoard();
    };
  }
}

function addScenePin() {
  const field = $("#scene-tag-pin-input");
  const label = field.value.trim();
  if (!label) return;
  const authored = sceneTags().find((tag) => tag.label.toLocaleLowerCase("en") === label.toLocaleLowerCase("en"));
  const slug = label.toLocaleLowerCase("en").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 48) || "direction";
  const pin = authored
    ? { id: authored.id, label: authored.label, payload: authored.payload, authored: true }
    : { id: `scene-pin-${slug}-${Date.now().toString(36)}`, label, payload: label, authored: false };
  if (!sceneTagState.pins.some((entry) => entry.id === pin.id || entry.label.toLocaleLowerCase("en") === pin.label.toLocaleLowerCase("en"))) {
    sceneTagState.pins.push(pin);
    saveScenePins();
  }
  field.value = "";
  renderScenePins();
}

function renderSceneTagBoard(animation = "") {
  const stage = $("#scene-tag-stage");
  if (!stage) return;
  const tagsById = sceneTagMap();
  sceneTagState.route = sceneTagState.route.filter((id) => tagsById.has(id));
  const currentId = sceneTagState.route.at(-1);
  const current = currentId ? tagsById.get(currentId) : null;
  $("#scene-tag-route").textContent = current
    ? sceneTagState.route.map((id) => tagsById.get(id)?.label).filter(Boolean).join(" / ")
    : "Start";
  if (!sceneTags().length) {
    stage.innerHTML = `<p class="scene-tag-empty">The direction index is unavailable.</p>`;
  } else if (!current) {
    const roots = ART_LIBRARY.taxonomy.rootIds.map((id) => tagsById.get(id)).filter(Boolean);
    stage.innerHTML = `<div class="scene-root-grid">${roots.map((tag) => sceneTagBubble(tag)).join("")}</div>`;
  } else if (!current.groups?.length) {
    stage.innerHTML = `<div class="scene-current-tag">${sceneTagBubble(current, true)}</div><p class="scene-tag-empty">No finer branches have been written for this direction.</p>`;
  } else {
    stage.innerHTML = current.groups.map((group, index) => {
      const row = (group.ids || []).map((id) => tagsById.get(id)).filter(Boolean).map((tag) => sceneTagBubble(tag)).join("");
      const currentBubble = index === 0 ? `<div class="scene-current-tag">${sceneTagBubble(current, true)}</div>` : "";
      return `<div class="scene-tag-group"><h5>${esc(group.label)}</h5><div class="scene-tag-row">${row}</div></div>${currentBubble}`;
    }).join("");
  }
  stage.classList.remove("is-forward", "is-back");
  if (animation) {
    void stage.offsetWidth;
    stage.classList.add(animation === "back" ? "is-back" : "is-forward");
  }
  wireSceneTagButtons(stage);
  renderScenePins();
  $("#scene-tag-back").disabled = sceneTagState.route.length === 0;
  $("#scene-tag-start").disabled = sceneTagState.route.length === 0;
}

function setImageLibraryView(view) {
  imageLibraryView = view === "scenery" ? "scenery" : "characters";
  document.querySelectorAll("[data-image-view]").forEach((button) => {
    const active = button.dataset.imageView === imageLibraryView;
    button.classList.toggle("active", active);
    button.setAttribute("aria-selected", String(active));
  });
  document.querySelectorAll("[data-image-pane]").forEach((pane) => {
    pane.hidden = pane.dataset.imagePane !== imageLibraryView;
  });
}

function openPlaceFromLibrary(placeId) {
  const place = (S.places || []).find((entry) => entry.id === placeId);
  if (!place) return toast("That location is no longer available.", true);
  location.hash = "places";
  showSection("places");
  renderPlaceEditor(place);
  requestAnimationFrame(() => $("#places-editor")?.scrollIntoView({ behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "start" }));
}

function updateSceneSublocations() {
  const placeId = $("#scene-place")?.value;
  const names = [...new Set((ART_LIBRARY.scenes || []).filter((scene) => scene.placeId === placeId && scene.sublocation).map((scene) => scene.sublocation))].sort((a, b) => a.localeCompare(b));
  $("#scene-sublocations").innerHTML = names.map((name) => `<option value="${esc(name)}"></option>`).join("");
}

function renderCharacterImages() {
  const characters = (ART_LIBRARY.characters || []).filter((character) => character.portrait);
  $("#image-character-count").textContent = `${characters.length} active portrait${characters.length === 1 ? "" : "s"}`;
  $("#image-character-grid").innerHTML = characters.length ? characters.map((character) => `<article class="image-character-card">
    <figure><img src="${esc(character.portrait)}" alt="Portrait of ${esc(character.name)}"></figure>
    <div class="image-card-copy">
      <h3>${esc(character.name)}</h3>
      <p>${[character.ancestry, character.class, character.subclass, character.player].filter(Boolean).map(esc).join(" · ")}</p>
      <div class="image-card-actions"><button type="button" class="quiet" data-character-image="${esc(character.id)}">Show at the table</button><a class="sheet-link" href="/character/${encodeURIComponent(character.id)}">Open sheet</a></div>
    </div>
  </article>`).join("") : `<p class="muted">No active character has chosen a portrait yet.</p>`;
  for (const button of document.querySelectorAll("[data-character-image]")) {
    button.onclick = () => {
      const character = characters.find((entry) => entry.id === button.dataset.characterImage);
      if (character) project({ type: "image", url: character.portrait, caption: character.name });
    };
  }
}

function sceneCard(scene, place) {
  const meta = [scene.variantCount > 1 ? `variant ${scene.variant} of ${scene.variantCount}` : "", scene.createdAt ? new Date(scene.createdAt).toLocaleDateString() : ""].filter(Boolean).join(" · ");
  return `<article class="scene-card">
    <figure><img src="${esc(scene.url)}" alt="${esc(scene.name)} at ${esc(place.name)}"></figure>
    <div class="image-card-copy">
      <h3>${esc(scene.name)}</h3>
      ${meta ? `<p>${esc(meta)}</p>` : ""}
      <div class="image-card-actions">
        <button type="button" class="quiet" data-scene-show="${esc(scene.id)}">Show at the table</button>
        ${scene.removable ? `<button type="button" class="quiet" data-scene-remove="${esc(scene.id)}">Remove record</button>` : ""}
      </div>
    </div>
  </article>`;
}

function renderSceneLibrary() {
  const scenes = ART_LIBRARY.scenes || [];
  $("#scene-library-count").textContent = `${scenes.length} saved view${scenes.length === 1 ? "" : "s"}`;
  const groups = (ART_LIBRARY.places || []).map((place) => ({ place, scenes: scenes.filter((scene) => scene.placeId === place.id) })).filter((group) => group.scenes.length);
  $("#scene-library").innerHTML = groups.length ? groups.map(({ place, scenes: placeScenes }) => {
    const sublocations = [...new Set(placeScenes.map((scene) => scene.sublocation || "Location overview"))];
    return `<section class="scene-location-group">
      <header class="scene-location-head"><h3>${esc(place.name)}</h3><button type="button" class="quiet" data-scene-place-open="${esc(place.id)}">Open location</button></header>
      ${sublocations.map((sublocation) => `<div class="scene-sublocation"><h4>${esc(sublocation)}</h4><div class="scene-grid">${placeScenes.filter((scene) => (scene.sublocation || "Location overview") === sublocation).map((scene) => sceneCard(scene, place)).join("")}</div></div>`).join("")}
    </section>`;
  }).join("") : `<p class="muted">No scenery has been kept yet.</p>`;
  for (const button of document.querySelectorAll("[data-scene-place-open]")) button.onclick = () => openPlaceFromLibrary(button.dataset.scenePlaceOpen);
  for (const button of document.querySelectorAll("[data-scene-show]")) button.onclick = () => {
    const scene = scenes.find((entry) => entry.id === button.dataset.sceneShow);
    const place = (ART_LIBRARY.places || []).find((entry) => entry.id === scene?.placeId);
    if (scene) project({ type: "image", url: scene.url, caption: [place?.name, scene.sublocation, scene.name].filter(Boolean).join(" · ") });
  };
  for (const button of document.querySelectorAll("[data-scene-remove]")) button.onclick = async () => {
    const scene = scenes.find((entry) => entry.id === button.dataset.sceneRemove);
    if (!scene || !confirm(`Remove “${scene.name}” from the library? The image file will be kept.`)) return;
    try {
      await api(`/api/art/scenes/${encodeURIComponent(scene.id)}`, { method: "DELETE" });
      toast("The library record was removed. The image file was kept.");
      await refresh();
      setImageLibraryView("scenery");
    } catch (error) { toast(error.message, true); }
  };
}

function renderImageLibrary() {
  if (!$("#image-character-grid")) return;
  setImageLibraryView(imageLibraryView);
  renderCharacterImages();
  const placeSelect = $("#scene-place");
  const selectedPlace = placeSelect.value;
  placeSelect.innerHTML = (ART_LIBRARY.places || []).map((place) => `<option value="${esc(place.id)}">${esc(place.name)}</option>`).join("");
  if ((ART_LIBRARY.places || []).some((place) => place.id === selectedPlace)) placeSelect.value = selectedPlace;
  const dimensions = ART_LIBRARY.dimensions || { width: 1536, height: 864, aspect: "16:9" };
  $("#scene-format").textContent = `${dimensions.width} × ${dimensions.height} · ${dimensions.aspect}`;
  $("#scene-generate").disabled = !ART_STATUS.workflows?.scenic?.ready || !placeSelect.options.length;
  $("#scene-generation-status").textContent = artHint("scenic");
  updateSceneSublocations();
  renderSceneTagBoard();
  renderSceneLibrary();
}

async function generateScene(event) {
  event.preventDefault();
  const button = $("#scene-generate");
  button.disabled = true;
  $("#scene-generation-status").textContent = "The view is being made.";
  try {
    const result = await api("/api/art/scenes", { method: "POST", body: {
      placeId: $("#scene-place").value,
      sublocation: $("#scene-sublocation").value,
      name: $("#scene-name").value,
      description: $("#scene-description").value,
      negativePrompt: $("#scene-negative").value,
      selectedTagIds: [...sceneTagState.explicit],
      excludedTagIds: [...sceneTagState.excluded],
      pins: sceneTagState.pins.filter((pin) => !pin.authored).map(({ id, label, payload }) => ({ id, label, payload })),
      tagDirection: $("#scene-tag-direction").value,
      embellishPrompt: $("#scene-embellish").checked,
      castWhenReady: $("#scene-cast").checked
    } });
    $("#scene-name").value = "";
    $("#scene-description").value = "";
    toast(result.message);
    await refresh();
    setImageLibraryView("scenery");
  } catch (error) {
    toast(error.message, true);
    $("#scene-generation-status").textContent = error.message;
  } finally {
    button.disabled = !ART_STATUS.workflows?.scenic?.ready || !$("#scene-place").options.length;
  }
}

window.addEventListener("hashchange", () => showSection(location.hash.slice(1) || "season"));

$("#ux-route").addEventListener("change", () => {
  selectedUxRoute = $("#ux-route").value;
  renderUx();
});
$("#ux-viewport").addEventListener("change", renderUx);
$("#ux-dead-only").addEventListener("change", renderUx);
$("#ux-clear").addEventListener("click", async () => {
  if (!confirm("Clear all locally collected UX history?")) return;
  try {
    TELEMETRY = await api("/api/telemetry", { method: "DELETE" });
    selectedUxRoute = null;
    renderUx();
    toast("UX history cleared.");
  } catch (error) {
    toast(error.message, true);
  }
});
let uxResizeFrame = null;
window.addEventListener("resize", () => {
  if ($("#sec-ux").hidden) return;
  cancelAnimationFrame(uxResizeFrame);
  uxResizeFrame = requestAnimationFrame(renderUx);
});

// --- downtime runner ---
function renderDowntimePicker() {
  const grid = $("#dt-buildings");
  const list = S.buildings;
  if (!list.length) {
    grid.innerHTML = `<p class="muted">No buildings yet. The wilderness is waiting.</p>`;
    return;
  }
  grid.innerHTML = list
    .map((b) => {
      const foreman = S.characters.find((c) => c.id === b.foremanId);
      return `<div class="card building-pick ${selectedBuilding === b.id ? "selected" : ""}" data-b="${b.id}">
        <strong>${esc(b.name)}</strong>
        <div class="muted" style="font-size:0.88rem;">${esc(b.resource)} · level ${b.level}</div>
        <div style="font-size:0.9rem;">${foreman ? esc(foreman.name) : '<span class="grave">no foreman</span>'}</div>
        <div class="muted" style="font-size:0.8rem;">${b.spentCount} of ${b.totalEntries} events discovered</div>
      </div>`;
    })
    .join("");
  for (const el of grid.querySelectorAll("[data-b]")) {
    el.onclick = () => selectBuilding(el.dataset.b);
  }
}

async function selectBuilding(id) {
  selectedBuilding = id;
  renderDowntimePicker();
  $("#dt-panel").hidden = false;
  $("#resolve-result").innerHTML = "";
  await renderPreview();
}

async function renderPreview() {
  if (!selectedBuilding) return;
  const effort = $("#dt-effort").checked ? "1" : "0";
  const p = await api(`/api/downtime/preview?building=${selectedBuilding}&effort=${effort}`);
  const b = S.buildings.find((x) => x.id === selectedBuilding);
  $("#dt-title").textContent = b.name + (p.foreman ? ` — ${p.foreman.name}` : "");
  // Visible modifiers itemized; hidden folded into the total (spec §8B).
  $("#dt-mods").innerHTML =
    p.visible
      .map((m) => `<div class="modline"><span>${esc(m.label)}</span><span>${m.value >= 0 ? "+" : ""}${m.value}</span></div>`)
      .join("") +
    `<div class="modline total"><span>Modifier to the roll</span><span>${p.total >= 0 ? "+" : ""}${p.total}</span></div>`;
  $("#dt-hidden").innerHTML = p.hidden.length
    ? p.hidden
        .map((m) => `<div class="modline"><span>${esc(m.label)}</span><span>${m.value >= 0 ? "+" : ""}${m.value}</span></div>`)
        .join("")
    : `<div class="muted" style="font-size:0.85rem;">Nothing folded in.</div>`;
  $("#dt-hidden-details").open = false;
}

$("#dt-effort").addEventListener("change", renderPreview);

$("#dt-resolve").addEventListener("click", async () => {
  const raw = parseInt($("#dt-raw").value, 10);
  if (Number.isNaN(raw)) return toast("Enter the raw dice first.");
  try {
    const r = await api("/api/downtime/resolve", {
      method: "POST",
      body: { buildingId: selectedBuilding, raw, playerEffort: $("#dt-effort").checked }
    });
    renderResult(r);
    $("#dt-raw").value = "";
    await refresh();
  } catch (e) {
    toast(e.message, true);
  }
});

function renderResult(r) {
  const grave = r.final === 0 || r.stockpileWiped;
  const lines = [];
  lines.push(`<div class="result-number ${grave ? "grave" : ""}">${r.final}</div>`);
  lines.push(`<div class="result-tier ${grave ? "grave" : r.final >= 16 ? "good" : ""}">${esc(r.tier)}</div>`);
  lines.push(
    `<div class="muted" style="font-size:0.85rem;">rolled ${r.raw}, modifier ${r.breakdown.total >= 0 ? "+" : ""}${r.breakdown.total}</div>`
  );
  if (r.event) {
    lines.push(`<div class="event-text">${esc(r.event)}</div>`);
  } else if (r.alreadySpent) {
    lines.push(`<div class="muted" style="margin:0.8rem 0;">(event already spent — resource only)</div>`);
  }
  if (r.stockpileWiped) {
    lines.push(`<div class="grave" style="font-weight:600;">All ${esc(r.resource)} is lost.</div>`);
  } else {
    lines.push(`<div>${r.amount > 0 ? `<span class="good">+${r.amount} ${esc(r.resource)}</span>` : `No ${esc(r.resource)} gained.`} <span class="muted">(${esc(r.resource)} now ${r.pools[r.resource]})</span></div>`);
  }
  if (r.effectGained) {
    lines.push(`<div style="margin-top:0.5rem;"><span class="pill">standing effect</span> ${esc(r.effectGained)}</div>`);
  }
  if (r.inspirationDrop) {
    lines.push(`<div class="muted" style="margin-top:0.7rem;font-size:0.85rem;">The foreman's standing takes a hit — consider adjusting their bookkeeping in Folk.</div>`);
  }
  $("#resolve-result").innerHTML = `<div class="card flash" style="max-width:480px;">${lines.join("")}</div>`;
}

// --- stores ---
function renderStores() {
  $("#stores-strip").innerHTML = Object.entries(S.resources)
    .map(
      ([name, v]) => `<div class="stat card"><div class="value">${v}</div><div class="smallcaps">${esc(name)}</div></div>`
    )
    .join("");
  $("#adj-resource").innerHTML = Object.keys(S.resources)
    .map((r) => `<option>${esc(r)}</option>`)
    .join("");
}

$("#adj-apply").addEventListener("click", async () => {
  try {
    await api("/api/resources/adjust", {
      method: "POST",
      body: {
        resource: $("#adj-resource").value,
        delta: parseInt($("#adj-delta").value, 10),
        reason: $("#adj-reason").value
      }
    });
    $("#adj-delta").value = "";
    $("#adj-reason").value = "";
    toast("Adjustment recorded.");
    await refresh();
  } catch (e) {
    toast(e.message, true);
  }
});

// --- buildings ---
function renderBuildings() {
  const rows = S.buildings
    .map((b) => {
      const options = ['<option value="">— none —</option>']
        .concat(
          S.characters
            .filter((c) => c.status === "alive" && c.trustedForWork === true)
            .map((c) => `<option value="${c.id}" ${b.foremanId === c.id ? "selected" : ""}>${esc(c.name)}</option>`)
        )
        .join("");
      const effects = b.effects?.length
        ? b.effects.map((e) => `<div class="pill" title="from a roll of ${e.source}">${esc(e.label)}</div>`).join(" ")
        : '<span class="muted">—</span>';
      return `<tr>
        <td><strong>${esc(b.name)}</strong><br><span class="muted" style="font-size:0.85rem;">${esc(b.resource)}</span></td>
        <td><input type="number" class="num" min="1" value="${b.level}" data-level="${b.id}"></td>
        <td><select data-foreman="${b.id}">${options}</select></td>
        <td>${b.producedTotal}</td>
        <td>${b.spentCount} of ${b.totalEntries}</td>
        <td>${effects}</td>
      </tr>`;
    })
    .join("");
  $("#buildings-table").innerHTML = `
    <tr><th>Building</th><th>Level</th><th>Foreman</th><th>Produced</th><th>Events discovered</th><th>Standing effects</th></tr>
    ${rows || '<tr><td colspan="6" class="muted">No buildings yet. The wilderness is waiting.</td></tr>'}`;
  for (const el of document.querySelectorAll("[data-level]")) {
    el.onchange = () =>
      api(`/api/buildings/${el.dataset.level}`, { method: "PUT", body: { level: parseInt(el.value, 10) } })
        .then(refresh)
        .catch((e) => toast(e.message, true));
  }
  for (const el of document.querySelectorAll("[data-foreman]")) {
    el.onchange = () =>
      api(`/api/buildings/${el.dataset.foreman}`, { method: "PUT", body: { foremanId: el.value || null } })
        .then(refresh)
        .catch((e) => toast(e.message, true));
  }
}

// --- folk ---
const TRAITS = ["Agility", "Strength", "Finesse", "Instinct", "Presence", "Knowledge"];
const FOLK_PORTRAIT_TAGS = ["masculine", "feminine", "androgynous", "weathered", "elegant", "fierce", "gentle", "uncanny", "practical"];
const FOLK_PORTRAIT_MODIFIERS = [-1, 0, 1, 2];

function portraitModifier(value) {
  const numeric = Number(value);
  return FOLK_PORTRAIT_MODIFIERS.includes(numeric) ? numeric : 0;
}

function portraitStyle(value) {
  return ["style1", "style2"].includes(String(value)) ? String(value) : "style2";
}

function folkPortraitState(c = {}) {
  const direction = c.portraitDirection || {};
  const equipment = direction.equipment || {};
  const workshop = c.portraitWorkshop || {};
  return {
    prompt: String(c.portraitPrompt || c.description || ""),
    suggestion: String(c.portraitSuggestion || ""),
    negativePrompt: String(c.portraitNegativePrompt || ""),
    primaryColor: /^#[0-9a-f]{6}$/i.test(direction.primaryColor) ? direction.primaryColor : "#805447",
    secondaryColor: /^#[0-9a-f]{6}$/i.test(direction.secondaryColor) ? direction.secondaryColor : "#6d806f",
    tags: Array.isArray(direction.tags) ? direction.tags.filter((tag) => FOLK_PORTRAIT_TAGS.includes(tag)) : [],
    equipment: Object.fromEntries(["armor", "mainHand", "offHand"].map((key) => [key, {
      enabled: equipment[key]?.enabled !== false,
      text: String(equipment[key]?.text || "")
    }])),
    stepsModifier: portraitModifier(workshop.stepsModifier),
    cfgModifier: portraitModifier(workshop.cfgModifier),
    style: portraitStyle(workshop.style),
    embellishPrompt: workshop.embellishPrompt !== false,
    fixSeed: workshop.fixSeed === true,
    lastSeed: Number.isSafeInteger(Number(workshop.lastSeed)) ? Number(workshop.lastSeed) : null,
    attempts: Array.isArray(workshop.attempts) ? workshop.attempts : []
  };
}

function folkPortraitHistoryHtml(c, portrait) {
  if (!portrait.attempts.length) return "";
  return `<div class="smallcaps" style="margin-top:.9rem;">Portrait history</div>
    <div class="folk-portrait-history">${portrait.attempts.slice().reverse().map((attempt, reverseIndex) => {
      const number = portrait.attempts.length - reverseIndex;
      const request = attempt.request || {};
      return `<article class="folk-portrait-attempt ${attempt.url === c.portrait ? "selected" : ""}">
        <img src="${esc(attempt.url)}" alt="Portrait attempt ${number}" loading="lazy">
        <small>Attempt ${number} · ${portraitStyle(request.style) === "style1" ? "Style 1" : "Style 2"} · steps ${portraitModifier(request.stepsModifier) >= 0 ? "+" : ""}${portraitModifier(request.stepsModifier)} · CFG ${portraitModifier(request.cfgModifier) >= 0 ? "+" : ""}${portraitModifier(request.cfgModifier)}</small>
        <div><button type="button" class="quiet" data-folk-portrait-use="${esc(attempt.id)}">Use</button><button type="button" class="quiet" data-folk-portrait-retry="${esc(attempt.id)}">Go again</button></div>
      </article>`;
    }).join("")}</div>`;
}

function folkPortraitStudioHtml(c) {
  const portrait = folkPortraitState(c);
  const ready = ART_STATUS.workflows?.portrait?.ready === true;
  const adviserReady = ART_STATUS.suggestions?.ready === true;
  const preview = c.portrait
    ? `<img src="${esc(c.portrait)}" alt="">`
    : esc((c.name || "?").slice(0, 1).toUpperCase());
  const equipmentLabel = { armor: "Armour", mainHand: "Main hand", offHand: "Off hand" };
  return `<hr class="folk-private-rule"><div class="smallcaps">Portrait workshop</div>
    <div class="folk-portrait-studio">
      <div class="folk-portrait-preview">${preview}</div>
      <label>Describe the portrait<textarea id="folk-portrait-prompt" rows="5" maxlength="6000">${esc(portrait.prompt)}</textarea></label>
      <p class="muted" style="margin:0;font-size:.72rem;">Balance atmosphere and concrete physical details. The portrait is rendered at 1104 × 1472.</p>
      <div class="folk-portrait-tools"><button type="button" class="quiet" id="folk-portrait-suggest" ${adviserReady ? "" : "disabled"}>Ask for suggestion</button><span class="muted" style="font-size:.68rem;">${adviserReady ? "The portrait adviser is ready." : "The portrait adviser is awaiting its key."}</span></div>
      ${portrait.suggestion ? `<aside class="folk-portrait-suggestion"><p>${esc(portrait.suggestion)}</p><button type="button" class="quiet" id="folk-portrait-use-suggestion">Use suggestion</button></aside>` : ""}
      <div class="folk-pigments">
        <label><input type="color" id="folk-portrait-primary" value="${portrait.primaryColor}"><span>Primary detail<br><small>${portrait.primaryColor}</small></span></label>
        <label><input type="color" id="folk-portrait-secondary" value="${portrait.secondaryColor}"><span>Secondary detail<br><small>${portrait.secondaryColor}</small></span></label>
      </div>
      <fieldset><legend>Visual tags</legend><div class="folk-portrait-tags">${FOLK_PORTRAIT_TAGS.map((tag) => `<button type="button" class="${portrait.tags.includes(tag) ? "selected" : ""}" aria-pressed="${portrait.tags.includes(tag)}" data-folk-portrait-tag="${tag}">${tag}</button>`).join("")}</div></fieldset>
      <fieldset><legend>Visible equipment</legend><div class="folk-portrait-equipment">${Object.entries(equipmentLabel).map(([key, label]) => `<label><input type="checkbox" data-folk-equipment-enabled="${key}" ${portrait.equipment[key].enabled ? "checked" : ""}><span>${label}</span><input type="text" data-folk-equipment-text="${key}" value="${esc(portrait.equipment[key].text)}" maxlength="300" placeholder="Optional"></label>`).join("")}</div></fieldset>
      <fieldset><legend>Generation details</legend><div class="folk-portrait-tuning">
        <div><span class="muted" style="font-size:.68rem;">Style</span><div class="folk-portrait-choice">${["style1", "style2"].map((style, index) => `<button type="button" data-folk-portrait-style="${style}" class="${portrait.style === style ? "selected" : ""}" aria-pressed="${portrait.style === style}">Style ${index + 1}</button>`).join("")}</div></div>
        ${[["steps", portrait.stepsModifier], ["cfg", portrait.cfgModifier]].map(([kind, current]) => `<div><span class="muted" style="font-size:.68rem;">${kind === "steps" ? "Steps" : "CFG"}</span><div class="folk-portrait-choice modifiers">${FOLK_PORTRAIT_MODIFIERS.map((value) => `<button type="button" data-folk-portrait-modifier="${kind}" data-value="${value}" class="${current === value ? "selected" : ""}" aria-pressed="${current === value}">${value >= 0 ? "+" : ""}${value}${value === 0 ? "<small>recommended</small>" : ""}</button>`).join("")}</div></div>`).join("")}
      </div></fieldset>
      <div class="folk-portrait-toggles">
        <label><input type="checkbox" id="folk-portrait-embellish" ${portrait.embellishPrompt ? "checked" : ""}><span><strong>Automatically embellish prompt</strong><br><small class="muted">Let the workflow's LLM expand the art direction.</small></span></label>
        <label><input type="checkbox" id="folk-portrait-fix-seed" ${portrait.fixSeed ? "checked" : ""}><span><strong>Fix seed</strong><br><small class="muted">Reuse the most recent composition seed.</small></span></label>
      </div>
      <details><summary>Negative prompt</summary><textarea id="folk-portrait-negative" rows="3" maxlength="4000">${esc(portrait.negativePrompt)}</textarea></details>
      <label>Portrait URL<input type="text" id="ed-portrait" value="${esc(c.portrait || "")}" placeholder="/generated/art/portrait/…"></label>
      <div class="folk-portrait-actions"><button type="button" id="folk-portrait-generate" ${ready ? "" : "disabled"}>Make portrait</button>${c.portrait ? `<button type="button" class="quiet" id="folk-portrait-clear">Clear portrait</button>` : ""}<span class="muted" style="font-size:.68rem;">${esc(artHint("portrait"))}</span></div>
      ${folkPortraitHistoryHtml(c, portrait)}
    </div>`;
}

function renderFolk() {
  const folk = S.characters || [];
  if (selectedFolkId !== "__new__" && !folk.some((person) => person.id === selectedFolkId)) selectedFolkId = folk[0]?.id || null;
  const grid = $("#folk-grid");
  grid.innerHTML = folk.length
    ? folkPortraitGridHtml(folk, { mode: "select", selectedId: selectedFolkId })
    : `<p class="muted">No folk have been entered yet.</p>`;
  wireFolkPortraitCards(grid, { onSelect: (id) => {
    selectedFolkId = id;
    renderFolk();
  } });
  const selected = selectedFolkId === "__new__" ? null : folk.find((person) => person.id === selectedFolkId);
  if (selected || selectedFolkId === "__new__") renderFolkEditor(selected);
  else $("#folk-editor").hidden = true;
}

function clampNum(el, min, max) {
  let v = parseInt(el.value, 10) || 0;
  v = Math.max(min, Math.min(max, v));
  el.value = v;
  return v;
}

function collectFolkPortraitSettings(c) {
  const tags = [...document.querySelectorAll("[data-folk-portrait-tag].selected")].map((button) => button.dataset.folkPortraitTag);
  const equipment = Object.fromEntries(["armor", "mainHand", "offHand"].map((key) => [key, {
    enabled: $(`[data-folk-equipment-enabled="${key}"]`)?.checked !== false,
    text: $(`[data-folk-equipment-text="${key}"]`)?.value.trim() || ""
  }]));
  const stepsModifier = portraitModifier($("[data-folk-portrait-modifier=steps].selected")?.dataset.value);
  const cfgModifier = portraitModifier($("[data-folk-portrait-modifier=cfg].selected")?.dataset.value);
  const style = portraitStyle($("[data-folk-portrait-style].selected")?.dataset.folkPortraitStyle);
  const prompt = $("#folk-portrait-prompt")?.value.trim() || "";
  const primaryColor = $("#folk-portrait-primary")?.value || "#805447";
  const secondaryColor = $("#folk-portrait-secondary")?.value || "#6d806f";
  const visibleEquipment = Object.entries(equipment).filter(([, item]) => item.enabled && item.text).map(([key, item]) => `${key}: ${item.text}`);
  const compiledPrompt = [
    "A character portrait balancing atmosphere and concrete physical specifics equally.",
    prompt,
    tags.length ? `Visual identity: ${tags.join(", ")}.` : "",
    `Use ${primaryColor} as the primary detail color and ${secondaryColor} as the secondary accent.`,
    visibleEquipment.length ? `Visible equipment: ${visibleEquipment.join("; ")}.` : "Do not feature equipment."
  ].filter(Boolean).join(" ");
  return {
    sourcePrompt: prompt,
    prompt: compiledPrompt,
    negativePrompt: $("#folk-portrait-negative")?.value.trim() || "",
    primaryColor,
    secondaryColor,
    tags,
    equipment,
    armor: equipment.armor.enabled ? equipment.armor.text : "",
    mainHand: equipment.mainHand.enabled ? equipment.mainHand.text : "",
    offHand: equipment.offHand.enabled ? equipment.offHand.text : "",
    stepsModifier,
    cfgModifier,
    style,
    embellishPrompt: $("#folk-portrait-embellish")?.checked !== false,
    fixSeed: $("#folk-portrait-fix-seed")?.checked === true,
    lastSeed: folkPortraitState(c).lastSeed
  };
}

function collectFolkBody(c) {
  const portrait = c ? collectFolkPortraitSettings(c) : null;
  const readList = (id) => {
    try {
      const value = JSON.parse($(id)?.value || "[]");
      return Array.isArray(value) ? value : [];
    } catch {
      return [];
    }
  };
  return {
    name: $("#ed-name").value,
    role: $("#ed-role").value,
    status: $("#ed-status").value,
    age: {
      band: $("#ed-age-band").value,
      years: $("#ed-age-years").value === "" ? null : parseInt($("#ed-age-years").value, 10)
    },
    connections: readList("#ed-connections"),
    experiences: readList("#ed-experiences"),
    description: $("#ed-description").value,
    hidden: {
      notes: $("#ed-gmnotes").value,
      inspiration: parseInt($("#ed-inspiration").value, 10) || 0,
      penalty: parseInt($("#ed-penalty").value, 10) || 0
    },
    portrait: $("#ed-portrait")?.value || c?.portrait || null,
    trustedForWork: $("#ed-trusted").checked,
    traits: Object.fromEntries(TRAITS.map((trait) => [trait, parseInt($(`#ed-tr-${trait}`).value, 10) || 0])),
    aptitudes: Object.fromEntries(S.buildings.map((building) => [building.id, parseInt($(`#ed-apt-${building.id}`).value, 10) || 0]).filter(([, value]) => value !== 0)),
    ...(portrait ? {
      portraitPrompt: portrait.sourcePrompt,
      portraitNegativePrompt: portrait.negativePrompt,
      portraitDirection: { tags: portrait.tags, primaryColor: portrait.primaryColor, secondaryColor: portrait.secondaryColor, equipment: portrait.equipment },
      portraitWorkshop: {
        stepsModifier: portrait.stepsModifier,
        cfgModifier: portrait.cfgModifier,
        style: portrait.style,
        embellishPrompt: portrait.embellishPrompt,
        fixSeed: portrait.fixSeed,
        lastSeed: portrait.lastSeed
      }
    } : {})
  };
}

async function saveFolk(c, { announce = true, refreshAfter = true } = {}) {
  const isNew = !c;
  const saved = await api(isNew ? "/api/characters" : `/api/characters/${c.id}`, { method: isNew ? "POST" : "PUT", body: collectFolkBody(c) });
  selectedFolkId = saved.id;
  if (announce) toast(isNew ? `${saved.name} entered the ledger.` : `${saved.name}'s card was updated.`);
  if (refreshAfter) await refresh();
  return saved;
}

$("#folk-new").addEventListener("click", () => {
  selectedFolkId = "__new__";
  renderFolk();
});

function wireFolkEditor(c) {
  $("#ed-cancel").onclick = () => {
    selectedFolkId = S.characters[0]?.id || null;
    renderFolk();
  };
  $("#ed-save").onclick = () => saveFolk(c).catch((error) => toast(error.message, true));
  const projectButton = $("#ed-project");
  if (projectButton) projectButton.onclick = () => project({ type: "folk", refId: c.id });
  wireFolkBiographyEditor();
  if (!c) return;

  for (const button of document.querySelectorAll("[data-folk-portrait-tag]")) button.onclick = () => {
    button.classList.toggle("selected");
    button.setAttribute("aria-pressed", String(button.classList.contains("selected")));
  };
  for (const button of document.querySelectorAll("[data-folk-portrait-style]")) button.onclick = () => {
    for (const choice of document.querySelectorAll("[data-folk-portrait-style]")) {
      const selected = choice === button;
      choice.classList.toggle("selected", selected);
      choice.setAttribute("aria-pressed", String(selected));
    }
  };
  for (const button of document.querySelectorAll("[data-folk-portrait-modifier]")) button.onclick = () => {
    for (const choice of document.querySelectorAll(`[data-folk-portrait-modifier="${button.dataset.folkPortraitModifier}"]`)) {
      const selected = choice === button;
      choice.classList.toggle("selected", selected);
      choice.setAttribute("aria-pressed", String(selected));
    }
  };
  const useSuggestion = $("#folk-portrait-use-suggestion");
  if (useSuggestion) useSuggestion.onclick = () => { $("#folk-portrait-prompt").value = c.portraitSuggestion || ""; };
  $("#folk-portrait-suggest").onclick = async () => {
    const button = $("#folk-portrait-suggest");
    button.disabled = true;
    try {
      const current = await saveFolk(c, { announce: false, refreshAfter: false });
      const result = await api(`/api/characters/${c.id}/portrait/suggest`, { method: "POST", body: { context: {
        name: $("#ed-name").value,
        role: $("#ed-role").value,
        description: $("#folk-portrait-prompt").value,
        notes: $("#ed-gmnotes").value
      } } });
      await api(`/api/characters/${c.id}`, { method: "PUT", body: { portraitSuggestion: result.suggestion } });
      toast("A portrait direction is ready.");
      await refresh();
      return current;
    } catch (error) {
      toast(error.message, true);
      button.disabled = false;
    }
  };
  $("#folk-portrait-generate").onclick = async () => {
    const button = $("#folk-portrait-generate");
    const settings = collectFolkPortraitSettings(c);
    if (!settings.sourcePrompt) { toast("Describe the portrait first.", true); return; }
    button.disabled = true;
    button.textContent = "Painting…";
    try {
      await saveFolk(c, { announce: false, refreshAfter: false });
      const body = { ...settings };
      if (settings.fixSeed && Number.isSafeInteger(settings.lastSeed)) body.seed = settings.lastSeed;
      const result = await api(`/api/characters/${c.id}/portrait`, { method: "POST", body });
      toast(result.message);
      await refresh();
    } catch (error) {
      toast(error.message, true);
      button.disabled = false;
      button.textContent = "Make portrait";
    }
  };
  const clear = $("#folk-portrait-clear");
  if (clear) clear.onclick = async () => {
    try {
      await api(`/api/characters/${c.id}`, { method: "PUT", body: { portrait: null } });
      await refresh();
    } catch (error) { toast(error.message, true); }
  };
  for (const button of document.querySelectorAll("[data-folk-portrait-use]")) button.onclick = async () => {
    const attempt = folkPortraitState(c).attempts.find((candidate) => candidate.id === button.dataset.folkPortraitUse);
    if (!attempt) return;
    try {
      await api(`/api/characters/${c.id}`, { method: "PUT", body: { portrait: attempt.url, portraitWorkshop: { lastSeed: attempt.seed } } });
      await refresh();
    } catch (error) { toast(error.message, true); }
  };
  for (const button of document.querySelectorAll("[data-folk-portrait-retry]")) button.onclick = async () => {
    const attempt = folkPortraitState(c).attempts.find((candidate) => candidate.id === button.dataset.folkPortraitRetry);
    if (!attempt) return;
    button.disabled = true;
    try {
      const result = await api(`/api/characters/${c.id}/portrait`, { method: "POST", body: { ...attempt.request, sourcePrompt: c.portraitPrompt || attempt.request.prompt, seed: attempt.seed } });
      toast(result.message);
      await refresh();
    } catch (error) { toast(error.message, true); button.disabled = false; }
  };
}

function folkConnectionTokens(connections) {
  if (!connections.length) return `<span class="muted" style="font-size:.7rem;">No connections recorded.</span>`;
  return connections.map((connection) => {
    const person = S.characters.find((candidate) => candidate.id === connection.folkId);
    return `<span class="folk-token"><span><strong>${esc(person?.name || "Unknown folk")}</strong> · ${esc(connection.kind)}</span><button type="button" data-folk-connection-remove="${esc(connection.folkId)}" aria-label="Remove connection">×</button></span>`;
  }).join("");
}

function folkExperienceTokens(experiences) {
  if (!experiences.length) return `<span class="muted" style="font-size:.7rem;">No formative experiences recorded.</span>`;
  return experiences.map((experience) => `<span class="folk-token"><span>${esc(experience.name)}</span><button type="button" data-folk-experience-remove="${esc(experience.id)}" aria-label="Remove experience">×</button></span>`).join("");
}

function wireFolkBiographyEditor() {
  const connectionField = $("#ed-connections");
  const experienceField = $("#ed-experiences");
  let connections = JSON.parse(connectionField.value || "[]");
  let experiences = JSON.parse(experienceField.value || "[]");

  const drawConnections = () => {
    connectionField.value = JSON.stringify(connections);
    $("#folk-connection-list").innerHTML = folkConnectionTokens(connections);
    for (const button of document.querySelectorAll("[data-folk-connection-remove]")) button.onclick = () => {
      connections = connections.filter((connection) => connection.folkId !== button.dataset.folkConnectionRemove);
      drawConnections();
    };
  };
  const drawExperiences = () => {
    experienceField.value = JSON.stringify(experiences);
    $("#folk-experience-list").innerHTML = folkExperienceTokens(experiences);
    const selected = new Set(experiences.map((experience) => experience.name.toLocaleLowerCase()));
    for (const button of document.querySelectorAll("[data-folk-experience-preset]")) {
      const active = selected.has(button.dataset.folkExperiencePreset.toLocaleLowerCase());
      button.classList.toggle("selected", active);
      button.setAttribute("aria-pressed", String(active));
      button.onclick = () => {
        const name = button.dataset.folkExperiencePreset;
        const key = name.toLocaleLowerCase();
        experiences = selected.has(key)
          ? experiences.filter((experience) => experience.name.toLocaleLowerCase() !== key)
          : [...experiences, { id: `exp_${Date.now().toString(36)}`, name }];
        drawExperiences();
      };
    }
    for (const button of document.querySelectorAll("[data-folk-experience-remove]")) button.onclick = () => {
      experiences = experiences.filter((experience) => experience.id !== button.dataset.folkExperienceRemove);
      drawExperiences();
    };
  };

  for (const button of document.querySelectorAll("[data-folk-age]")) button.onclick = () => {
    $("#ed-age-band").value = button.dataset.folkAge;
    for (const choice of document.querySelectorAll("[data-folk-age]")) {
      const active = choice === button;
      choice.classList.toggle("selected", active);
      choice.setAttribute("aria-pressed", String(active));
    }
  };
  $("#folk-connection-add").onclick = () => {
    const folkId = $("#folk-connection-person").value;
    if (!folkId) return;
    const kind = $("#folk-connection-kind").value;
    const existing = connections.find((connection) => connection.folkId === folkId);
    if (existing) existing.kind = kind;
    else connections.push({ folkId, kind });
    drawConnections();
  };
  const addCustomExperience = () => {
    const input = $("#folk-experience-custom");
    const name = input.value.trim();
    if (!name || experiences.some((experience) => experience.name.toLocaleLowerCase() === name.toLocaleLowerCase())) return;
    experiences.push({ id: `exp_${Date.now().toString(36)}`, name });
    input.value = "";
    drawExperiences();
  };
  $("#folk-experience-add").onclick = addCustomExperience;
  $("#folk-experience-custom").onkeydown = (event) => {
    if (event.key !== "Enter") return;
    event.preventDefault();
    addCustomExperience();
  };
  drawConnections();
  drawExperiences();
}

function renderFolkEditor(c) {
  const isNew = !c;
  const person = c || { name: "", role: "", status: "alive", description: "", age: { band: "unknown", years: null }, connections: [], experiences: [], traits: {}, aptitudes: {}, trustedForWork: false, hidden: {} };
  const age = { band: "unknown", years: null, ...(person.age || {}) };
  const connections = Array.isArray(person.connections) ? person.connections : [];
  const experiences = Array.isArray(person.experiences) ? person.experiences : [];
  const connectionOptions = S.characters.filter((candidate) => candidate.id !== person.id).map((candidate) => `<option value="${esc(candidate.id)}">${esc(candidate.name)}</option>`).join("");
  const traitRows = TRAITS.map((trait) => `<div class="formrow"><label>${trait}</label><input type="number" class="num" id="ed-tr-${trait}" value="${person.traits?.[trait] ?? 0}"></div>`).join("");
  const aptRows = S.buildings.map((building) => `<div class="formrow"><label>${esc(building.name)}</label><input type="number" class="num" id="ed-apt-${building.id}" value="${person.aptitudes?.[building.id] ?? 0}"></div>`).join("");
  const editor = $("#folk-editor");
  editor.hidden = false;
  editor.innerHTML = `<div class="folk-card-back-head"><h3>${isNew ? "New folk card" : esc(person.name)}</h3>${isNew ? "" : `<button type="button" class="quiet" id="ed-project">Show at the table</button>`}</div>
    <div class="folk-editor-fields">
      <div class="formrow"><label>Name</label><input type="text" id="ed-name" value="${esc(person.name)}"></div>
      <div class="formrow"><label>Role</label><input type="text" id="ed-role" value="${esc(person.role || "")}"></div>
      <div class="formrow"><label>Status</label><select id="ed-status">${["alive", "dead", "missing"].map((status) => `<option ${person.status === status ? "selected" : ""}>${status}</option>`).join("")}</select></div>
      <fieldset class="folk-biography"><legend>Life at a glance</legend>
        <div class="folk-biography-block"><div class="folk-biography-head"><strong>Age</strong></div><div class="folk-age-line"><input type="hidden" id="ed-age-band" value="${esc(age.band)}"><div class="folk-age-palette">${FOLK_AGE_BANDS.map(([value, label]) => `<button type="button" data-folk-age="${value}" class="${age.band === value ? "selected" : ""}" aria-pressed="${age.band === value}">${label}</button>`).join("")}</div><label class="folk-age-years">exact <input type="number" id="ed-age-years" min="0" max="999" value="${age.years ?? ""}" placeholder="—"></label></div></div>
        <div class="folk-biography-block"><div class="folk-biography-head"><strong>Connections</strong><span class="muted" style="font-size:.68rem;">named bonds, not prose</span></div><input type="hidden" id="ed-connections" value="${esc(JSON.stringify(connections))}"><div class="folk-token-list" id="folk-connection-list">${folkConnectionTokens(connections)}</div><div class="folk-connection-add"><select id="folk-connection-person" aria-label="Connected folk"><option value="">Choose folk</option>${connectionOptions}</select><select id="folk-connection-kind" aria-label="Connection type">${FOLK_CONNECTION_KINDS.map((kind) => `<option value="${kind}">${kind}</option>`).join("")}</select><button type="button" class="quiet" id="folk-connection-add" ${connectionOptions ? "" : "disabled"}>Add</button></div></div>
        <div class="folk-biography-block"><div class="folk-biography-head"><strong>Experiences</strong><span class="muted" style="font-size:.68rem;">quick beats for later detail</span></div><input type="hidden" id="ed-experiences" value="${esc(JSON.stringify(experiences))}"><div class="folk-experience-palette">${FOLK_EXPERIENCE_PRESETS.map((name) => `<button type="button" data-folk-experience-preset="${esc(name)}">${esc(name)}</button>`).join("")}</div><div class="folk-token-list" id="folk-experience-list">${folkExperienceTokens(experiences)}</div><div class="folk-experience-add"><input type="text" id="folk-experience-custom" maxlength="120" placeholder="Another short experience"><button type="button" class="quiet" id="folk-experience-add">Add</button></div></div>
      </fieldset>
      <div class="formrow"><label>Description</label><div style="flex:1"><textarea id="ed-description" rows="4">${esc(person.description || "")}</textarea><small class="muted">Public. Players see this word for word when they turn the card.</small></div></div>
      <div class="formrow"><label>GM notes</label><div style="flex:1"><textarea id="ed-gmnotes" rows="5">${esc(person.hidden?.notes || "")}</textarea><small class="muted">Private. This never leaves the GM console.</small></div></div>
      <div class="formrow"><label>Work trust</label><input type="checkbox" id="ed-trusted" ${person.trustedForWork ? "checked" : ""}><span class="muted" style="font-size:.72rem;">eligible to lead settlement work</span></div>
      <hr class="folk-private-rule"><div class="smallcaps">Private measures</div>
      <div class="folk-stats-grid">${traitRows}<div class="formrow"><label>Inspiration</label><input type="number" id="ed-inspiration" min="-1" max="2" value="${person.hidden?.inspiration ?? 0}"></div><div class="formrow"><label>Penalty</label><input type="number" id="ed-penalty" value="${person.hidden?.penalty ?? 0}"></div></div>
      <hr class="folk-private-rule"><div class="smallcaps">Aptitude by building</div><div class="folk-stats-grid">${aptRows || `<span class="muted">No buildings are available.</span>`}</div>
      ${isNew ? `<p class="muted">Save the card before opening its portrait workshop.</p>` : folkPortraitStudioHtml(person)}
      <div class="folk-editor-actions"><button type="button" id="ed-save">${isNew ? "Add folk" : "Save card"}</button><button type="button" class="quiet" id="ed-cancel">Cancel</button></div>
    </div>`;
  wireFolkEditor(c);
}

// --- people (the wider world's characters) & places ---

function placeName(placeId) {
  const p = (S.places || []).find((x) => x.id === placeId);
  return p ? p.name : null;
}

function placeOptions(selectedId) {
  const opts = [`<option value="" ${!selectedId ? "selected" : ""}>no location</option>`];
  for (const p of S.places || []) {
    opts.push(`<option value="${p.id}" ${selectedId === p.id ? "selected" : ""}>${esc(p.name)}</option>`);
  }
  return opts.join("");
}

function renderPeople() {
  const grid = $("#people-grid");
  const people = S.people || [];
  grid.innerHTML = people.length
    ? people
        .map((p) => {
          const dead = p.status !== "alive";
          const items = (p.items || [])
            .map((it) => `<li><strong>${esc(it.name)}</strong>${it.note ? ` — <span class="muted">${esc(it.note)}</span>` : ""}</li>`)
            .join("");
          return `<div class="card" style="${dead ? "opacity:0.6;" : ""}">
            <div class="folk-head">
              <div class="portrait">${p.portrait ? `<img src="${esc(p.portrait)}" alt="">` : esc(p.name[0] || "?")}</div>
              <div>
                <strong>${esc(p.name)}</strong>
                ${dead ? `<span class="pill grave">${esc(p.status)}</span>` : ""}
                ${p.revealed ? "" : `<span class="pill">hidden from players</span>`}
                <div class="muted" style="font-size:0.85rem;">${esc(p.role || "")}</div>
              </div>
            </div>
            <p style="font-size:0.9rem;">${esc(p.description || "")}</p>
            ${items ? `<div class="muted" style="font-size:0.82rem;">Carries:</div><ul style="margin:0.2rem 0 0.4rem 1.1rem; font-size:0.86rem;">${items}</ul>` : ""}
            <div class="formrow" style="margin-top:0.5rem;">
              <label style="min-width:auto;">Now at</label>
              <select data-move="${p.id}">${placeOptions(p.placeId)}</select>
            </div>
            ${p.hidden?.notes ? `<details class="gm-only"><summary>gm only</summary><div class="inner" style="white-space:pre-wrap;">${esc(p.hidden.notes)}</div></details>` : ""}
            <div style="margin-top:0.6rem;"><button class="quiet" data-edit-person="${p.id}">Edit</button> <button class="quiet" data-show-person="${p.id}">Show at the table</button></div>
          </div>`;
        })
        .join("")
    : `<p class="muted">No one beyond the palisade yet.</p>`;
  for (const el of grid.querySelectorAll("[data-show-person]")) {
    el.onclick = () => project({ type: "person", refId: el.dataset.showPerson });
  }
  for (const el of grid.querySelectorAll("[data-move]")) {
    el.onchange = () =>
      api(`/api/people/${el.dataset.move}`, { method: "PUT", body: { placeId: el.value || null } })
        .then(() => {
          const dest = el.value ? placeName(el.value) : null;
      toast(dest ? `Moved to ${dest}.` : "Location cleared.");
          return refresh();
        })
        .catch((e) => toast(e.message, true));
  }
  for (const el of grid.querySelectorAll("[data-edit-person]")) {
    el.onclick = () => renderPersonEditor(people.find((p) => p.id === el.dataset.editPerson));
  }
}

$("#people-new").addEventListener("click", () => renderPersonEditor(null));

function renderPersonEditor(p) {
  const isNew = !p;
  p = p || { name: "", role: "", status: "alive", description: "", portrait: null, portraitPrompt: "", placeId: null, items: [], revealed: true, hidden: {} };
  const items = (p.items || []).map((it) => ({ name: it.name || "", note: it.note || "" }));

  function draw() {
    const itemRows = items
      .map(
        (it, i) => `<div class="formrow">
          <input type="text" data-item-name="${i}" value="${esc(it.name)}" placeholder="item" style="width:160px;">
          <input type="text" data-item-note="${i}" value="${esc(it.note)}" placeholder="description or rules" style="flex:1;">
          <button class="quiet" data-item-drop="${i}" title="remove">✕</button>
        </div>`
      )
      .join("");
    $("#people-editor").innerHTML = `<div class="card" style="max-width:620px; margin-top:1rem;">
      <h3>${isNew ? "Add a person" : `Edit ${esc(p.name)}`}</h3>
      <div class="formrow"><label>Name</label><input type="text" id="pe-name" value="${esc(p.name)}" style="flex:1"></div>
      <div class="formrow"><label>Role</label><input type="text" id="pe-role" value="${esc(p.role || "")}" style="flex:1" placeholder="occupation or role"></div>
      <div class="formrow"><label>Status</label>
        <select id="pe-status">
          ${["alive", "dead", "missing"].map((s) => `<option ${p.status === s ? "selected" : ""}>${s}</option>`).join("")}
        </select>
      </div>
      <div class="formrow"><label>Place</label><select id="pe-place">${placeOptions(p.placeId)}</select></div>
      <div class="formrow"><label>Shown to players</label><input type="checkbox" id="pe-revealed" ${p.revealed ? "checked" : ""}> <span class="muted" style="font-size:0.85rem;">appears in the players' journal</span></div>
      <div class="formrow" style="align-items:flex-start;"><label>Description</label>
        <div style="flex:1">
          <textarea id="pe-description" rows="3" style="width:100%">${esc(p.description || "")}</textarea>
          <div class="muted" style="font-size:0.8rem;">Public — players read this word for word. Keep what they shouldn't know out of it.</div>
        </div>
      </div>
      <div class="formrow" style="align-items:flex-start;"><label>GM notes</label>
        <div style="flex:1">
          <textarea id="pe-gmnotes" rows="3" style="width:100%">${esc(p.hidden?.notes || "")}</textarea>
          <div class="muted" style="font-size:0.8rem;">Private — never leaves this console.</div>
        </div>
      </div>
      <hr class="rule"><div class="smallcaps">Carries</div>
      ${itemRows || `<p class="muted" style="font-size:0.85rem;">No items.</p>`}
      <div class="formrow"><button class="quiet" id="pe-item-add">Add an item</button></div>
      <hr class="rule"><div class="smallcaps">Portrait</div>
      <div class="formrow"><label>Portrait URL</label><input type="text" id="pe-portrait" value="${esc(p.portrait || "")}" style="flex:1" placeholder="/portraits/… (optional)"></div>
      ${isNew
        ? `<p class="muted" style="font-size:0.85rem;">Save them first — then a portrait can be requested.</p>`
        : `<div class="formrow" style="align-items:flex-start;"><label>ComfyUI prompt</label>
            <div style="flex:1">
              <textarea id="pe-prompt" rows="2" style="width:100%" placeholder="what the artist should paint">${esc(p.portraitPrompt || p.description || "")}</textarea>
              <label class="muted" style="display:flex;align-items:center;gap:.4rem;margin-top:.4rem;font-size:.78rem;"><input type="checkbox" id="pe-embellish" ${artEmbellishPreference("portrait") ? "checked" : ""}> Automatically embellish prompt</label>
              <div class="formrow" style="margin:0.4rem 0 0;">
                <button class="quiet" id="pe-portrait-request" ${ART_STATUS.workflows?.portrait?.ready ? "" : "disabled"}>Request a portrait</button>
                <span class="muted" style="font-size:0.8rem;">${esc(artHint("portrait"))}</span>
              </div>
            </div>
          </div>`}
      <hr class="rule">
      <div class="formrow">
        <button id="pe-save">${isNew ? "Add person" : "Save"}</button>
        <button class="quiet" id="pe-cancel">Cancel</button>
        ${isNew ? "" : `<button class="quiet grave" id="pe-delete" style="margin-left:auto;">Delete person</button>`}
      </div>
    </div>`;
    wire();
  }

  function collectItems() {
    for (let i = 0; i < items.length; i++) {
      items[i].name = $(`[data-item-name="${i}"]`)?.value ?? items[i].name;
      items[i].note = $(`[data-item-note="${i}"]`)?.value ?? items[i].note;
    }
  }

  function wire() {
    $("#pe-item-add").onclick = () => { collectItems(); items.push({ name: "", note: "" }); draw(); };
    for (const el of document.querySelectorAll("[data-item-drop]")) {
      el.onclick = () => { collectItems(); items.splice(parseInt(el.dataset.itemDrop, 10), 1); draw(); };
    }
    $("#pe-cancel").onclick = () => ($("#people-editor").innerHTML = "");
    const requestBtn = $("#pe-portrait-request");
    if (requestBtn) {
      requestBtn.onclick = async () => {
        const label = requestBtn.textContent;
        requestBtn.disabled = true;
        requestBtn.textContent = "Painting…";
        try {
          const embellishPrompt = $("#pe-embellish").checked;
          rememberArtEmbellish("portrait", embellishPrompt);
          const r = await api(`/api/people/${p.id}/portrait`, { method: "POST", body: { prompt: $("#pe-prompt").value, embellishPrompt } });
          $("#pe-portrait").value = r.url;
          toast(r.message);
        } catch (e) {
          toast(e.message, true);
        } finally {
          requestBtn.disabled = !ART_STATUS.workflows?.portrait?.ready;
          requestBtn.textContent = label;
        }
      };
    }
    const deleteBtn = $("#pe-delete");
    if (deleteBtn) {
      deleteBtn.onclick = async () => {
        if (!confirm(`Delete ${p.name}? This also deletes players' notes about them.`)) return;
        try {
          await api(`/api/people/${p.id}`, { method: "DELETE" });
          $("#people-editor").innerHTML = "";
          await refresh();
        } catch (e) {
          toast(e.message, true);
        }
      };
    }
    $("#pe-save").onclick = async () => {
      collectItems();
      const body = {
        name: $("#pe-name").value,
        role: $("#pe-role").value,
        status: $("#pe-status").value,
        description: $("#pe-description").value,
        hidden: { notes: $("#pe-gmnotes").value },
        portrait: $("#pe-portrait").value || null,
        placeId: $("#pe-place").value || null,
        revealed: $("#pe-revealed").checked,
        items: items.filter((it) => it.name.trim())
      };
      if (!isNew) body.portraitPrompt = $("#pe-prompt") ? $("#pe-prompt").value : p.portraitPrompt;
      try {
        if (isNew) await api("/api/people", { method: "POST", body });
        else await api(`/api/people/${p.id}`, { method: "PUT", body });
        $("#people-editor").innerHTML = "";
        await refresh();
      } catch (e) {
        toast(e.message, true);
      }
    };
  }

  draw();
}

function renderPlaces() {
  const grid = $("#places-grid");
  const places = S.places || [];
  grid.innerHTML = places.length
    ? places
        .map((pl) => {
          const here = (S.people || []).filter((p) => p.placeId === pl.id).map((p) => esc(p.name));
          return `<div class="card">
            <strong>${esc(pl.name)}</strong>
            ${pl.kind ? `<span class="pill">${esc(pl.kind)}</span>` : ""}
            ${pl.revealed ? "" : `<span class="pill">hidden from players</span>`}
            <p style="font-size:0.9rem;">${esc(pl.description || "")}</p>
            ${here.length ? `<div class="muted" style="font-size:0.82rem;">Here: ${here.join(", ")}</div>` : ""}
            ${pl.hidden?.notes ? `<details class="gm-only"><summary>gm only</summary><div class="inner" style="white-space:pre-wrap;">${esc(pl.hidden.notes)}</div></details>` : ""}
            <div style="margin-top:0.6rem;"><button class="quiet" data-edit-place="${pl.id}">Edit</button> <button class="quiet" data-show-place="${pl.id}">Show at the table</button></div>
          </div>`;
        })
        .join("")
    : `<p class="muted">Only blank map so far.</p>`;
  for (const el of grid.querySelectorAll("[data-show-place]")) {
    el.onclick = () => project({ type: "place", refId: el.dataset.showPlace });
  }
  for (const el of grid.querySelectorAll("[data-edit-place]")) {
    el.onclick = () => renderPlaceEditor(places.find((p) => p.id === el.dataset.editPlace));
  }
}

$("#places-new").addEventListener("click", () => renderPlaceEditor(null));

function renderPlaceEditor(pl) {
  const isNew = !pl;
  pl = pl || { name: "", kind: "", description: "", portrait: null, imagePrompt: "", revealed: true, fixed: false, hidden: {} };
  $("#places-editor").innerHTML = `<div class="card" style="max-width:620px; margin-top:1rem;">
    <h3>${isNew ? "Add a place" : `Edit ${esc(pl.name)}`}</h3>
    <div class="formrow"><label>Name</label><input type="text" id="ple-name" value="${esc(pl.name)}" style="flex:1"></div>
    <div class="formrow"><label>Kind</label><input type="text" id="ple-kind" value="${esc(pl.kind || "")}" style="flex:1" placeholder="ruin, forest, crossing…"></div>
    <div class="formrow"><label>Shown to players</label><input type="checkbox" id="ple-revealed" ${pl.revealed ? "checked" : ""}> <span class="muted" style="font-size:0.85rem;">appears in the players' journal</span></div>
    <div class="formrow" style="align-items:flex-start;"><label>Description</label>
      <div style="flex:1">
        <textarea id="ple-description" rows="3" style="width:100%">${esc(pl.description || "")}</textarea>
        <div class="muted" style="font-size:0.8rem;">Public — players read this word for word.</div>
      </div>
    </div>
    <div class="formrow" style="align-items:flex-start;"><label>GM notes</label>
      <div style="flex:1">
        <textarea id="ple-gmnotes" rows="3" style="width:100%">${esc(pl.hidden?.notes || "")}</textarea>
        <div class="muted" style="font-size:0.8rem;">Private — never leaves this console.</div>
      </div>
    </div>
    <hr class="rule"><div class="smallcaps">Image</div>
    <div class="formrow"><label>Image URL</label><input type="text" id="ple-portrait" value="${esc(pl.portrait || "")}" style="flex:1" placeholder="/places/… (optional)"></div>
    ${isNew ? `<p class="muted" style="font-size:0.85rem;">Save the place first, then request its scene.</p>` : `<div class="formrow" style="align-items:flex-start;"><label>ComfyUI prompt</label>
      <div style="flex:1">
        <textarea id="ple-prompt" rows="3" style="width:100%" placeholder="the place, weather, light, and viewpoint">${esc(pl.imagePrompt || pl.description || "")}</textarea>
        <label class="muted" style="display:flex;align-items:center;gap:.4rem;margin-top:.4rem;font-size:.78rem;"><input type="checkbox" id="ple-embellish" ${artEmbellishPreference("scenic") ? "checked" : ""}> Automatically embellish prompt</label>
        <div class="formrow" style="margin:.4rem 0 0;">
          <button class="quiet" id="ple-image-request" ${ART_STATUS.workflows?.scenic?.ready ? "" : "disabled"}>Request a scene</button>
          <span class="muted" style="font-size:.8rem;">${esc(artHint("scenic"))}</span>
        </div>
      </div>
    </div>`}
    <hr class="rule">
    <div class="formrow">
      <button id="ple-save">${isNew ? "Add place" : "Save"}</button>
      <button class="quiet" id="ple-cancel">Cancel</button>
      ${isNew || pl.fixed ? "" : `<button class="quiet grave" id="ple-delete" style="margin-left:auto;">Delete place</button>`}
    </div>
  </div>`;
  $("#ple-cancel").onclick = () => ($("#places-editor").innerHTML = "");
  const imageRequest = $("#ple-image-request");
  if (imageRequest) imageRequest.onclick = async () => {
    const label = imageRequest.textContent;
    imageRequest.disabled = true;
    imageRequest.textContent = "Painting…";
    try {
      const embellishPrompt = $("#ple-embellish").checked;
      rememberArtEmbellish("scenic", embellishPrompt);
      const result = await api(`/api/places/${encodeURIComponent(pl.id)}/image`, { method: "POST", body: { prompt: $("#ple-prompt").value, embellishPrompt } });
      $("#ple-portrait").value = result.url;
      toast(result.message);
    } catch (error) {
      toast(error.message, true);
    } finally {
      imageRequest.disabled = !ART_STATUS.workflows?.scenic?.ready;
      imageRequest.textContent = label;
    }
  };
  const deleteBtn = $("#ple-delete");
  if (deleteBtn) {
    deleteBtn.onclick = async () => {
      if (!confirm(`Delete ${pl.name}? This also deletes players' notes about it and clears the location from anyone there.`)) return;
      try {
        await api(`/api/places/${pl.id}`, { method: "DELETE" });
        $("#places-editor").innerHTML = "";
        await refresh();
      } catch (e) {
        toast(e.message, true);
      }
    };
  }
  $("#ple-save").onclick = async () => {
    const body = {
      name: $("#ple-name").value,
      kind: $("#ple-kind").value,
      description: $("#ple-description").value,
      hidden: { notes: $("#ple-gmnotes").value },
      portrait: $("#ple-portrait").value || null,
      imagePrompt: $("#ple-prompt")?.value || pl.imagePrompt || "",
      revealed: $("#ple-revealed").checked
    };
    try {
      if (isNew) await api("/api/places", { method: "POST", body });
      else await api(`/api/places/${pl.id}`, { method: "PUT", body });
      $("#places-editor").innerHTML = "";
      await refresh();
    } catch (e) {
      toast(e.message, true);
    }
  };
}

// --- party ---
const activePartyMembers = () => (S.party || []).filter((pc) => pc.active !== false);

function partyIdentity(p) {
  const portrait = p.portrait
    ? `<img src="${esc(p.portrait)}" alt="">`
    : esc((p.name || "?").slice(0, 1).toUpperCase());
  return `<div class="party-identity"><span class="party-portrait" aria-hidden="true">${portrait}</span><span><strong>${esc(p.name)}</strong>${p.player ? `<br><span class="muted" style="font-size:0.85rem;">${esc(p.player)}</span>` : ""}</span></div>`;
}

function renderParty() {
  const active = activePartyMembers();
  const retired = (S.party || []).filter((pc) => pc.active === false);
  const rows = active
    .map(
      (p) => `<tr>
        <td>${partyIdentity(p)}</td>
        <td>${esc(p.ancestry || "")} ${esc(p.class || "")}<br><span class="muted" style="font-size:0.85rem;">${esc(p.subclass || "")}</span></td>
        <td><input type="number" class="num" min="1" max="10" value="${p.level}" data-pclevel="${esc(p.id)}" aria-label="Level for ${esc(p.name)}"></td>
        <td><div class="condition-toggles" aria-label="Conditions for ${esc(p.name)}">${CONDITIONS.map((condition) => {
          const applied = (p.conditions || []).includes(condition.id);
          const action = applied ? "Clear" : "Apply";
          return `<button class="condition-toggle${applied ? " active" : ""}" type="button" data-pccondition="${esc(p.id)}" data-condition="${condition.id}" aria-pressed="${applied}" title="${action} ${condition.name}">${conditionIcon(condition.id)}<span>${condition.name}</span></button>`;
        }).join("")}</div></td>
        <td><a class="sheet-link" href="/character/${encodeURIComponent(p.id)}">Open the sheet</a></td>
        <td><button class="quiet" data-pcart="${esc(p.id)}" ${ART_STATUS.workflows?.portrait?.ready ? "" : "disabled"} title="${esc(artHint("portrait"))}">Portrait</button> <button class="quiet" data-pcretire="${esc(p.id)}">Retire</button></td>
      </tr>`
    )
    .join("");
  $("#party-table").innerHTML = `
    <tr><th>Character</th><th>Class</th><th>Level</th><th>Conditions</th><th>Sheet</th><th></th></tr>
    ${rows || '<tr><td colspan="6" class="muted">No active player characters. Send your players to /create or restore someone below.</td></tr>'}`;
  $("#stepped-back").hidden = retired.length === 0;
  $("#stepped-back-count").textContent = String(retired.length);
  $("#stepped-back-list").innerHTML = retired.map((p) => `<div class="stepped-back-row">
    <span class="party-portrait" aria-hidden="true">${p.portrait ? `<img src="${esc(p.portrait)}" alt="">` : esc((p.name || "?").slice(0, 1).toUpperCase())}</span>
    <span><strong>${esc(p.name)}</strong><span class="muted">${[p.ancestry, p.class, p.player].filter(Boolean).map(esc).join(" · ") || "Character record preserved"}</span></span>
    <button class="quiet" type="button" data-pcrestore="${esc(p.id)}">Return</button>
  </div>`).join("");
  for (const el of document.querySelectorAll("[data-pclevel]")) {
    el.onchange = () =>
      api(`/api/party/${el.dataset.pclevel}`, { method: "PUT", body: { level: clampNum(el, 1, 10) } })
        .then(refresh).catch((e) => toast(e.message, true));
  }
  for (const el of document.querySelectorAll("[data-pccondition]")) {
    el.onclick = async () => {
      const p = S.party.find((x) => x.id === el.dataset.pccondition);
      const current = new Set(p.conditions || []);
      if (current.has(el.dataset.condition)) current.delete(el.dataset.condition);
      else current.add(el.dataset.condition);
      try {
        await api(`/api/party/${p.id}/conditions`, { method: "PUT", body: { conditions: [...current] } });
        await refresh();
      } catch (e) {
        toast(e.message, true);
      }
    };
  }
  for (const el of document.querySelectorAll("[data-pcretire]")) {
    el.onclick = async () => {
      const p = S.party.find((x) => x.id === el.dataset.pcretire);
      if (!confirm(`Retire ${p.name}? Their sheet, inventory, notes, and drawings will be kept, but they will disappear from player choosers.`)) return;
      try {
        await api(`/api/party/${encodeURIComponent(p.id)}`, { method: "DELETE" });
        toast(`${p.name} stepped back from the tale.`);
        await refresh();
      } catch (e) {
        toast(e.message, true);
      }
    };
  }
  for (const el of document.querySelectorAll("[data-pcrestore]")) {
    el.onclick = async () => {
      const p = S.party.find((x) => x.id === el.dataset.pcrestore);
      try {
        await api(`/api/party/${encodeURIComponent(p.id)}/restore`, { method: "POST" });
        toast(`${p.name} returned to the party.`);
        await refresh();
      } catch (e) {
        toast(e.message, true);
      }
    };
  }
  renderConsumableGrant();
  renderPaperDelivery();
}

function renderPaperDelivery() {
  const target = $("#paper-target");
  const selected = target.value;
  const active = activePartyMembers();
  target.innerHTML = active.length
    ? `<option value="group">Whole party — shared copies</option>${active.map((pc) => `<option value="${esc(pc.id)}">${esc(pc.name)} — private</option>`).join("")}`
    : `<option value="">No active characters</option>`;
  target.disabled = active.length === 0;
  $("#paper-deliver").disabled = active.length === 0;
  if ([...target.options].some((option) => option.value === selected)) target.value = selected;
  const papers = (S.party || []).flatMap((pc) => (pc.papers || []).map((paper) => ({ pc, paper })));
  $("#paper-ledger").innerHTML = papers.length ? papers.map(({ pc, paper }) => `<div class="paper-ledger-row">
    <div><strong>${esc(paper.name)}</strong><div class="muted">${esc(pc.name)}${paper.author ? ` · ${esc(paper.author)}` : ""}</div></div>
    <button class="quiet" type="button" data-project-paper="${esc(paper.id)}">Show on projector</button>
  </div>`).join("") : `<div class="muted">No physical papers are carried yet.</div>`;
  for (const button of document.querySelectorAll("[data-project-paper]")) button.onclick = () => project({ type: "paper", refId: button.dataset.projectPaper });
}

function selectedConsumable() {
  const value = $("#grant-consumable").value.trim().toLowerCase();
  return CONSUMABLES.find((item) => item.name.toLowerCase() === value) || null;
}

function renderConsumableGrant() {
  const pcSelect = $("#grant-pc");
  const selectedPc = pcSelect.value;
  const active = activePartyMembers();
  pcSelect.innerHTML = active.length
    ? active.map((pc) => `<option value="${esc(pc.id)}">${esc(pc.name)}</option>`).join("")
    : `<option value="">No active characters</option>`;
  pcSelect.disabled = active.length === 0;
  $("#grant-give").disabled = active.length === 0;
  if ([...pcSelect.options].some((option) => option.value === selectedPc)) pcSelect.value = selectedPc;
  $("#consumable-options").innerHTML = CONSUMABLES.map((item) => `<option value="${esc(item.name)}"></option>`).join("");
  const item = selectedConsumable();
  $("#grant-rules").textContent = item?.description || "Start typing a name to search all 60 standard consumables.";
  $("#grant-roll").textContent = item ? `Loot roll ${String(item.roll).padStart(2, "0")}` : "";
}

$("#grant-consumable").addEventListener("input", renderConsumableGrant);
$("#grant-give").addEventListener("click", async () => {
  const item = selectedConsumable();
  const pcId = $("#grant-pc").value;
  if (!pcId) return toast("Choose a character.", true);
  if (!item) return toast("Choose a consumable from the list.", true);
  try {
    await api(`/api/party/${pcId}/inventory/grant`, {
      method: "POST",
      body: { catalogId: item.id, quantity: clampNum($("#grant-quantity"), 1, 5) }
    });
    const pc = S.party.find((entry) => entry.id === pcId);
    toast(`${item.name} given to ${pc.name}.`);
    $("#grant-consumable").value = "";
    await refresh();
  } catch (e) {
    toast(e.message, true);
  }
});

$("#paper-deliver").addEventListener("click", async () => {
  const target = $("#paper-target").value;
  const name = $("#paper-title").value.trim();
  const body = $("#paper-body").value.trim();
  if (!name || !body) return toast("Give the paper a title and text.", true);
  try {
    const result = await api("/api/party/inventory/paper", { method: "POST", body: { target, name, body } });
    $("#paper-title").value = "";
    $("#paper-body").value = "";
    if ($("#paper-project").checked) await project({ type: "paper", refId: result.delivered[0].itemId });
    else {
      toast(target === "group" ? "Paper delivered to the party." : "Paper delivered privately.");
      await refresh();
    }
  } catch (error) { toast(error.message, true); }
});

// --- session chronicle ---

const SESSION_STATUS_LABELS = {
  gathering: "gathering accounts",
  retelling: "with the chronicler",
  review: "awaiting review",
  failed: "needs attention",
  published: "entered in the chronicle"
};

function sessionParticipantName(session, pcId) {
  return S.party.find((pc) => pc.id === pcId)?.name
    || session.perspectives?.find((perspective) => perspective.pcId === pcId)?.author
    || "A companion";
}

function sessionRosterHtml(session, editable) {
  return `<fieldset class="session-roster" data-session-roster>
    <legend>Characters present</legend>
    ${(session.participants || []).map((pcId) => `<label>
      <input type="checkbox" value="${esc(pcId)}" checked ${editable ? "" : "disabled"}>
      <span>${esc(sessionParticipantName(session, pcId))}</span>
    </label>`).join("")}
    ${editable ? S.party.filter((pc) => pc.active && !(session.participants || []).includes(pc.id)).map((pc) => `<label>
      <input type="checkbox" value="${esc(pc.id)}">
      <span>${esc(pc.name)}</span>
    </label>`).join("") : ""}
  </fieldset>`;
}

function perspectiveSealsHtml(session) {
  const perspectives = new Set((session.perspectives || []).filter((entry) => entry.text).map((entry) => entry.pcId));
  return `<div class="perspective-seals">${(session.participants || []).map((pcId) =>
    `<span class="perspective-seal ${perspectives.has(pcId) ? "complete" : ""}">${esc(sessionParticipantName(session, pcId))}</span>`
  ).join("")}</div>`;
}

function openSessionHtml(session) {
  const editable = session.status === "gathering" || session.status === "failed";
  const reviewing = session.status === "review";
  const stampClass = reviewing ? "review" : session.status === "retelling" ? "retelling" : "";
  const complete = (session.participants || []).filter((pcId) =>
    (session.perspectives || []).some((perspective) => perspective.pcId === pcId && perspective.text)
  ).length;
  const error = session.status === "failed" && session.error
    ? `<div class="session-error">${esc(session.error)}</div>`
    : "";
  const review = reviewing ? `
    <label class="smallcaps" for="retelling-${esc(session.id)}">Review the account</label>
    <textarea class="retelling-review" id="retelling-${esc(session.id)}" data-session-retelling maxlength="30000">${esc(session.retelling?.text || "")}</textarea>
    <div class="session-actions">
      <button type="button" class="quiet" data-session-save-review>Save the reviewed page</button>
      <button type="button" data-session-publish>Enter it into the chronicle</button>
      <span class="status-note">${esc(session.retelling?.model || "")}</span>
    </div>` : `
    <div class="session-fields">
      <label>Factual summary
        <textarea rows="7" maxlength="12000" data-session-summary ${editable ? "" : "readonly"}>${esc(session.gmSummary || "")}</textarea>
      </label>
      <label>What held your attention
        <textarea rows="7" maxlength="4000" data-session-highlight ${editable ? "" : "readonly"}>${esc(session.gmHighlight || "")}</textarea>
      </label>
    </div>
    ${sessionRosterHtml(session, editable)}
    ${perspectiveSealsHtml(session)}
    ${error}
    <div class="session-actions">
      ${editable ? `<button type="button" class="quiet" data-session-save>Save the gathering</button>
        <button type="button" data-session-retell>Send to the chronicler</button>` : ""}
      <span class="status-note">${session.status === "retelling"
        ? "The page will change when the account returns."
        : `${complete} of ${(session.participants || []).length} perspectives received`}</span>
    </div>`;
  return `<article class="session-sheet" data-session="${esc(session.id)}" data-status="${esc(session.status)}">
    <div class="session-head">
      <span class="session-number">${esc(session.number)}</span>
      <div class="session-title">
        <strong>Session ${esc(session.number)}</strong>
        <span>${esc(session.date || "undated")} · ${esc(session.seasonLabel || "")}</span>
      </div>
      <span class="session-stamp ${stampClass}">${esc(SESSION_STATUS_LABELS[session.status] || session.status)}</span>
    </div>
    ${review}
  </article>`;
}

function publishedSessionHtml(session) {
  return `<article class="session-sheet" data-status="published">
    <div class="session-head">
      <span class="session-number">${esc(session.number)}</span>
      <div class="session-title"><strong>Session ${esc(session.number)}</strong><span>${esc(session.date || "undated")} · ${esc(session.seasonLabel || "")}</span></div>
      <span class="session-stamp review">published</span>
    </div>
    <div class="published-excerpt">${esc(session.retelling?.text || "")}</div>
  </article>`;
}

async function saveGathering(article) {
  const id = article.dataset.session;
  return api(`/api/sessions/${encodeURIComponent(id)}`, {
    method: "PUT",
    body: {
      gmSummary: article.querySelector("[data-session-summary]").value,
      gmHighlight: article.querySelector("[data-session-highlight]").value,
      participants: [...article.querySelectorAll("[data-session-roster] input:checked")].map((input) => input.value)
    }
  });
}

async function refreshSessionSection(message) {
  document.activeElement?.blur();
  await refresh();
  renderSessions(true);
  if (message) toast(message);
}

function wireSessions() {
  for (const button of document.querySelectorAll("[data-session-save]")) button.onclick = async () => {
    try {
      await saveGathering(button.closest("[data-session]"));
      await refreshSessionSection("The gathering is saved.");
    } catch (error) { toast(error.message, true); }
  };
  for (const button of document.querySelectorAll("[data-session-retell]")) button.onclick = async () => {
    const article = button.closest("[data-session]");
    try {
      await saveGathering(article);
      await api(`/api/sessions/${encodeURIComponent(article.dataset.session)}/retell`, { method: "POST" });
      await refreshSessionSection("The account has gone to the chronicler.");
    } catch (error) { toast(error.message, true); }
  };
  for (const button of document.querySelectorAll("[data-session-save-review]")) button.onclick = async () => {
    const article = button.closest("[data-session]");
    try {
      await api(`/api/sessions/${encodeURIComponent(article.dataset.session)}`, {
        method: "PUT",
        body: { retellingText: article.querySelector("[data-session-retelling]").value }
      });
      await refreshSessionSection("The reviewed page is saved.");
    } catch (error) { toast(error.message, true); }
  };
  for (const button of document.querySelectorAll("[data-session-publish]")) button.onclick = async () => {
    const article = button.closest("[data-session]");
    if (!confirm("Enter this reviewed account into the players' chronicle?")) return;
    try {
      await api(`/api/sessions/${encodeURIComponent(article.dataset.session)}`, {
        method: "PUT",
        body: { retellingText: article.querySelector("[data-session-retelling]").value }
      });
      await api(`/api/sessions/${encodeURIComponent(article.dataset.session)}/publish`, { method: "POST" });
      await refreshSessionSection("The session has entered the chronicle.");
    } catch (error) { toast(error.message, true); }
  };
}

function renderSessions(force = false) {
  const root = $("#sessions-list");
  if (!root || (!force && document.activeElement?.closest("#sec-sessions"))) return;
  const sessions = [...(S.sessions || [])].sort((a, b) => Number(b.number || 0) - Number(a.number || 0));
  const open = sessions.filter((session) => session.status !== "published");
  const published = sessions.filter((session) => session.status === "published");
  const campaign = S.campaigns?.campaigns?.find((entry) => entry.id === S.campaigns.currentId);
  $("#session-campaign-name").textContent = campaign?.name || "Current campaign";
  $("#session-opening-note").textContent = open.length
    ? "Finish the open account before beginning the next session."
    : "Mark who was at the table, then open their writing prompt.";
  $("#session-open").disabled = open.length > 0 || !S.party.some((pc) => pc.active);
  $("#session-open").textContent = open.length ? "Session account open" : "The session ends";
  $("#session-new-roster").hidden = open.length > 0;
  $("#session-new-roster").innerHTML = `<legend>Who was at the table</legend>${S.party.filter((pc) => pc.active).map((pc) => `<label>
    <input type="checkbox" data-new-session-pc value="${esc(pc.id)}" checked>
    <span>${esc(pc.name)}</span>
  </label>`).join("") || '<span class="muted">No active characters are seated in this campaign.</span>'}`;
  root.innerHTML = `${open.map(openSessionHtml).join("")}
    ${published.length ? `<details class="published-sessions"><summary>Published sessions · ${published.length}</summary>${published.map(publishedSessionHtml).join("")}</details>` : ""}`;
  wireSessions();
}

$("#session-open").addEventListener("click", async () => {
  const participants = [...document.querySelectorAll("[data-new-session-pc]:checked")].map((input) => input.value);
  try {
    await api("/api/sessions", { method: "POST", body: { participants } });
    await refreshSessionSection("The perspective pages are open.");
  } catch (error) { toast(error.message, true); }
});

$("#sec-sessions").addEventListener("focusout", () => {
  setTimeout(() => {
    if (!document.activeElement?.closest("#sec-sessions") && S) renderSessions(true);
  }, 0);
});

// --- ledger ---
function renderLedger() {
  const rows = S.log
    .map((l) => {
      const text = l.summary || "";
      const eventLine = l.event ? `<div style="font-size:0.9rem; margin-top:0.2rem;">${esc(l.event)}</div>` : "";
      return `<tr>
        <td style="white-space:nowrap;" class="muted">${esc(l.season)}</td>
        <td>${esc(text)}${eventLine}${l.note ? `<div class="muted" style="font-size:0.85rem;">${esc(l.note)}</div>` : ""}</td>
        <td style="white-space:nowrap;">
          <label style="font-size:0.82rem;" class="muted">
            <input type="checkbox" data-pub="${l.id}" ${l.published ? "checked" : ""}> chronicle
          </label>
        </td>
      </tr>`;
    })
    .join("");
  $("#log-table").innerHTML = `
    <tr><th>Season</th><th>Entry</th><th>Published</th></tr>
    ${rows || '<tr><td colspan="3" class="muted">The ledger is blank. The first season awaits.</td></tr>'}`;
  for (const el of document.querySelectorAll("[data-pub]")) {
    el.onchange = () =>
      api(`/api/log/${el.dataset.pub}/publish`, { method: "POST", body: { published: el.checked } })
        .then(refresh).catch((e) => toast(e.message, true));
  }
}

$("#season-advance").addEventListener("click", async () => {
  await api("/api/season/advance", { method: "POST" });
  toast("Season advanced.");
  await refresh();
});

$("#note-add").addEventListener("click", async () => {
  try {
    await api("/api/log", {
      method: "POST",
      body: { text: $("#note-text").value, publish: $("#note-publish").checked }
    });
    $("#note-text").value = "";
    await refresh();
  } catch (e) {
    toast(e.message, true);
  }
});

// --- settlement ---
function renderCampaigns() {
  if (document.activeElement?.matches("#campaign-new-name, [data-campaign-name]")) return;
  const ledger = S.campaigns || { currentId: null, campaigns: [] };
  const current = ledger.campaigns.find((campaign) => campaign.id === ledger.currentId);
  $("#campaign-current-name").textContent = current ? `Current table: ${current.name}` : "No current campaign";
  const featureDefinitions = S.playerFeatureDefinitions || [];
  $("#campaign-list").innerHTML = ledger.campaigns.map((campaign) => {
    const isCurrent = campaign.id === ledger.currentId;
    const archived = campaign.status === "archived";
    const created = campaign.createdAt ? new Date(campaign.createdAt).toLocaleDateString() : "undated";
    return `<div class="campaign-row ${isCurrent ? "is-current" : ""} ${archived ? "is-archived" : ""}">
      <span class="campaign-mark" aria-label="${isCurrent ? "Current campaign" : "Campaign"}"><span>◆</span></span>
      <label class="campaign-copy">
        <input type="text" maxlength="80" value="${esc(campaign.name)}" data-campaign-name="${esc(campaign.id)}" aria-label="Campaign name">
        <span class="campaign-meta">${isCurrent ? "current table" : archived ? "archived" : "active"} · entered ${esc(created)}</span>
      </label>
      <div class="campaign-actions">
        <button type="button" class="quiet" data-campaign-save="${esc(campaign.id)}">Rename</button>
        ${!archived && !isCurrent ? `<button type="button" class="quiet" data-campaign-current="${esc(campaign.id)}">Set current</button>` : ""}
        ${archived
          ? `<button type="button" class="quiet" data-campaign-status="${esc(campaign.id)}" data-status="active">Restore</button>`
          : `<button type="button" class="quiet" data-campaign-status="${esc(campaign.id)}" data-status="archived" ${isCurrent ? "disabled title=\"Choose another current campaign first\"" : ""}>Archive</button>`}
      </div>
      <details class="campaign-feature-gate" ${isCurrent ? "open" : ""}>
        <summary>Player access · changes appear immediately</summary>
        <div class="campaign-feature-grid">${featureDefinitions.map((feature) => `<label class="campaign-feature-toggle">
          <input type="checkbox" data-campaign-feature="${esc(campaign.id)}" data-feature-key="${esc(feature.key)}" ${campaign.playerFeatures?.[feature.key] !== false ? "checked" : ""} ${archived ? "disabled" : ""}>
          <strong>${esc(feature.label)}</strong><span>${esc(feature.description)}</span>
        </label>`).join("")}</div>
      </details>
    </div>`;
  }).join("");

  for (const button of document.querySelectorAll("[data-campaign-save]")) button.onclick = async () => {
    const id = button.dataset.campaignSave;
    const name = document.querySelector(`[data-campaign-name="${CSS.escape(id)}"]`).value;
    try {
      await api(`/api/campaigns/${encodeURIComponent(id)}`, { method: "PUT", body: { name } });
      toast("Campaign renamed.");
      await refresh();
    } catch (error) { toast(error.message, true); }
  };
  for (const button of document.querySelectorAll("[data-campaign-current]")) button.onclick = async () => {
    try {
      await api("/api/campaigns/current", { method: "PUT", body: { id: button.dataset.campaignCurrent } });
      toast("The table has changed campaigns.");
      await refresh();
    } catch (error) { toast(error.message, true); }
  };
  for (const button of document.querySelectorAll("[data-campaign-status]")) button.onclick = async () => {
    const status = button.dataset.status;
    const campaign = ledger.campaigns.find((entry) => entry.id === button.dataset.campaignStatus);
    if (status === "archived" && !confirm(`Archive ${campaign?.name || "this campaign"}? Its characters and drafts will be hidden until restored.`)) return;
    try {
      await api(`/api/campaigns/${encodeURIComponent(button.dataset.campaignStatus)}`, { method: "PUT", body: { status } });
      toast(status === "archived" ? "Campaign archived." : "Campaign restored.");
      await refresh();
    } catch (error) { toast(error.message, true); }
  };
  for (const input of document.querySelectorAll("[data-campaign-feature]")) input.onchange = async () => {
    input.disabled = true;
    try {
      await api(`/api/campaigns/${encodeURIComponent(input.dataset.campaignFeature)}`, {
        method: "PUT",
        body: { playerFeatures: { [input.dataset.featureKey]: input.checked } }
      });
      toast(`${input.checked ? "Opened" : "Closed"} ${featureDefinitions.find((feature) => feature.key === input.dataset.featureKey)?.label || "player feature"}.`);
      await refresh();
    } catch (error) {
      input.checked = !input.checked;
      input.disabled = false;
      toast(error.message, true);
    }
  };
}

$("#campaign-create").addEventListener("submit", async (event) => {
  event.preventDefault();
  try {
    await api("/api/campaigns", { method: "POST", body: { name: $("#campaign-new-name").value } });
    $("#campaign-new-name").value = "";
    toast("Campaign added to the ledger.");
    await refresh();
  } catch (error) { toast(error.message, true); }
});

function renderTown() {
  if (document.activeElement && document.activeElement.closest("#sec-town")) return;
  $("#town-name").value = S.settlement.name;
  $("#town-pop").value = S.settlement.population;
  $("#town-notes").value = S.settlement.chronicleNotes || "";
}

$("#town-save").addEventListener("click", async () => {
  try {
    await api("/api/settlement", {
      method: "PUT",
      body: {
        name: $("#town-name").value,
        population: parseInt($("#town-pop").value, 10),
        chronicleNotes: $("#town-notes").value
      }
    });
    toast("Saved.");
    await refresh();
  } catch (e) {
    toast(e.message, true);
  }
});

// --- the Almanac (public rules, private lore, reveal-one-result tables) ---
let WIKI = [];
let wikiById = new Map();
let wikiActive = null;
let wikiFilter = "all";
let wikiLoaded = false;
let TABLES = [];
let tablesLoaded = false;
let almanacView = "pages";

const crumb = (node) => (node.path || []).join(" / ");

function bodyHtml(body) {
  return String(body || "").split(/\n{2,}/).map((block) => {
    const lines = block.split("\n").map((line) => line.trim()).filter(Boolean);
    if (lines.length && lines.every((line) => line.startsWith("- "))) {
      return `<ul>${lines.map((line) => `<li>${esc(line.slice(2))}</li>`).join("")}</ul>`;
    }
    return `<p>${lines.map(esc).join("<br>")}</p>`;
  }).join("");
}

function filteredWikiNodes() {
  const sourceNodes = wikiFilter === "all" ? WIKI : WIKI.filter((node) => node.source === wikiFilter);
  return searchRuleNodes(sourceNodes, $("#wiki-search").value);
}

function renderWikiTree() {
  const nodes = filteredWikiNodes();
  const groups = new Map();
  for (const node of nodes) {
    const label = `${node.source === "lore" ? "Private lore" : "Rules"} / ${crumb(node) || "Unsorted"}`;
    if (!groups.has(label)) groups.set(label, []);
    groups.get(label).push(node);
  }
  for (const el of document.querySelectorAll("[data-pcart]")) {
    el.onclick = async () => {
      const p = S.party.find((candidate) => candidate.id === el.dataset.pcart);
      const suggested = p.portraitPrompt || [p.name, p.ancestry, p.class, p.subclass, "fantasy character portrait"].filter(Boolean).join(", ");
      const portraitPrompt = window.prompt(`Portrait prompt for ${p.name}`, suggested);
      if (portraitPrompt === null) return;
      const label = el.textContent;
      el.disabled = true;
      el.textContent = "Painting…";
      try {
        const result = await api(`/api/party/${encodeURIComponent(p.id)}/portrait`, { method: "POST", body: { prompt: portraitPrompt } });
        toast(result.message);
        await refresh();
      } catch (error) {
        toast(error.message, true);
        el.disabled = false;
        el.textContent = label;
      }
    };
  }
  $("#wiki-index-status").textContent = `${nodes.length} ${nodes.length === 1 ? "page" : "pages"}`;
  $("#wiki-tree").innerHTML = nodes.length
    ? [...groups.entries()].sort(([left], [right]) => left.localeCompare(right)).map(([label, entries]) => `
        <div class="group">${esc(label)}</div>
        ${entries.map((node) => `
          <button type="button" class="leaf ${node.id === wikiActive ? "on" : ""}" data-wiki="${esc(node.id)}">
            ${esc(node.title)}<span class="leaf-source">${node.source === "lore" ? "lore" : "rule"}</span>
          </button>`).join("")}`).join("")
    : `<p class="almanac-empty">No page carries that wording.</p>`;
  $("#wiki-tree").querySelectorAll("[data-wiki]").forEach((button) => {
    button.addEventListener("click", () => openWikiNode(button.dataset.wiki));
  });
}

function openWikiNode(id) {
  const node = wikiById.get(id);
  if (!node) return;
  wikiActive = id;
  const related = (node.seeAlso || []).map((relatedId) => wikiById.get(relatedId)).filter(Boolean);
  $("#wiki-main").innerHTML = `
    <p class="crumb">${esc(crumb(node))}${node.source === "lore" ? " / private lore" : " / rules"}</p>
    <h3>${esc(node.title)}</h3>
    <div class="almanac-rule" aria-hidden="true"><i></i></div>
    <div class="body">${bodyHtml(node.body)}</div>
    ${related.length ? `<div class="almanac-related">${related.map((entry) => `<button type="button" class="quiet" data-wiki="${esc(entry.id)}">${esc(entry.title)}</button>`).join("")}</div>` : ""}
    ${node.source === "lore" ? `<div class="almanac-article-actions"><button type="button" class="quiet" data-wiki-edit="${esc(node.id)}">Edit page</button><button type="button" class="quiet" data-wiki-delete="${esc(node.id)}">Remove page</button></div>` : ""}`;
  renderWikiTree();
  $("#wiki-main").querySelectorAll("[data-wiki]").forEach((button) => {
    button.addEventListener("click", () => openWikiNode(button.dataset.wiki));
  });
  $("#wiki-main [data-wiki-edit]")?.addEventListener("click", () => wikiEditor(node));
  $("#wiki-main [data-wiki-delete]")?.addEventListener("click", async (event) => {
    if (!confirm(`Remove "${node.title}" from the private Almanac?`)) return;
    const button = event.currentTarget;
    button.disabled = true;
    try {
      await api(`/api/gm/almanac/lore/${node.id}`, { method: "DELETE" });
      wikiActive = null;
      await loadWiki();
      $("#wiki-main").innerHTML = `<p class="almanac-empty">The page has been removed.</p>`;
      toast("Lore page removed.");
    } catch (error) {
      button.disabled = false;
      toast(error.message, true);
    }
  });
}

function wikiEditor(sourceNode) {
  const isNew = !sourceNode;
  const node = sourceNode || { title: "", path: ["Lore"], body: "", keywords: [] };
  $("#wiki-main").innerHTML = `
    <div class="almanac-editor">
      <p class="crumb">${isNew ? "Private lore / new page" : "Private lore / editing"}</p>
      <h3>${isNew ? "Bind a new page" : `Edit ${esc(node.title)}`}</h3>
      <label>Title<input type="text" id="wk-title" maxlength="120" value="${esc(node.title)}"></label>
      <label>Shelf<input type="text" id="wk-path" maxlength="480" value="${esc((node.path || []).join(" / "))}" placeholder="Lore / The World"></label>
      <label>Search words<input type="text" id="wk-keywords" maxlength="600" value="${esc((node.keywords || []).join(", "))}"></label>
      <label>Page<textarea id="wk-body" maxlength="30000">${esc(node.body)}</textarea></label>
      <div class="almanac-article-actions"><button type="button" id="wk-save">${isNew ? "Bind it in" : "Save page"}</button><button type="button" class="quiet" id="wk-cancel">Cancel</button></div>
    </div>`;
  $("#wk-title").focus();
  $("#wk-cancel").addEventListener("click", () => {
    if (isNew) $("#wiki-main").innerHTML = `<p class="almanac-empty">Choose a page from the index.</p>`;
    else openWikiNode(node.id);
  });
  $("#wk-save").addEventListener("click", async (event) => {
    const button = event.currentTarget;
    const body = {
      title: $("#wk-title").value,
      path: $("#wk-path").value.split("/").map((part) => part.trim()).filter(Boolean),
      keywords: $("#wk-keywords").value.split(",").map((word) => word.trim()).filter(Boolean),
      body: $("#wk-body").value
    };
    button.disabled = true;
    try {
      const saved = isNew
        ? await api("/api/gm/almanac/lore", { method: "POST", body })
        : await api(`/api/gm/almanac/lore/${node.id}`, { method: "PUT", body });
      await loadWiki();
      openWikiNode(saved.id);
      toast(isNew ? "Lore page bound into the Almanac." : "Lore page saved.");
    } catch (error) {
      button.disabled = false;
      toast(error.message, true);
    }
  });
}

async function loadWiki() {
  const payload = await api("/api/gm/almanac");
  WIKI = prepareRuleNodes(payload);
  wikiById = new Map(WIKI.map((node) => [node.id, node]));
  wikiLoaded = true;
  renderWikiTree();
  if (wikiActive && wikiById.has(wikiActive)) openWikiNode(wikiActive);
}

function progressMarkup(seen, total) {
  const safeTotal = Math.max(Number(total) || 0, 1);
  const safeSeen = Math.min(Math.max(Number(seen) || 0, 0), safeTotal);
  const progress = Math.round((safeSeen / safeTotal) * 100);
  return `<div class="chance-progress"><span>${safeSeen} of ${total} pages turned</span><span class="chance-progress-track" aria-hidden="true"><i style="--progress:${progress}%"></i></span></div>`;
}

function renderTravelTool(table) {
  const danger = Object.entries(table.travel.danger || {});
  const modes = Object.entries(table.travel.modes || {});
  return `<article class="chance-tool travel">
    <div class="chance-die compound">d12+d6</div>
    <div class="chance-copy">
      <h3>${esc(table.name)}</h3>
      <p class="muted">${esc(table.blurb)}</p>
      <div class="chance-controls">
        <label>Danger<select id="travel-danger">${danger.map(([key, value]) => `<option value="${esc(key)}">${esc(value.label)} (${value.seen}/${value.total})</option>`).join("")}</select></label>
        <label>Way of travel<select id="travel-mode">${modes.map(([key, value]) => `<option value="${esc(key)}">${esc(value.label)} (${value.seen}/${value.total})</option>`).join("")}</select></label>
        <label>Physical d12<input type="number" id="travel-raw" min="1" max="12" inputmode="numeric" placeholder="optional"></label>
        <label>Physical d6<input type="number" id="travel-twist-raw" min="1" max="6" inputmode="numeric" placeholder="optional"></label>
        <button type="button" data-travel-roll>Set out</button>
      </div>
    </div>
  </article>`;
}

function renderTables() {
  $("#tables-grid").innerHTML = TABLES.map((table) => table.travel ? renderTravelTool(table) : `
    <article class="chance-tool">
      <div class="chance-die">d${table.die}</div>
      <div class="chance-copy">
        <h3>${esc(table.name)}</h3>
        <p class="muted">${esc(table.blurb)}</p>
        ${progressMarkup(table.seen, table.total)}
        <div class="chance-controls">
          <label>Physical result<input type="number" min="1" max="${table.die}" inputmode="numeric" placeholder="optional" data-table-raw="${esc(table.id)}"></label>
          <button type="button" data-table-roll="${esc(table.id)}">Turn one page</button>
        </div>
      </div>
    </article>`).join("");
  $("#tables-grid").querySelectorAll("[data-table-roll]").forEach((button) => {
    button.addEventListener("click", async () => {
      const table = TABLES.find((entry) => entry.id === button.dataset.tableRoll);
      const raw = $(`[data-table-raw="${CSS.escape(table.id)}"]`).value;
      button.disabled = true;
      try {
        const result = await api(`/api/gm/tables/${table.id}/roll`, { method: "POST", body: raw ? { raw } : {} });
        showTableResult(table.name, result);
        await loadTables(false);
      } catch (error) {
        button.disabled = false;
        toast(error.message, true);
      }
    });
  });
  $("#tables-grid [data-travel-roll]")?.addEventListener("click", rollTravelTable);
}

async function rollTravelTable(event) {
  const button = event.currentTarget;
  const table = TABLES.find((entry) => entry.travel);
  const body = { mode: $("#travel-mode").value, danger: $("#travel-danger").value };
  if ($("#travel-raw").value) body.raw = $("#travel-raw").value;
  if ($("#travel-twist-raw").value) body.twistRaw = $("#travel-twist-raw").value;
  button.disabled = true;
  try {
    const result = await api("/api/gm/tables/travel/roll", { method: "POST", body });
    showTableResult(table.name, result);
    await loadTables(false);
  } catch (error) {
    button.disabled = false;
    toast(error.message, true);
  }
}

function showTableResult(name, result) {
  const encounter = result.encounter || result;
  const repeated = encounter.seenBefore || result.twist?.seenBefore;
  const number = `${encounter.n}${result.twist ? ` / ${result.twist.n}` : ""}`;
  const context = result.tierLabel ? `${result.tierLabel} / ${result.modeLabel}` : `Page ${encounter.n}`;
  $("#table-result").innerHTML = `<article class="chance-reveal">
    <header class="chance-reveal-head">
      <div class="chance-reveal-number">${esc(number)}</div>
      <div class="chance-reveal-title"><strong>${esc(name)}</strong><span>${esc(context)}</span></div>
    </header>
    <div class="entry-text">${esc(encounter.entry.text)}</div>
    ${encounter.entry.reward ? `<div class="entry-reward">${esc(encounter.entry.reward)}</div>` : ""}
    ${result.twist ? `<div class="entry-text"><strong>The way colors it:</strong> ${esc(result.twist.entry.text)}</div>` : ""}
    ${repeated ? `<div class="seen">A page in this result has been turned before.</div>` : ""}
    <div class="almanac-article-actions"><button type="button" class="quiet" id="tr-ledger">Enter it into the ledger</button></div>
  </article>`;
  const ledgerButton = $("#tr-ledger");
  ledgerButton.addEventListener("click", async () => {
    const text = `${name}${result.tierLabel ? ` (${result.tierLabel}, ${result.modeLabel})` : ""} ${encounter.n}${result.twist ? `/${result.twist.n}` : ""}: ${encounter.entry.text}${result.twist ? ` — ${result.twist.entry.text}` : ""}`;
    ledgerButton.disabled = true;
    try {
      await api("/api/log", { method: "POST", body: { text } });
      ledgerButton.textContent = "Entered into the ledger";
      toast("Entered into the ledger.");
    } catch (error) {
      ledgerButton.disabled = false;
      toast(error.message, true);
    }
  });
  $("#table-result").scrollIntoView({ behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "nearest" });
}

async function loadTables(clearResult = true) {
  TABLES = await api("/api/gm/tables");
  tablesLoaded = true;
  renderTables();
  if (clearResult) $("#table-result").innerHTML = "";
}

function setAlmanacView(view) {
  almanacView = view === "chance" ? "chance" : "pages";
  document.querySelectorAll("[data-almanac-view]").forEach((button) => {
    const active = button.dataset.almanacView === almanacView;
    button.classList.toggle("active", active);
    button.setAttribute("aria-selected", String(active));
  });
  document.querySelectorAll("[data-almanac-pane]").forEach((pane) => {
    pane.hidden = pane.dataset.almanacPane !== almanacView;
  });
  if (almanacView === "pages" && !wikiLoaded) {
    $("#wiki-tree").innerHTML = `<p class="almanac-empty">Opening the index.</p>`;
    loadWiki().catch((error) => toast(error.message, true));
  }
  if (almanacView === "chance" && !tablesLoaded) {
    $("#tables-grid").innerHTML = `<p class="almanac-empty">Opening the chance tables.</p>`;
    loadTables().catch((error) => toast(error.message, true));
  }
}

$("#wiki-search").addEventListener("input", renderWikiTree);
$("#wiki-search").addEventListener("keydown", (event) => {
  if (event.key === "Enter") {
    const first = filteredWikiNodes()[0];
    if (first) openWikiNode(first.id);
  }
});
$("#wiki-new").addEventListener("click", () => wikiEditor(null));
document.querySelectorAll("[data-wiki-filter]").forEach((button) => {
  button.addEventListener("click", () => {
    wikiFilter = button.dataset.wikiFilter;
    document.querySelectorAll("[data-wiki-filter]").forEach((entry) => entry.classList.toggle("active", entry === button));
    renderWikiTree();
  });
});
document.querySelectorAll("[data-almanac-view]").forEach((button) => {
  button.addEventListener("click", () => setAlmanacView(button.dataset.almanacView));
});

document.querySelectorAll("[data-image-view]").forEach((button) => {
  button.addEventListener("click", () => setImageLibraryView(button.dataset.imageView));
});
$("#scene-place").addEventListener("change", updateSceneSublocations);
$("#scene-embellish").checked = artEmbellishPreference("scenic");
$("#scene-embellish").addEventListener("change", () => rememberArtEmbellish("scenic", $("#scene-embellish").checked));
$("#scene-open-place").addEventListener("click", () => openPlaceFromLibrary($("#scene-place").value));
$("#scene-tag-back").addEventListener("click", sceneTagBack);
$("#scene-tag-start").addEventListener("click", () => {
  sceneTagState.route = [];
  renderSceneTagBoard("back");
});
$("#scene-tag-clear").addEventListener("click", () => {
  sceneTagState.explicit.clear();
  sceneTagState.excluded.clear();
  syncSceneDirection();
  renderSceneTagBoard();
});
$("#scene-tag-pin-add").addEventListener("click", addScenePin);
$("#scene-tag-pin-input").addEventListener("keydown", (event) => {
  if (event.key === "Enter") {
    event.preventDefault();
    addScenePin();
  }
});
$("#scene-form").addEventListener("submit", generateScene);

// --- boot ---
showSection(location.hash.slice(1) || "season");
refresh().catch((e) => toast(e.message, true));
