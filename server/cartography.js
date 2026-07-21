import fs from "node:fs";
import path from "node:path";
import { createHash, randomUUID } from "node:crypto";
import { DATA_DIR } from "./store.js";

export const DEFAULT_CARTOGRAPHY = Object.freeze({
  version: 1,
  ownerPcId: null,
  sheets: []
});

const IMAGE_DIR = path.join(DATA_DIR, "cartography-images");
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const MAX_STROKES = 1200;
const MAX_POINTS = 30000;
const MAX_NOTES = 120;
const MAX_SUBMISSIONS = 30;
const MIME_EXTENSIONS = Object.freeze({
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp"
});

const clippedText = (value, max) => String(value || "").trim().slice(0, max);
const boundedNumber = (value, fallback, min, max) => {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(min, Math.min(max, number)) : fallback;
};
const normalizedPoint = (value) => Math.round(boundedNumber(value, 0, 0, 1) * 10000) / 10000;
const colorValue = (value) => /^#[0-9a-f]{6}$/i.test(String(value || "")) ? String(value).toLowerCase() : "#5b4028";

function normalizeImage(value) {
  if (!value || typeof value !== "object" || !value.file) return null;
  return {
    file: path.basename(String(value.file)),
    mimeType: MIME_EXTENSIONS[value.mimeType] ? value.mimeType : "image/jpeg"
  };
}

function normalizeNote(value) {
  return {
    id: clippedText(value?.id, 100) || `pin_${randomUUID()}`,
    x: normalizedPoint(value?.x),
    y: normalizedPoint(value?.y),
    title: clippedText(value?.title, 120),
    text: clippedText(value?.text, 2400),
    createdAt: value?.createdAt || new Date().toISOString(),
    updatedAt: value?.updatedAt || value?.createdAt || new Date().toISOString()
  };
}

function cartographerPayload(sheet) {
  return {
    title: sheet.title,
    strokes: sheet.strokes,
    notes: sheet.notes
  };
}

function normalizeSubmission(value) {
  if (!value || typeof value !== "object") return null;
  const submittedAt = clippedText(value.submittedAt, 100);
  if (!submittedAt) return null;
  const strokes = cleanCartographyStrokes(Array.isArray(value.strokes) ? value.strokes : []);
  const notes = (Array.isArray(value.notes) ? value.notes : []).slice(0, MAX_NOTES).map(normalizeNote);
  const title = clippedText(value.title, 120) || "Untitled map";
  return {
    revision: Math.max(1, Math.round(boundedNumber(value.revision, 1, 1, 100000))),
    title,
    strokes,
    notes,
    submittedAt,
    contentHash: clippedText(value.contentHash, 100) || hash({ title, strokes, notes })
  };
}

function normalizeZone(value) {
  return {
    id: clippedText(value?.id, 100) || `zone_${randomUUID()}`,
    name: clippedText(value?.name, 120) || "Unnamed region",
    x: normalizedPoint(value?.x),
    y: normalizedPoint(value?.y),
    width: Math.max(.03, normalizedPoint(value?.width || .18)),
    height: Math.max(.03, normalizedPoint(value?.height || .14)),
    truth: clippedText(value?.truth, 4000),
    furnishing: clippedText(value?.furnishing, 4000),
    detail: clippedText(value?.detail, 6000),
    createdAt: value?.createdAt || new Date().toISOString(),
    updatedAt: value?.updatedAt || value?.createdAt || new Date().toISOString()
  };
}

function hash(value) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex").slice(0, 20);
}

export function cleanCartographyStrokes(value) {
  if (!Array.isArray(value)) throw new Error("Map ink must be a list of marks.");
  if (value.length > MAX_STROKES) throw new Error("This sheet holds too many separate marks.");
  let pointsSeen = 0;
  return value.map((stroke) => {
    if (!stroke || !["pen", "eraser"].includes(stroke.tool)) throw new Error("Unknown map drawing tool.");
    if (!Array.isArray(stroke.points) || stroke.points.length < 1) throw new Error("A map mark needs a path.");
    pointsSeen += stroke.points.length;
    if (pointsSeen > MAX_POINTS) throw new Error("This sheet holds too many map points.");
    const points = stroke.points.map((point) => {
      if (!Array.isArray(point) || point.length !== 2 || !point.every(Number.isFinite)) {
        throw new Error("A map mark has an invalid point.");
      }
      return [normalizedPoint(point[0]), normalizedPoint(point[1])];
    });
    return {
      tool: stroke.tool,
      layer: stroke.layer === "detail" ? "detail" : "structure",
      color: colorValue(stroke.color),
      width: boundedNumber(stroke.width, stroke.tool === "eraser" ? 0.025 : 0.0035, 0.001, 0.08),
      points
    };
  });
}

