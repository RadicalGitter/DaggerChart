import { buildRemoteMenu } from "./remote-tree.js";

const $ = (selector) => document.querySelector(selector);
const app = {
  music: { songs: [], playlists: [] },
  gm: { characters: [], people: [], places: [], screen: null },
  art: { places: [], scenes: [] },
  notifications: [],
  menu: [],
  route: [],
  playingId: null,
  playOrder: [],
  history: [],
  hovered: null,
  open: false,
  holdOpened: false,
  continuationDirection: localStorage.getItem("settlement-pocket-direction") || "sustain",
  nextContinuationId: null,
  queueingContinuation: false,
  influences: new Map(),
  seenRequests: new Set(),
  refreshTimer: null
};

const audio = $("#audio");
let fadeTimer = null;
let branchTimer = null;
let backTimer = null;
let holdTimer = null;
let toastTimer = null;
let ignoreCoreClick = false;

async function api(path, options = {}) {
  const response = await fetch(path, {
    headers: { "Content-Type": "application/json" },
    ...options,
    body: options.body ? JSON.stringify(options.body) : undefined
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || "The table did not answer.");
  return result;
}

function toast(message) {
  const element = $("#toast");
  element.textContent = message;
  element.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => element.classList.remove("show"), 2600);
}

const songById = (id) => app.music.songs.find((song) => song.id === id);
const readySongs = () => app.music.songs.filter((song) => song.status === "ready" && song.audioUrl);
const formatTime = (seconds) => {
  if (!Number.isFinite(seconds)) return "0:00";
  const whole = Math.max(0, Math.floor(seconds));
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, "0")}`;
};

function renderNowPlaying() {
  const song = songById(app.playingId);
  $("#playing-title").textContent = song?.title || "Nothing playing";
  $("#playing-detail").textContent = song
    ? (song.prompt || song.description || "Ready at the table")
    : "Choose a song from the command wheel.";
  $("#play-toggle").innerHTML = audio.paused ? "&#9654;" : "&#10074;&#10074;";
  const art = $("#track-art");
  art.replaceChildren();
  if (song?.imageUrl) {
    const image = document.createElement("img");
    image.src = song.imageUrl;
    image.alt = "";
    art.append(image);
  } else {
    const glyph = document.createElement("span");
    glyph.innerHTML = "&#9835;";
    glyph.setAttribute("aria-hidden", "true");
    art.append(glyph);
  }
  renderContinuation();
}

function influenceModifiers() {
  return [...app.influences.values()].map((entry) => entry.modifier).filter(Boolean);
}

function sameModifiers(song) {
  const expected = [...influenceModifiers()].sort();
  const actual = [...(song.continuation?.modifiers || [])].sort();
  return expected.length === actual.length && expected.every((value, index) => value === actual[index]);
}

function continuationFor(sourceId, direction = app.continuationDirection) {
  if (!sourceId) return null;
  return app.music.songs.find((song) => song.continuation?.sourceSongId === sourceId
    && song.continuation?.direction === direction
    && sameModifiers(song)
    && song.status !== "failed") || null;
}

function renderContinuation() {
  document.querySelectorAll("[data-direction]").forEach((button) => {
    button.setAttribute("aria-pressed", String(button.dataset.direction === app.continuationDirection));
  });
  $("#intensity-label").textContent = app.continuationDirection === "escalate" ? "Rise"
    : app.continuationDirection === "deescalate" ? "Ease" : "Hold";
  const selectedByKind = (kind) => [...app.influences.keys()].filter((id) => id.startsWith(`${kind}:`)).length;
  for (const [kind, selector] of [["character", ".hex-characters"], ["npc", ".hex-npcs"], ["intent", ".hex-intent"], ["world", ".hex-world"]]) {
    $(selector).classList.toggle("has-selection", selectedByKind(kind) > 0);
  }
  $("#character-count").textContent = String(selectedByKind("character") || app.music.characterTags?.length || 0);
  $("#npc-count").textContent = String(selectedByKind("npc") || app.gm.people?.length || 0);
  $("#intent-count").textContent = String(selectedByKind("intent"));
  $("#world-count").textContent = String(selectedByKind("world"));
  const influenceLabels = [...app.influences.values()].map((entry) => entry.label);
  $("#influence-summary").textContent = influenceLabels.length ? influenceLabels.join(" + ") : "No borrowed themes";
  const source = songById(app.playingId);
  const queued = songById(app.nextContinuationId) || continuationFor(source?.id);
  const button = $("#queue-extension");
  button.disabled = app.queueingContinuation || !source;
  button.textContent = app.queueingContinuation ? "Queuing..." : queued?.status === "ready" ? "Next ready" : queued ? "Rendering" : "Queue next";
  const timing = app.music.modelPerformance?.find((entry) => entry.model === source?.settings?.model);
  const directionText = app.continuationDirection === "escalate" ? "Rise builds pressure."
    : app.continuationDirection === "deescalate" ? "Ease releases tension." : "Hold keeps the current mood.";
  $("#generation-status").textContent = timing
    ? `${directionText} ${timing.model}: about ${formatTime(timing.averageSeconds)} from ${timing.samples} run${timing.samples === 1 ? "" : "s"}.`
    : directionText;
}

async function queueContinuation(direction = app.continuationDirection, automatic = false) {
  const source = songById(app.playingId);
  if (!source) return toast("Play a song before queuing its next movement.");
  const existing = continuationFor(source.id, direction);
  if (existing) {
    app.nextContinuationId = existing.id;
    renderContinuation();
    if (!automatic) toast(existing.status === "ready" ? "The next movement is ready." : "The next movement is already rendering.");
    return existing;
  }
  if (app.queueingContinuation) return null;
  app.queueingContinuation = true;
  renderContinuation();
  try {
    const song = await api(`/api/music/songs/${encodeURIComponent(source.id)}/extend`, {
      method: "POST",
      body: { direction, modifiers: influenceModifiers() }
    });
    app.music.songs.unshift(song);
    app.nextContinuationId = song.id;
    if (!automatic) toast(`${direction === "sustain" ? "A matching" : "A directed"} next movement is rendering.`);
    return song;
  } catch (error) {
    toast(error.message || "The next movement could not be queued.");
    return null;
  } finally {
    app.queueingContinuation = false;
    renderContinuation();
  }
}

function orderFor(playlistId) {
  const playlist = app.music.playlists.find((entry) => entry.id === playlistId);
  const playable = new Set(readySongs().map((song) => song.id));
  const ids = playlist?.songIds?.filter((id) => playable.has(id)) || [];
  return ids.length ? ids : readySongs().map((song) => song.id);
}

function playSong(songId, playlistId = null) {
  const song = songById(songId);
  if (!song?.audioUrl) return toast("That song is not ready to play.");
  clearInterval(fadeTimer);
  fadeTimer = null;
  if (app.playingId && app.playingId !== songId) app.history.unshift(app.playingId);
  app.history = [...new Set(app.history)].slice(0, 20);
  app.playingId = songId;
  app.playOrder = orderFor(playlistId);
  const nextUrl = new URL(song.audioUrl, location.href).href;
  if (audio.src !== nextUrl) audio.src = song.audioUrl;
  else audio.currentTime = 0;
  audio.volume = Number($("#volume").value);
  audio.play().catch((error) => {
    toast(error?.name === "NotAllowedError" ? "Tap play once to allow sound on this phone." : "This song could not be played.");
  });
  renderNowPlaying();
  if ($("#keep-growing").checked) setTimeout(() => queueContinuation(app.continuationDirection, true), 250);
}

function adjacentSong(direction) {
  const order = app.playOrder.length ? app.playOrder : readySongs().map((song) => song.id);
  if (!order.length) return null;
  const index = Math.max(0, order.indexOf(app.playingId));
  if (direction > 0) return order[(index + 1) % order.length];
  return app.history.find((id) => songById(id)?.audioUrl) || order[(index - 1 + order.length) % order.length];
}

function transport(command) {
  if (command === "toggle") {
    if (!audio.src) {
      const first = readySongs()[0];
      if (first) playSong(first.id);
      else toast("No playable songs are ready.");
    } else if (audio.paused) audio.play().catch(() => toast("Tap play once to allow sound on this phone."));
    else audio.pause();
  }
  if (command === "next") {
    const next = adjacentSong(1);
    if (next) playSong(next);
  }
  if (command === "previous") {
    if (audio.currentTime > 3) audio.currentTime = 0;
    else {
      const previous = adjacentSong(-1);
      if (previous) playSong(previous);
    }
  }
  if (command === "fade") fadeOut();
}

function fadeOut() {
  clearInterval(fadeTimer);
  const startingVolume = audio.volume;
  fadeTimer = setInterval(() => {
    audio.volume = Math.max(0, audio.volume - Math.max(.015, startingVolume / 25));
    if (audio.volume > 0) return;
    clearInterval(fadeTimer);
    fadeTimer = null;
    audio.pause();
    audio.volume = Number($("#volume").value);
  }, 100);
}

function screenDescription(current) {
  if (!current) return ["Settlement title", "The table screen is ready."];
  if (current.type === "image") return [current.caption || "An image", "Image on the presenter screen"];
  if (current.type === "text") return [current.title || "Words", "Text on the presenter screen"];
  if (current.type === "stores") return ["Settlement stores", "Resources at the table"];
  if (current.type === "buildings") return ["Settlement buildings", "Construction at the table"];
  const collection = current.type === "folk" ? app.gm.characters : current.type === "person" ? app.gm.people : app.gm.places;
  const record = collection?.find((entry) => entry.id === current.refId);
  return [record?.name || current.type, `${current.type} on the presenter screen`];
}

function renderScreen() {
  const [title, detail] = screenDescription(app.gm.screen);
  $("#screen-title").textContent = title;
  $("#screen-detail").textContent = detail;
}

async function project(body) {
  const result = await api("/api/screen", { method: "PUT", body });
  app.gm.screen = result.current;
  renderScreen();
  toast(body.type === null ? "The presenter screen is dark." : "Shown at the table.");
}

function activeItems() {
  return app.route.length ? app.route.at(-1).children : app.menu;
}

function findMenuItem(id, items = app.menu) {
  for (const item of items || []) {
    if (item.id === id) return item;
    const found = item.children ? findMenuItem(id, item.children) : null;
    if (found) return found;
  }
  return null;
}

function openNamedBranch(id) {
  const item = findMenuItem(id);
  if (!item?.children) return toast("That branch has nothing to show yet.");
  app.open = true;
  app.route = [item];
  app.hovered = null;
  $("#command-core").setAttribute("aria-expanded", "true");
  renderRadial();
}

function setHovered(item) {
  if (app.hovered?.id === item?.id) return;
  app.hovered = item || null;
  document.querySelectorAll(".radial-item").forEach((button) => button.classList.toggle("hovered", button.dataset.itemId === item?.id));
  navigator.vibrate?.(8);
  clearTimeout(branchTimer);
  if (item?.children) branchTimer = setTimeout(() => openBranch(item), 210);
}

function renderRadial(direction = "forward") {
  const stage = $("#command-stage");
  const menu = $("#radial-menu");
  const links = $("#radial-links");
  const items = activeItems();
  menu.replaceChildren();
  links.replaceChildren();
  $("#command-route").textContent = app.route.length ? app.route.map((item) => item.label).join(" / ") : "Commands";
  stage.classList.toggle("back-ready", app.route.length > 0);
  const start = -160;
  const end = -20;
  const radius = items.length > 4 ? 137 : 126;
  items.forEach((item, index) => {
    const angle = items.length === 1 ? -90 : start + (end - start) * index / (items.length - 1);
    const radians = angle * Math.PI / 180;
    const x = Math.cos(radians) * radius;
    const y = Math.sin(radians) * radius;
    const button = document.createElement("button");
    button.type = "button";
    const selected = item.action?.type === "toggle-influence" && app.influences.has(item.action.influence?.id);
    button.className = `radial-item${item.children ? " branch" : ""}${item.label.length > 14 ? " long" : ""}${selected ? " selected" : ""}`;
    button.dataset.itemId = item.id;
    button.style.setProperty("--x", `${x.toFixed(1)}px`);
    button.style.setProperty("--y", `${y.toFixed(1)}px`);
    const strong = document.createElement("strong");
    strong.textContent = item.label;
    button.append(strong);
    if (item.detail) {
      const small = document.createElement("small");
      small.textContent = item.detail;
      button.append(small);
    }
    button.onclick = () => item.children ? openBranch(item) : execute(item.action);
    menu.append(button);
    const link = document.createElement("i");
    link.className = "radial-link";
    link.style.setProperty("--length", `${radius - 32}px`);
    link.style.setProperty("--angle", `${angle}deg`);
    links.append(link);
  });
  stage.dataset.direction = direction;
  requestAnimationFrame(() => stage.classList.toggle("open", app.open));
}

function openMenu(held = false) {
  app.open = true;
  app.holdOpened = held;
  app.route = [];
  app.hovered = null;
  $("#command-core").setAttribute("aria-expanded", "true");
  renderRadial();
}

function closeMenu() {
  clearTimeout(branchTimer);
  clearTimeout(backTimer);
  app.open = false;
  app.route = [];
  app.hovered = null;
  $("#command-core").setAttribute("aria-expanded", "false");
  $("#command-stage").classList.remove("open", "back-ready");
  $("#command-route").textContent = "Commands";
}

function openBranch(item) {
  if (!app.open || !item?.children) return;
  clearTimeout(branchTimer);
  app.route.push(item);
  app.hovered = null;
  renderRadial("forward");
}

function goBack() {
  if (!app.route.length) return closeMenu();
  app.route.pop();
  app.hovered = null;
  renderRadial("back");
}

async function execute(action) {
  if (!action) return;
  closeMenu();
  try {
    if (action.type === "play-song") playSong(action.songId, action.playlistId);
    if (action.type === "transport") transport(action.command);
    if (action.type === "extend") {
      app.continuationDirection = action.direction || "sustain";
      localStorage.setItem("settlement-pocket-direction", app.continuationDirection);
      await queueContinuation(app.continuationDirection);
    }
    if (action.type === "toggle-influence") {
      const influence = action.influence;
      if (app.influences.has(influence.id)) app.influences.delete(influence.id);
      else app.influences.set(influence.id, influence);
      app.nextContinuationId = null;
      renderContinuation();
      toast(app.influences.has(influence.id) ? `${influence.label} added to the next movement.` : `${influence.label} removed.`);
    }
    if (action.type === "project") await project(action.body);
    if (action.type === "noop") toast("Nothing is ready in that branch.");
  } catch (error) {
    toast(error.message || "The command could not be completed.");
  }
}

function radialTargetAt(x, y) {
  return document.elementFromPoint(x, y)?.closest?.(".radial-item");
}

const core = $("#command-core");
core.addEventListener("pointerdown", (event) => {
  core.setPointerCapture(event.pointerId);
  app.holdOpened = false;
  clearTimeout(holdTimer);
  holdTimer = setTimeout(() => {
    app.holdOpened = true;
    navigator.vibrate?.(14);
    openMenu(true);
  }, 230);
});
core.addEventListener("pointermove", (event) => {
  if (!app.open) return;
  const target = radialTargetAt(event.clientX, event.clientY);
  if (target) {
    clearTimeout(backTimer);
    const item = activeItems().find((candidate) => candidate.id === target.dataset.itemId);
    setHovered(item);
    return;
  }
  setHovered(null);
  if (!app.route.length) return;
  const rect = core.getBoundingClientRect();
  const onCore = Math.hypot(event.clientX - (rect.left + rect.width / 2), event.clientY - (rect.top + rect.height / 2)) < rect.width * .62;
  if (onCore && !backTimer) backTimer = setTimeout(() => { backTimer = null; goBack(); }, 220);
  if (!onCore) { clearTimeout(backTimer); backTimer = null; }
});
core.addEventListener("pointerup", () => {
  clearTimeout(holdTimer);
  clearTimeout(branchTimer);
  if (!app.open) {
    ignoreCoreClick = true;
    return queueContinuation();
  }
  ignoreCoreClick = app.holdOpened;
  if (app.hovered && !app.hovered.children) execute(app.hovered.action);
  else if (app.holdOpened) closeMenu();
});
core.addEventListener("pointercancel", () => {
  clearTimeout(holdTimer);
  if (app.holdOpened) closeMenu();
});
core.onclick = (event) => {
  event.preventDefault();
  if (ignoreCoreClick) {
    ignoreCoreClick = false;
    return;
  }
  if (!app.open) queueContinuation();
};

function pendingRequests() {
  return app.notifications.filter((notification) => notification.status === "pending" && notification.kind === "screen-request");
}

function renderRequestCount() {
  const count = pendingRequests().length;
  const badge = $("#request-count");
  badge.hidden = count === 0;
  badge.textContent = String(count);
}

function openRequest(notification) {
  if (!notification || $("#request-dialog").open) return;
  $("#request-dialog").dataset.notificationId = notification.id;
  $("#request-title").textContent = notification.summary || "Show this at the table?";
  $("#request-from").textContent = `${notification.actor?.name || "A player"} asked ${new Date(notification.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}.`;
  const preview = $("#request-preview");
  preview.replaceChildren();
  const projection = notification.payload?.projection;
  if (projection?.type === "image") {
    const image = document.createElement("img");
    image.src = projection.url;
    image.alt = projection.caption || "Requested image";
    preview.append(image);
  } else {
    const text = document.createElement("div");
    text.className = "text";
    text.textContent = projection?.body || notification.summary || "";
    preview.append(text);
  }
  app.seenRequests.add(notification.id);
  $("#request-dialog").showModal();
}

async function resolveRequest(action) {
  const dialog = $("#request-dialog");
  const id = dialog.dataset.notificationId;
  if (!id) return;
  $("#approve-request").disabled = true;
  $("#dismiss-request").disabled = true;
  try {
    const result = await api(`/api/gm-notifications/${encodeURIComponent(id)}/${action}`, { method: "POST" });
    if (action === "approve") app.gm.screen = result.current;
    app.notifications = app.notifications.map((notification) => notification.id === id
      ? { ...notification, status: action === "approve" ? "approved" : "dismissed" }
      : notification);
    dialog.close();
    renderScreen();
    renderRequestCount();
    toast(action === "approve" ? "Shown at the table." : "Request dismissed.");
    const next = pendingRequests()[0];
    if (next) setTimeout(() => openRequest(next), 180);
  } catch (error) {
    toast(error.message || "The request could not be handled.");
  } finally {
    $("#approve-request").disabled = false;
    $("#dismiss-request").disabled = false;
  }
}

$("#approve-request").onclick = () => resolveRequest("approve");
$("#dismiss-request").onclick = () => resolveRequest("dismiss");
$("#request-count").onclick = () => openRequest(pendingRequests()[0]);

async function refresh() {
  try {
    const [music, gm, art, notifications] = await Promise.all([
      api("/api/music"),
      api("/api/state"),
      api("/api/art/library").catch(() => ({ places: [], scenes: [] })),
      api("/api/gm-notifications")
    ]);
    app.music = music;
    app.gm = gm;
    app.art = art;
    app.notifications = notifications;
    app.menu = buildRemoteMenu({ music, gm, art });
    if (app.open) renderRadial();
    renderNowPlaying();
    renderScreen();
    renderRequestCount();
    $("#connection-state").className = "connection-state live";
    $("#connection-state span").textContent = "Live";
    const unseen = pendingRequests().find((notification) => !app.seenRequests.has(notification.id));
    if (unseen && !app.open) openRequest(unseen);
  } catch (error) {
    $("#connection-state").className = "connection-state lost";
    $("#connection-state span").textContent = "Offline";
    toast(error.message || "The table could not be reached.");
  }
}

$("#previous-track").onclick = () => transport("previous");
$("#play-toggle").onclick = () => transport("toggle");
$("#next-track").onclick = () => transport("next");
$("#fade-out").onclick = fadeOut;
$("#open-commands").onclick = () => app.open ? closeMenu() : openMenu(false);
document.querySelectorAll("[data-open-branch]").forEach((button) => {
  button.onclick = () => openNamedBranch(button.dataset.openBranch);
});
document.querySelectorAll("[data-direction]").forEach((button) => {
  button.onclick = () => {
    app.continuationDirection = button.dataset.direction;
    localStorage.setItem("settlement-pocket-direction", app.continuationDirection);
    app.nextContinuationId = continuationFor(app.playingId)?.id || null;
    renderContinuation();
  };
});
$("#queue-extension").onclick = () => queueContinuation();
$("#keep-growing").onchange = (event) => {
  if (event.target.checked) queueContinuation(app.continuationDirection, true);
};
$("#volume").value = localStorage.getItem("settlement-pocket-volume") || "0.8";
$("#volume").oninput = (event) => {
  clearInterval(fadeTimer);
  fadeTimer = null;
  audio.volume = Number(event.target.value);
  localStorage.setItem("settlement-pocket-volume", event.target.value);
};
$("#seek").oninput = (event) => {
  if (Number.isFinite(audio.duration)) audio.currentTime = audio.duration * Number(event.target.value) / 1000;
};
audio.onplay = renderNowPlaying;
audio.onpause = renderNowPlaying;
audio.ontimeupdate = () => {
  $("#seek").value = Number.isFinite(audio.duration) ? String(audio.currentTime / audio.duration * 1000) : "0";
  $("#time-label").textContent = `${formatTime(audio.currentTime)} / ${formatTime(audio.duration)}`;
};
audio.onended = () => {
  const continuation = songById(app.nextContinuationId) || continuationFor(app.playingId);
  if (continuation?.status === "ready" && continuation.audioUrl) playSong(continuation.id);
  else {
    if (continuation && $("#keep-growing").checked) toast("The next movement is still rendering; continuing through the library.");
    transport("next");
  }
};
audio.onerror = () => toast("The audio file could not be read.");

const stream = new EventSource("/api/stream");
stream.onopen = () => {
  $("#connection-state").className = "connection-state live";
  $("#connection-state span").textContent = "Live";
};
stream.onmessage = () => {
  clearTimeout(app.refreshTimer);
  app.refreshTimer = setTimeout(refresh, 180);
};
stream.onerror = () => {
  $("#connection-state").className = "connection-state lost";
  $("#connection-state span").textContent = "Reconnecting";
};

document.addEventListener("keydown", (event) => {
  if (event.key !== "Escape") return;
  if ($("#request-dialog").open) $("#request-dialog").close();
  else closeMenu();
});

audio.volume = Number($("#volume").value);
renderContinuation();
refresh();
