import { TAGS, ROOT_IDS, findTag, childIds, descendantIds } from "./taxonomy.js";
import { initTerms } from "/shared/i18n.js";
import { setTelemetryMode } from "/shared/telemetry.js";
import "/shared/feedback.js";

initTerms();

const $ = (selector) => document.querySelector(selector);
const esc = (value) => String(value ?? "").replace(/[&<>"']/g, (char) =>
  ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]));
const MUSIC_EMBEDDED = new URLSearchParams(location.search).get("embed") === "1";

document.body.classList.toggle("embedded", MUSIC_EMBEDDED);

const PROMPT_ENVELOPE = "tag-board-v1";
const edgePalette = ["#8ecfd0", "#e7b8c5", "#ead18c", "#a9d2b6", "#c5b6e1", "#efc2ad", "#acc6df"];
const state = {
  data: { provider: {}, songs: [], playlists: [], characterTags: [] },
  playlistId: "library",
  route: [],
  explicit: new Set(),
  excluded: new Set(),
  pins: loadPins(),
  history: loadHistory(),
  layouts: loadBubbleLayouts(),
  colors: loadBubbleColors(),
  popStates: new Map(),
  paintColor: null,
  selectedCharacter: null,
  playingId: null,
  queue: loadQueue(),
  clickTimer: null,
  tagTransitioning: false
};

const bubblePhysics = {
  items: new Map(),
  frame: 0,
  lastTime: 0,
  drag: null,
  stageWidth: 0,
  stageHeight: 0,
  layoutMode: null
};

function loadPins() {
  try {
    const value = JSON.parse(localStorage.getItem("settlement-music-pins") || "[]");
    return Array.isArray(value) ? value.filter((pin) => pin?.id && pin?.label).slice(0, 24) : [];
  } catch {
    return [];
  }
}

function savePins() {
  localStorage.setItem("settlement-music-pins", JSON.stringify(state.pins));
}

function loadHistory() {
  try {
    const value = JSON.parse(localStorage.getItem("settlement-music-history") || "[]");
    return Array.isArray(value)
      ? value.filter((entry) => entry?.songId).slice(0, 50)
      : [];
  } catch {
    return [];
  }
}

function saveHistory() {
  localStorage.setItem("settlement-music-history", JSON.stringify(state.history));
}

// The play queue mirrors the popped history: songs wait in line until
// they are played or struck, and survive a reload the same way.
function loadQueue() {
  try {
    const value = JSON.parse(localStorage.getItem("settlement-music-queue") || "[]");
    return Array.isArray(value) ? value.filter((id) => typeof id === "string").slice(0, 50) : [];
  } catch {
    return [];
  }
}

function saveQueue() {
  localStorage.setItem("settlement-music-queue", JSON.stringify(state.queue));
}

function loadBubbleLayouts() {
  try {
    const value = JSON.parse(localStorage.getItem("settlement-music-layouts") || "{}");
    return value && typeof value === "object" && !Array.isArray(value) ? value : {};
  } catch {
    return {};
  }
}

function saveBubbleLayouts() {
  localStorage.setItem("settlement-music-layouts", JSON.stringify(state.layouts));
}

function loadBubbleColors() {
  try {
    const value = JSON.parse(localStorage.getItem("settlement-music-colors") || "{}");
    return value && typeof value === "object" && !Array.isArray(value) ? value : {};
  } catch {
    return {};
  }
}

function saveBubbleColors() {
  localStorage.setItem("settlement-music-colors", JSON.stringify(state.colors));
}

async function api(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: { ...(options.body ? { "Content-Type": "application/json" } : {}), ...(options.headers || {}) }
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error || `Request failed (${response.status}).`);
  return body;
}

function toast(message) {
  const el = $("#toast");
  el.textContent = message;
  el.classList.add("show");
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => el.classList.remove("show"), 2600);
}