export function blueprintCoverage(strokes, columns = 32, rows = 20) {
  const cells = new Set();
  const structural = (Array.isArray(strokes) ? strokes : []).filter((stroke) => stroke.layer !== "detail");
  const mark = (x, y, erase = false) => {
    const column = Math.max(0, Math.min(columns - 1, Math.floor(normalizedPoint(x) * columns)));
    const row = Math.max(0, Math.min(rows - 1, Math.floor(normalizedPoint(y) * rows)));
    const key = `${column}:${row}`;
    if (erase) cells.delete(key);
    else cells.add(key);
  };
  for (const stroke of structural) {
    const erase = stroke.tool === "eraser";
    const points = stroke.points || [];
    points.forEach(([x, y]) => mark(x, y, erase));
    for (let index = 1; index < points.length; index += 1) {
      const [ax, ay] = points[index - 1];
      const [bx, by] = points[index];
      const steps = Math.max(1, Math.ceil(Math.max(Math.abs(bx - ax) * columns, Math.abs(by - ay) * rows) * 2));
      for (let step = 1; step < steps; step += 1) {
        const amount = step / steps;
        mark(ax + (bx - ax) * amount, ay + (by - ay) * amount, erase);
      }
    }
  }
  return [...cells].sort((a, b) => {
    const [ac, ar] = a.split(":").map(Number);
    const [bc, br] = b.split(":").map(Number);
    return ar - br || ac - bc;
  });
}

export function diffBlueprintCoverage(previous = [], current = [], columns = 32, rows = 20) {
  const before = new Set(previous);
  const after = new Set(current);
  const added = current.filter((cell) => !before.has(cell));
  const removed = previous.filter((cell) => !after.has(cell));
  const changed = [...new Set([...added, ...removed])];
  const coordinates = changed.map((cell) => cell.split(":").map(Number));
  const bounds = coordinates.length ? {
    x: Math.min(...coordinates.map(([column]) => column)) / columns,
    y: Math.min(...coordinates.map(([, row]) => row)) / rows,
    width: (Math.max(...coordinates.map(([column]) => column)) - Math.min(...coordinates.map(([column]) => column)) + 1) / columns,
    height: (Math.max(...coordinates.map(([, row]) => row)) - Math.min(...coordinates.map(([, row]) => row)) + 1) / rows
  } : null;
  return {
    changed: changed.length > 0,
    addedCells: added,
    removedCells: removed,
    changedCells: changed,
    changedPercent: Math.round(changed.length / (columns * rows) * 1000) / 10,
    bounds
  };
}

function normalizeBlueprint(value) {
  const strokes = cleanCartographyStrokes(Array.isArray(value?.strokes) ? value.strokes : []);
  const coverage = Array.isArray(value?.confirmedCoverage) ? value.confirmedCoverage.filter((cell) => /^\d+:\d+$/.test(cell)) : [];
  return {
    strokes,
    revision: Math.max(0, Math.round(boundedNumber(value?.revision, 0, 0, 100000))),
    confirmedHash: clippedText(value?.confirmedHash, 100) || null,
    confirmedCoverage: coverage,
    pendingDiff: value?.pendingDiff && typeof value.pendingDiff === "object" ? {
      changed: value.pendingDiff.changed === true,
      addedCells: Array.isArray(value.pendingDiff.addedCells) ? value.pendingDiff.addedCells : [],
      removedCells: Array.isArray(value.pendingDiff.removedCells) ? value.pendingDiff.removedCells : [],
      changedCells: Array.isArray(value.pendingDiff.changedCells) ? value.pendingDiff.changedCells : [],
      changedPercent: boundedNumber(value.pendingDiff.changedPercent, 0, 0, 100),
      bounds: value.pendingDiff.bounds || null
    } : null
  };
}

