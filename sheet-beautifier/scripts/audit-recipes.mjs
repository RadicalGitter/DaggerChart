import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  DEFAULT_SHEET_BEAUTY,
  normalizeSheetBeautyDocument,
  sheetBeautyInternals,
  sheetBeautyView
} from "../../server/sheet-beauty.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const read = (file, fallback) => {
  try { return JSON.parse(fs.readFileSync(path.join(root, "data", file), "utf8")); }
  catch { return fallback; }
};

const pcs = read("pcs.json", []).filter((pc) => pc?.active !== false);
const document = normalizeSheetBeautyDocument(read("sheet-beauty.json", DEFAULT_SHEET_BEAUTY));
let failed = false;

for (const pc of pcs) {
  const view = sheetBeautyView(pc, document);
  const candidates = view.candidates.map((candidate) => {
    const slots = Object.keys(candidate.config.slots);
    if (slots.length !== new Set(slots).size || slots.some((slot) => !sheetBeautyInternals.KNOWN_SLOTS.has(slot))) failed = true;
    return `${candidate.variant}:${candidate.config.motif}:${slots.join(",")}`;
  });
  console.log(`${pc.name || pc.id} | level ${pc.level || 1} | tokens ${view.available}/${view.entitlement} | commits ${view.spent}`);
  console.log(`  ${candidates.join("\n  ")}`);
}

if (!pcs.length) console.log("No active characters found.");
if (failed) {
  console.error("Recipe audit found an unknown or duplicate slot.");
  process.exitCode = 1;
}
