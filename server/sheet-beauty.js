import { createHash, randomUUID } from "node:crypto";
import { BACKGROUND_FIELD_DEFINITIONS } from "./background-suggest.js";

export const SHEET_BEAUTY_RECIPE_VERSION = 1;
export const DEFAULT_SHEET_BEAUTY = { version: 1, characters: {} };

const VARIANTS = ["etched", "illuminated"];
const BACKGROUND_IDS = new Set(BACKGROUND_FIELD_DEFINITIONS.map((field) => field.id));
const CLASS_MOTIFS = {
  core_class_bard: "refrain",
  core_class_druid: "grove",
  core_class_guardian: "bulwark",
  core_class_ranger: "trail",
  core_class_rogue: "veil",
  core_class_seraph: "halo",
  core_class_sorcerer: "constellation",
  core_class_warrior: "blade",
  core_class_wizard: "diagram",
  custom_class_inventor: "mechanism"
};
const KNOWN_SLOTS = new Set([
  "masthead", "portraitFrame", "moduleEdge", "tierFlourish",
  "memoryMargin", "domainSeal", "covenantSeal", "connectionThread"
]);

const cleanText = (value, limit = 120) => String(value || "").trim().slice(0, limit);
const cleanLevel = (value) => Math.max(1, Math.min(10, Number.parseInt(value, 10) || 1));
const tierForLevel = (level) => level >= 8 ? 4 : level >= 5 ? 3 : level >= 2 ? 2 : 1;
const tokenEntitlement = (pc) => cleanLevel(pc?.level) + 1;

function stableHash(value) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex").slice(0, 16);
}

function normalizedVersion(version) {
  if (!version || typeof version !== "object" || !version.config) return null;
  const slots = {};
  for (const [name, value] of Object.entries(version.config.slots || {})) {
    if (KNOWN_SLOTS.has(name) && value && typeof value === "object") slots[name] = { ...value };
  }
  return {
    id: cleanText(version.id, 100),
    committedAt: cleanText(version.committedAt, 40),
    candidateId: cleanText(version.candidateId, 100),
    pass: Math.max(1, Number.parseInt(version.pass, 10) || 1),
    variant: VARIANTS.includes(version.variant) ? version.variant : "etched",
    config: {
      recipeVersion: SHEET_BEAUTY_RECIPE_VERSION,
      classId: cleanText(version.config.classId, 100),
      motif: cleanText(version.config.motif, 40) || "fieldwork",
      finish: VARIANTS.includes(version.config.finish) ? version.config.finish : "etched",
      grade: Math.max(1, Math.min(4, Number.parseInt(version.config.grade, 10) || 1)),
      tier: Math.max(1, Math.min(4, Number.parseInt(version.config.tier, 10) || 1)),
      slots
    }
  };
}

export function normalizeSheetBeautyDocument(raw) {
  const result = structuredClone(DEFAULT_SHEET_BEAUTY);
  if (!raw || typeof raw !== "object") return result;
  for (const [pcId, source] of Object.entries(raw.characters || {})) {
    if (!/^pc_[a-zA-Z0-9_-]{3,100}$/.test(pcId)) continue;
    const versions = (Array.isArray(source?.versions) ? source.versions : [])
      .map(normalizedVersion)
      .filter((version) => version?.id);
    const ids = new Set(versions.map((version) => version.id));
    result.characters[pcId] = {
      spent: Math.max(versions.length, Number.parseInt(source?.spent, 10) || 0),
      activeVersionId: ids.has(source?.activeVersionId) ? source.activeVersionId : null,
      versions
    };
  }
  return result;
}

function recordFor(document, pcId) {
  if (!document.characters[pcId]) {
    document.characters[pcId] = { spent: 0, activeVersionId: null, versions: [] };
  }
  return document.characters[pcId];
}