function normalizeTruth(value) {
  return {
    overview: clippedText(value?.overview, 8000),
    zones: (Array.isArray(value?.zones) ? value.zones : []).slice(0, 100).map(normalizeZone)
  };
}

function normalizeRenderResult(value, fallbackKind) {
  return {
    kind: value?.kind || fallbackKind,
    dependencyHash: clippedText(value?.dependencyHash, 100) || null,
    status: ["current", "needs-render", "rendering", "failed"].includes(value?.status) ? value.status : "needs-render",
    imageUrl: clippedText(value?.imageUrl, 500) || null,
    brief: clippedText(value?.brief, 12000),
    updatedAt: value?.updatedAt || null
  };
}

function normalizeRenderPlan(value) {
  return {
    status: ["unplanned", "awaiting-confirmation", "compiling", "ready"].includes(value?.status) ? value.status : "unplanned",
    revision: Math.max(0, Math.round(boundedNumber(value?.revision, 0, 0, 100000))),
    invalidatedZoneIds: Array.isArray(value?.invalidatedZoneIds) ? value.invalidatedZoneIds.map(String) : [],
    map: normalizeRenderResult(value?.map, "parchment-map"),
    scenes: (Array.isArray(value?.scenes) ? value.scenes : []).map((scene) => ({
      zoneId: clippedText(scene?.zoneId, 100),
      ...normalizeRenderResult(scene, "scene")
    }))
  };
}

function normalizeSheet(value) {
  return {
    id: clippedText(value?.id, 100) || `map_${randomUUID()}`,
    title: clippedText(value?.title, 120) || "Untitled map",
    createdBy: value?.createdBy === "cartographer" ? "cartographer" : "gm",
    visibility: value?.visibility === "cartographer" ? "cartographer" : "gm",
    width: Math.round(boundedNumber(value?.width, 1600, 320, 8000)),
    height: Math.round(boundedNumber(value?.height, 1000, 240, 8000)),
    image: normalizeImage(value?.image),
    strokes: cleanCartographyStrokes(Array.isArray(value?.strokes) ? value.strokes : []),
    notes: (Array.isArray(value?.notes) ? value.notes : []).slice(0, MAX_NOTES).map(normalizeNote),
    submissions: (Array.isArray(value?.submissions) ? value.submissions : [])
      .slice(-MAX_SUBMISSIONS)
      .map(normalizeSubmission)
      .filter(Boolean),
    blueprint: normalizeBlueprint(value?.blueprint),
    truth: normalizeTruth(value?.truth),
    renderPlan: normalizeRenderPlan(value?.renderPlan),
    createdAt: value?.createdAt || new Date().toISOString(),
    updatedAt: value?.updatedAt || value?.createdAt || new Date().toISOString()
  };
}

export function normalizeCartographyDocument(value) {
  const source = value && typeof value === "object" && !Array.isArray(value) ? value : DEFAULT_CARTOGRAPHY;
  return {
    version: 1,
    ownerPcId: clippedText(source.ownerPcId, 100) || null,
    sheets: (Array.isArray(source.sheets) ? source.sheets : []).map(normalizeSheet)
  };
}

export function isCartographer(document, pcId) {
  return Boolean(pcId && document?.ownerPcId === pcId);
}