function formatTime(seconds) {
  if (!Number.isFinite(seconds)) return "0:00";
  const whole = Math.max(0, Math.floor(seconds));
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, "0")}`;
}

function songSourceLabel(song) {
  if (song.mode === "cover") return "character-theme variation";
  const influence = Number(song.settings?.worldThemeWeight);
  if (Number.isFinite(influence) && influence > 0) {
    return `world theme ${Math.round(influence * 100)}%`;
  }
  return song.source;
}

function songById(id) {
  return state.data.songs.find((song) => song.id === id);
}

function playlistById(id) {
  return state.data.playlists.find((playlist) => playlist.id === id);
}

function songSeed(value) {
  let hash = 2166136261;
  for (const char of String(value || "")) {
    hash ^= char.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function bubbleVisual(song, index = 0) {
  const seed = songSeed(song.id || song.title) + index;
  const sizing = bubbleSizeProfile();
  const shapes = [
    ["53% 47% 55% 45% / 48% 54% 46% 52%", "48% 52% 46% 54% / 55% 47% 53% 45%"],
    ["47% 53% 49% 51% / 54% 46% 55% 45%", "54% 46% 53% 47% / 47% 55% 45% 53%"],
    ["51% 49% 46% 54% / 45% 53% 47% 55%", "46% 54% 52% 48% / 53% 45% 55% 47%"]
  ];
  const [shapeA, shapeB] = shapes[seed % shapes.length];
  return {
    a: edgePalette[seed % edgePalette.length],
    b: edgePalette[(seed + 2) % edgePalette.length],
    c: edgePalette[(seed + 5) % edgePalette.length],
    size: sizing.base + (seed % 3) * sizing.step,
    drift: 7 + (seed % 4),
    turn: seed % 360,
    shapeA,
    shapeB
  };
}

function bubbleLayoutMode() {
  if (window.matchMedia("(max-width: 680px)").matches) return "compact";
  if (MUSIC_EMBEDDED || window.matchMedia("(max-width: 2200px)").matches) return "reduced";
  return "wide";
}

function bubbleSizeProfile(mode = bubbleLayoutMode()) {
  if (mode === "compact") return { min: 72, max: 144, base: 84, step: 6, cell: 108 };
  if (mode === "reduced") return { min: 78, max: 172, base: 94, step: 7, cell: 122 };
  return { min: 90, max: 230, base: 114, step: 8, cell: 150 };
}

function bubbleSizeLimits(mode = bubbleLayoutMode()) {
  const profile = bubbleSizeProfile(mode);
  const available = Math.max(48, Math.min(bubblePhysics.stageWidth - 4, bubblePhysics.stageHeight - 4));
  const max = Math.min(profile.max, available);
  return { min: Math.min(profile.min, max), max };
}

function bubbleLayoutKey(songId, mode = bubbleLayoutMode()) {
  return `${mode}:${state.playlistId}:${songId}`;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function drawBubbleItems() {
  for (const item of bubblePhysics.items.values()) {
    item.element.style.left = `${item.x}px`;
    item.element.style.top = `${item.y}px`;
  }
}

function keepBubbleInStage(item, bounce = true) {
  const maxX = Math.max(0, bubblePhysics.stageWidth - item.size);
  const maxY = Math.max(0, bubblePhysics.stageHeight - item.size);
  if (item.x < 0) {
    item.x = 0;
    if (bounce && item.vx < 0) item.vx *= -0.52;
  } else if (item.x > maxX) {
    item.x = maxX;
    if (bounce && item.vx > 0) item.vx *= -0.52;
  }
  if (item.y < 0) {
    item.y = 0;
    if (bounce && item.vy < 0) item.vy *= -0.52;
  } else if (item.y > maxY) {
    item.y = maxY;
    if (bounce && item.vy > 0) item.vy *= -0.52;
  }
}

function resolveBubbleCollisions() {
  const items = [...bubblePhysics.items.values()];
  for (let index = 0; index < items.length; index += 1) {
    for (let otherIndex = index + 1; otherIndex < items.length; otherIndex += 1) {
      const a = items[index];
      const b = items[otherIndex];
      const dx = (b.x + b.size / 2) - (a.x + a.size / 2);
      const dy = (b.y + b.size / 2) - (a.y + a.size / 2);
      const minimum = (a.size + b.size) / 2 + 5;
      const distance = Math.hypot(dx, dy) || 0.001;
      if (distance >= minimum) continue;

      const nx = dx / distance;
      const ny = dy / distance;
      const inverseA = a.dragging || a.locked ? 0 : 1;
      const inverseB = b.dragging || b.locked ? 0 : 1;
      const inverseTotal = inverseA + inverseB;
      if (!inverseTotal) continue;

      const overlap = minimum - distance;
      a.x -= nx * overlap * inverseA / inverseTotal;
      a.y -= ny * overlap * inverseA / inverseTotal;
      b.x += nx * overlap * inverseB / inverseTotal;
      b.y += ny * overlap * inverseB / inverseTotal;

      const relativeSpeed = (b.vx - a.vx) * nx + (b.vy - a.vy) * ny;
      if (relativeSpeed < 0) {
        const impulse = -(1 + 0.48) * relativeSpeed / inverseTotal;
        a.vx -= impulse * nx * inverseA;
        a.vy -= impulse * ny * inverseA;
        b.vx += impulse * nx * inverseB;
        b.vy += impulse * ny * inverseB;
      }
      keepBubbleInStage(a);
      keepBubbleInStage(b);
    }
  }
}

function persistBubblePositions() {
  if (!bubblePhysics.stageWidth || !bubblePhysics.stageHeight) return;
  for (const item of bubblePhysics.items.values()) {
    state.layouts[bubbleLayoutKey(item.id, bubblePhysics.layoutMode || bubbleLayoutMode())] = {
      x: clamp((item.x + item.size / 2) / bubblePhysics.stageWidth, 0, 1),
      y: clamp((item.y + item.size / 2) / bubblePhysics.stageHeight, 0, 1),
      size: Math.round(item.size)
    };
  }
  saveBubbleLayouts();
}

function bubblePhysicsStep(timestamp) {
  bubblePhysics.frame = 0;
  const delta = Math.min(0.032, Math.max(0.001, (timestamp - bubblePhysics.lastTime) / 1000));
  bubblePhysics.lastTime = timestamp;
  const damping = Math.exp(-4.8 * delta);

  for (const item of bubblePhysics.items.values()) {
    if (item.dragging || item.locked) continue;
    item.x += item.vx * delta;
    item.y += item.vy * delta;
    item.vx *= damping;
    item.vy *= damping;
    if (Math.abs(item.vx) < 2) item.vx = 0;
    if (Math.abs(item.vy) < 2) item.vy = 0;
    keepBubbleInStage(item);
  }
  resolveBubbleCollisions();
  drawBubbleItems();

  const moving = bubblePhysics.drag || [...bubblePhysics.items.values()].some((item) => Math.abs(item.vx) > 2 || Math.abs(item.vy) > 2);
  if (moving) {
    bubblePhysics.frame = requestAnimationFrame(bubblePhysicsStep);
  } else {
    persistBubblePositions();
  }
}

function wakeBubblePhysics() {
  if (bubblePhysics.frame) return;
  bubblePhysics.lastTime = performance.now();
  bubblePhysics.frame = requestAnimationFrame(bubblePhysicsStep);
}

function beginBubbleDrag(event, bubble) {
  if (event.button !== 0) return;
  const item = bubblePhysics.items.get(bubble.dataset.song);
  if (!item || item.locked) return;
  const stageRect = $("#bubble-stage").getBoundingClientRect();
  const pointerX = event.clientX - stageRect.left;
  const pointerY = event.clientY - stageRect.top;
  const centerX = item.x + item.size / 2;
  const centerY = item.y + item.size / 2;
  const distance = Math.hypot(pointerX - centerX, pointerY - centerY);
  const mode = distance >= item.size * 0.36 ? "resize" : "move";
  item.dragging = true;
  item.vx = 0;
  item.vy = 0;
  bubblePhysics.drag = {
    item,
    mode,
    pointerId: event.pointerId,
    offsetX: pointerX - item.x,
    offsetY: pointerY - item.y,
    centerX,
    centerY,
    startDistance: distance,
    startSize: item.size,
    startX: event.clientX,
    startY: event.clientY,
    lastX: item.x,
    lastY: item.y,
    lastAt: performance.now(),
    moved: false
  };
  bubble.setPointerCapture(event.pointerId);
  hideBubbleInfo();
  wakeBubblePhysics();
}

function moveBubbleDrag(event, bubble) {
  const drag = bubblePhysics.drag;
  if (!drag || drag.pointerId !== event.pointerId || drag.item.element !== bubble) return;
  const stageRect = $("#bubble-stage").getBoundingClientRect();
  const now = performance.now();
  const elapsed = Math.max(8, now - drag.lastAt);
  if (drag.mode === "resize") {
    const pointerX = event.clientX - stageRect.left;
    const pointerY = event.clientY - stageRect.top;
    const distance = Math.hypot(pointerX - drag.centerX, pointerY - drag.centerY);
    const limits = bubbleSizeLimits(bubblePhysics.layoutMode);
    const size = clamp(drag.startSize + (distance - drag.startDistance) * 2, limits.min, limits.max);
    drag.item.size = size;
    drag.item.x = drag.centerX - size / 2;
    drag.item.y = drag.centerY - size / 2;
    drag.item.vx = 0;
    drag.item.vy = 0;
    bubble.style.setProperty("--bubble-size", `${size}px`);
  } else {
    drag.item.x = event.clientX - stageRect.left - drag.offsetX;
    drag.item.y = event.clientY - stageRect.top - drag.offsetY;
    drag.item.vx = (drag.item.x - drag.lastX) / elapsed * 1000;
    drag.item.vy = (drag.item.y - drag.lastY) / elapsed * 1000;
  }
  keepBubbleInStage(drag.item, false);
  drag.lastX = drag.item.x;
  drag.lastY = drag.item.y;
  drag.lastAt = now;
  drag.moved ||= Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY) > 5;
  if (drag.moved) bubble.classList.add(drag.mode === "resize" ? "resizing" : "dragging");
  hideBubbleInfo();
  resolveBubbleCollisions();
  drawBubbleItems();
  event.preventDefault();
}

function endBubbleDrag(event, bubble) {
  const drag = bubblePhysics.drag;
  if (!drag || drag.pointerId !== event.pointerId || drag.item.element !== bubble) return;
  drag.item.dragging = false;
  bubble.classList.remove("dragging", "resizing", "edge-ready");
  if (drag.moved) {
    bubble.dataset.suppressClick = "true";
    setTimeout(() => delete bubble.dataset.suppressClick, 0);
  }
  bubblePhysics.drag = null;
  persistBubblePositions();
  wakeBubblePhysics();
}

function updateBubbleEdgeHint(event, bubble) {
  if (bubblePhysics.drag) return;
  const rect = bubble.getBoundingClientRect();
  const distance = Math.hypot(event.clientX - (rect.left + rect.width / 2), event.clientY - (rect.top + rect.height / 2));
  bubble.classList.toggle("edge-ready", distance >= rect.width * 0.36);
}

function mountBubblePhysics() {
  if (bubblePhysics.frame) cancelAnimationFrame(bubblePhysics.frame);
  bubblePhysics.frame = 0;
  bubblePhysics.drag = null;
  bubblePhysics.items.clear();
  const stage = $("#bubble-stage");
  const bubbles = [...stage.querySelectorAll("[data-song]")];
  bubblePhysics.stageWidth = stage.clientWidth;
  bubblePhysics.stageHeight = stage.clientHeight;
  bubblePhysics.layoutMode = bubbleLayoutMode();
  if (!bubbles.length || !bubblePhysics.stageWidth || !bubblePhysics.stageHeight) return;

  const sizing = bubbleSizeProfile(bubblePhysics.layoutMode);
  const limits = bubbleSizeLimits(bubblePhysics.layoutMode);
  const columns = Math.max(1, Math.floor(bubblePhysics.stageWidth / sizing.cell));
  const rows = Math.max(1, Math.ceil(bubbles.length / columns));
  bubbles.forEach((bubble, index) => {
    const saved = state.layouts[bubbleLayoutKey(bubble.dataset.song)];
    const naturalSize = bubble.offsetWidth;
    const size = clamp(Number.isFinite(saved?.size) ? saved.size : naturalSize, limits.min, limits.max);
    bubble.style.setProperty("--bubble-size", `${size}px`);
    const fallbackX = ((index % columns) + 0.5) / columns;
    const fallbackY = (Math.floor(index / columns) + 0.5) / rows;
    const item = {
      id: bubble.dataset.song,
      element: bubble,
      size,
      x: (Number.isFinite(saved?.x) ? saved.x : fallbackX) * bubblePhysics.stageWidth - size / 2,
      y: (Number.isFinite(saved?.y) ? saved.y : fallbackY) * bubblePhysics.stageHeight - size / 2,
      vx: 0,
      vy: 0,
      dragging: false,
      locked: false
    };
    keepBubbleInStage(item, false);
    bubblePhysics.items.set(item.id, item);
  });
  for (let pass = 0; pass < 8; pass += 1) resolveBubbleCollisions();
  drawBubbleItems();
  persistBubblePositions();
}

function resizeBubbleField() {
  const stage = $("#bubble-stage");
  const nextWidth = stage.clientWidth;
  const nextHeight = stage.clientHeight;
  if (!bubblePhysics.items.size || !nextWidth || !nextHeight || bubblePhysics.drag) return;
  const previousWidth = bubblePhysics.stageWidth || nextWidth;
  const previousHeight = bubblePhysics.stageHeight || nextHeight;
  for (const item of bubblePhysics.items.values()) {
    const centerX = (item.x + item.size / 2) / previousWidth;
    const centerY = (item.y + item.size / 2) / previousHeight;
    item.x = centerX * nextWidth - item.size / 2;
    item.y = centerY * nextHeight - item.size / 2;
  }
  bubblePhysics.stageWidth = nextWidth;
  bubblePhysics.stageHeight = nextHeight;
  for (let pass = 0; pass < 5; pass += 1) resolveBubbleCollisions();
  drawBubbleItems();
  persistBubblePositions();
}

function revealBubbleField() {
  const stage = $("#bubble-stage");
  if (!stage.clientWidth || !stage.clientHeight || !stage.querySelector("[data-song]")) return;
  if (!bubblePhysics.items.size) mountBubblePhysics();
  else resizeBubbleField();
}

function historyAge(timestamp) {
  const seconds = Math.max(0, Math.floor((Date.now() - Number(timestamp || 0)) / 1000));
  if (seconds < 60) return "just now";
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86400)}d ago`;
}

