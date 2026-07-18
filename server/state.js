// Campaign state: load-on-boot, mutate in memory, persist on every change.
import { loadJson, saveJson, loadEventTables, snapshot } from "./store.js";
import { DEFAULT_PLAYER_FEATURES, normalizePlayerFeatures } from "./player-features.js";
import { normalizeFolkProfile } from "./folk-profile.js";
import {
  STARTER_STORES,
  completeProject as applyConstructionProject,
  costText,
  normalizeProjectCheck,
  normalizeSettlementConstruction,
  projectFor,
  recordProjectCheck
} from "./construction.js";

const SEASONS = ["Spring", "Summer", "Autumn", "Winter"];

const DEFAULT_SETTLEMENT = {
  name: "The Settlement",
  population: 50,
  season: { name: "Spring", year: 1 },
  chronicleNotes: "",
  constructionVersion: 1,
  resources: { ...STARTER_STORES },
  buildings: {}
};

const DEFAULT_SESSION = {
  fear: 0,
  showFearToPlayers: true
};

const makeCampaignId = () => `cmp_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
const cleanCampaignName = (value, fallback) => String(value || "").trim().slice(0, 80) || fallback;

function normalizeCampaignState(raw, settlementName) {
  const now = new Date().toISOString();
  const source = Array.isArray(raw?.campaigns) ? raw.campaigns : [];
  const seen = new Set();
  let changed = !raw || !Array.isArray(raw.campaigns);
  const campaigns = [];

  for (const item of source) {
    const id = String(item?.id || "");
    if (!/^cmp_[a-zA-Z0-9_-]{3,80}$/.test(id) || seen.has(id)) {
      changed = true;
      continue;
    }
    seen.add(id);
    const normalized = {
      id,
      name: cleanCampaignName(item.name, "Unnamed campaign"),
      status: item.status === "archived" ? "archived" : "active",
      createdAt: String(item.createdAt || now),
      playerFeatures: normalizePlayerFeatures(item.playerFeatures)
    };
    if (JSON.stringify(normalized) !== JSON.stringify(item)) changed = true;
    campaigns.push(normalized);
  }

  if (!campaigns.length) {
    campaigns.push({
      id: makeCampaignId(),
      name: cleanCampaignName(settlementName, "The Settlement"),
      status: "active",
      createdAt: now,
      playerFeatures: { ...DEFAULT_PLAYER_FEATURES }
    });
    changed = true;
  }

  if (!campaigns.some((campaign) => campaign.status === "active")) {
    campaigns[0].status = "active";
    changed = true;
  }

  const requestedCurrent = String(raw?.currentId || "");
  const current = campaigns.find((campaign) => campaign.id === requestedCurrent && campaign.status === "active")
    || campaigns.find((campaign) => campaign.status === "active");
  if (current.id !== requestedCurrent) changed = true;
  return { value: { currentId: current.id, campaigns }, changed };
}

const normalizeSession = (session) => ({
  fear: Number.isInteger(session?.fear) ? Math.max(0, Math.min(12, session.fear)) : DEFAULT_SESSION.fear,
  showFearToPlayers: typeof session?.showFearToPlayers === "boolean"
    ? session.showFearToPlayers
    : DEFAULT_SESSION.showFearToPlayers
});

const DEFAULT_VILLAGE = {
  id: "place_village",
  name: "The Settlement",
  kind: "home",
  description: "The town itself — fifty souls and counting, a palisade against the dark.",
  portrait: null,
  revealed: true,
  fixed: true,
  hidden: { notes: "" }
};

const settlement = loadJson("settlement.json", DEFAULT_SETTLEMENT);
const campaignState = normalizeCampaignState(loadJson("campaigns.json", null), settlement.name);

export const state = {
  settlement,
  campaigns: campaignState.value,
  session: normalizeSession(loadJson("session.json", DEFAULT_SESSION)),
  sessions: loadJson("sessions.json", []),
  characters: loadJson("characters.json", []),
  pcs: loadJson("pcs.json", []),
  characterDrafts: loadJson("character-drafts.json", []),
  log: loadJson("log.json", []),
  people: loadJson("people.json", []),
  places: loadJson("places.json", [DEFAULT_VILLAGE]),
  notes: loadJson("notes.json", []),
  messages: loadJson("messages.json", []),
  journalDoodles: loadJson("journal-doodles.json", {}),
  feedback: loadJson("feedback.json", []),
  artLibrary: loadJson("art-library.json", { scenes: [] }),
  screen: loadJson("screen.json", { current: null }),
  adversaries: loadJson("adversaries.json", { adversaries: [] }),
  encounters: loadJson("encounters.json", { encounters: [] }),
  tables: loadEventTables(),
  reference: loadJson("daggerheart/reference.json", null)
};

if (!Array.isArray(state.sessions)) state.sessions = [];
if (!state.artLibrary || typeof state.artLibrary !== "object") state.artLibrary = { scenes: [] };
if (!Array.isArray(state.artLibrary.scenes)) state.artLibrary.scenes = [];

const knownCampaignIds = new Set(state.campaigns.campaigns.map((campaign) => campaign.id));
let pcsMigrated = false;
let draftsMigrated = false;
let sessionsMigrated = false;
let logMigrated = false;

for (const pc of state.pcs) {
  if (knownCampaignIds.has(pc.campaignId)) continue;
  pc.campaignId = state.campaigns.currentId;
  pcsMigrated = true;
}
for (const entry of state.characterDrafts) {
  if (!entry?.draft || knownCampaignIds.has(entry.draft.campaignId)) continue;
  entry.draft.campaignId = state.campaigns.currentId;
  draftsMigrated = true;
}
for (const session of state.sessions) {
  if (!knownCampaignIds.has(session.campaignId)) {
    session.campaignId = state.campaigns.currentId;
    sessionsMigrated = true;
  }
  // A network request cannot survive a server restart. Return the record to
  // an explicit retryable state instead of leaving the UI waiting forever.
  if (session.status === "retelling") {
    session.status = "failed";
    session.error = "The server closed before the chronicler returned. Send it again.";
    sessionsMigrated = true;
  }
}
for (const entry of state.log) {
  if (knownCampaignIds.has(entry.campaignId)) continue;
  entry.campaignId = state.campaigns.currentId;
  logMigrated = true;
}

if (campaignState.changed) saveJson("campaigns.json", state.campaigns);
if (pcsMigrated) saveJson("pcs.json", state.pcs);
if (draftsMigrated) saveJson("character-drafts.json", state.characterDrafts);
if (sessionsMigrated) saveJson("sessions.json", state.sessions);
if (logMigrated) saveJson("log.json", state.log);

// Ensure every building in the event tables exists in settlement state.
// New buildings pick up their suggested foreman by name if that character exists.
for (const [id, t] of Object.entries(state.tables.buildings)) {
  if (!state.settlement.buildings[id]) {
    const suggested = t.suggestedForeman
      ? state.characters.find((c) => c.name === t.suggestedForeman)
      : null;
    state.settlement.buildings[id] = {
      id,
      name: t.name,
      resource: t.resource,
      level: 1,
      constructed: false,
      projectCheck: normalizeProjectCheck(),
      constructionHistory: [],
      foremanId: suggested ? suggested.id : null,
      spent: [],
      effects: [],
      producedTotal: 0
    };
  }
}

const constructionMigration = normalizeSettlementConstruction(state.settlement);
if (constructionMigration.changed) {
  if (constructionMigration.freshStart) snapshot("construction-migration");
  saveJson("settlement.json", state.settlement);
}

let folkProfilesMigrated = false;
for (const character of state.characters) {
  if (typeof character.trustedForWork !== "boolean") {
    character.trustedForWork = Object.values(state.settlement.buildings).some((building) => building.foremanId === character.id);
    folkProfilesMigrated = true;
  }
  const profile = normalizeFolkProfile(character);
  for (const [key, value] of Object.entries(profile)) {
    if (JSON.stringify(character[key]) === JSON.stringify(value)) continue;
    character[key] = value;
    folkProfilesMigrated = true;
  }
}
if (folkProfilesMigrated) saveJson("characters.json", state.characters);

export function persist() {
  saveJson("settlement.json", state.settlement);
  saveJson("campaigns.json", state.campaigns);
  saveJson("session.json", state.session);
  saveJson("sessions.json", state.sessions);
  saveJson("characters.json", state.characters);
  saveJson("pcs.json", state.pcs);
  saveJson("character-drafts.json", state.characterDrafts);
  saveJson("log.json", state.log);
  saveJson("people.json", state.people);
  saveJson("places.json", state.places);
  saveJson("notes.json", state.notes);
  saveJson("messages.json", state.messages);
  saveJson("journal-doodles.json", state.journalDoodles);
  saveJson("feedback.json", state.feedback);
  saveJson("art-library.json", state.artLibrary);
  saveJson("screen.json", state.screen);
  // The bestiary (adversaries.json) is hand-edited reference data; the
  // server reads it but never writes it back.
  saveJson("encounters.json", state.encounters);
}

export function getCharacter(id) {
  return state.characters.find((c) => c.id === id) || null;
}

export function campaignById(id) {
  return state.campaigns.campaigns.find((campaign) => campaign.id === id) || null;
}

export function isActiveCampaign(id) {
  return campaignById(id)?.status === "active";
}

export function activeCampaigns() {
  return state.campaigns.campaigns.filter((campaign) => campaign.status === "active");
}

export function createCampaignId() {
  return makeCampaignId();
}

export function seasonLabel() {
  const s = state.settlement.season;
  return `${s.name}, Year ${s.year}`;
}

export function advanceSeason() {
  const s = state.settlement.season;
  const i = SEASONS.indexOf(s.name);
  if (i === SEASONS.length - 1) {
    s.name = SEASONS[0];
    s.year += 1;
  } else {
    s.name = SEASONS[i + 1];
  }
  persist();
  return s;
}

export function addLog(entry) {
  const row = {
    id: `log_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    ts: new Date().toISOString(),
    season: seasonLabel(),
    campaignId: state.campaigns.currentId,
    published: false,
    ...entry
  };
  state.log.unshift(row);
  return row;
}