function sheetView(sheet, mode, pcId = null) {
  const latestSubmission = sheet.submissions.at(-1) || null;
  const visibleFieldwork = mode === "gm" && latestSubmission ? latestSubmission : (mode === "gm" ? { strokes: [], notes: [] } : sheet);
  const draftHash = hash(cartographerPayload(sheet));
  const view = {
    id: sheet.id,
    title: sheet.title,
    createdBy: sheet.createdBy,
    visibility: sheet.visibility,
    width: sheet.width,
    height: sheet.height,
    hasImage: Boolean(sheet.image),
    imageUrl: sheet.image
      ? `/api/cartography/images/${encodeURIComponent(sheet.id)}?${mode === "gm" ? "gm=1" : `pc=${encodeURIComponent(pcId)}`}`
      : null,
    strokes: visibleFieldwork.strokes.map((stroke) => ({ ...stroke, points: stroke.points.map((point) => [...point]) })),
    notes: visibleFieldwork.notes.map((note) => ({ ...note })),
    submission: latestSubmission ? {
      revision: latestSubmission.revision,
      submittedAt: latestSubmission.submittedAt,
      strokeCount: latestSubmission.strokes.length,
      noteCount: latestSubmission.notes.length,
      hasDraftChanges: latestSubmission.contentHash !== draftHash
    } : {
      revision: 0,
      submittedAt: null,
      strokeCount: 0,
      noteCount: 0,
      hasDraftChanges: Boolean(sheet.strokes.length || sheet.notes.length)
    },
    createdAt: sheet.createdAt,
    updatedAt: sheet.updatedAt,
    canDelete: mode === "gm" || sheet.createdBy === "cartographer"
  };
  if (mode === "gm") {
    view.blueprint = structuredClone(sheet.blueprint);
    view.truth = structuredClone(sheet.truth);
    view.renderPlan = structuredClone(sheet.renderPlan);
  }
  return view;
}

export function cartographyPlayerView(document, pcId, pcs = []) {
  if (!isCartographer(document, pcId)) return null;
  const owner = pcs.find((pc) => pc.id === pcId && pc.active !== false);
  if (!owner) return null;
  return {
    role: "cartographer",
    owner: { id: owner.id, name: owner.name },
    sheets: document.sheets
      .filter((sheet) => sheet.visibility === "cartographer")
      .map((sheet) => sheetView(sheet, "player", pcId))
  };
}

export function cartographyGmView(document, pcs = []) {
  const owner = pcs.find((pc) => pc.id === document.ownerPcId) || null;
  return {
    role: "gm",
    owner: owner ? { id: owner.id, name: owner.name, active: owner.active !== false } : null,
    sheets: document.sheets.map((sheet) => sheetView(sheet, "gm"))
  };
}

export function createBlankSheet(document, { title, createdBy = "cartographer", visibility } = {}) {
  if (document.sheets.length >= 80) throw new Error("The map case is full.");
  const now = new Date().toISOString();
  const sheet = normalizeSheet({
    id: `map_${randomUUID()}`,
    title: clippedText(title, 120) || "Untitled field map",
    createdBy,
    visibility: visibility === "gm" ? "gm" : "cartographer",
    width: 1600,
    height: 1000,
    createdAt: now,
    updatedAt: now
  });
  document.sheets.push(sheet);
  return sheet;
}

export function saveCartographyImage(dataUrl, sheetId) {
  const match = String(dataUrl || "").match(/^data:(image\/(?:png|jpeg|webp));base64,([a-z0-9+/=]+)$/i);
  if (!match || !MIME_EXTENSIONS[match[1].toLowerCase()]) throw new Error("Choose a PNG, JPEG, or WebP map image.");
  const mimeType = match[1].toLowerCase();
  const buffer = Buffer.from(match[2], "base64");
  if (!buffer.length || buffer.length > MAX_IMAGE_BYTES) throw new Error("Map images must be smaller than 5 MB.");
  fs.mkdirSync(IMAGE_DIR, { recursive: true });
  const file = `${sheetId}.${MIME_EXTENSIONS[mimeType]}`;
  const destination = path.join(IMAGE_DIR, file);
  const temporary = `${destination}.${process.pid}-${Date.now()}.tmp`;
  try {
    fs.writeFileSync(temporary, buffer);
    fs.renameSync(temporary, destination);
  } finally {
    if (fs.existsSync(temporary)) fs.unlinkSync(temporary);
  }
  return { file, mimeType };
}

export function createImageSheet(document, { title, visibility, width, height, dataUrl } = {}) {
  const sheet = createBlankSheet(document, { title, createdBy: "gm", visibility });
  try {
    sheet.width = Math.round(boundedNumber(width, 1600, 320, 8000));
    sheet.height = Math.round(boundedNumber(height, 1000, 240, 8000));
    sheet.image = saveCartographyImage(dataUrl, sheet.id);
    return sheet;
  } catch (error) {
    document.sheets = document.sheets.filter((candidate) => candidate.id !== sheet.id);
    throw error;
  }
}