function renderHistory() {
  const available = state.history.filter((entry) => songById(entry.songId));
  if (available.length !== state.history.length) {
    state.history = available;
    saveHistory();
  }
  $("#history-list").innerHTML = available.length ? available.map((entry) => {
    const song = songById(entry.songId);
    const visual = bubbleVisual(song);
    const detail = [song.duration ? formatTime(song.duration) : song.status, historyAge(entry.poppedAt)].filter(Boolean).join(" · ");
    return `<button class="history-song" data-history-song="${esc(song.id)}" style="--history-color:${visual.a}" title="Play ${esc(song.title)}; right-click for actions">
      <span class="history-drop" aria-hidden="true"></span>
      <span class="history-copy"><strong>${esc(song.title)}</strong><span>${esc(detail)}</span></span>
    </button>`;
  }).join("") : `<div class="history-empty">Popped songs collect here.</div>`;

  for (const row of document.querySelectorAll("[data-history-song]")) {
    row.onclick = () => playSong(row.dataset.historySong);
    row.oncontextmenu = (event) => {
      event.preventDefault();
      showContextMenu(row.dataset.historySong, event.clientX, event.clientY);
    };
  }
}

function rememberPop(songId) {
  state.history = [{ songId, poppedAt: Date.now() }, ...state.history.filter((entry) => entry.songId !== songId)].slice(0, 50);
  saveHistory();
  renderHistory();
}

function renderQueue() {
  const available = state.queue.filter((songId) => songById(songId));
  if (available.length !== state.queue.length) {
    state.queue = available;
    saveQueue();
  }
  $("#queue-list").innerHTML = available.length ? available.map((songId, index) => {
    const song = songById(songId);
    const visual = bubbleVisual(song);
    const detail = [`#${index + 1}`, song.duration ? formatTime(song.duration) : song.status].filter(Boolean).join(" · ");
    return `<div class="history-song queue-song" data-queue-song="${esc(song.id)}" style="--history-color:${visual.a}" title="Play ${esc(song.title)} now; right-click for actions">
      <span class="history-drop" aria-hidden="true"></span>
      <span class="history-copy"><strong>${esc(song.title)}</strong><span>${esc(detail)}</span></span>
      <button class="queue-remove" data-queue-remove="${esc(song.id)}" title="Strike from the queue" aria-label="Remove ${esc(song.title)} from the queue">×</button>
    </div>`;
  }).join("") : `<div class="history-empty">Queued songs wait here until played or struck.</div>`;

  for (const row of document.querySelectorAll("[data-queue-song]")) {
    row.onclick = (event) => {
      if (event.target.closest("[data-queue-remove]")) return;
      playSong(row.dataset.queueSong);
    };
    row.oncontextmenu = (event) => {
      event.preventDefault();
      showContextMenu(row.dataset.queueSong, event.clientX, event.clientY);
    };
  }
  for (const x of document.querySelectorAll("[data-queue-remove]")) {
    x.onclick = (event) => {
      event.stopPropagation();
      state.queue = state.queue.filter((id) => id !== x.dataset.queueRemove);
      saveQueue();
      renderQueue();
    };
  }
}

function queueSong(songId, { next = false } = {}) {
  const song = songById(songId);
  if (!song) return;
  const rest = state.queue.filter((id) => id !== songId);
  state.queue = next ? [songId, ...rest] : [...rest, songId];
  saveQueue();
  renderQueue();
  toast(next ? `${song.title} is next.` : `${song.title} joins the queue.`);
}

function activeSongs() {
  const playlist = playlistById(state.playlistId);
  const ids = playlist ? new Set(playlist.songIds) : null;
  const query = $("#song-search").value.trim().toLowerCase();
  return state.data.songs.filter((song) =>
    (!ids || ids.has(song.id)) &&
    (!query || `${song.title} ${song.prompt}`.toLowerCase().includes(query)));
}

function renderPlaylists() {
  const counts = new Map(state.data.playlists.map((playlist) => [playlist.id, playlist.songIds.length]));
  $("#playlist-list").innerHTML = state.data.playlists.map((playlist) => `
    <button class="playlist-button ${playlist.id === state.playlistId ? "active" : ""}" data-playlist="${esc(playlist.id)}">
      <span>${esc(playlist.name)}</span><span>${counts.get(playlist.id) || 0}</span>
    </button>`).join("");
  for (const button of document.querySelectorAll("[data-playlist]")) {
    button.onclick = () => {
      state.playlistId = button.dataset.playlist;
      renderPlaylists();
      renderBubbles();
    };
  }
}

function sizeBubbleStage(songCount) {
  const stage = $("#bubble-stage");
  if (window.matchMedia("(max-width: 680px)").matches) {
    const columns = Math.max(1, Math.floor((stage.clientWidth || 340) / 156));
    const height = `${Math.max(420, Math.ceil(songCount / columns) * 156 + 28)}px`;
    if (stage.style.minHeight !== height) stage.style.minHeight = height;
  } else if (stage.style.minHeight) {
    stage.style.removeProperty("min-height");
  }
}