function characterSignals(pc) {
  const answeredBackground = new Set(
    (pc.background || []).filter((entry) => cleanText(entry?.a)).map((entry) => entry.id)
  );
  const inventory = Array.isArray(pc.inventory) ? pc.inventory : [];
  return {
    portrait: Boolean(cleanText(pc.portrait)),
    fullBackground: [...BACKGROUND_IDS].every((id) => answeredBackground.has(id)),
    domains: (pc.domainCards || []).length > 0,
    covenant: inventory.some((item) => item?.kind === "paper" && item?.paperType === "covenant"),
    connections: (pc.connections || []).filter((entry) => cleanText(entry?.note)).length >= 3
  };
}

function recipeFor(pc, record, variant) {
  const level = cleanLevel(pc.level);
  const tier = tierForLevel(level);
  const pass = record.versions.length + 1;
  const motif = CLASS_MOTIFS[pc.class?.id] || (cleanText(pc.class?.name).toLowerCase().includes("invent") ? "mechanism" : "fieldwork");
  const signals = characterSignals(pc);
  const grade = Math.min(4, Math.max(tier, 1 + Math.floor((pass - 1) / 2)));
  const slots = {
    masthead: { motif, grade },
    portraitFrame: { motif, grade },
    moduleEdge: { motif, grade },
    tierFlourish: { tier, grade }
  };
  if (signals.fullBackground) slots.memoryMargin = { motif, grade };
  if (signals.domains) slots.domainSeal = { motif, grade };
  if (signals.covenant) slots.covenantSeal = { motif, grade };
  if (signals.connections) slots.connectionThread = { motif, grade };
  const config = {
    recipeVersion: SHEET_BEAUTY_RECIPE_VERSION,
    classId: cleanText(pc.class?.id, 100),
    motif,
    finish: variant,
    grade,
    tier,
    slots
  };
  const candidateId = `beauty_candidate_${stableHash({ pcId: pc.id, pass, config })}`;
  return { id: candidateId, pass, variant, config };
}

function publicRecord(pc, document) {
  const record = recordFor(document, pc.id);
  const active = record.versions.find((version) => version.id === record.activeVersionId) || null;
  const entitlement = tokenEntitlement(pc);
  const signals = characterSignals(pc);
  return {
    entitlement,
    spent: record.spent,
    available: Math.max(0, entitlement - record.spent),
    activeVersionId: active?.id || null,
    active,
    versions: [...record.versions].reverse(),
    candidates: VARIANTS.map((variant) => recipeFor(pc, record, variant)),
    unlocks: [
      "classIdentity",
      "tier",
      ...(signals.portrait ? ["portrait"] : []),
      ...(signals.fullBackground ? ["fullBackground"] : []),
      ...(signals.domains ? ["domains"] : []),
      ...(signals.covenant ? ["covenant"] : []),
      ...(signals.connections ? ["connections"] : [])
    ]
  };
}

export function sheetBeautyView(pc, document) {
  return publicRecord(pc, document);
}

export function commitSheetBeauty(pc, document, candidateId, committedAt = new Date().toISOString()) {
  const record = recordFor(document, pc.id);
  if (record.spent >= tokenEntitlement(pc)) throw new Error("No sheet-beautifying tokens remain.");
  const candidate = VARIANTS.map((variant) => recipeFor(pc, record, variant))
    .find((item) => item.id === candidateId);
  if (!candidate) throw new Error("That preview is no longer current. Open the atelier again.");
  const version = {
    id: `beauty_${randomUUID()}`,
    committedAt,
    candidateId: candidate.id,
    pass: candidate.pass,
    variant: candidate.variant,
    config: structuredClone(candidate.config)
  };
  record.versions.push(version);
  record.spent += 1;
  record.activeVersionId = version.id;
  return version;
}

export function restoreSheetBeauty(pc, document, versionId) {
  const record = recordFor(document, pc.id);
  if (versionId === null || versionId === "") {
    record.activeVersionId = null;
    return null;
  }
  const version = record.versions.find((candidate) => candidate.id === versionId);
  if (!version) throw new Error("That sheet version could not be found.");
  record.activeVersionId = version.id;
  return version;
}

export const sheetBeautyInternals = { characterSignals, recipeFor, tierForLevel, tokenEntitlement, KNOWN_SLOTS };