export function cartographyImagePath(sheet) {
  if (!sheet?.image?.file) return null;
  const destination = path.resolve(IMAGE_DIR, path.basename(sheet.image.file));
  if (path.dirname(destination) !== path.resolve(IMAGE_DIR)) return null;
  return destination;
}

export function updateSheet(document, sheetId, patch = {}, mode = "gm") {
  const sheet = document.sheets.find((candidate) => candidate.id === sheetId);
  if (!sheet) throw new Error("No such map sheet.");
  if (mode !== "gm" && sheet.createdBy !== "cartographer") throw new Error("Only the Keeper can rename an issued map.");
  if (Object.hasOwn(patch, "title")) sheet.title = clippedText(patch.title, 120) || sheet.title;
  if (mode === "gm" && Object.hasOwn(patch, "visibility")) {
    sheet.visibility = patch.visibility === "cartographer" ? "cartographer" : "gm";
  }
  sheet.updatedAt = new Date().toISOString();
  return sheet;
}

export function replaceSheetStrokes(document, sheetId, strokes) {
  const sheet = document.sheets.find((candidate) => candidate.id === sheetId && candidate.visibility === "cartographer");
  if (!sheet) throw new Error("No such issued map sheet.");
  sheet.strokes = cleanCartographyStrokes(strokes);
  sheet.updatedAt = new Date().toISOString();
  return sheet;
}

export function submitSheetToDreamer(document, sheetId) {
  const sheet = document.sheets.find((candidate) => candidate.id === sheetId && candidate.visibility === "cartographer");
  if (!sheet) throw new Error("No such issued map sheet.");
  const payload = cartographerPayload(sheet);
  const contentHash = hash(payload);
  const latest = sheet.submissions.at(-1);
  if (latest?.contentHash === contentHash) throw new Error("This draft already matches the last map sent to the Dreamer.");
  const submission = normalizeSubmission({
    ...structuredClone(payload),
    revision: (latest?.revision || 0) + 1,
    submittedAt: new Date().toISOString(),
    contentHash
  });
  sheet.submissions.push(submission);
  if (sheet.submissions.length > MAX_SUBMISSIONS) sheet.submissions.splice(0, sheet.submissions.length - MAX_SUBMISSIONS);
  sheet.updatedAt = submission.submittedAt;
  return submission;
}

function zonesTouchedByCells(zones, changedCells, columns = 32, rows = 20) {
  const changed = new Set(changedCells || []);
  return zones.filter((zone) => {
    const left = Math.floor(zone.x * columns);
    const right = Math.ceil((zone.x + zone.width) * columns);
    const top = Math.floor(zone.y * rows);
    const bottom = Math.ceil((zone.y + zone.height) * rows);
    for (let row = top; row < bottom; row += 1) {
      for (let column = left; column < right; column += 1) if (changed.has(`${column}:${row}`)) return true;
    }
    return false;
  }).map((zone) => zone.id);
}

export function replaceBlueprintStrokes(document, sheetId, strokes) {
  const sheet = document.sheets.find((candidate) => candidate.id === sheetId);
  if (!sheet) throw new Error("No such map sheet.");
  sheet.blueprint.strokes = cleanCartographyStrokes(strokes).map((stroke) => ({ ...stroke, layer: stroke.layer === "detail" ? "detail" : "structure" }));
  const coverage = blueprintCoverage(sheet.blueprint.strokes);
  const currentHash = hash(coverage);
  const diff = diffBlueprintCoverage(sheet.blueprint.confirmedCoverage, coverage);
  sheet.blueprint.pendingDiff = diff.changed ? diff : null;
  sheet.renderPlan.status = diff.changed ? "awaiting-confirmation" : (sheet.renderPlan.status === "awaiting-confirmation" ? "ready" : sheet.renderPlan.status);
  if (!diff.changed && currentHash === sheet.blueprint.confirmedHash) sheet.blueprint.pendingDiff = null;
  sheet.updatedAt = new Date().toISOString();
  return { sheet, diff };
}

