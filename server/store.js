// JSON persistence: human-readable files, atomic writes, timestamped backups.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const ROOT = path.join(__dirname, "..");
export const DATA_DIR = process.env.DATA_DIR || path.join(ROOT, "data");
const BACKUP_DIR = path.join(DATA_DIR, "backups");
const TABLES_DIR = path.join(DATA_DIR, "event-tables");

export function loadJson(name, fallback) {
  const file = path.join(DATA_DIR, name);
  if (!fs.existsSync(file)) return structuredClone(fallback);
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

export function saveJson(name, obj) {
  const file = path.join(DATA_DIR, name);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  // A unique temp file keeps overlapping local server instances from
  // renaming one another's in-progress write during restarts and smoke tests.
  const nonce = Math.random().toString(36).slice(2, 9);
  const tmp = `${file}.${process.pid}-${Date.now()}-${nonce}.tmp`;
  try {
    fs.writeFileSync(tmp, JSON.stringify(obj, null, 2) + "\n", "utf8");
    fs.renameSync(tmp, file);
  } finally {
    if (fs.existsSync(tmp)) fs.unlinkSync(tmp);
  }
}

// Merge every table file in data/event-tables/ into one combined shape.
export function loadEventTables() {
  fs.mkdirSync(TABLES_DIR, { recursive: true });
  const combined = { rewardCurve: {}, tierRanges: {}, buildings: {} };
  for (const f of fs.readdirSync(TABLES_DIR).filter((f) => f.endsWith(".json"))) {
    const t = JSON.parse(fs.readFileSync(path.join(TABLES_DIR, f), "utf8"));
    Object.assign(combined.rewardCurve, t.rewardCurve);
    Object.assign(combined.tierRanges, t.tierRanges);
    Object.assign(combined.buildings, t.buildings || {});
  }
  return combined;
}

// Snapshot every top-level json file before a downtime resolution lands.
export function snapshot(label = "season") {
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const dest = path.join(BACKUP_DIR, `${stamp}-${label}`);
  fs.mkdirSync(dest, { recursive: true });
  for (const f of fs.readdirSync(DATA_DIR)) {
    const src = path.join(DATA_DIR, f);
    if (fs.statSync(src).isFile() && f.endsWith(".json")) {
      fs.copyFileSync(src, path.join(dest, f));
    }
  }
  return dest;
}
