// Source-authored GM preparation, read on demand so edits need no restart.
import fs from "node:fs";
import path from "node:path";
import { DATA_DIR, loadJson } from "./store.js";

export function adventureDocuments() {
  const document = loadJson("adventures.json", { version: 1, adventures: [] });
  return Array.isArray(document.adventures) ? document.adventures : [];
}

export function adventureById(id) {
  return adventureDocuments().find((entry) => entry.id === id) || null;
}

export function adventureMapPath(adventure) {
  const file = adventure?.map?.file;
  if (typeof file !== "string" || !/^[a-z0-9][a-z0-9_-]*\.(png|jpe?g|webp)$/i.test(file)) return null;
  const target = path.join(DATA_DIR, "adventure-maps", file);
  return fs.existsSync(target) && fs.statSync(target).isFile() ? target : null;
}

export function adventureList() {
  return adventureDocuments().map((entry) => ({
    id: entry.id,
    name: entry.name,
    summary: entry.summary || "",
    status: entry.status || "Prepared",
    partySize: entry.partySize || null,
    level: entry.level || null,
    duration: entry.duration || "",
    mapAvailable: Boolean(adventureMapPath(entry))
  }));
}

// The public image endpoint never accepts a general file path or a second map.
export function projectedAdventureMapPath(screen, id) {
  return screen?.type === "adventure-map" && screen.refId === id
    ? adventureMapPath(adventureById(id))
    : null;
}
