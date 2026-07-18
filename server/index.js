import express from "express";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import "./env.js";
import { campaignById, completeBuildingProject, createCampaignId, isActiveCampaign, state, persist, addLog, advanceSeason, resolveDowntime, modifierBreakdown, seasonLabel, setBuildingProjectCheck } from "./state.js";
import { gmView, tableView, loreView, screenView, partyListView, playerCharacterView, gmMessagesView, playerMessagesView } from "./views.js";
import { normalizeFolkProfile } from "./folk-profile.js";
import { loadJson, saveJson } from "./store.js";
import almanac from "./almanac.js";
import { addInventoryItem, consumables, grantConsumable, inventoryEntry, updateInventoryItem, useInventoryItem } from "./inventory.js";
import { clearTelemetry, recordTelemetryBatch, telemetryView } from "./telemetry.js";
import { retellSession } from "./retell.js";
import { suggestPortrait } from "./portrait-suggest.js";
import { BACKGROUND_FIELD_DEFINITIONS, normalizeBackgroundEntries, suggestBackground } from "./background-suggest.js";
import { artWorkshop } from "./art.js";
import { resolveDualityRoll } from "./duality-roll.js";
import { DEFAULT_PLAYER_FEATURES, normalizePlayerFeatures, playerFeaturePatch } from "./player-features.js";
import { normalizeCharacterName, renameCharacter } from "./party-name.js";
import { normalizeCharacterDraftVersion } from "./character-draft.js";
import { claimOwedDomainCard, updateOwnedDomainCards } from "./domain-cards.js";
import {
  SCENE_DIMENSIONS,
  SCENE_ROOT_IDS,
  SCENE_TAGS,
  assertUniquePlaceName,
  sceneInput,
  sceneLibraryView,
  scenePrompt,
  sceneRecords
} from "./art-library.js";
import {
  musicView,
  characterThemeView,
  generateSong,
  generateCharacterTheme,
  publishCharacterTheme,
  setCharacterThemeIdentity,
  renameCharacterThemeTitles,
  createPlaylist,
  addSongToPlaylist,
  renameSong,
  removeSong,
  songAudioPath,
  checkProviderCredits,
  refreshPendingMusic,
  configureSunoMirror,
  syncSunoSnapshot
} from "./music.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");
const PUBLIC = path.join(ROOT, "public");
const PORT = process.env.PORT || 4626;
const STANDARD_CONDITIONS = new Set(["hidden", "restrained", "vulnerable"]);
const rulesCorpus = loadJson("daggerheart/rules.json", { version: "1.0", source: null, nodes: [] });
const isActivePc = (pc) => pc?.active !== false;
const isPlayablePc = (pc) => isActivePc(pc) && isActiveCampaign(pc?.campaignId);
const activePcById = (id) => state.pcs.find((pc) => pc.id === id && isPlayablePc(pc)) || null;
const currentActivePcs = () => state.pcs.filter((pc) => isPlayablePc(pc) && pc.campaignId === state.campaigns.currentId);
const SESSION_TEXT_LIMITS = { gmSummary: 12000, gmHighlight: 4000, perspective: 12000, retelling: 30000 };
const SESSION_TEXT_LABELS = {
  gmSummary: "The factual summary",
  gmHighlight: "The point of emphasis",
  perspective: "The perspective",
  retelling: "The retelling"
};

function cleanSessionText(value, field, required = false) {
  if (typeof value !== "string") {
    if (required) throw new Error(`${SESSION_TEXT_LABELS[field] || field} is required.`);
    return "";
  }
  const text = value.trim();
  if (required && !text) throw new Error(`${SESSION_TEXT_LABELS[field] || field} is required.`);
  const limit = SESSION_TEXT_LIMITS[field] || 12000;
  if (text.length > limit) throw new Error(`${SESSION_TEXT_LABELS[field] || field} is too long.`);
  return text;
}

function sessionById(id) {
  return state.sessions.find((session) => session.id === id) || null;
}

function currentSessionById(id) {
  const session = sessionById(id);
  if (!session || session.campaignId !== state.campaigns.currentId) throw new Error("No such session in the current campaign.");
  return session;
}

function sessionParticipants(value, campaignId, activeOnly = false) {
  if (!Array.isArray(value)) throw new Error("Choose the characters who were there.");
  const ids = [...new Set(value.map(String))];
  if (!ids.length) throw new Error("Choose at least one character.");
  for (const id of ids) {
    const pc = state.pcs.find((candidate) => candidate.id === id && candidate.campaignId === campaignId);
    if (!pc || (activeOnly && !isPlayablePc(pc))) throw new Error("A chosen character is not available in this campaign.");
  }
  return ids;
}

const app = express();
app.use(express.json({ limit: "8mb" }));
app.use(almanac); // wiki + roll-to-reveal tables (server/almanac.js)
app.use("/shared", express.static(path.join(PUBLIC, "shared")));
app.use("/vendor/dice-box-threejs", express.static(path.join(PUBLIC, "vendor", "dice-box-threejs")));
app.use("/vendor/html2canvas", express.static(path.join(ROOT, "node_modules", "html2canvas", "dist")));
app.use("/gm", express.static(path.join(PUBLIC, "gm")));
app.use("/board", express.static(path.join(PUBLIC, "board")));
app.use("/login", express.static(path.join(PUBLIC, "login")));
app.use("/player", express.static(path.join(PUBLIC, "player")));
app.use("/table", express.static(path.join(PUBLIC, "table")));
app.use("/table-book", express.static(path.join(PUBLIC, "table-book")));
app.use("/tome", express.static(path.join(PUBLIC, "tome")));
app.use("/create", express.static(path.join(PUBLIC, "create")));
app.use("/character", express.static(path.join(PUBLIC, "character")));
app.use("/background", express.static(path.join(PUBLIC, "background")));
app.use("/journal", express.static(path.join(PUBLIC, "journal")));
app.use("/screen", express.static(path.join(PUBLIC, "screen")));
app.use("/music", express.static(path.join(PUBLIC, "music")));
app.use("/rules", express.static(path.join(PUBLIC, "rules")));
app.use("/generated", express.static(path.join(PUBLIC, "generated"), { maxAge: "1h" }));
// /character/<id> serves the sheet shell; the page reads the id from the URL.
app.get("/character/:id", (_req, res) => res.sendFile(path.join(PUBLIC, "character", "index.html")));
app.get("/background/:id", (_req, res) => res.sendFile(path.join(PUBLIC, "background", "index.html")));
// The bare address is the trusted-table identity chooser. No passwords;
// choosing a PC only sets this device's settlement-pc identity.
app.get("/", (_req, res) => res.redirect("/login"));

// --- live updates (SSE): table view & future board screen refresh on change ---
const clients = new Set();
app.get("/api/stream", (req, res) => {
  res.set({ "Content-Type": "text/event-stream", "Cache-Control": "no-cache", Connection: "keep-alive" });
  res.flushHeaders();
  res.write("data: connected\n\n");
  clients.add(res);
  req.on("close", () => clients.delete(res));
});
function broadcast() {
  for (const c of clients) c.write("data: update\n\n");
}

function broadcastEvent(name, payload) {
  if (!/^[a-z][a-z0-9-]*$/i.test(name)) throw new Error("Invalid live event name.");
  const message = `event: ${name}\ndata: ${JSON.stringify(payload)}\n\n`;
  for (const client of clients) client.write(message);
}

const musicPoll = setInterval(() => {
  void refreshPendingMusic()
    .then((changed) => { if (changed) broadcast(); })
    .catch((err) => console.warn(`Music task refresh failed: ${err.message}`));
}, 15000);
musicPoll.unref();

// Spoiler safety: errors report messages only, never state or table contents.
function guard(handler) {
  return (req, res) => {
    try {
      handler(req, res);
    } catch (err) {
      const internal = Boolean(err?.code);
      if (internal) console.error(err);
      res.status(internal ? 500 : 400).json({
        error: internal ? "The ledger could not be updated." : err.message
      });
    }
  };
}

function guardAsync(handler) {
  return async (req, res) => {
    try {
      await handler(req, res);
    } catch (err) {
      const internal = Boolean(err?.code);
      if (internal) console.error(err);
      res.status(internal ? 500 : 400).json({
        error: internal ? "The ledger could not be updated." : err.message
      });
    }
  };
}

function allowSunoSnapshot(req, res, next) {
  const origin = req.get("Origin");
  if (origin && /^https:\/\/(?:www\.)?suno\.com$/i.test(origin)) {
    res.set({
      "Access-Control-Allow-Origin": origin,
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
      "Access-Control-Allow-Private-Network": "true",
      Vary: "Origin"
    });
  }
  next();
}

// --- table (player) API: whitelisted server-side ---
app.get("/api/table", (_req, res) => res.json(tableView()));

app.post("/api/rolls/duality", guard((req, res) => {
  const pc = activePcById(String(req.body?.pcId || ""));
  if (!pc) throw new Error("Choose an active character before rolling.");
  const roll = resolveDualityRoll(req.body);
  const event = {
    id: randomUUID(),
    pcId: pc.id,
    pcName: pc.name,
    portrait: pc.portrait || null,
    at: new Date().toISOString(),
    ...roll
  };
  broadcastEvent("duality-roll", event);
  res.status(201).json(event);
}));

