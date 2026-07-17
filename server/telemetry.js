// Local, content-free UX telemetry for the trusted playtest table.
// REVIEW IF THE PROJECT CHANGES DIRECTION: this intentionally has no consent
// gate for the current five known players. Revisit before remote/public use.
import { loadJson, saveJson } from "./store.js";

const FILE = "telemetry.json";
const VIEWPORTS = new Set(["mobile", "tablet", "desktop"]);
const PAGE_PATTERN = /^\/(?:login|player|table|table-book|tome|create|character\/:id|journal|music)(?:@embed)?$/;
const MAX_EVENTS_PER_BATCH = 200;
const MAX_POINTS_PER_PAGE = 900;
const MAX_TARGETS_PER_PAGE = 120;
const MAX_MODES_PER_PAGE = 60;

function freshTelemetry() {
  const at = new Date().toISOString();
  return { version: 1, startedAt: at, updatedAt: at, pages: {} };
}

let telemetry = loadJson(FILE, freshTelemetry());

function ensureRoot() {
  telemetry.version = 1;
  telemetry.startedAt ||= new Date().toISOString();
  telemetry.updatedAt ||= telemetry.startedAt;
  telemetry.pages = telemetry.pages && typeof telemetry.pages === "object" ? telemetry.pages : {};
}

ensureRoot();

function cleanPage(value) {
  const page = String(value || "").trim().slice(0, 80);
  if (!PAGE_PATTERN.test(page)) throw new Error("Unknown telemetry surface.");
  return page;
}

function cleanMode(value) {
  const mode = String(value || "default").toLowerCase().replace(/[^a-z0-9:_-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 64);
  return mode || "default";
}

function cleanTarget(value) {
  return String(value || "surface")
    .toLowerCase()
    .replace(/[^a-z0-9#._:[\]-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 96) || "surface";
}

function viewportStats() {
  return { sessions: 0, activeMs: 0, clicks: 0, deadClicks: 0 };
}

function pageStats(pathname, at) {
  return {
    path: pathname,
    firstSeenAt: at,
    lastSeenAt: at,
    sessions: 0,
    activeMs: 0,
    clicks: 0,
    deadClicks: 0,
    viewports: {
      mobile: viewportStats(),
      tablet: viewportStats(),
      desktop: viewportStats()
    },
    modes: {},
    targets: {},
    points: []
  };
}

function modeStats() {
  return {
    entries: 0,
    activeMs: 0,
    clicks: 0,
    deadClicks: 0,
    viewports: {
      mobile: { entries: 0, activeMs: 0, clicks: 0, deadClicks: 0 },
      tablet: { entries: 0, activeMs: 0, clicks: 0, deadClicks: 0 },
      desktop: { entries: 0, activeMs: 0, clicks: 0, deadClicks: 0 }
    }
  };
}

function modeFor(page, rawMode) {
  let mode = cleanMode(rawMode);
  if (!page.modes[mode] && Object.keys(page.modes).length >= MAX_MODES_PER_PAGE) mode = "other";
  page.modes[mode] ||= modeStats();
  page.modes[mode].viewports ||= modeStats().viewports;
  return { mode, stats: page.modes[mode] };
}

function targetFor(page, rawTarget) {
  let target = cleanTarget(rawTarget);
  if (!page.targets[target] && Object.keys(page.targets).length >= MAX_TARGETS_PER_PAGE) target = "other";
  page.targets[target] ||= {
    clicks: 0,
    deadClicks: 0,
    lastSeenAt: null,
    viewports: {
      mobile: { clicks: 0, deadClicks: 0 },
      tablet: { clicks: 0, deadClicks: 0 },
      desktop: { clicks: 0, deadClicks: 0 }
    }
  };
  page.targets[target].viewports ||= {
    mobile: { clicks: 0, deadClicks: 0 },
    tablet: { clicks: 0, deadClicks: 0 },
    desktop: { clicks: 0, deadClicks: 0 }
  };
  return { target, stats: page.targets[target] };
}

export function recordTelemetryBatch(body) {
  const pathname = cleanPage(body?.page);
  const events = Array.isArray(body?.events) ? body.events.slice(0, MAX_EVENTS_PER_BATCH) : [];
  if (!events.length) return telemetryView();

  const at = new Date().toISOString();
  const page = telemetry.pages[pathname] ||= pageStats(pathname, at);
  let changed = false;

  for (const event of events) {
    const kind = String(event?.kind || "");
    const viewport = VIEWPORTS.has(event?.viewport) ? event.viewport : "desktop";
    const viewportEntry = page.viewports[viewport] ||= viewportStats();
    const { mode, stats: modeEntry } = modeFor(page, event?.mode);
    const modeViewportEntry = modeEntry.viewports[viewport];

    if (kind === "visit") {
      page.sessions += 1;
      viewportEntry.sessions += 1;
      modeEntry.entries += 1;
      modeViewportEntry.entries += 1;
      changed = true;
      continue;
    }

    if (kind === "enter") {
      modeEntry.entries += 1;
      modeViewportEntry.entries += 1;
      changed = true;
      continue;
    }

    if (kind === "duration") {
      const ms = Math.max(0, Math.min(60_000, Math.round(Number(event.ms) || 0)));
      if (ms < 100) continue;
      page.activeMs += ms;
      viewportEntry.activeMs += ms;
      modeEntry.activeMs += ms;
      modeViewportEntry.activeMs += ms;
      changed = true;
      continue;
    }

    if (kind !== "click") continue;
    const x = Math.max(0, Math.min(1, Number(event.x) || 0));
    const y = Math.max(0, Math.min(1, Number(event.y) || 0));
    const dead = event.dead === true;
    const { target, stats: targetEntry } = targetFor(page, event.target);
    const targetViewportEntry = targetEntry.viewports[viewport];
    page.clicks += 1;
    viewportEntry.clicks += 1;
    modeEntry.clicks += 1;
    modeViewportEntry.clicks += 1;
    targetEntry.clicks += 1;
    targetViewportEntry.clicks += 1;
    if (dead) {
      page.deadClicks += 1;
      viewportEntry.deadClicks += 1;
      modeEntry.deadClicks += 1;
      modeViewportEntry.deadClicks += 1;
      targetEntry.deadClicks += 1;
      targetViewportEntry.deadClicks += 1;
    }
    targetEntry.lastSeenAt = at;
    page.points.push({ x, y, dead, viewport, mode, target, at });
    if (page.points.length > MAX_POINTS_PER_PAGE) page.points.splice(0, page.points.length - MAX_POINTS_PER_PAGE);
    changed = true;
  }

  if (changed) {
    page.lastSeenAt = at;
    telemetry.updatedAt = at;
    saveJson(FILE, telemetry);
  }
  return telemetryView();
}

export function telemetryView() {
  ensureRoot();
  return structuredClone(telemetry);
}

export function clearTelemetry() {
  telemetry = freshTelemetry();
  saveJson(FILE, telemetry);
  return telemetryView();
}