function renderBubbles() {
  hideBubbleInfo();
  const playlist = playlistById(state.playlistId);
  $("#collection-title").textContent = playlist?.name || "Library";
  const songs = activeSongs();
  // Library filtering follows the tags the user actually selected. Descendant
  // expansion is generation metadata and must not make a broad tag too strict.
  const filterIds = [...state.explicit];
  const matchingCount = songs.filter((song) => {
    const songTags = new Set(song.tagIds || []);
    return filterIds.every((id) => songTags.has(id));
  }).length;
  const summary = $("#filter-summary");
  summary.hidden = !filterIds.length;
  summary.textContent = filterIds.length
    ? `${matchingCount} of ${songs.length} match ${filterIds.length} included ${filterIds.length === 1 ? "tag" : "tags"}`
    : "";
  const stage = $("#bubble-stage");
  sizeBubbleStage(songs.length);
  stage.innerHTML = songs.length ? songs.map((song, index) => {
    const visual = bubbleVisual(song, index);
    const paintColor = state.colors[song.id] || "transparent";
    const songTags = new Set(song.tagIds || []);
    const missesTags = filterIds.length && !filterIds.every((id) => songTags.has(id));
    const detail = song.status === "ready"
      ? [songSourceLabel(song), song.duration ? formatTime(song.duration) : ""].filter(Boolean).join(" · ")
      : song.status;
    return `<button class="song-bubble ${song.status !== "ready" ? "rendering" : ""} ${missesTags ? "tag-miss" : ""} ${state.colors[song.id] ? "painted" : ""}"
      style="--edge-a:${visual.a};--edge-b:${visual.b};--edge-c:${visual.c};--paint-color:${paintColor};--bubble-size:${visual.size}px;--drift:${visual.drift}s;--bubble-turn:${visual.turn}deg;--bubble-shape-a:${visual.shapeA};--bubble-shape-b:${visual.shapeB}"
      data-song="${esc(song.id)}" aria-label="Play ${esc(song.title)}">
      <strong>${esc(song.title)}</strong><span>${esc(detail)}</span>
    </button>`;
  }).join("") : `<div class="bubble-empty">No songs are in this collection yet.</div>`;

  mountBubblePhysics();
  for (const bubble of document.querySelectorAll("[data-song]")) {
    const song = songById(bubble.dataset.song);
    bubble.onclick = () => {
      if (bubble.dataset.suppressClick) return;
      if (state.paintColor) {
        paintBubble(bubble.dataset.song, bubble);
        return;
      }
      popAndPlay(bubble.dataset.song);
    };
    bubble.onpointerdown = (event) => beginBubbleDrag(event, bubble);
    bubble.onpointermove = (event) => {
      if (bubblePhysics.drag) moveBubbleDrag(event, bubble);
      else updateBubbleEdgeHint(event, bubble);
    };
    bubble.onpointerup = (event) => endBubbleDrag(event, bubble);
    bubble.onpointercancel = (event) => endBubbleDrag(event, bubble);
    bubble.onmouseenter = (event) => showBubbleInfo(song, event.clientX, event.clientY);
    bubble.onmousemove = (event) => {
      if (bubblePhysics.drag) hideBubbleInfo();
      else positionBubbleInfo(event.clientX, event.clientY);
    };
    bubble.onmouseleave = () => {
      bubble.classList.remove("edge-ready");
      hideBubbleInfo();
    };
    bubble.onfocus = () => {
      const rect = bubble.getBoundingClientRect();
      showBubbleInfo(song, rect.right, rect.top + rect.height / 2);
    };
    bubble.onblur = hideBubbleInfo;
    bubble.oncontextmenu = (event) => {
      event.preventDefault();
      showContextMenu(bubble.dataset.song, event.clientX, event.clientY);
    };
  }
  for (const songId of state.popStates.keys()) applyBubblePopState(songId);
  renderPaintTool();
}

function paintBubble(songId, bubble) {
  if (state.paintColor === "clear") delete state.colors[songId];
  else state.colors[songId] = state.paintColor;
  saveBubbleColors();
  bubble.style.setProperty("--paint-color", state.colors[songId] || "transparent");
  bubble.classList.toggle("painted", Boolean(state.colors[songId]));
  bubble.classList.remove("paint-splash");
  void bubble.offsetWidth;
  bubble.classList.add("paint-splash");
  setTimeout(() => bubble.classList.remove("paint-splash"), 380);
}

function renderPaintTool() {
  const active = Boolean(state.paintColor);
  $("#bubble-stage").classList.toggle("painting", active);
  $("#paint-toggle").setAttribute("aria-pressed", String(active));
  $("#paint-pot").style.setProperty("--pot-color", state.paintColor && state.paintColor !== "clear" ? state.paintColor : "transparent");
  for (const swatch of document.querySelectorAll("[data-paint]")) {
    swatch.classList.toggle("selected", swatch.dataset.paint === state.paintColor);
  }
  for (const bubble of document.querySelectorAll("[data-song]")) {
    const song = songById(bubble.dataset.song);
    const action = state.paintColor === "clear" ? "Clear color from" : active ? "Paint" : "Play";
    bubble.setAttribute("aria-label", `${action} ${song?.title || "song"}`);
  }
}

function closePaintPalette() {
  $("#paint-palette").hidden = true;
  $("#paint-toggle").setAttribute("aria-expanded", "false");
}

function positionBubbleInfo(x, y) {
  const info = $("#bubble-info");
  if (info.hidden) return;
  const margin = 12;
  const left = Math.max(margin, Math.min(x + 16, innerWidth - info.offsetWidth - margin));
  const top = Math.max(margin, Math.min(y + 16, innerHeight - info.offsetHeight - margin));
  info.style.left = `${left}px`;
  info.style.top = `${top}px`;
}

function showBubbleInfo(song, x, y) {
  if (!song) return;
  const info = $("#bubble-info");
  const detail = [
    song.status,
    song.duration ? formatTime(song.duration) : "",
    songSourceLabel(song),
    song.settings?.model || ""
  ].filter(Boolean).join(" · ");
  const hasTagEnvelope = song.promptEnvelope?.start === PROMPT_ENVELOPE
    && song.promptEnvelope?.end === PROMPT_ENVELOPE;
  const selected = new Set(song.selectedTagIds || []);
  const seen = new Set();
  const promptTags = hasTagEnvelope ? (song.tagIds || []).map((id) => {
    const tag = tagById(id);
    if (!tag || seen.has(tag.label.toLowerCase())) return "";
    seen.add(tag.label.toLowerCase());
    let tier = 0;
    let current = TAGS[id];
    while (current?.parentId) {
      tier += 1;
      current = TAGS[current.parentId];
    }
    return `<span class="prompt-tag tier-${Math.min(tier, 2)} ${selected.has(id) ? "selected" : ""}">${esc(tag.label)}</span>`;
  }).filter(Boolean).join("") : "";
  const promptPreview = promptTags
    ? `<div class="bubble-info-tags">${promptTags}</div>`
    : song.prompt ? `<p>${esc(song.prompt)}</p>` : "";
  info.innerHTML = `<strong>${esc(song.title)}</strong><div class="bubble-info-meta">${esc(detail)}</div>${promptPreview}`;
  info.hidden = false;
  positionBubbleInfo(x, y);
}

function hideBubbleInfo() {
  $("#bubble-info").hidden = true;
}

function popSound() {
  try {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    const context = new AudioContext();
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = "sine";
    oscillator.frequency.setValueAtTime(260, context.currentTime);
    oscillator.frequency.exponentialRampToValueAtTime(90, context.currentTime + 0.08);
    gain.gain.setValueAtTime(0.08, context.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, context.currentTime + 0.09);
    oscillator.connect(gain).connect(context.destination);
    oscillator.start();
    oscillator.stop(context.currentTime + 0.1);
    oscillator.onended = () => context.close();
  } catch {
    // The visual pop remains useful when a browser blocks synthesized audio.
  }
}

function setBubbleLocked(songId, locked) {
  const item = bubblePhysics.items.get(songId);
  if (item) {
    item.locked = locked;
    if (locked) {
      item.vx = 0;
      item.vy = 0;
    }
  }
}