// --- character creator & party (player-facing; the table is trusted) ---
app.get("/api/reference", guard((_req, res) => {
  if (!state.reference) throw new Error("Reference data missing — run the reference build.");
  res.json(state.reference);
}));
app.get("/api/rules", (_req, res) => {
  res.set("Cache-Control", "public, max-age=300");
  res.json(rulesCorpus);
});

app.get("/api/party", (_req, res) => res.json(partyListView()));

app.get("/api/art/status", (_req, res) => res.json({
  ...artWorkshop.status(),
  suggestions: {
    ready: Boolean(process.env.ANTHROPIC_API_KEY),
    model: process.env.PORTRAIT_SUGGEST_MODEL || process.env.RETELL_MODEL || "claude-opus-4-8"
  }
}));

function artLibraryView() {
  const characters = state.pcs
    .filter((pc) => isPlayablePc(pc))
    .map((pc) => ({
      id: pc.id,
      campaignId: pc.campaignId,
      campaign: campaignById(pc.campaignId)?.name || "",
      name: pc.name,
      player: pc.player || "",
      portrait: pc.portrait || null,
      class: pc.class?.name || "",
      subclass: pc.subclass?.name || "",
      ancestry: pc.ancestry?.name || "",
      appearance: {
        primaryColor: pc.appearance?.primaryColor || "",
        secondaryColor: pc.appearance?.secondaryColor || ""
      }
    }));
  const recordedUrls = new Set(state.artLibrary.scenes.map((scene) => scene.url));
  const legacyScenes = state.places
    .filter((place) => place.portrait && !recordedUrls.has(place.portrait))
    .map((place) => sceneLibraryView({
      id: `place_cover_${place.id}`,
      placeId: place.id,
      name: `${place.name} overview`,
      url: place.portrait,
      width: SCENE_DIMENSIONS.width,
      height: SCENE_DIMENSIONS.height,
      createdAt: null
    }, false));
  return {
    dimensions: SCENE_DIMENSIONS,
    taxonomy: { rootIds: SCENE_ROOT_IDS, tags: SCENE_TAGS },
    characters,
    places: state.places.map((place) => ({
      id: place.id,
      name: place.name,
      kind: place.kind || "",
      revealed: place.revealed !== false
    })),
    scenes: [
      ...state.artLibrary.scenes.map((scene) => sceneLibraryView(scene)),
      ...legacyScenes
    ]
  };
}

app.get("/api/art/library", (_req, res) => res.json(artLibraryView()));

app.post("/api/art/scenes", guardAsync(async (req, res) => {
  const input = sceneInput(req.body || {}, state.places);
  const result = await artWorkshop.request({
    kind: "scenic",
    entityId: `${input.placeId}_${Date.now()}`,
    prompt: scenePrompt(input),
    negativePrompt: input.negativePrompt,
    width: SCENE_DIMENSIONS.width,
    height: SCENE_DIMENSIONS.height,
    embellishPrompt: input.embellishPrompt
  });
  if (!state.places.includes(input.place)) throw new Error("That location is no longer available.");
  const records = sceneRecords(input, result);
  state.artLibrary.scenes.push(...records);
  if (input.castWhenReady) {
    state.screen.current = {
      type: "image",
      refId: records[0].id,
      url: records[0].url,
      caption: [input.place.name, input.sublocation, input.name].filter(Boolean).join(" · "),
      title: "",
      body: "",
      setAt: new Date().toISOString()
    };
  }
  persist();
  broadcast();
  res.status(201).json({
    scenes: records.map((record) => sceneLibraryView(record)),
    projected: input.castWhenReady,
    message: records.length === 1 ? "The scene is ready." : `${records.length} scene variants are ready.`
  });
}));

app.delete("/api/art/scenes/:id", guard((req, res) => {
  const index = state.artLibrary.scenes.findIndex((scene) => scene.id === req.params.id);
  if (index < 0) throw new Error("No such scene in the library.");
  const [scene] = state.artLibrary.scenes.splice(index, 1);
  persist();
  broadcast();
  res.json({ removed: scene.name });
}));

app.post("/api/art/portrait/suggest", guardAsync(async (req, res) => {
  const draftId = String(req.body.draftId || "");
  if (!/^draft_[a-zA-Z0-9_-]{6,80}$/.test(draftId)) throw new Error("A valid character draft is required.");
  // This is a trusted five-player table with no per-player quota. Add request
  // throttling here before exposing character creation beyond that boundary.
  const result = await suggestPortrait(req.body.context || {});
  res.json(result);
}));

app.post("/api/art/portrait", guardAsync(async (req, res) => {
  const draftId = String(req.body.draftId || "");
  if (!/^draft_[a-zA-Z0-9_-]{6,80}$/.test(draftId)) throw new Error("A valid character draft is required.");
  const result = await artWorkshop.request({
    kind: "portrait",
    entityId: draftId,
    prompt: req.body.prompt,
    negativePrompt: req.body.negativePrompt,
    seed: req.body.seed,
    width: req.body.width,
    height: req.body.height,
    stepsModifier: req.body.stepsModifier,
    cfgModifier: req.body.cfgModifier,
    style: req.body.style,
    primaryColor: req.body.primaryColor,
    secondaryColor: req.body.secondaryColor,
    tags: req.body.tags,
    armor: req.body.armor,
    mainHand: req.body.mainHand,
    offHand: req.body.offHand,
    embellishPrompt: req.body.embellishPrompt
  });
  res.json({ ...result, message: "The portrait is ready." });
}));

app.get("/api/character-drafts", (_req, res) => res.json(state.characterDrafts.map((entry) => ({
  id: entry.id,
  campaignId: entry.draft?.campaignId || state.campaigns.currentId,
  name: entry.draft?.name || "",
  player: entry.draft?.player || "",
  step: entry.step || 0,
  savedAt: entry.savedAt || null
})).filter((entry) => isActiveCampaign(entry.campaignId))));

app.get("/api/character-drafts/:id", guard((req, res) => {
  const entry = state.characterDrafts.find((candidate) => candidate.id === req.params.id);
  if (!entry || !isActiveCampaign(entry.draft?.campaignId)) return res.status(404).json({ error: "No such character draft." });
  res.json(entry);
}));

app.put("/api/character-drafts/:id", guard((req, res) => {
  if (!/^draft_[a-zA-Z0-9_-]{6,80}$/.test(req.params.id)) throw new Error("Invalid draft identifier.");
  if (!req.body.draft || typeof req.body.draft !== "object") throw new Error("A character draft is required.");
  if (JSON.stringify(req.body.draft).length > 200_000) throw new Error("That character draft is too large.");
  const campaignId = String(req.body.draft.campaignId || state.campaigns.currentId);
  if (!isActiveCampaign(campaignId)) throw new Error("Choose an active campaign.");
  const incoming = {
    id: req.params.id,
    version: normalizeCharacterDraftVersion(req.body.version),
    step: Math.max(0, Number.parseInt(req.body.step, 10) || 0),
    part: Math.max(0, Number.parseInt(req.body.part, 10) || 0),
    savedAt: String(req.body.savedAt || new Date().toISOString()),
    draft: { ...req.body.draft, campaignId }
  };
  const index = state.characterDrafts.findIndex((candidate) => candidate.id === req.params.id);
  if (index === -1) state.characterDrafts.push(incoming);
  else if (Date.parse(incoming.savedAt) >= Date.parse(state.characterDrafts[index].savedAt || 0)) state.characterDrafts[index] = incoming;
  persist(); broadcast();
  res.json(incoming);
}));

app.delete("/api/character-drafts/:id", guard((req, res) => {
  const index = state.characterDrafts.findIndex((candidate) => candidate.id === req.params.id);
  if (index !== -1) state.characterDrafts.splice(index, 1);
  persist(); broadcast();
  res.json({ ok: true });
}));

app.get("/api/party/:id", guard((req, res) => {
  const pc = playerCharacterView(req.params.id);
  if (!pc) throw new Error("No such character.");
  res.json(pc);
}));

