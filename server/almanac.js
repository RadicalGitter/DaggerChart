// GM-only Almanac: editable private lore and reveal-one-result chance tables.
// Table entry text is never enumerable. A roll may return only its one result.
import { Router } from "express";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { loadJson, saveJson, DATA_DIR } from "./store.js";

const router = Router();
const RULES = loadJson("daggerheart/rules.json", { nodes: [] });
const lore = loadJson("wiki-lore.json", { nodes: [] });
const tableState = loadJson("tables-state.json", {});
const TABLES_DIR = path.join(DATA_DIR, "tables");
const tables = new Map();

const guard = (handler) => async (req, res) => {
  try {
    await handler(req, res);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
};

function boundedText(value, label, max, { required = false } = {}) {
  const clean = String(value ?? "").trim();
  if (required && !clean) throw new Error(`${label} is required.`);
  if (clean.length > max) throw new Error(`${label} is too long.`);
  return clean;
}

function boundedList(value, label, { maxItems = 40, maxLength = 80, fallback = [] } = {}) {
  if (value === undefined) return fallback;
  if (!Array.isArray(value)) throw new Error(`${label} must be a list.`);
  if (value.length > maxItems) throw new Error(`${label} has too many entries.`);
  return value
    .map((item) => boundedText(item, label, maxLength))
    .filter(Boolean);
}

function loreInput(body, existing = {}) {
  return {
    title: boundedText(body.title ?? existing.title, "The title", 120, { required: true }),
    path: boundedList(body.path, "The path", {
      maxItems: 6,
      maxLength: 80,
      fallback: existing.path || ["Lore"]
    }),
    body: boundedText(body.body ?? existing.body, "The page", 30000),
    seeAlso: boundedList(body.seeAlso, "See also", { fallback: existing.seeAlso || [] }),
    keywords: boundedList(body.keywords, "Keywords", { fallback: existing.keywords || [] })
  };
}

function loadTables() {
  if (!fs.existsSync(TABLES_DIR)) return;
  for (const filename of fs.readdirSync(TABLES_DIR).filter((name) => name.endsWith(".json"))) {
    const fullPath = path.join(TABLES_DIR, filename);
    const table = JSON.parse(fs.readFileSync(fullPath, "utf8"));
    if (!/^[a-z0-9-]+$/.test(table?.id || "") || tables.has(table.id)) {
      throw new Error(`Invalid or duplicate chance table: ${filename}`);
    }
    tables.set(table.id, table);
  }
}

function rollNumber(raw, sides) {
  if (!Number.isInteger(sides) || sides < 2 || sides > 1000) throw new Error("The chance table has an invalid die.");
  if (raw === undefined || raw === null || raw === "") return crypto.randomInt(1, sides + 1);
  const value = Number(raw);
  if (!Number.isInteger(value) || value < 1 || value > sides) throw new Error(`The die is a d${sides}.`);
  return value;
}

function reveal(key, sides, entries, raw) {
  const number = rollNumber(raw, sides);
  const source = entries?.[String(number)];
  if (!source?.text) throw new Error("That page is missing from the chance table.");
  const spent = Array.isArray(tableState[key]) ? tableState[key] : [];
  const seenBefore = spent.includes(number);
  if (!seenBefore) spent.push(number);
  tableState[key] = spent;
  saveJson("tables-state.json", tableState);
  return {
    n: number,
    entry: {
      text: String(source.text),
      ...(source.reward ? { reward: String(source.reward) } : {})
    },
    seenBefore
  };
}

function seenCount(key) {
  return Array.isArray(tableState[key]) ? new Set(tableState[key]).size : 0;
}

function tableMetadata(table) {
  if (table.danger) {
    return {
      id: table.id,
      name: table.name,
      blurb: table.blurb || "",
      travel: {
        danger: Object.fromEntries(Object.entries(table.danger).map(([key, value]) => [key, {
          label: value.label,
          die: value.die,
          total: Object.keys(value.entries || {}).length,
          seen: seenCount(`travel:${key}`)
        }])),
        modes: Object.fromEntries(Object.entries(table.modes || {}).map(([key, value]) => [key, {
          label: value.label,
          die: value.die,
          total: Object.keys(value.twists || {}).length,
          seen: seenCount(`travel-mode:${key}`)
        }]))
      }
    };
  }
  return {
    id: table.id,
    name: table.name,
    blurb: table.blurb || "",
    die: table.die,
    total: Object.keys(table.entries || {}).length,
    seen: seenCount(table.id)
  };
}

loadTables();

router.get("/api/gm/almanac", (_req, res) => {
  res.json({
    nodes: [
      ...(RULES.nodes || []).map((node) => ({ ...node, source: "rules" })),
      ...(lore.nodes || []).map((node) => ({ ...node, source: "lore" }))
    ]
  });
});

router.post("/api/gm/almanac/lore", guard((req, res) => {
  const node = {
    id: `lore_${crypto.randomUUID().slice(0, 12)}`,
    ...loreInput(req.body || {})
  };
  lore.nodes ||= [];
  lore.nodes.push(node);
  saveJson("wiki-lore.json", lore);
  res.status(201).json(node);
}));

router.put("/api/gm/almanac/lore/:id", guard((req, res) => {
  const node = (lore.nodes || []).find((entry) => entry.id === req.params.id);
  if (!node) throw new Error("Only private lore pages can be edited here.");
  Object.assign(node, loreInput(req.body || {}, node));
  saveJson("wiki-lore.json", lore);
  res.json(node);
}));

router.delete("/api/gm/almanac/lore/:id", guard((req, res) => {
  const index = (lore.nodes || []).findIndex((entry) => entry.id === req.params.id);
  if (index < 0) throw new Error("Only private lore pages can be removed here.");
  lore.nodes.splice(index, 1);
  saveJson("wiki-lore.json", lore);
  res.json({ ok: true });
}));

router.get("/api/gm/tables", (_req, res) => {
  res.json([...tables.values()].map(tableMetadata));
});

router.post("/api/gm/tables/travel/roll", guard((req, res) => {
  const table = tables.get("travel");
  if (!table?.danger) throw new Error("The travel table is unavailable.");
  const tier = table.danger[req.body?.danger];
  const mode = table.modes?.[req.body?.mode];
  if (!tier) throw new Error("Choose how dangerous the route is.");
  if (!mode) throw new Error("Choose the way of travel.");
  res.json({
    tierLabel: tier.label,
    modeLabel: mode.label,
    encounter: reveal(`travel:${req.body.danger}`, tier.die, tier.entries, req.body?.raw),
    twist: reveal(`travel-mode:${req.body.mode}`, mode.die, mode.twists, req.body?.twistRaw)
  });
}));

router.post("/api/gm/tables/:id/roll", guard((req, res) => {
  const table = tables.get(req.params.id);
  if (!table || table.danger) throw new Error("Unknown chance table.");
  res.json(reveal(table.id, table.die, table.entries, req.body?.raw));
}));

export default router;