function applyBubblePopState(songId) {
  const timing = state.popStates.get(songId);
  const bubble = document.querySelector(`[data-song="${CSS.escape(songId)}"]`);
  if (!timing || !bubble) return;
  const now = Date.now();
  if (now >= timing.endAt) {
    bubble.classList.remove("pop", "regrow");
    setBubbleLocked(songId, false);
    state.popStates.delete(songId);
  } else if (now >= timing.regrowAt) {
    bubble.classList.remove("pop");
    bubble.classList.add("regrow");
    setBubbleLocked(songId, true);
  } else {
    bubble.classList.remove("regrow");
    bubble.classList.add("pop");
    setBubbleLocked(songId, true);
  }
}

function finishBubblePop(songId) {
  const bubble = document.querySelector(`[data-song="${CSS.escape(songId)}"]`);
  if (bubble) bubble.classList.remove("pop", "regrow");
  setBubbleLocked(songId, false);
  state.popStates.delete(songId);
}

function popAndPlay(songId) {
  const song = songById(songId);
  if (!song || state.popStates.has(songId)) return;
  const startedAt = Date.now();
  state.popStates.set(songId, { regrowAt: startedAt + 1500, endAt: startedAt + 2050 });
  popSound();
  applyBubblePopState(songId);
  hideBubbleInfo();
  rememberPop(songId);
  setTimeout(() => applyBubblePopState(songId), 1500);
  setTimeout(() => finishBubblePop(songId), 2050);
  if (song.audioUrl) playSong(songId);
  else toast(song.error || "This draft is still being written.");
}

function playSong(songId) {
  const song = songById(songId);
  if (!song?.audioUrl) return toast("No playable audio is available yet.");
  // Played songs leave the queue, however they came to be played.
  if (state.queue.includes(songId)) {
    state.queue = state.queue.filter((id) => id !== songId);
    saveQueue();
    renderQueue();
  }
  const audio = $("#audio");
  state.playingId = songId;
  audio.src = song.audioUrl;
  audio.load();
  audio.play()
    .then(updateTransport)
    .catch(() => toast("Playback was blocked. Press the play control once to continue."));
  $("#playing-title").textContent = song.title;
  const source = songSourceLabel(song);
  $("#playing-detail").textContent = source !== song.source ? source : (song.prompt || "Generated cue");
  updateTransport();
}

function updateTransport() {
  const audio = $("#audio");
  $("#play-toggle").textContent = audio.paused ? "▶" : "❚❚";
  $("#loop-toggle").classList.toggle("on", audio.loop);
}

function showContextMenu(songId, x, y) {
  const song = songById(songId);
  if (!song) return;
  hideBubbleInfo();
  const menu = $("#context-menu");
  const playlistItems = state.data.playlists
    .filter((playlist) => !playlist.fixed || playlist.id === "library")
    .map((playlist) => `<button data-action="playlist" data-id="${esc(playlist.id)}">Add to ${esc(playlist.name)}</button>`)
    .join("");
  menu.innerHTML = `
    <button data-action="play">Play</button>
    <button data-action="queue-next">Play next</button>
    <button data-action="queue">Add to queue</button>
    <button data-action="reuse">Re-use prompt</button>
    <hr>${playlistItems}<hr>
    <button data-action="rename">Rename</button>
    <button data-action="settings">Settings</button>
    <button data-action="delete">Remove from the desk</button>`;
  menu.hidden = false;
  menu.style.left = `${Math.min(x, innerWidth - 230)}px`;
  menu.style.top = `${Math.min(y, innerHeight - menu.offsetHeight - 8)}px`;
  menu.onclick = async (event) => {
    const button = event.target.closest("button");
    if (!button) return;
    hideContextMenu();
    try {
      if (button.dataset.action === "play") playSong(songId);
      if (button.dataset.action === "queue-next") queueSong(songId, { next: true });
      if (button.dataset.action === "queue") queueSong(songId);
      if (button.dataset.action === "reuse") {
        $("#song-description").value = song.description || "";
        $("#song-title").value = `${song.title} variation`;
        $("#song-prompt").value = song.prompt || "";
        toast("Prompt returned to the instrument.");
      }
      if (button.dataset.action === "playlist") {
        await api(`/api/music/playlists/${encodeURIComponent(button.dataset.id)}/songs`, {
          method: "POST", body: JSON.stringify({ songId })
        });
        await load();
        toast(`Added to ${playlistById(button.dataset.id)?.name || "playlist"}.`);
      }
      if (button.dataset.action === "rename") {
        const title = prompt("Song title", song.title);
        if (title?.trim()) {
          await api(`/api/music/songs/${encodeURIComponent(songId)}`, { method: "PUT", body: JSON.stringify({ title }) });
          await load();
        }
      }
      if (button.dataset.action === "settings") {
        setTelemetryMode("settings");
        $("#settings-dialog").showModal();
      }
      if (button.dataset.action === "delete" && confirm(`Remove ${song.title} from the desk? Its audio file will be kept.`)) {
        await api(`/api/music/songs/${encodeURIComponent(songId)}`, { method: "DELETE" });
        await load();
      }
    } catch (error) {
      toast(error.message);
    }
  };
}

function hideContextMenu() {
  $("#context-menu").hidden = true;
}

function pinById(id) {
  return state.pins.find((pin) => pin.id === id);
}

function tagById(id) {
  return TAGS[id] || pinById(id) || null;
}

function ancestors(id) {
  const found = [];
  let current = TAGS[id];
  while (current?.parentId) {
    found.push(current.parentId);
    current = TAGS[current.parentId];
  }
  return found;
}

function excludedByBranch(id) {
  return state.excluded.has(id) || ancestors(id).some((parentId) => state.excluded.has(parentId));
}

function inherited(id) {
  return !excludedByBranch(id) && ancestors(id).some((parentId) => state.explicit.has(parentId));
}

function tagState(id) {
  if (excludedByBranch(id)) return "excluded";
  if (state.explicit.has(id)) return "explicit";
  if (inherited(id)) return "inherited";
  return "";
}

function toggleTag(id) {
  if (state.explicit.has(id)) {
    state.explicit.delete(id);
  } else if (inherited(id) || excludedByBranch(id)) {
    if (excludedByBranch(id)) state.excluded.delete(id);
    else state.excluded.add(id);
  } else {
    state.explicit.add(id);
    state.excluded.delete(id);
  }
  renderTags();
  compilePrompt();
  renderBubbles();
}

function dive(id, source) {
  if (!tagById(id) || state.tagTransitioning) return;
  transitionTags(() => state.route.push(id), source, "forward");
}

function transitionTags(updateRoute, source, direction) {
  if (state.tagTransitioning) return;
  const board = $("#tag-board");
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (reduced || !source) {
    updateRoute();
    renderTags();
    return;
  }
  const boardRect = board.getBoundingClientRect();
  const sourceRect = source.getBoundingClientRect();
  board.style.setProperty("--dive-x", `${sourceRect.left + sourceRect.width / 2 - boardRect.left}px`);
  board.style.setProperty("--dive-y", `${sourceRect.top + sourceRect.height / 2 - boardRect.top}px`);
  state.tagTransitioning = true;
  const outClass = direction === "back" ? "dive-back-out" : "dive-out";
  const inClass = direction === "back" ? "dive-back-in" : "dive-in";
  board.classList.remove("dive-in", "dive-back-in");
  board.classList.add(outClass);
  setTimeout(() => {
    updateRoute();
    renderTags();
    board.classList.remove(outClass);
    board.classList.add(inClass);
    setTimeout(() => {
      board.classList.remove(inClass);
      state.tagTransitioning = false;
    }, 280);
  }, 145);
}

function tagButton(id, extra = "") {
  const tag = tagById(id);
  return `<button class="tag-button ${tagState(id)} ${extra}" data-tag="${esc(id)}">${esc(tag?.label || id)}</button>`;
}

function wireTagButtons(container = document) {
  for (const button of container.querySelectorAll("[data-tag]")) {
    button.onclick = () => {
      clearTimeout(state.clickTimer);
      state.clickTimer = setTimeout(() => toggleTag(button.dataset.tag), 230);
    };
    button.ondblclick = (event) => {
      event.preventDefault();
      clearTimeout(state.clickTimer);
      dive(button.dataset.tag, button);
    };
  }
}

