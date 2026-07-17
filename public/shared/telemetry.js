// Small, content-free UX collector for the trusted local playtest table.
// Written text, data values, identities, URLs, screenshots, and browser details
// deliberately never enter this payload.
const ROUTES = new Set([
  "/login",
  "/player",
  "/table",
  "/table-book",
  "/tome",
  "/create",
  "/character/:id",
  "/journal",
  "/music",
  "/rules"
]);
const ACTION_SELECTOR = [
  "a[href]",
  "button",
  "input",
  "select",
  "textarea",
  "summary",
  "label[for]",
  "canvas",
  "[contenteditable]",
  "[draggable=true]",
  "[role=button]",
  "[role=link]",
  "[role=checkbox]",
  "[role=menuitem]",
  "[role=option]",
  "[data-action]"
].join(",");
const TARGET_ATTRIBUTES = ["action", "nav", "tab", "card", "shell", "switch"];
const MAX_QUEUE = 400;

function pageKey() {
  let pathname = location.pathname.replace(/\/+$/, "") || "/";
  if (/^\/character\/[^/]+$/.test(pathname)) pathname = "/character/:id";
  if (!ROUTES.has(pathname)) return null;
  return new URLSearchParams(location.search).get("embed") === "1" ? `${pathname}@embed` : pathname;
}

function viewport() {
  if (innerWidth <= 600) return "mobile";
  if (innerWidth <= 1100) return "tablet";
  return "desktop";
}

function cleanMode(value) {
  return String(value || "default")
    .toLowerCase()
    .replace(/[^a-z0-9:_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64) || "default";
}

function cleanToken(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 42);
}

function interactiveAncestor(element) {
  if (!(element instanceof Element)) return null;
  const direct = element.closest(ACTION_SELECTOR);
  if (direct) return direct;
  let current = element;
  while (current && current !== document.body) {
    const cursor = getComputedStyle(current).cursor;
    if (["pointer", "grab", "grabbing", "crosshair"].includes(cursor)) return current;
    current = current.parentElement;
  }
  return null;
}

function targetKey(rawElement, actionable) {
  const element = actionable || (rawElement instanceof Element ? rawElement : document.body);
  const tag = element.tagName?.toLowerCase() || "surface";
  const id = cleanToken(element.id);
  if (id && id.length === element.id.length && !/\d{4,}/.test(id)) return `${tag}#${id}`;

  for (const attribute of TARGET_ATTRIBUTES) {
    if (!(attribute in element.dataset)) continue;
    const value = cleanToken(element.dataset[attribute]);
    if (value) return `${tag}[data-${attribute}=${value}]`;
    return `${tag}[data-${attribute}]`;
  }

  const classes = [...element.classList]
    .map(cleanToken)
    .filter(Boolean)
    .filter((name) => !/(selected|active|open|closed|dragging|painted|visible|hidden|enter|exit)/.test(name))
    .slice(0, 3);
  return `${tag}${classes.map((name) => `.${name}`).join("")}`;
}

const PAGE = pageKey();
let mode = "default";
let queue = [];
let flushTimer = null;
let activeSince = null;
let pointerStart = null;
let sending = false;

function activeNow() {
  return document.visibilityState === "visible" && document.hasFocus();
}

function resumeTimer() {
  if (PAGE && activeNow() && activeSince === null) activeSince = performance.now();
}

function enqueue(event) {
  if (!PAGE) return;
  queue.push({ ...event, mode, viewport: viewport() });
  if (queue.length > MAX_QUEUE) queue.splice(0, queue.length - MAX_QUEUE);
  if (queue.length >= 16) flush();
  else if (!flushTimer) flushTimer = setTimeout(flush, 4_000);
}

function recordDuration() {
  if (activeSince === null) return;
  const now = performance.now();
  const ms = Math.round(now - activeSince);
  activeSince = activeNow() ? now : null;
  if (ms >= 100) enqueue({ kind: "duration", ms });
}

async function flush() {
  clearTimeout(flushTimer);
  flushTimer = null;
  if (!PAGE || sending || !queue.length) return;
  const events = queue.splice(0, 200);
  sending = true;
  try {
    const response = await fetch("/api/telemetry/batch", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ page: PAGE, events }),
      keepalive: true
    });
    if (!response.ok) throw new Error("telemetry rejected");
  } catch {
    queue = [...events, ...queue].slice(-MAX_QUEUE);
  } finally {
    sending = false;
    if (queue.length && !flushTimer) flushTimer = setTimeout(flush, 8_000);
  }
}

function flushOnExit() {
  recordDuration();
  if (!PAGE || !queue.length || !navigator.sendBeacon) return;
  const events = queue.splice(0, 200);
  const body = new Blob([JSON.stringify({ page: PAGE, events })], { type: "application/json" });
  if (!navigator.sendBeacon("/api/telemetry/batch", body)) queue = [...events, ...queue].slice(-MAX_QUEUE);
}

export function setTelemetryMode(value) {
  if (!PAGE) return;
  const next = cleanMode(value);
  if (next === mode) return;
  recordDuration();
  mode = next;
  enqueue({ kind: "enter" });
  resumeTimer();
}

if (PAGE) {
  enqueue({ kind: "visit" });
  resumeTimer();

  document.addEventListener("pointerdown", (event) => {
    if (event.button !== 0) return;
    pointerStart = { x: event.clientX, y: event.clientY, at: performance.now(), target: event.target };
  }, true);

  document.addEventListener("pointerup", (event) => {
    if (!pointerStart || event.button !== 0) return;
    const start = pointerStart;
    pointerStart = null;
    if (performance.now() - start.at > 1_200 || Math.hypot(event.clientX - start.x, event.clientY - start.y) > 10) return;
    const actionable = interactiveAncestor(start.target);
    const disabled = actionable?.matches(":disabled, [aria-disabled=true]") || false;
    enqueue({
      kind: "click",
      x: innerWidth ? event.clientX / innerWidth : 0,
      y: innerHeight ? event.clientY / innerHeight : 0,
      dead: !actionable || disabled,
      target: targetKey(start.target, actionable)
    });
  }, true);

  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") {
      recordDuration();
      flush();
    } else resumeTimer();
  });
  window.addEventListener("focus", resumeTimer);
  window.addEventListener("blur", () => { recordDuration(); flush(); });
  window.addEventListener("pagehide", flushOnExit);
  setInterval(() => { recordDuration(); flush(); }, 15_000);
}