app.post("/api/party", guard((req, res) => {
  const campaignId = String(req.body?.campaignId || state.campaigns.currentId);
  if (!isActiveCampaign(campaignId)) throw new Error("Choose an active campaign.");
  const pc = { ...req.body, campaignId };
  pc.name = normalizeCharacterName(pc.name);
  pc.id = `pc_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
  pc.createdAt = new Date().toISOString();
  pc.level = pc.level || 1;
  pc.active = true;
  state.pcs.push(pc);
  addLog({ type: "party", campaignId, summary: `${pc.name.trim()} takes their place in the settlement.`, published: true });
  persist();
  // Theme generation is separate from character persistence: a provider
  // failure must never keep a player from finishing their character.
  void generateCharacterTheme(pc)
    .then(() => broadcast())
    .catch((err) => console.warn(`Character theme could not be queued: ${err.message}`));
  broadcast();
  res.json(playerCharacterView(pc.id));
}));

app.post("/api/party/:id/domain-cards", guard((req, res) => {
  const pc = activePcById(req.params.id);
  if (!pc) throw new Error("No such character.");
  claimOwedDomainCard(pc, state.reference, String(req.body?.cardId || ""));
  persist();
  broadcast();
  res.status(201).json(playerCharacterView(pc.id));
}));

app.put("/api/party/:id", guard((req, res) => {
  const i = state.pcs.findIndex((p) => p.id === req.params.id && isPlayablePc(p));
  if (i === -1) throw new Error("No such character.");
  if (Object.hasOwn(req.body, "conditions")) throw new Error("Use the Conditions control.");
  if (Object.hasOwn(req.body, "name")) throw new Error("Use the character name control.");
  if (Object.hasOwn(req.body, "campaignId") && !isActiveCampaign(req.body.campaignId)) throw new Error("Choose an active campaign.");
  const prev = state.pcs[i];
  const next = { ...prev, ...req.body, id: prev.id };
  if (Object.hasOwn(req.body, "domainCards")) {
    next.domainCards = updateOwnedDomainCards(prev, req.body.domainCards);
  }
  // Damage thresholds are armor base + level: keep them in step with level changes.
  if (Number.isInteger(req.body.level) && prev.thresholds && req.body.level !== prev.level) {
    const delta = req.body.level - prev.level;
    next.thresholds = {
      major: prev.thresholds.major + delta,
      severe: prev.thresholds.severe + delta
    };
  }
  state.pcs[i] = next;
  persist();
  broadcast();
  res.json(playerCharacterView(next.id));
}));

app.put("/api/party/:id/background", guard((req, res) => {
  const pc = activePcById(req.params.id);
  if (!pc) throw new Error("No such character.");
  pc.background = normalizeBackgroundEntries(req.body?.background);
  persist();
  broadcast();
  res.json({ background: playerCharacterView(pc.id).background });
}));

app.post("/api/party/:id/background/suggest", guardAsync(async (req, res) => {
  const pc = activePcById(req.params.id);
  if (!pc) throw new Error("No such character.");
  const fieldId = String(req.body?.fieldId || "");
  const publicPc = playerCharacterView(pc.id);
  const existing = publicPc.background.find((field) => field.id === fieldId);
  const definition = BACKGROUND_FIELD_DEFINITIONS.find((field) => field.id === fieldId)
    || (existing ? { id: existing.id, title: existing.q } : null);
  if (!definition) throw new Error("Choose a background memory.");
  const currentText = String(req.body?.currentText || "").trim();
  if (!currentText) throw new Error("Write a beginning before asking for an expansion.");
  if (currentText.length > 6000) throw new Error("That memory is too long to expand.");
  const result = await suggestBackground({
    pc,
    field: definition,
    currentText,
    locale: req.body?.locale === "sv" ? "sv" : "en"
  });
  res.json(result);
}));

app.put("/api/party/:id/name", guard((req, res) => {
  const pc = activePcById(req.params.id);
  if (!pc) throw new Error("No such character.");
  const result = renameCharacter(pc, req.body);
  if (result.changed) {
    renameCharacterThemeTitles(pc.id, result.previousName, result.name);
    addLog({
      type: "party",
      campaignId: pc.campaignId,
      summary: `${result.previousName} is now known as ${result.name}.`
    });
    persist();
    broadcast();
  }
  res.json(playerCharacterView(pc.id));
}));

app.post("/api/party/:id/portrait", guardAsync(async (req, res) => {
  const pc = state.pcs.find((candidate) => candidate.id === req.params.id && isPlayablePc(candidate));
  if (!pc) throw new Error("No such character.");
  pc.portraitPrompt = String(req.body.prompt || "").trim();
  persist();
  const result = await artWorkshop.request({
    kind: "portrait",
    entityId: pc.id,
    prompt: pc.portraitPrompt,
    negativePrompt: req.body.negativePrompt,
    seed: req.body.seed,
    width: req.body.width,
    height: req.body.height,
    stepsModifier: req.body.stepsModifier,
    cfgModifier: req.body.cfgModifier,
    style: req.body.style,
    primaryColor: req.body.primaryColor,
    secondaryColor: req.body.secondaryColor,
    tags: req.body.tags,
    armor: req.body.armor,
    mainHand: req.body.mainHand,
    offHand: req.body.offHand,
    embellishPrompt: req.body.embellishPrompt
  });
  if (!state.pcs.includes(pc)) throw new Error("That character is no longer available.");
  pc.portrait = result.url;
  persist();
  broadcast();
  res.json({ ...result, message: `${pc.name}'s portrait is ready.` });
}));

app.get("/api/items/consumables", (_req, res) => res.json(consumables(state.reference)));

app.put("/api/party/:id/conditions", guard((req, res) => {
  const pc = activePcById(req.params.id);
  if (!pc) throw new Error("No such character.");
  if (!Array.isArray(req.body.conditions)) throw new Error("Conditions must be a list.");
  const conditions = [...new Set(req.body.conditions)];
  if (conditions.some((id) => !STANDARD_CONDITIONS.has(id))) throw new Error("Unknown condition.");
  pc.conditions = conditions;
  persist();
  broadcast();
  res.json(playerCharacterView(pc.id));
}));

function pcForInventory(id) {
  const pc = activePcById(id);
  if (!pc) throw new Error("No such character.");
  return pc;
}

app.post("/api/party/:id/inventory", guard((req, res) => {
  const pc = pcForInventory(req.params.id);
  addInventoryItem(pc, req.body.kind === "paper" ? { ...req.body, author: pc.name } : req.body, state.reference);
  persist(); broadcast();
  res.json(playerCharacterView(pc.id));
}));

app.post("/api/party/inventory/paper", guard((req, res) => {
  const target = String(req.body.target || "");
  const recipients = target === "group"
    ? currentActivePcs()
    : state.pcs.filter((pc) => pc.id === target && isPlayablePc(pc));
  if (!recipients.length) throw new Error("Choose at least one character.");
  const delivered = recipients.map((pc) => {
    const item = addInventoryItem(pc, {
      kind: "paper",
      paperType: "note",
      name: req.body.name,
      body: req.body.body,
      author: "The Keeper"
    }, state.reference);
    return { id: pc.id, name: pc.name, itemId: item.id };
  });
  persist(); broadcast();
  res.json({ delivered });
}));

app.post("/api/party/:id/inventory/grant", guard((req, res) => {
  const pc = pcForInventory(req.params.id);
  grantConsumable(pc, req.body.catalogId, req.body.quantity, state.reference);
  persist(); broadcast();
  res.json(playerCharacterView(pc.id));
}));

app.put("/api/party/:id/inventory/:itemId", guard((req, res) => {
  const pc = pcForInventory(req.params.id);
  updateInventoryItem(pc, req.params.itemId, req.body, state.reference);
  persist(); broadcast();
  res.json(playerCharacterView(pc.id));
}));

app.delete("/api/party/:id/inventory/:itemId", guard((req, res) => {
  const pc = pcForInventory(req.params.id);
  const { index, item } = inventoryEntry(pc, req.params.itemId, state.reference);
  if (item.kind === "paper" && item.paperType === "covenant") throw new Error("The signed covenant remains in the inventory.");
  pc.inventory.splice(index, 1);
  persist(); broadcast();
  res.json(playerCharacterView(pc.id));
}));

app.post("/api/party/:id/inventory/:itemId/use", guard((req, res) => {
  const pc = pcForInventory(req.params.id);
  const effect = useInventoryItem(pc, req.params.itemId, req.body, state.reference);
  persist(); broadcast();
  res.json({ pc: playerCharacterView(pc.id), effect });
}));

app.delete("/api/party/:id", guard((req, res) => {
  const pc = state.pcs.find((candidate) => candidate.id === req.params.id);
  if (!pc) throw new Error("No such character.");
  if (pc.active !== false) {
    pc.active = false;
    addLog({ type: "party", summary: `${pc.name} steps back from the tale.` });
  }
  persist();
  broadcast();
  res.json({ retired: pc.name, active: false });
}));

app.post("/api/party/:id/restore", guard((req, res) => {
  const pc = state.pcs.find((candidate) => candidate.id === req.params.id);
  if (!pc) throw new Error("No such character.");
  if (pc.active === false) {
    pc.active = true;
    addLog({ type: "party", summary: `${pc.name} returns to the tale.` });
  }
  persist();
  broadcast();
  res.json({ restored: pc.name, active: true });
}));

// --- GM API ---
app.get("/api/state", (_req, res) => res.json(gmView()));