function renderTags() {
  setTelemetryMode(`tags:depth-${state.route.length}`);
  const currentId = state.route.at(-1);
  const current = tagById(currentId);
  if (!currentId) {
    $("#tag-board").innerHTML = `<div class="tag-row tag-roots">${ROOT_IDS.map((id) => tagButton(id)).join("")}</div>`;
  } else if (!current?.groups?.length) {
    $("#tag-board").innerHTML = `
      <div class="current-wrap"><button class="current-tag" id="current-tag">${esc(current?.label || currentId)}</button></div>
      <div class="leaf-note">This word has no finer branches yet. Select it, pin another word, or go back.</div>`;
  } else {
    const [upper, lower] = current.groups;
    $("#tag-board").innerHTML = `
      <div class="tag-group-label">${esc(upper.label)}</div>
      <div class="tag-row">${upper.ids.map((id) => tagButton(id)).join("")}</div>
      <div class="current-wrap"><button class="current-tag" id="current-tag">${esc(current.label)}</button></div>
      <div class="tag-row">${lower.ids.map((id) => tagButton(id)).join("")}</div>
      <div class="tag-group-label">${esc(lower.label)}</div>`;
  }
  wireTagButtons($("#tag-board"));
  const center = $("#current-tag");
  if (center) center.onclick = goBack;
  $("#clear-tags").disabled = state.explicit.size === 0 && state.excluded.size === 0;
  renderPins();
}

function goBack() {
  if (!state.route.length || state.tagTransitioning) return;
  transitionTags(() => state.route.pop(), $("#current-tag") || $("#tag-back"), "back");
}

function renderPins() {
  $("#pinned-row").innerHTML = state.pins.map((pin) =>
    `<button class="pin-tag ${tagState(pin.id) === "explicit" ? "on" : ""}" data-pin="${esc(pin.id)}" title="Double-click to open">${esc(pin.label)}</button>`
  ).join("");
  for (const button of document.querySelectorAll("[data-pin]")) {
    button.onclick = () => {
      clearTimeout(state.clickTimer);
      state.clickTimer = setTimeout(() => toggleTag(button.dataset.pin), 230);
    };
    button.ondblclick = (event) => {
      event.preventDefault();
      clearTimeout(state.clickTimer);
      dive(button.dataset.pin, button);
    };
  }
}

function effectiveTagIds() {
  const active = new Set();
  for (const id of state.explicit) {
    if (excludedByBranch(id)) continue;
    active.add(id);
    if (TAGS[id]) {
      for (const childId of descendantIds(id)) {
        if (!excludedByBranch(childId)) active.add(childId);
      }
    }
  }
  return [...active];
}

function selectedTagIds() {
  return [...state.explicit].filter((id) => !excludedByBranch(id));
}

function compilePrompt() {
  const items = [];
  const seen = new Set();
  for (const id of effectiveTagIds()) {
    const tag = tagById(id);
    const payload = tag?.payload || tag?.label;
    if (payload && !seen.has(payload.toLowerCase())) {
      seen.add(payload.toLowerCase());
      items.push(payload);
    }
  }
  const character = state.data.characterTags.find((entry) => entry.pcId === state.selectedCharacter);
  if (character?.theme?.identity) items.unshift(character.theme.identity);
  $("#song-prompt").value = items.join(", ");
}

function renderCharacters() {
  const wrap = $("#character-sources");
  wrap.hidden = !state.data.characterTags.length;
  $("#character-tags").innerHTML = state.data.characterTags.map((entry) =>
    `<button class="character-tag ${entry.pcId === state.selectedCharacter ? "on" : ""}" data-character="${esc(entry.pcId)}">${esc(entry.name)}</button>`
  ).join("");
  for (const button of document.querySelectorAll("[data-character]")) {
    button.onclick = () => {
      state.selectedCharacter = state.selectedCharacter === button.dataset.character ? null : button.dataset.character;
      renderCharacters();
      compilePrompt();
    };
  }
  const selected = state.data.characterTags.find((entry) => entry.pcId === state.selectedCharacter);
  $("#source-note").textContent = selected
    ? `Covering ${selected.name}'s published theme`
    : "Original composition";
  renderWorldThemeControl(selected);
}

function renderWorldThemeControl(selectedCharacter = null) {
  const config = state.data.worldTheme || { title: "Vessa'rin", start: 3, end: 13, ready: false };
  const slider = $("#world-theme-weight");
  const characterWeight = $("#audio-weight");
  const value = Math.max(0, Math.min(100, Number(slider.value) || 0));
  const unavailable = Boolean(selectedCharacter) || !config.ready;

  slider.disabled = unavailable;
  characterWeight.disabled = !selectedCharacter;
  $("#world-theme-value").textContent = `${value}%`;
  $(".world-theme-control").classList.toggle("unavailable", unavailable);

  if (selectedCharacter) {
    $("#world-theme-source").textContent = "Character theme selected - one audio reference at a time.";
    $("#source-note").textContent = `Covering ${selectedCharacter.name}'s published theme`;
  } else if (!config.ready) {
    $("#world-theme-source").textContent = `Sync ${config.title} to make its sample available.`;
    $("#source-note").textContent = "Original composition";
  } else {
    $("#world-theme-source").textContent = `${formatTime(config.start)}-${formatTime(config.end)} of ${config.title}`;
    $("#source-note").textContent = value > 0 ? `World Theme at ${value}%` : "Original composition";
  }
}

async function captureSunoCollection(endpoint, targetName) {
  if (!/(^|\.)suno\.com$/i.test(location.hostname)) {
    alert(`Open the ${targetName} collection on Suno before using this helper.`);
    return;
  }

  const found = new Map();
  const normalize = (value) => String(value || "").replace(/\s+/g, " ").trim();
  function collectVisibleSongs() {
    for (const link of document.querySelectorAll('a[href*="/song/"]')) {
      const match = link.getAttribute("href")?.match(/\/song\/([0-9a-f-]{36})/i);
      if (!match) continue;
      const id = match[1].toLowerCase();
      const title = normalize(link.textContent);
      if (!title) continue;
      const row = link.closest('[role="row"]') || link.closest("button") || link.parentElement;
      const lines = String(row?.innerText || "").split("\n").map(normalize).filter(Boolean);
      const durationLabel = lines.find((line) => /^\d+:\d{2}$/.test(line));
      const durationParts = durationLabel?.split(":").map(Number) || [];
      const duration = durationParts.length === 2 ? durationParts[0] * 60 + durationParts[1] : null;
      const model = lines.find((line) => /^(?:v\d|studio)/i.test(line)) || "";
      const style = lines
        .filter((line) => line !== title && line !== durationLabel && line !== model && !/^(?:remix|share|more)$/i.test(line))
        .sort((left, right) => right.length - left.length)[0] || "";
      const imageUrl = row?.querySelector('img[alt*="Song"]')?.src || "";
      found.set(id, { id, title, duration, model, style, imageUrl });
    }
  }

  const scroller = document.scrollingElement || document.documentElement;
  const startingTop = scroller.scrollTop;
  let previousCount = -1;
  let stablePasses = 0;
  for (let pass = 0; pass < 40 && stablePasses < 3; pass += 1) {
    collectVisibleSongs();
    stablePasses = found.size === previousCount ? stablePasses + 1 : 0;
    previousCount = found.size;
    window.scrollTo(0, scroller.scrollHeight);
    await new Promise((resolve) => setTimeout(resolve, 450));
  }
  collectVisibleSongs();
  window.scrollTo(0, startingTop);

  const collectionName = normalize(document.querySelector("main h1")?.textContent || document.querySelector("h1")?.textContent);
  const snapshot = { collectionName, sourceUrl: location.href, songs: [...found.values()] };
  const sameName = collectionName.normalize("NFKC").toLocaleLowerCase()
    === targetName.normalize("NFKC").toLocaleLowerCase();
  if (!sameName) {
    alert(`This is “${collectionName || "an unnamed page"}”. Open “${targetName}” before syncing.`);
    return;
  }
  if (!snapshot.songs.length) {
    alert("No songs were visible, so the local mirror was left unchanged.");
    return;
  }

  const serialized = JSON.stringify(snapshot);
  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: serialized
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || `Sync returned ${response.status}.`);
    alert(`${targetName} synchronized: ${result.total} songs, ${result.downloaded} new downloads.`);
  } catch (error) {
    try {
      await navigator.clipboard.writeText(serialized);
      alert(`Direct sync was blocked. The snapshot was copied; use “Import copied snapshot” at the music desk.\n\n${error.message}`);
    } catch {
      prompt("Copy this snapshot into the music desk:", serialized);
    }
  }
}