export function beginBlueprintConfirmation(document, sheetId) {
  const sheet = document.sheets.find((candidate) => candidate.id === sheetId);
  if (!sheet) throw new Error("No such map sheet.");
  const coverage = blueprintCoverage(sheet.blueprint.strokes);
  const diff = diffBlueprintCoverage(sheet.blueprint.confirmedCoverage, coverage);
  if (!diff.changed && sheet.blueprint.confirmedHash) throw new Error("The confirmed structure has not changed.");
  const affectedZoneIds = sheet.blueprint.confirmedHash
    ? zonesTouchedByCells(sheet.truth.zones, diff.changedCells)
    : sheet.truth.zones.map((zone) => zone.id);
  sheet.blueprint.revision += 1;
  sheet.blueprint.confirmedCoverage = coverage;
  sheet.blueprint.confirmedHash = hash(coverage);
  sheet.blueprint.pendingDiff = null;
  sheet.renderPlan.status = "compiling";
  sheet.renderPlan.revision = sheet.blueprint.revision;
  sheet.renderPlan.invalidatedZoneIds = affectedZoneIds;
  sheet.updatedAt = new Date().toISOString();
  return { revision: sheet.blueprint.revision, affectedZoneIds, diff };
}

function zoneCoverageSignature(sheet, zone) {
  const columns = 32;
  const rows = 20;
  const coverage = sheet.blueprint.confirmedCoverage.filter((cell) => {
    const [column, row] = cell.split(":").map(Number);
    const x = column / columns;
    const y = row / rows;
    return x >= zone.x && x <= zone.x + zone.width && y >= zone.y && y <= zone.y + zone.height;
  });
  return hash(coverage);
}

export function compileRenderPlan(document, sheetId) {
  const sheet = document.sheets.find((candidate) => candidate.id === sheetId);
  if (!sheet) throw new Error("No such map sheet.");
  const now = new Date().toISOString();
  const mapDependency = hash({ structure: sheet.blueprint.confirmedHash, truth: sheet.truth });
  const previousMap = sheet.renderPlan.map;
  sheet.renderPlan.map = {
    ...previousMap,
    kind: "parchment-map",
    dependencyHash: mapDependency,
    status: previousMap.dependencyHash === mapDependency && previousMap.imageUrl ? "current" : "needs-render",
    brief: `Blueprint revision ${sheet.blueprint.revision}. ${sheet.truth.overview || "No overall truth has been written."} Preserve the confirmed hard structure. Render as an incomplete but accurate map on physical parchment.`,
    updatedAt: now
  };
  const previousScenes = new Map(sheet.renderPlan.scenes.map((scene) => [scene.zoneId, scene]));
  sheet.renderPlan.scenes = sheet.truth.zones.map((zone) => {
    const dependencyHash = hash({
      structure: zoneCoverageSignature(sheet, zone),
      truth: zone.truth,
      furnishing: zone.furnishing,
      detail: zone.detail
    });
    const previous = previousScenes.get(zone.id);
    const unchanged = previous?.dependencyHash === dependencyHash && previous.imageUrl;
    return {
      zoneId: zone.id,
      kind: "scene",
      dependencyHash,
      status: unchanged ? "current" : "needs-render",
      imageUrl: unchanged ? previous.imageUrl : null,
      brief: `${zone.name}. ${zone.truth || "No general truth written."} Furnishing: ${zone.furnishing || "unspecified"}. Detail: ${zone.detail || "unspecified"}. Preserve the confirmed room shape and adjacency from blueprint revision ${sheet.blueprint.revision}.`,
      updatedAt: now
    };
  });
  sheet.renderPlan.status = "ready";
  sheet.renderPlan.invalidatedZoneIds = [];
  sheet.updatedAt = now;
  return sheet.renderPlan;
}

function markTruthDirty(sheet, zoneIds = []) {
  sheet.renderPlan.status = sheet.blueprint.pendingDiff ? "awaiting-confirmation" : "ready";
  sheet.renderPlan.map.status = "needs-render";
  const dirty = new Set(zoneIds);
  for (const scene of sheet.renderPlan.scenes) if (dirty.has(scene.zoneId)) scene.status = "needs-render";
  sheet.updatedAt = new Date().toISOString();
}

export function updateMapTruth(document, sheetId, value) {
  const sheet = document.sheets.find((candidate) => candidate.id === sheetId);
  if (!sheet) throw new Error("No such map sheet.");
  sheet.truth.overview = clippedText(value?.overview, 8000);
  markTruthDirty(sheet, sheet.truth.zones.map((zone) => zone.id));
  return sheet.truth;
}