app.post("/api/campaigns", guard((req, res) => {
  const name = String(req.body?.name || "").trim();
  if (!name) throw new Error("A campaign name is required.");
  if (name.length > 80) throw new Error("Campaign names must be at most 80 characters.");
  if (state.campaigns.campaigns.length >= 50) throw new Error("The campaign ledger is full.");
  if (state.campaigns.campaigns.some((campaign) => campaign.name.toLocaleLowerCase() === name.toLocaleLowerCase())) throw new Error("That campaign name is already in the ledger.");
  const campaign = {
    id: createCampaignId(),
    name,
    status: "active",
    createdAt: new Date().toISOString(),
    playerFeatures: { ...DEFAULT_PLAYER_FEATURES }
  };
  state.campaigns.campaigns.push(campaign);
  persist(); broadcast();
  res.status(201).json(campaign);
}));

app.put("/api/campaigns/current", guard((req, res) => {
  const campaign = campaignById(String(req.body?.id || ""));
  if (!campaign || campaign.status !== "active") throw new Error("Choose an active campaign.");
  state.campaigns.currentId = campaign.id;
  persist(); broadcast();
  res.json({ currentId: campaign.id });
}));

app.put("/api/campaigns/:id", guard((req, res) => {
  const campaign = campaignById(req.params.id);
  if (!campaign) throw new Error("No such campaign.");
  let nextName = campaign.name;
  let nextStatus = campaign.status;
  let nextPlayerFeatures = normalizePlayerFeatures(campaign.playerFeatures);
  if (req.body.name !== undefined) {
    const name = String(req.body.name || "").trim();
    if (!name) throw new Error("A campaign name is required.");
    if (name.length > 80) throw new Error("Campaign names must be at most 80 characters.");
    if (state.campaigns.campaigns.some((candidate) => candidate.id !== campaign.id && candidate.name.toLocaleLowerCase() === name.toLocaleLowerCase())) throw new Error("That campaign name is already in the ledger.");
    nextName = name;
  }
  if (req.body.status !== undefined) {
    if (!["active", "archived"].includes(req.body.status)) throw new Error("Unknown campaign status.");
    if (req.body.status === "archived" && campaign.id === state.campaigns.currentId) throw new Error("Make another campaign current before archiving this one.");
    nextStatus = req.body.status;
  }
  if (req.body.playerFeatures !== undefined) {
    nextPlayerFeatures = { ...nextPlayerFeatures, ...playerFeaturePatch(req.body.playerFeatures) };
  }
  campaign.name = nextName;
  campaign.status = nextStatus;
  campaign.playerFeatures = nextPlayerFeatures;
  persist(); broadcast();
  res.json(campaign);
}));

app.put("/api/session", guard((req, res) => {
  const hasFear = Object.prototype.hasOwnProperty.call(req.body || {}, "fear");
  const hasVisibility = Object.prototype.hasOwnProperty.call(req.body || {}, "showFearToPlayers");
  if (hasFear) {
    if (!Number.isInteger(req.body.fear)) throw new Error("Fear must be a whole number.");
    state.session.fear = Math.max(0, Math.min(12, req.body.fear));
  }
  if (hasVisibility) {
    if (typeof req.body.showFearToPlayers !== "boolean") throw new Error("Fear visibility must be true or false.");
    state.session.showFearToPlayers = req.body.showFearToPlayers;
  }
  persist();
  broadcast();
  res.json({ ...state.session });
}));

// --- private GM/PC threads ---
const MESSAGE_SIDES = new Set(["gm", "player"]);

app.get("/api/messages/gm", (_req, res) => res.json(gmMessagesView()));

app.get("/api/messages", guard((req, res) => {
  const pc = activePcById(req.query.pc);
  if (!pc) throw new Error("No such active character.");
  res.json(playerMessagesView(pc.id));
}));

app.post("/api/messages", guard((req, res) => {
  const pc = activePcById(req.body?.pcId);
  if (!pc) throw new Error("No such active character.");
  const from = req.body?.from;
  if (!MESSAGE_SIDES.has(from)) throw new Error("Unknown message sender.");
  const text = String(req.body?.text || "").trim();
  if (!text) throw new Error("Write a message before sending it.");
  if (text.length > 4000) throw new Error("Messages must be at most 4000 characters.");
  const message = {
    id: `msg_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    pcId: pc.id,
    from,
    text,
    ts: new Date().toISOString(),
    read: { gm: from === "gm", player: from === "player" }
  };
  state.messages.push(message);
  persist();
  broadcast();
  res.json(message);
}));

app.put("/api/messages/read", guard((req, res) => {
  const side = req.body?.side;
  if (!MESSAGE_SIDES.has(side)) throw new Error("Unknown message reader.");
  const pc = state.pcs.find((candidate) => candidate.id === req.body?.pcId);
  if (!pc || (side === "player" && !isPlayablePc(pc))) throw new Error("No such readable character thread.");
  let marked = 0;
  for (const message of state.messages) {
    if (message.pcId !== pc.id || message.read?.[side] === true) continue;
    message.read = {
      gm: message.read?.gm === true,
      player: message.read?.player === true,
      [side]: true
    };
    marked += 1;
  }
  if (marked) {
    persist();
    broadcast();
  }
  res.json({ pcId: pc.id, side, marked });
}));

// Local UX evidence. Batches never broadcast: a heartbeat must not cause
// every open client to refetch campaign state.
app.get("/api/telemetry", (_req, res) => res.json(telemetryView()));
app.post("/api/telemetry/batch", guard((req, res) => {
  recordTelemetryBatch(req.body || {});
  res.status(204).end();
}));
app.delete("/api/telemetry", guard((_req, res) => res.json(clearTelemetry())));

// --- first-party playtest tickets ---

const FEEDBACK_STATUSES = new Set(["open", "triaged", "resolved", "wont-fix"]);

app.get("/api/feedback", (_req, res) => res.json(state.feedback));

app.post("/api/feedback", guard((req, res) => {
  const text = String(req.body.text || "").trim();
  const screenshot = String(req.body.screenshot || "");
  if (!text) throw new Error("Describe what should be different.");
  if (text.length > 4000) throw new Error("Feedback must be at most 4000 characters.");
  if (!/^data:image\/(?:jpeg|png);base64,/.test(screenshot) || screenshot.length > 7_000_000) throw new Error("The annotated screenshot is invalid or too large.");
  const pc = state.pcs.find((candidate) => candidate.id === req.body.pcId);
  const ticket = {
    id: `feedback_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    status: "open",
    cluster: "",
    text,
    screenshot,
    sourceUrl: String(req.body.sourceUrl || "").slice(0, 500),
    viewport: {
      width: Math.max(0, Math.min(10000, Number.parseInt(req.body.viewport?.width, 10) || 0)),
      height: Math.max(0, Math.min(10000, Number.parseInt(req.body.viewport?.height, 10) || 0))
    },
    reporter: pc ? { pcId: pc.id, name: pc.name } : { pcId: null, name: "Unseated player" },
    createdAt: new Date().toISOString(),
    updatedAt: null,
    agentNotes: ""
  };
  state.feedback.unshift(ticket);
  persist(); broadcast();
  res.json(ticket);
}));

app.put("/api/feedback/:id", guard((req, res) => {
  const ticket = state.feedback.find((candidate) => candidate.id === req.params.id);
  if (!ticket) throw new Error("No such feedback ticket.");
  if (req.body.status !== undefined) {
    if (!FEEDBACK_STATUSES.has(req.body.status)) throw new Error("Unknown ticket status.");
    ticket.status = req.body.status;
  }
  if (req.body.cluster !== undefined) ticket.cluster = String(req.body.cluster || "").trim().slice(0, 120);
  if (req.body.agentNotes !== undefined) ticket.agentNotes = String(req.body.agentNotes || "").trim().slice(0, 8000);
  ticket.updatedAt = new Date().toISOString();
  persist(); broadcast();
  res.json(ticket);
}));

// --- music desk & character themes ---
app.get("/api/music", (_req, res) => res.json(musicView(currentActivePcs())));

app.get("/api/music/themes/:pcId", guard((req, res) => {
  if (!activePcById(req.params.pcId)) throw new Error("No such character.");
  res.json(characterThemeView(req.params.pcId));
}));

app.get("/api/music/songs/:id/audio", guard((req, res) => {
  const file = songAudioPath(req.params.id);
  if (!file) throw new Error("That audio is not available locally.");
  res.sendFile(file);
}));

app.post("/api/music/generate", guardAsync(async (req, res) => {
  const song = await generateSong(req.body || {});
  broadcast();
  res.json(song);
}));

app.post("/api/music/themes/:pcId/generate", guardAsync(async (req, res) => {
  const pc = activePcById(req.params.pcId);
  if (!pc) throw new Error("No such character.");
  const song = await generateCharacterTheme(pc, req.body || {});
  broadcast();
  res.json(song);
}));

app.post("/api/music/provider/check", guardAsync(async (_req, res) => {
  res.json(await checkProviderCredits());
}));

app.post("/api/music/provider/refresh", guardAsync(async (_req, res) => {
  const changed = await refreshPendingMusic();
  if (changed) broadcast();
  res.json({ changed });
}));

app.post("/api/music/provider/callback", guardAsync(async (_req, res) => {
  const changed = await refreshPendingMusic();
  if (changed) broadcast();
  res.json({ ok: true });
}));

app.put("/api/music/suno-mirror", guard((req, res) => {
  const mirror = configureSunoMirror(req.body?.targetName);
  broadcast();
  res.json(mirror);
}));