function sunoBookmarklet(targetName) {
  const endpoint = `${location.origin}/api/music/suno-snapshot`;
  return `javascript:(${captureSunoCollection.toString()})(${JSON.stringify(endpoint)},${JSON.stringify(targetName)})`;
}

function renderSunoMirror() {
  const mirror = state.data.sunoMirror || { targetName: "Vessa'rin" };
  const nameInput = $("#suno-mirror-name");
  if (document.activeElement !== nameInput) nameInput.value = mirror.targetName || "Vessa'rin";
  const helper = $("#suno-helper");
  helper.href = sunoBookmarklet(nameInput.value);
  helper.textContent = `${nameInput.value} sync`;
  const result = mirror.lastResult;
  $("#suno-mirror-status").textContent = mirror.lastSyncedAt && result
    ? `${result.total} ${result.total === 1 ? "song" : "songs"} · ${result.downloaded} downloaded · ${result.removed} removed from the mirror · ${new Date(mirror.lastSyncedAt).toLocaleString()}`
    : "Not synchronized yet.";
}

function renderProvider() {
  const provider = state.data.provider || {};
  $("#provider-dot").classList.toggle("ready", Boolean(provider.ready));
  $("#provider-label").textContent = provider.mode === "live" ? "Suno live" : "Local rehearsal mode";
  const credits = provider.credits === null || provider.credits === undefined ? "Not checked" : String(provider.credits);
  $("#provider-detail").innerHTML = `
    <p><strong>${esc(provider.name || "Music provider")}</strong> · ${esc(provider.mode || "mock")}</p>
    <p class="muted">API key: ${provider.keyConfigured ? "configured" : "not configured"}<br>Credits: ${esc(credits)}${provider.error ? `<br>${esc(provider.error)}` : ""}</p>`;
}

function renderIdentities() {
  $("#identity-list").innerHTML = state.data.characterTags.length
    ? state.data.characterTags.map((entry) => `
      <div class="identity-editor">
        <strong>${esc(entry.name)}</strong>
        <textarea data-identity="${esc(entry.pcId)}" maxlength="2000">${esc(entry.theme.identity || "")}</textarea>
        <button class="quiet" data-save-identity="${esc(entry.pcId)}" type="button">Save</button>
      </div>`).join("")
    : `<p class="muted">Character identities appear after a theme is published.</p>`;
  for (const button of document.querySelectorAll("[data-save-identity]")) {
    button.onclick = async () => {
      const pcId = button.dataset.saveIdentity;
      const identity = document.querySelector(`[data-identity="${CSS.escape(pcId)}"]`).value;
      try {
        await api(`/api/music/themes/${encodeURIComponent(pcId)}/identity`, {
          method: "PUT", body: JSON.stringify({ identity })
        });
        await load();
        toast("Musical identity saved.");
      } catch (error) {
        toast(error.message);
      }
    };
  }
}

async function load() {
  try {
    state.data = await api("/api/music");
    if (!playlistById(state.playlistId)) state.playlistId = "library";
    if (state.selectedCharacter && !state.data.characterTags.some((entry) => entry.pcId === state.selectedCharacter)) {
      state.selectedCharacter = null;
    }
    renderPlaylists();
    renderBubbles();
    renderHistory();
    renderQueue();
    renderCharacters();
    renderProvider();
    renderSunoMirror();
    renderIdentities();
  } catch (error) {
    toast(error.message);
  }
}

$("#song-search").oninput = renderBubbles;
$("#world-theme-weight").oninput = () => {
  const selected = state.data.characterTags.find((entry) => entry.pcId === state.selectedCharacter);
  renderWorldThemeControl(selected);
};
$("#paint-toggle").onclick = () => {
  const palette = $("#paint-palette");
  palette.hidden = !palette.hidden;
  $("#paint-toggle").setAttribute("aria-expanded", String(!palette.hidden));
};
for (const swatch of document.querySelectorAll("[data-paint]")) {
  swatch.onclick = () => {
    state.paintColor = swatch.dataset.paint;
    renderPaintTool();
    closePaintPalette();
  };
}
$("#stop-paint").onclick = () => {
  state.paintColor = null;
  renderPaintTool();
  closePaintPalette();
};
$("#arrange-bubbles").onclick = () => {
  const prefix = `${bubbleLayoutMode()}:${state.playlistId}:`;
  for (const key of Object.keys(state.layouts)) {
    if (key.startsWith(prefix)) delete state.layouts[key];
  }
  saveBubbleLayouts();
  renderBubbles();
};
$("#clear-queue").onclick = () => {
  state.queue = [];
  saveQueue();
  renderQueue();
};

$("#clear-history").onclick = () => {
  state.history = [];
  saveHistory();
  renderHistory();
};
$("#tag-back").onclick = goBack;
$("#tag-start").onclick = () => { state.route = []; renderTags(); };
$("#clear-tags").onclick = () => {
  state.explicit.clear();
  state.excluded.clear();
  renderTags();
  compilePrompt();
  renderBubbles();
};
$("#pin-form").onsubmit = (event) => {
  event.preventDefault();
  const label = $("#pin-input").value.trim();
  if (!label) return;
  const authored = findTag(label);
  const id = authored?.id || `pin-${label.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || Date.now()}`;
  if (!state.pins.some((pin) => pin.id === id)) {
    state.pins.push({ id, label: authored?.label || label, payload: authored?.payload || label });
    savePins();
  }
  $("#pin-input").value = "";
  renderPins();
};

$("#generation-form").onsubmit = async (event) => {
  event.preventDefault();
  const selected = state.data.characterTags.find((entry) => entry.pcId === state.selectedCharacter);
  const button = $("#generate-song");
  button.disabled = true;
  $("#generation-note").textContent = "The drafts have gone to the writing room.";
  try {
    const tagIds = effectiveTagIds();
    await api("/api/music/generate", {
      method: "POST",
      body: JSON.stringify({
        description: $("#song-description").value,
        title: $("#song-title").value,
        prompt: $("#song-prompt").value,
        mode: selected ? "cover" : "create",
        sourceSongId: selected?.theme?.id || null,
        tagIds,
        selectedTagIds: selectedTagIds(),
        promptEnvelope: tagIds.length
          ? { start: PROMPT_ENVELOPE, end: PROMPT_ENVELOPE }
          : null,
        settings: {
          model: $("#song-model").value,
          style: $("#song-style").value,
          negativeTags: $("#song-negative").value,
          instrumental: $("#song-instrumental").checked,
          styleWeight: Number($("#style-weight").value),
          weirdnessConstraint: Number($("#weirdness").value),
          audioWeight: Number($("#audio-weight").value),
          worldThemeWeight: selected ? 0 : Number($("#world-theme-weight").value) / 100
        }
      })
    });
    state.playlistId = "library";
    await load();
    $("#generation-note").textContent = state.data.provider.mode === "mock"
      ? "Two-song provider behavior is simulated with local masters in rehearsal mode."
      : "Suno is writing two drafts. They will surface as the provider returns them.";
  } catch (error) {
    $("#generation-note").textContent = error.message;
  } finally {
    button.disabled = false;
  }
};

$("#new-playlist").onclick = async () => {
  const name = prompt("Playlist name");
  if (!name?.trim()) return;
  try {
    const playlist = await api("/api/music/playlists", { method: "POST", body: JSON.stringify({ name }) });
    state.playlistId = playlist.id;
    await load();
  } catch (error) {
    toast(error.message);
  }
};