export function buildingProject(buildingId) {
  return projectFor(state.settlement.buildings[buildingId], state.settlement.resources);
}

export function setBuildingProjectCheck(buildingId, status, note = "") {
  const building = state.settlement.buildings[buildingId];
  const check = recordProjectCheck(building, { status, note });
  persist();
  return { check, project: projectFor(building, state.settlement.resources) };
}

export function completeBuildingProject(buildingId) {
  const building = state.settlement.buildings[buildingId];
  if (!building) throw new Error("Unknown building.");
  snapshot("construction");
  const result = applyConstructionProject(state.settlement, building);
  addLog({
    type: "construction",
    buildingId,
    projectKind: result.kind,
    cost: result.cost,
    summary: result.kind === "construction"
      ? `${building.name} was raised. -${costText(result.cost)}.`
      : `${building.name} was improved to level ${result.toLevel}. -${costText(result.cost)}.`
  });
  persist();
  return { ...result, buildingId, building: building.name };
}

// --- The roll (spec §5 — exact math, do not improve) ---

export function modifierBreakdown(buildingId, playerEffort) {
  const b = state.settlement.buildings[buildingId];
  if (!b || b.constructed !== true) return null;
  const foreman = b.foremanId ? getCharacter(b.foremanId) : null;
  const visible = [
    { label: "Building level", value: b.level },
    {
      label: foreman ? `${foreman.name}'s aptitude` : "No foreman",
      value: foreman ? foreman.aptitudes?.[buildingId] ?? 0 : 0
    }
  ];
  if (playerEffort) visible.push({ label: "Player effort", value: 1 });
  for (const e of b.effects) {
    if (typeof e.bonus === "number" && e.bonus !== 0) {
      visible.push({ label: e.label || "Standing effect", value: e.bonus });
    }
  }
  // Hidden components are folded into the total, itemized only behind
  // the GM's reveal toggle (spec §8B/C).
  const hidden = [];
  if (foreman) {
    const insp = foreman.hidden?.inspiration ?? 0;
    const pen = foreman.hidden?.penalty ?? 0;
    if (insp !== 0) hidden.push({ label: "Inspiration", value: insp });
    if (pen !== 0) hidden.push({ label: "Hidden penalty", value: pen });
  }
  const visibleTotal = visible.reduce((n, m) => n + m.value, 0);
  const hiddenTotal = hidden.reduce((n, m) => n + m.value, 0);
  return { visible, hidden, visibleTotal, hiddenTotal, total: visibleTotal + hiddenTotal, foreman };
}