app.options("/api/music/suno-snapshot", allowSunoSnapshot, (_req, res) => res.sendStatus(204));
app.post("/api/music/suno-snapshot", allowSunoSnapshot, guardAsync(async (req, res) => {
  const result = await syncSunoSnapshot(req.body || {});
  broadcast();
  res.json(result);
}));

app.post("/api/music/themes/:pcId/publish", guard((req, res) => {
  const pc = activePcById(req.params.pcId);
  if (!pc) throw new Error("No such character.");
  const theme = publishCharacterTheme(req.body.songId, pc);
  broadcast();
  res.json(theme);
}));

app.put("/api/music/themes/:pcId/identity", guard((req, res) => {
  if (!activePcById(req.params.pcId)) throw new Error("No such character.");
  const result = setCharacterThemeIdentity(req.params.pcId, req.body.identity);
  broadcast();
  res.json(result);
}));

app.post("/api/music/playlists", guard((req, res) => {
  const playlist = createPlaylist(req.body.name);
  broadcast();
  res.json(playlist);
}));

app.post("/api/music/playlists/:id/songs", guard((req, res) => {
  const playlist = addSongToPlaylist(req.params.id, req.body.songId);
  broadcast();
  res.json(playlist);
}));

app.put("/api/music/songs/:id", guard((req, res) => {
  const song = renameSong(req.params.id, req.body.title);
  broadcast();
  res.json(song);
}));

app.delete("/api/music/songs/:id", guard((req, res) => {
  const result = removeSong(req.params.id);
  broadcast();
  res.json(result);
}));

// --- named drafting boards (GM whiteboards): items + camera pins ---
const BOARD_NAMES = new Set(["main", "hud"]);
const emptyBoard = () => ({ items: [], pins: [] });
const boardDocument = (value) => ({
  items: Array.isArray(value?.items) ? value.items : [],
  pins: Array.isArray(value?.pins) ? value.pins : []
});
let boards = loadJson("boards.json", null);
if (!boards) {
  boards = { main: boardDocument(loadJson("board.json", emptyBoard())), hud: emptyBoard() };
  saveJson("boards.json", boards);
} else {
  boards = { main: boardDocument(boards.main), hud: boardDocument(boards.hud) };
}
const gmScreen = loadJson("daggerheart/gm-screen.json", { sections: [] });

function namedBoard(name) {
  if (!BOARD_NAMES.has(name)) throw new Error("Unknown board.");
  return boards[name];
}

function updateBoard(name, body) {
  const board = namedBoard(name);
  if (Array.isArray(body?.items)) board.items = body.items;
  if (Array.isArray(body?.pins)) board.pins = body.pins;
  saveJson("boards.json", boards);
  return board;
}

app.get("/api/board", (_req, res) => res.json(namedBoard("main")));
app.put("/api/board", guard((req, res) => res.json(updateBoard("main", req.body))));
app.get("/api/board/:name", guard((req, res) => res.json(namedBoard(req.params.name))));
app.put("/api/board/:name", guard((req, res) => res.json(updateBoard(req.params.name, req.body))));
app.get("/api/gm-screen", (_req, res) => res.json(gmScreen));

app.get("/api/downtime/preview", guard((req, res) => {
  const mods = modifierBreakdown(req.query.building, req.query.effort === "1");
  if (!mods) throw new Error("Unknown building.");
  const { foreman, ...rest } = mods;
  res.json({ ...rest, foreman: foreman ? { id: foreman.id, name: foreman.name } : null });
}));

app.post("/api/downtime/resolve", guard((req, res) => {
  const { buildingId, raw, playerEffort, note } = req.body;
  const result = resolveDowntime({ buildingId, raw, playerEffort, note });
  broadcast();
  res.json(result);
}));

app.post("/api/season/advance", guard((_req, res) => {
  const s = advanceSeason();
  addLog({ type: "season", summary: `The season turns. It is now ${s.name}, Year ${s.year}.` });
  persist();
  broadcast();
  res.json(s);
}));

app.post("/api/resources/adjust", guard((req, res) => {
  const { resource, delta, reason } = req.body;
  if (!(resource in state.settlement.resources)) throw new Error("Unknown resource.");
  if (!Number.isInteger(delta)) throw new Error("Delta must be a whole number.");
  if (!reason || !reason.trim()) throw new Error("Enter a reason for the adjustment.");
  if (state.settlement.resources[resource] + delta < 0) throw new Error("The stores cannot fall below zero.");
  state.settlement.resources[resource] += delta;
  addLog({
    type: "adjust",
    summary: `${delta >= 0 ? "+" : ""}${delta} ${resource} — ${reason.trim()}`
  });
  persist();
  broadcast();
  res.json({ resources: state.settlement.resources });
}));

app.put("/api/settlement", guard((req, res) => {
  const { population, name, chronicleNotes } = req.body;
  if (population !== undefined) {
    if (!Number.isInteger(population) || population < 0) throw new Error("Population must be a whole number.");
    state.settlement.population = population;
  }
  if (typeof name === "string" && name.trim()) state.settlement.name = name.trim();
  if (typeof chronicleNotes === "string") state.settlement.chronicleNotes = chronicleNotes;
  persist();
  broadcast();
  res.json({ ok: true });
}));

app.put("/api/buildings/:id", guard((req, res) => {
  const b = state.settlement.buildings[req.params.id];
  if (!b) throw new Error("Unknown building.");
  const { level, foremanId } = req.body;
  if (level !== undefined && level !== b.level) throw new Error("Building levels change through construction projects.");
  if (foremanId !== undefined) {
    const foreman = foremanId ? state.characters.find((character) => character.id === foremanId) : null;
    if (foremanId && (!foreman || foreman.status !== "alive" || foreman.trustedForWork !== true)) {
      throw new Error("A foreman must be living folk whose trust has been earned.");
    }
    b.foremanId = foreman?.id || null;
  }
  persist();
  broadcast();
  res.json({ ok: true });
}));

app.put("/api/buildings/:id/check", guard((req, res) => {
  const result = setBuildingProjectCheck(req.params.id, req.body?.status, req.body?.note);
  broadcast();
  res.json(result);
}));

app.post("/api/buildings/:id/complete-project", guard((req, res) => {
  const result = completeBuildingProject(req.params.id);
  broadcast();
  res.json(result);
}));