export function addTruthZone(document, sheetId, value) {
  const sheet = document.sheets.find((candidate) => candidate.id === sheetId);
  if (!sheet) throw new Error("No such map sheet.");
  if (sheet.truth.zones.length >= 100) throw new Error("This map already has too many true regions.");
  const zone = normalizeZone({ ...value, id: `zone_${randomUUID()}` });
  sheet.truth.zones.push(zone);
  markTruthDirty(sheet, [zone.id]);
  return zone;
}

export function updateTruthZone(document, sheetId, zoneId, value) {
  const sheet = document.sheets.find((candidate) => candidate.id === sheetId);
  if (!sheet) throw new Error("No such map sheet.");
  const index = sheet.truth.zones.findIndex((zone) => zone.id === zoneId);
  if (index < 0) throw new Error("No such true region.");
  const zone = normalizeZone({ ...sheet.truth.zones[index], ...value, id: zoneId, updatedAt: new Date().toISOString() });
  sheet.truth.zones[index] = zone;
  markTruthDirty(sheet, [zone.id]);
  return zone;
}

export function deleteTruthZone(document, sheetId, zoneId) {
  const sheet = document.sheets.find((candidate) => candidate.id === sheetId);
  if (!sheet) throw new Error("No such map sheet.");
  const before = sheet.truth.zones.length;
  sheet.truth.zones = sheet.truth.zones.filter((zone) => zone.id !== zoneId);
  if (before === sheet.truth.zones.length) throw new Error("No such true region.");
  sheet.renderPlan.scenes = sheet.renderPlan.scenes.filter((scene) => scene.zoneId !== zoneId);
  markTruthDirty(sheet);
}

export function addSheetNote(document, sheetId, value) {
  const sheet = document.sheets.find((candidate) => candidate.id === sheetId && candidate.visibility === "cartographer");
  if (!sheet) throw new Error("No such issued map sheet.");
  if (sheet.notes.length >= MAX_NOTES) throw new Error("This map cannot hold another pinned note.");
  const note = normalizeNote({ ...value, id: `pin_${randomUUID()}`, createdAt: new Date().toISOString() });
  if (!note.title && !note.text) throw new Error("Write a speculation before pinning it.");
  sheet.notes.push(note);
  sheet.updatedAt = note.updatedAt;
  return note;
}

export function updateSheetNote(document, sheetId, noteId, value) {
  const sheet = document.sheets.find((candidate) => candidate.id === sheetId && candidate.visibility === "cartographer");
  if (!sheet) throw new Error("No such issued map sheet.");
  const index = sheet.notes.findIndex((note) => note.id === noteId);
  if (index < 0) throw new Error("No such pinned note.");
  const updated = normalizeNote({ ...sheet.notes[index], ...value, id: noteId, updatedAt: new Date().toISOString() });
  if (!updated.title && !updated.text) throw new Error("A pinned note cannot be empty.");
  sheet.notes[index] = updated;
  sheet.updatedAt = updated.updatedAt;
  return updated;
}

export function deleteSheetNote(document, sheetId, noteId) {
  const sheet = document.sheets.find((candidate) => candidate.id === sheetId && candidate.visibility === "cartographer");
  if (!sheet) throw new Error("No such issued map sheet.");
  const before = sheet.notes.length;
  sheet.notes = sheet.notes.filter((note) => note.id !== noteId);
  if (sheet.notes.length === before) throw new Error("No such pinned note.");
  sheet.updatedAt = new Date().toISOString();
}

export function deleteSheet(document, sheetId, mode = "gm") {
  const sheet = document.sheets.find((candidate) => candidate.id === sheetId);
  if (!sheet) throw new Error("No such map sheet.");
  if (mode !== "gm" && sheet.createdBy !== "cartographer") throw new Error("Only the Keeper can remove an issued map.");
  const imagePath = cartographyImagePath(sheet);
  document.sheets = document.sheets.filter((candidate) => candidate.id !== sheetId);
  if (imagePath && fs.existsSync(imagePath)) fs.unlinkSync(imagePath);
}