export function resolveDowntime({ buildingId, raw, playerEffort = false, note = "" }) {
  const b = state.settlement.buildings[buildingId];
  const table = state.tables.buildings[buildingId];
  if (!b || !table) throw new Error("Unknown building.");
  if (b.constructed !== true) throw new Error("Raise the building before resolving its season.");
  if (!Number.isInteger(raw) || raw < -2 || raw > 23) {
    throw new Error("Raw dice must be a whole number from −2 to 23 (4d6 − 1d6).");
  }
  const mods = modifierBreakdown(buildingId, playerEffort);
  const final = Math.max(0, Math.min(30, raw + mods.total));
  const entry = table.results[String(final)];
  if (!entry) throw new Error(`No table entry for ${final}.`);

  const fresh = !b.spent.includes(final);
  if (fresh) b.spent.push(final);

  const pools = state.settlement.resources;
  const amount = entry.resource || 0;
  if (pools[b.resource] === undefined) pools[b.resource] = 0;
  pools[b.resource] += amount;
  b.producedTotal += amount;

  let stockpileWiped = false;
  if (entry.losesStockpile) {
    pools[b.resource] = 0;
    stockpileWiped = true;
  }

  if (fresh && entry.effect) {
    b.effects.push({ label: entry.effect, source: final });
  }

  // Spoiler rule (§8A): the log stores event text only once it has fired.
  const foremanName = mods.foreman ? mods.foreman.name : "no foreman";
  const logRow = addLog({
    type: "downtime",
    buildingId,
    building: b.name,
    foreman: foremanName,
    raw,
    final,
    tier: entry.tier,
    resource: b.resource,
    amount,
    stockpileWiped,
    event: fresh ? entry.event : null,
    alreadySpent: !fresh,
    note,
    summary:
      `${b.name} (${foremanName}). Rolled ${final}: ${entry.tier}. ` +
      (stockpileWiped
        ? `All ${b.resource} lost.`
        : `+${amount} ${b.resource}.`)
  });

  snapshot("downtime");
  persist();

  return {
    final,
    raw,
    breakdown: {
      visible: mods.visible,
      hiddenTotal: mods.hiddenTotal,
      hidden: mods.hidden,
      total: mods.total
    },
    tier: entry.tier,
    resource: b.resource,
    amount,
    event: fresh ? entry.event : null,
    alreadySpent: !fresh,
    stockpileWiped,
    inspirationDrop: !!entry.inspirationDrop,
    effectGained: fresh && entry.effect ? entry.effect : null,
    pools: { ...pools },
    log: logRow
  };
}