app.post("/api/characters", guard((req, res) => {
  const c = req.body;
  if (!c.name || !c.name.trim()) throw new Error("A name is required.");
  const character = {
    id: `chr_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    name: c.name.trim(),
    role: c.role || "",
    status: c.status || "alive",
    description: c.description || "",
    portrait: c.portrait || null,
    portraitPrompt: c.portraitPrompt || "",
    portraitSuggestion: c.portraitSuggestion || "",
    portraitNegativePrompt: c.portraitNegativePrompt || "",
    portraitDirection: c.portraitDirection || {},
    portraitWorkshop: c.portraitWorkshop || {},
    trustedForWork: c.trustedForWork === true,
    ...normalizeFolkProfile(c),
    publicTraits: !!c.publicTraits,
    traits: c.traits || {},
    aptitudes: c.aptitudes || {},
    hidden: { inspiration: 0, penalty: 0, notes: "", ...(c.hidden || {}) }
  };
  state.characters.push(character);
  persist();
  broadcast();
  res.json(character);
}));

app.put("/api/characters/:id", guard((req, res) => {
  const i = state.characters.findIndex((c) => c.id === req.params.id);
  if (i === -1) throw new Error("Unknown character.");
  const prev = state.characters[i];
  state.characters[i] = {
    ...prev,
    ...req.body,
    id: prev.id,
    hidden: { ...prev.hidden, ...(req.body.hidden || {}) },
    portraitDirection: {
      ...(prev.portraitDirection || {}),
      ...(req.body.portraitDirection || {}),
      equipment: {
        ...(prev.portraitDirection?.equipment || {}),
        ...(req.body.portraitDirection?.equipment || {})
      }
    },
    portraitWorkshop: { ...(prev.portraitWorkshop || {}), ...(req.body.portraitWorkshop || {}) }
  };
  Object.assign(state.characters[i], normalizeFolkProfile(state.characters[i]));
  state.characters[i].connections = state.characters[i].connections.filter((connection) => (
    connection.folkId !== prev.id && state.characters.some((character) => character.id === connection.folkId)
  ));
  state.characters[i].trustedForWork = state.characters[i].trustedForWork === true;
  if (!state.characters[i].trustedForWork) {
    for (const building of Object.values(state.settlement.buildings)) {
      if (building.foremanId === prev.id) building.foremanId = null;
    }
  }
  persist();
  broadcast();
  res.json(state.characters[i]);
}));

const folkPortraitModifier = (value) => [-1, 0, 1, 2].includes(Number(value)) ? Number(value) : 0;
const folkPortraitStyle = (value) => ["style1", "style2"].includes(String(value)) ? String(value) : "style2";
const folkPortraitText = (value, max) => String(value || "").trim().slice(0, max);

function folkPortraitRequest(body = {}) {
  const equipment = body.equipment && typeof body.equipment === "object" ? body.equipment : {};
  return {
    sourcePrompt: folkPortraitText(body.sourcePrompt || body.prompt, 6_000),
    prompt: folkPortraitText(body.prompt, 8_000),
    negativePrompt: folkPortraitText(body.negativePrompt, 4_000),
    primaryColor: folkPortraitText(body.primaryColor, 32),
    secondaryColor: folkPortraitText(body.secondaryColor, 32),
    tags: Array.isArray(body.tags) ? body.tags.slice(0, 20).map((tag) => folkPortraitText(tag, 80)) : [],
    equipment: Object.fromEntries(["armor", "mainHand", "offHand"].map((key) => [key, {
      enabled: equipment[key]?.enabled !== false,
      text: folkPortraitText(equipment[key]?.text || body[key], 300)
    }])),
    armor: folkPortraitText(body.armor, 300),
    mainHand: folkPortraitText(body.mainHand, 300),
    offHand: folkPortraitText(body.offHand, 300),
    stepsModifier: folkPortraitModifier(body.stepsModifier),
    cfgModifier: folkPortraitModifier(body.cfgModifier),
    style: folkPortraitStyle(body.style),
    embellishPrompt: body.embellishPrompt !== false,
    fixSeed: body.fixSeed === true
  };
}

app.post("/api/characters/:id/portrait/suggest", guardAsync(async (req, res) => {
  const character = state.characters.find((candidate) => candidate.id === req.params.id);
  if (!character) throw new Error("Unknown character.");
  const result = await suggestPortrait({
    name: character.name,
    role: character.role,
    ...req.body.context
  });
  res.json(result);
}));

app.post("/api/characters/:id/portrait", guardAsync(async (req, res) => {
  const character = state.characters.find((candidate) => candidate.id === req.params.id);
  if (!character) throw new Error("Unknown character.");
  const request = folkPortraitRequest(req.body);
  if (!request.sourcePrompt) throw new Error("Describe the portrait first.");

  character.portraitPrompt = request.sourcePrompt;
  character.portraitNegativePrompt = request.negativePrompt;
  character.portraitDirection = {
    tags: request.tags,
    primaryColor: request.primaryColor,
    secondaryColor: request.secondaryColor,
    equipment: request.equipment
  };
  character.portraitWorkshop = {
    ...(character.portraitWorkshop || {}),
    fixSeed: request.fixSeed,
    stepsModifier: request.stepsModifier,
    cfgModifier: request.cfgModifier,
    style: request.style,
    embellishPrompt: request.embellishPrompt
  };
  persist();

  const result = await artWorkshop.request({
    kind: "portrait",
    entityId: character.id,
    prompt: request.prompt || request.sourcePrompt,
    negativePrompt: request.negativePrompt,
    seed: req.body.seed,
    stepsModifier: request.stepsModifier,
    cfgModifier: request.cfgModifier,
    style: request.style,
    primaryColor: request.primaryColor,
    secondaryColor: request.secondaryColor,
    tags: request.tags,
    armor: request.armor,
    mainHand: request.mainHand,
    offHand: request.offHand,
    embellishPrompt: request.embellishPrompt
  });
  if (!state.characters.includes(character)) throw new Error("That folk card is no longer available.");
  const seed = Number(result.seed);
  const urls = (Array.isArray(result.urls) && result.urls.length ? result.urls : [result.url])
    .map((url) => String(url || ""))
    .filter((url) => url.startsWith("/generated/art/portrait/"));
  if (!urls.length || !Number.isSafeInteger(seed)) throw new Error("The portrait workshop returned an invalid result.");
  const createdAt = new Date().toISOString();
  const requestRecord = {
    prompt: request.prompt || request.sourcePrompt,
    negativePrompt: request.negativePrompt,
    primaryColor: request.primaryColor,
    secondaryColor: request.secondaryColor,
    tags: request.tags,
    equipment: request.equipment,
    armor: request.armor,
    mainHand: request.mainHand,
    offHand: request.offHand,
    stepsModifier: request.stepsModifier,
    cfgModifier: request.cfgModifier,
    style: request.style,
    embellishPrompt: request.embellishPrompt,
    fixSeed: request.fixSeed
  };
  const attempts = urls.map((url) => ({
    id: `portrait_attempt_${randomUUID()}`,
    url,
    seed,
    createdAt,
    request: requestRecord
  }));
  character.portrait = String(result.url || urls[0]);
  character.portraitWorkshop = {
    ...character.portraitWorkshop,
    lastSeed: seed,
    attempts: [...(character.portraitWorkshop.attempts || []), ...attempts].slice(-30)
  };
  persist();
  broadcast();
  res.json({ ...result, message: `${character.name}'s portrait is ready.` });
}));

// --- people & places (the wider world; player journal reads via /api/lore) ---

function findPlace(id) {
  return state.places.find((p) => p.id === id) || null;
}

app.post("/api/people", guard((req, res) => {
  const b = req.body;
  if (!b.name || !b.name.trim()) throw new Error("A name is required.");
  if (b.placeId && !findPlace(b.placeId)) throw new Error("Unknown place.");
  const person = {
    id: `ppl_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    name: b.name.trim(),
    role: b.role || "",
    status: b.status || "alive",
    description: b.description || "",
    portrait: b.portrait || null,
    portraitPrompt: b.portraitPrompt || "",
    placeId: b.placeId || null,
    items: Array.isArray(b.items) ? b.items : [],
    revealed: b.revealed !== false,
    hidden: { notes: "", ...(b.hidden || {}) }
  };
  state.people.push(person);
  persist();
  broadcast();
  res.json(person);
}));

app.put("/api/people/:id", guard((req, res) => {
  const i = state.people.findIndex((p) => p.id === req.params.id);
  if (i === -1) throw new Error("Unknown person.");
  if (req.body.placeId && !findPlace(req.body.placeId)) throw new Error("Unknown place.");
  const prev = state.people[i];
  state.people[i] = { ...prev, ...req.body, id: prev.id, hidden: { ...prev.hidden, ...(req.body.hidden || {}) } };
  persist();
  broadcast();
  res.json(state.people[i]);
}));

app.delete("/api/people/:id", guard((req, res) => {
  const i = state.people.findIndex((p) => p.id === req.params.id);
  if (i === -1) throw new Error("Unknown person.");
  const [gone] = state.people.splice(i, 1);
  state.notes = state.notes.filter((n) => !(n.kind === "person" && n.refId === gone.id));
  persist();
  broadcast();
  res.json({ removed: gone.name });
}));

app.post("/api/people/:id/portrait", guardAsync(async (req, res) => {
  const person = state.people.find((p) => p.id === req.params.id);
  if (!person) throw new Error("Unknown person.");
  person.portraitPrompt = String(req.body.prompt || "").trim();
  persist();
  const result = await artWorkshop.request({
    kind: "portrait",
    entityId: person.id,
    prompt: person.portraitPrompt,
    negativePrompt: req.body.negativePrompt,
    seed: req.body.seed,
    width: req.body.width,
    height: req.body.height,
    embellishPrompt: req.body.embellishPrompt
  });
  if (!state.people.includes(person)) throw new Error("That person is no longer available.");
  person.portrait = result.url;
  persist();
  broadcast();
  res.json({ ...result, message: `${person.name}'s portrait is ready.` });
}));

app.post("/api/places", guard((req, res) => {
  const b = req.body;
  const name = assertUniquePlaceName(b.name, state.places);
  const place = {
    id: `place_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    name,
    kind: b.kind || "",
    description: b.description || "",
    portrait: b.portrait || null,
    imagePrompt: b.imagePrompt || "",
    revealed: b.revealed !== false,
    fixed: false,
    hidden: { notes: "", ...(b.hidden || {}) }
  };
  state.places.push(place);
  persist();
  broadcast();
  res.json(place);
}));

app.post("/api/places/:id/image", guardAsync(async (req, res) => {
  const place = state.places.find((candidate) => candidate.id === req.params.id);
  if (!place) throw new Error("Unknown place.");
  place.imagePrompt = String(req.body.prompt || "").trim();
  persist();
  const input = sceneInput({
    placeId: place.id,
    name: `${place.name} overview`,
    description: place.imagePrompt,
    negativePrompt: req.body.negativePrompt,
    selectedTagIds: [],
    excludedTagIds: [],
    pins: [],
    embellishPrompt: req.body.embellishPrompt,
    castWhenReady: false
  }, state.places);
  const result = await artWorkshop.request({
    kind: "scenic",
    entityId: place.id,
    prompt: scenePrompt(input),
    negativePrompt: input.negativePrompt,
    seed: req.body.seed,
    width: SCENE_DIMENSIONS.width,
    height: SCENE_DIMENSIONS.height,
    embellishPrompt: input.embellishPrompt
  });
  if (!state.places.includes(place)) throw new Error("That place is no longer available.");
  const records = sceneRecords(input, result);
  state.artLibrary.scenes.push(...records);
  place.portrait = result.url;
  persist();
  broadcast();
  res.json({ ...result, scenes: records.map((record) => sceneLibraryView(record)), message: `${place.name}'s scene is ready.` });
}));

app.put("/api/places/:id", guard((req, res) => {
  const i = state.places.findIndex((p) => p.id === req.params.id);
  if (i === -1) throw new Error("Unknown place.");
  const prev = state.places[i];
  const body = { ...req.body };
  if (body.name !== undefined) body.name = assertUniquePlaceName(body.name, state.places, prev.id);
  state.places[i] = {
    ...prev,
    ...body,
    id: prev.id,
    fixed: prev.fixed,
    hidden: { ...prev.hidden, ...(body.hidden || {}) }
  };
  persist();
  broadcast();
  res.json(state.places[i]);
}));

app.delete("/api/places/:id", guard((req, res) => {
  const i = state.places.findIndex((p) => p.id === req.params.id);
  if (i === -1) throw new Error("Unknown place.");
  if (state.places[i].fixed) throw new Error("The settlement cannot be deleted.");
  const [gone] = state.places.splice(i, 1);
  for (const person of state.people) {
    if (person.placeId === gone.id) person.placeId = null;
  }
  state.notes = state.notes.filter((n) => !(n.kind === "place" && n.refId === gone.id));
  state.artLibrary.scenes = state.artLibrary.scenes.filter((scene) => scene.placeId !== gone.id);
  persist();
  broadcast();
  res.json({ removed: gone.name });
}));

// --- the encounter builder: bestiary, saved encounters, live card positions ---

app.get("/api/adversaries", (_req, res) => res.json(state.adversaries));

const findEncounter = (id) => {
  const encounter = state.encounters.encounters.find((e) => e.id === id);
  if (!encounter) throw new Error("Unknown encounter.");
  return encounter;
};

// Card positions are normalized (x, y in 0..1 of the stage; w as a fraction of
// stage width) so the GM board and the projector lay the same scene out alike.
function cleanEncounterEntities(raw) {
  if (!Array.isArray(raw)) throw new Error("An encounter needs a list of entities.");
  const adversaryIds = new Set(state.adversaries.adversaries.map((a) => a.id));
  const seen = new Set();
  return raw.slice(0, 60).map((entity) => {
    const id = String(entity?.id || "");
    if (!/^en_[a-zA-Z0-9_-]{3,60}$/.test(id) || seen.has(id)) throw new Error("Bad entity id.");
    seen.add(id);
    const kind = entity.kind === "pc" ? "pc" : "adversary";
    const refId = String(entity.refId || "");
    if (kind === "pc" && !state.pcs.some((pc) => pc.id === refId)) throw new Error("Unknown character in the encounter.");
    if (kind === "adversary" && !adversaryIds.has(refId)) throw new Error("Unknown adversary in the encounter.");
    const num = (value, fallback, min, max) =>
      Number.isFinite(value) ? Math.max(min, Math.min(max, value)) : fallback;
    return {
      id,
      kind,
      refId,
      label: String(entity.label || "").slice(0, 60),
      x: num(entity.x, 0.5, 0, 1),
      y: num(entity.y, 0.5, 0, 1),
      w: num(entity.w, 0.09, 0.04, 0.3),
      hp: num(entity.hp, 0, 0, 99),
      stress: num(entity.stress, 0, 0, 99),
      defeated: entity.defeated === true
    };
  });
}

app.get("/api/encounters", (_req, res) => res.json(state.encounters));

app.post("/api/encounters", guard((req, res) => {
  const name = String(req.body?.name || "").trim().slice(0, 80) || "Unnamed encounter";
  const pcs = currentActivePcs();
  const encounter = {
    id: `enc_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
    name,
    createdAt: new Date().toISOString(),
    entities: pcs.map((pc, index) => ({
      id: `en_pc_${pc.id}`,
      kind: "pc",
      refId: pc.id,
      label: pc.name,
      x: 0.14 + (index % 2) * 0.1,
      y: pcs.length > 1 ? 0.18 + (index / (pcs.length - 1)) * 0.6 : 0.45,
      w: 0.09,
      hp: 0,
      stress: 0,
      defeated: false
    }))
  };
  state.encounters.encounters.push(encounter);
  persist();
  res.json(encounter);
}));

app.put("/api/encounters/:id", guard((req, res) => {
  const encounter = findEncounter(req.params.id);
  if (req.body?.name !== undefined) {
    encounter.name = String(req.body.name || "").trim().slice(0, 80) || encounter.name;
  }
  if (req.body?.entities !== undefined) encounter.entities = cleanEncounterEntities(req.body.entities);
  persist();
  // The projector follows along live; the GM board ignores its own echo.
  broadcast();
  res.json(encounter);
}));

app.delete("/api/encounters/:id", guard((req, res) => {
  const encounter = findEncounter(req.params.id);
  state.encounters.encounters = state.encounters.encounters.filter((e) => e.id !== encounter.id);
  if (state.screen.current?.type === "encounter" && state.screen.current.refId === encounter.id) {
    state.screen.current = null;
  }
  persist();
  broadcast();
  res.json({ removed: encounter.name });
}));

// --- the table screen: GM projects, everyone sees ---

app.get("/api/screen", (_req, res) => res.json(screenView(rulesCorpus)));

const SCREEN_TYPES = new Set(["image", "text", "rule", "paper", "stores", "buildings", "folk", "person", "place", "encounter"]);

app.put("/api/screen", guard((req, res) => {
  const { type, refId, url, caption, title, body } = req.body;
  if (type === null) {
    state.screen.current = null;
  } else {
    if (!SCREEN_TYPES.has(type)) throw new Error("Unsupported screen type.");
    if (type === "image" && (!url || !url.trim())) throw new Error("An image needs a URL.");
    if (type === "text" && !(title || "").trim() && !(body || "").trim()) throw new Error("Write something first.");
    if (type === "rule" && !rulesCorpus.nodes.find((node) => node.id === refId)) throw new Error("Unknown rule.");
    if (type === "paper" && !state.pcs.some((pc) => (pc.inventory || []).some((item) => typeof item === "object" && item.id === refId && item.kind === "paper"))) throw new Error("Unknown paper.");
    if (type === "folk" && !state.characters.find((c) => c.id === refId)) throw new Error("Unknown folk.");
    if (type === "person" && !state.people.find((p) => p.id === refId)) throw new Error("Unknown person.");
    if (type === "place" && !state.places.find((p) => p.id === refId)) throw new Error("Unknown place.");
    if (type === "encounter" && !state.encounters.encounters.find((e) => e.id === refId)) throw new Error("Unknown encounter.");
    state.screen.current = {
      type,
      refId: refId || null,
      url: (url || "").trim() || null,
      caption: (caption || "").trim(),
      title: (title || "").trim(),
      body: (body || "").trim(),
      setAt: new Date().toISOString()
    };
  }
  persist();
  broadcast();
  res.json({ ok: true, current: state.screen.current });
}));

// --- session perspectives and reviewed retellings ---

app.post("/api/sessions", guard((req, res) => {
  const campaignId = state.campaigns.currentId;
  if (state.sessions.some((session) => session.campaignId === campaignId && session.status !== "published")) {
    throw new Error("Finish the open session before beginning another.");
  }
  const defaultParticipants = currentActivePcs().map((pc) => pc.id);
  const participants = sessionParticipants(
    req.body?.participants === undefined ? defaultParticipants : req.body.participants,
    campaignId,
    true
  );
  const previousNumbers = state.sessions
    .filter((session) => session.campaignId === campaignId)
    .map((session) => Number(session.number) || 0);
  const now = new Date();
  const session = {
    id: `ses_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
    campaignId,
    number: Math.max(0, ...previousNumbers) + 1,
    date: now.toISOString().slice(0, 10),
    seasonLabel: seasonLabel(),
    status: "gathering",
    participants,
    gmSummary: "",
    gmHighlight: "",
    perspectives: [],
    retelling: null,
    error: null,
    transcript: null,
    createdAt: now.toISOString()
  };
  state.sessions.push(session);
  persist();
  broadcast();
  res.status(201).json(session);
}));

app.put("/api/sessions/:id", guard((req, res) => {
  const session = currentSessionById(req.params.id);
  const gathering = session.status === "gathering" || session.status === "failed";
  if (req.body.gmSummary !== undefined) session.gmSummary = cleanSessionText(req.body.gmSummary, "gmSummary");
  if (req.body.gmHighlight !== undefined) session.gmHighlight = cleanSessionText(req.body.gmHighlight, "gmHighlight");
  if (req.body.participants !== undefined) {
    if (!gathering) throw new Error("Participants are fixed while the chronicler is working or awaiting review.");
    session.participants = sessionParticipants(req.body.participants, session.campaignId);
  }
  if (req.body.retellingText !== undefined) {
    if (session.status !== "review") throw new Error("There is no retelling awaiting review.");
    const text = cleanSessionText(req.body.retellingText, "retelling", true);
    session.retelling = { ...(session.retelling || {}), text, editedAt: new Date().toISOString() };
  }
  persist();
  broadcast();
  res.json(session);
}));

app.post("/api/sessions/:id/perspectives", guard((req, res) => {
  const session = sessionById(req.params.id);
  const pc = activePcById(req.body?.pcId);
  if (!session || !pc || session.campaignId !== pc.campaignId) throw new Error("No such session for this character.");
  if (session.status !== "gathering" && session.status !== "failed") throw new Error("This account has already gone to the chronicler.");
  if (!(session.participants || []).includes(pc.id)) throw new Error("This character was not marked present for the session.");
  const text = cleanSessionText(req.body?.text, "perspective", true);
  const perspective = {
    pcId: pc.id,
    author: pc.name,
    text,
    ts: new Date().toISOString()
  };
  session.perspectives ||= [];
  const existing = (session.perspectives || []).findIndex((entry) => entry.pcId === pc.id);
  if (existing === -1) session.perspectives.push(perspective);
  else session.perspectives[existing] = perspective;
  persist();
  broadcast();
  res.json({ ok: true, perspective });
}));

app.post("/api/sessions/:id/retell", guard((req, res) => {
  const session = currentSessionById(req.params.id);
  if (session.status !== "gathering" && session.status !== "failed") throw new Error("This session is not ready to send.");
  session.gmSummary = cleanSessionText(session.gmSummary, "gmSummary", true);
  session.gmHighlight = cleanSessionText(session.gmHighlight, "gmHighlight", true);
  const perspectives = (session.participants || []).map((pcId) => {
    const perspective = (session.perspectives || []).find((entry) => entry.pcId === pcId && entry.text);
    if (!perspective) throw new Error("Wait for every chosen character to write their perspective.");
    return {
      author: state.pcs.find((pc) => pc.id === pcId)?.name || perspective.author || "A companion",
      text: perspective.text
    };
  });
  const previousRetellings = state.sessions
    .filter((entry) => entry.campaignId === session.campaignId && entry.status === "published" && entry.retelling?.text)
    .map((entry) => ({
      number: entry.number,
      seasonLabel: entry.seasonLabel,
      text: entry.retelling.text
    }));
  const bundle = {
    session: {
      number: session.number,
      date: session.date,
      seasonLabel: session.seasonLabel,
      gmSummary: session.gmSummary,
      gmHighlight: session.gmHighlight
    },
    perspectives,
    previousRetellings
  };

  session.status = "retelling";
  session.error = null;
  persist();
  broadcast();
  res.status(202).json({ ok: true, status: session.status });

  void retellSession(bundle).then((retelling) => {
    const current = sessionById(session.id);
    if (!current || current.status !== "retelling") return;
    current.retelling = retelling;
    current.status = "review";
    current.error = null;
    persist();
    broadcast();
  }).catch((error) => {
    const current = sessionById(session.id);
    if (!current || current.status !== "retelling") return;
    current.status = "failed";
    current.error = String(error?.message || "The chronicler could not answer.").slice(0, 300);
    persist();
    broadcast();
    console.warn(`Session ${current.number} retelling failed: ${current.error}`);
  });
}));

app.post("/api/sessions/:id/publish", guard((req, res) => {
  const session = currentSessionById(req.params.id);
  if (session.status !== "review" || !session.retelling?.text?.trim()) throw new Error("Review the retelling before publishing it.");
  const text = cleanSessionText(session.retelling.text, "retelling", true);
  session.retelling.text = text;
  session.status = "published";
  session.error = null;
  session.publishedAt = new Date().toISOString();
  const firstLine = text.split(/\r?\n/).find((line) => line.trim())?.trim().slice(0, 240) || `Session ${session.number}`;
  addLog({
    type: "retelling",
    campaignId: session.campaignId,
    season: session.seasonLabel,
    summary: firstLine,
    publishedText: text,
    published: true
  });
  persist();
  broadcast();
  res.json({ ok: true, status: session.status });
}));

// --- player journal & notes ---

app.get("/api/lore", (req, res) => res.json(loreView(req.query.pc || null)));

const NOTE_KINDS = new Set(["journal", "person", "place"]);
const DOODLE_PAGES = new Set(["journal", "people", "places"]);

function cleanDoodleStrokes(value) {
  if (!Array.isArray(value) || value.length > 300) throw new Error("That page holds too many marks.");
  let pointCount = 0;
  return value.map((stroke) => {
    if (!stroke || (stroke.tool !== "pen" && stroke.tool !== "eraser")) throw new Error("Unknown drawing tool.");
    if (!Array.isArray(stroke.points) || stroke.points.length < 1) throw new Error("A mark needs a path.");
    pointCount += stroke.points.length;
    if (pointCount > 12000) throw new Error("That page holds too many marks.");
    const points = stroke.points.map((point) => {
      if (!Array.isArray(point) || point.length !== 2 || !point.every(Number.isFinite)) throw new Error("A mark has an invalid point.");
      return point.map((n) => Math.max(0, Math.min(1, Math.round(n * 10000) / 10000)));
    });
    const fallbackWidth = stroke.tool === "eraser" ? 0.025 : 0.0035;
    const width = Number.isFinite(stroke.width) ? Math.max(0.001, Math.min(0.08, stroke.width)) : fallbackWidth;
    return { tool: stroke.tool, width, points };
  });
}

app.get("/api/journal-doodles/:pcId", guard((req, res) => {
  if (!activePcById(req.params.pcId)) throw new Error("No such character.");
  res.json(state.journalDoodles[req.params.pcId] || { journal: [], people: [], places: [] });
}));

app.put("/api/journal-doodles/:pcId/:page", guard((req, res) => {
  const { pcId, page } = req.params;
  if (!activePcById(pcId)) throw new Error("No such character.");
  if (!DOODLE_PAGES.has(page)) throw new Error("No such journal page.");
  const strokes = cleanDoodleStrokes(req.body.strokes);
  state.journalDoodles[pcId] ||= { journal: [], people: [], places: [] };
  state.journalDoodles[pcId][page] = strokes;
  persist();
  res.json({ ok: true, strokes: strokes.length });
}));

app.post("/api/notes", guard((req, res) => {
  const { kind, refId, scope, pcId, text } = req.body;
  if (!NOTE_KINDS.has(kind)) throw new Error("Unknown kind of note.");
  if (!text || !text.trim()) throw new Error("Write something first.");
  const pc = activePcById(pcId);
  if (!pc) throw new Error("No such character.");
  if (kind === "person" && !state.people.find((p) => p.id === refId && p.revealed))
    throw new Error("Unknown person.");
  if (kind === "place" && !state.places.find((p) => p.id === refId && p.revealed))
    throw new Error("Unknown place.");
  const note = {
    id: `note_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    kind,
    refId: kind === "journal" ? null : refId,
    scope: scope === "personal" ? "personal" : "group",
    pcId,
    author: pc.name,
    text: text.trim(),
    season: seasonLabel(),
    ts: new Date().toISOString(),
    updated: null
  };
  state.notes.push(note);
  persist();
  broadcast();
  res.json(note);
}));

app.put("/api/notes/:id", guard((req, res) => {
  const note = state.notes.find((n) => n.id === req.params.id);
  if (!note) throw new Error("No such note.");
  if (!activePcById(req.body.pcId)) throw new Error("No such character.");
  if (note.pcId !== req.body.pcId) throw new Error("Only the character who wrote this note can edit it.");
  if (typeof req.body.text === "string" && req.body.text.trim()) note.text = req.body.text.trim();
  if (req.body.scope === "personal" || req.body.scope === "group") note.scope = req.body.scope;
  note.updated = new Date().toISOString();
  persist();
  broadcast();
  res.json(note);
}));

app.delete("/api/notes/:id", guard((req, res) => {
  const i = state.notes.findIndex((n) => n.id === req.params.id);
  if (i === -1) throw new Error("No such note.");
  if (!activePcById(req.query.pc)) throw new Error("No such character.");
  if (state.notes[i].pcId !== req.query.pc) throw new Error("Only the character who wrote this note can remove it.");
  state.notes.splice(i, 1);
  persist();
  broadcast();
  res.json({ ok: true });
}));

app.post("/api/log", guard((req, res) => {
  const { text, publish } = req.body;
  if (!text || !text.trim()) throw new Error("Write something first.");
  const row = addLog({ type: "note", summary: text.trim(), published: !!publish });
  persist();
  broadcast();
  res.json(row);
}));

app.post("/api/log/:id/publish", guard((req, res) => {
  const row = state.log.find((l) => l.id === req.params.id);
  if (!row) throw new Error("No such entry.");
  row.published = !!req.body.published;
  if (typeof req.body.publishedText === "string") row.publishedText = req.body.publishedText;
  persist();
  broadcast();
  res.json(row);
}));

app.listen(PORT, () => {
  console.log(`The Settlement is open.`);
  console.log(`  GM console:      http://localhost:${PORT}/gm`);
  console.log(`  Player table:    http://localhost:${PORT}/table`);
  console.log(`  Player root:     http://localhost:${PORT}/player`);
  console.log(`  Music desk:      http://localhost:${PORT}/music`);
});