$("#open-settings").onclick = () => {
  setTelemetryMode("settings");
  $("#settings-dialog").showModal();
};
$("#settings-dialog").addEventListener("close", () => setTelemetryMode(`tags:depth-${state.route.length}`));
$("#suno-mirror-name").oninput = () => {
  const targetName = $("#suno-mirror-name").value.trim() || "Vessa'rin";
  $("#suno-helper").href = sunoBookmarklet(targetName);
  $("#suno-helper").textContent = `${targetName} sync`;
};
$("#save-suno-mirror").onclick = async () => {
  const button = $("#save-suno-mirror");
  button.disabled = true;
  try {
    await api("/api/music/suno-mirror", {
      method: "PUT",
      body: JSON.stringify({ targetName: $("#suno-mirror-name").value })
    });
    await load();
    toast("Suno mirror target saved.");
  } catch (error) {
    toast(error.message);
  } finally {
    button.disabled = false;
  }
};
$("#suno-helper").onclick = async (event) => {
  event.preventDefault();
  try {
    await navigator.clipboard.writeText($("#suno-helper").href);
    toast("Sync helper copied. Add it as a browser bookmark, then use it on Suno.");
  } catch {
    toast("Drag the sync helper to the browser bookmarks bar.");
  }
};
$("#paste-suno-snapshot").onclick = async () => {
  const button = $("#paste-suno-snapshot");
  button.disabled = true;
  try {
    const snapshot = JSON.parse(await navigator.clipboard.readText());
    const result = await api("/api/music/suno-snapshot", {
      method: "POST",
      body: JSON.stringify(snapshot)
    });
    state.playlistId = "suno_mirror";
    await load();
    toast(`${result.total} Suno songs synchronized.`);
  } catch (error) {
    toast(error.message || "The clipboard does not contain a Suno snapshot.");
  } finally {
    button.disabled = false;
  }
};
$("#open-suno-library").onclick = () => {
  window.open(state.data.sunoMirror?.sourceUrl || "https://suno.com/me", "_blank", "noopener");
};
$("#check-provider").onclick = async () => {
  const button = $("#check-provider");
  button.disabled = true;
  try {
    state.data.provider = await api("/api/music/provider/check", { method: "POST" });
    renderProvider();
    toast("Provider account checked.");
  } catch (error) {
    toast(error.message);
  } finally {
    button.disabled = false;
  }
};

$("#play-toggle").onclick = () => {
  const audio = $("#audio");
  if (!audio.src && state.playingId) playSong(state.playingId);
  else if (audio.paused) audio.play().catch(() => toast("Playback is not available on this device yet."));
  else audio.pause();
};
$("#next-track").onclick = () => {
  const next = state.queue[0];
  if (next) playSong(next); // playSong strikes it from the queue itself
  else toast("Nothing waits in the queue.");
};
$("#prev-track").onclick = () => {
  const audio = $("#audio");
  // Once restarts the song; pressed again at the top, it reaches for the
  // previous one in the popped history.
  if (audio.src && audio.currentTime > 3) {
    audio.currentTime = 0;
    return;
  }
  const idx = state.history.findIndex((entry) => entry.songId === state.playingId);
  const previous = idx >= 0 ? state.history[idx + 1] : state.history[0];
  if (previous && songById(previous.songId)?.audioUrl) playSong(previous.songId);
  else if (audio.src) audio.currentTime = 0;
};
$("#loop-toggle").onclick = () => { $("#audio").loop = !$("#audio").loop; updateTransport(); };
const audio = $("#audio");
let userVolume = Number($("#volume").value);
let fadeGain = 1;
let duckGain = 1;
let duckTimer = null;
let duckResetTimer = null;

function applyMusicVolume() {
  const effectiveVolume = Math.max(0, Math.min(1, userVolume * fadeGain * duckGain));
  audio.volume = effectiveVolume;
  audio.dataset.effectiveVolume = effectiveVolume.toFixed(3);
  audio.dataset.duckGain = duckGain.toFixed(3);
}

function duckForCritical() {
  const start = performance.now();
  const initial = duckGain;
  const target = 10 ** (-4 / 20);
  const attack = 180;
  const hold = 950;
  const release = 1250;
  clearInterval(duckTimer);
  clearTimeout(duckResetTimer);
  duckTimer = setInterval(() => {
    const elapsed = performance.now() - start;
    if (elapsed < attack) {
      const progress = elapsed / attack;
      duckGain = initial + (target - initial) * progress;
    } else if (elapsed < attack + hold) {
      duckGain = target;
    } else {
      const progress = Math.min(1, (elapsed - attack - hold) / release);
      const smooth = progress * progress * (3 - 2 * progress);
      duckGain = target + (1 - target) * smooth;
    }
    applyMusicVolume();
    if (elapsed >= attack + hold + release) {
      clearInterval(duckTimer);
      duckTimer = null;
      duckGain = 1;
      applyMusicVolume();
    }
  }, 30);
  // Background tabs can throttle intervals; this guarantees eventual recovery.
  duckResetTimer = setTimeout(() => {
    clearInterval(duckTimer);
    duckTimer = null;
    duckGain = 1;
    applyMusicVolume();
  }, attack + hold + release + 250);
}

$("#volume").oninput = (event) => {
  userVolume = Number(event.target.value);
  applyMusicVolume();
};
$("#seek").oninput = (event) => {
  const audio = $("#audio");
  if (Number.isFinite(audio.duration)) audio.currentTime = audio.duration * Number(event.target.value) / 1000;
};
$("#fade-out").onclick = () => {
  const startingGain = fadeGain;
  const timer = setInterval(() => {
    fadeGain = Math.max(0, fadeGain - 0.04);
    applyMusicVolume();
    if (fadeGain <= 0) {
      clearInterval(timer);
      audio.pause();
      fadeGain = startingGain;
      applyMusicVolume();
    }
  }, 100);
};

applyMusicVolume();
audio.onplay = updateTransport;
audio.onpause = updateTransport;
audio.ontimeupdate = () => {
  $("#seek").value = Number.isFinite(audio.duration) ? String(audio.currentTime / audio.duration * 1000) : "0";
  $("#time-label").textContent = `${formatTime(audio.currentTime)} / ${formatTime(audio.duration)}`;
};
audio.onended = () => {
  const next = state.queue[0];
  if (next) playSong(next); // playSong strikes it from the queue itself
  else updateTransport();
};

document.addEventListener("pointerdown", (event) => {
  if (!event.target.closest("#context-menu")) hideContextMenu();
  if (!event.target.closest(".paint-wrap")) closePaintPalette();
});
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    hideContextMenu();
    state.paintColor = null;
    renderPaintTool();
    closePaintPalette();
  }
  // Space is the desk's foot pedal: it always plays/pauses — unless the
  // GM is actually typing somewhere.
  if (event.code === "Space") {
    if (event.target.closest?.("input, textarea, select, [contenteditable]")) return;
    event.preventDefault();
    $("#play-toggle").click();
  }
});

let bubbleResizeTimer = null;
new ResizeObserver(() => {
  clearTimeout(bubbleResizeTimer);
  bubbleResizeTimer = setTimeout(() => {
    sizeBubbleStage(activeSongs().length);
    if (bubblePhysics.layoutMode && bubblePhysics.layoutMode !== bubbleLayoutMode()) renderBubbles();
    else revealBubbleField();
  }, 100);
}).observe($("#bubble-stage"));

window.addEventListener("message", (event) => {
  if (event.origin !== location.origin || event.data?.type !== "settlement:music-visible") return;
  requestAnimationFrame(revealBubbleField);
});

renderTags();
compilePrompt();
renderPaintTool();
load();

const stream = new EventSource("/api/stream");
let reloadTimer = null;
stream.addEventListener("duality-roll", (event) => {
  try {
    const roll = JSON.parse(event.data);
    if (roll?.outcome === "critical") duckForCritical();
  } catch { /* Ignore malformed transient events without interrupting music. */ }
});
stream.onmessage = () => {
  clearTimeout(reloadTimer);
  reloadTimer = setTimeout(load, 400);
};
