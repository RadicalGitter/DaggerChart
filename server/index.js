import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";
import "./env.js";
import { state, persist, addLog, advanceSeason, resolveDowntime, modifierBreakdown, seasonLabel } from "./state.js";
import { gmView, tableView, loreView, screenView, partyListView, playerCharacterView } from "./views.js";
import { loadJson, saveJson } from "./store.js";
import { addInventoryItem, consumables, grantConsumable, inventoryEntry, updateInventoryItem, useInventoryItem } from "./inventory.js";
import { clearTelemetry, recordTelemetryBatch, telemetryView } from "./telemetry.js";
import {
  musicView,
  characterThemeView,
  generateSong,
  generateCharacterTheme,
  publishCharacterTheme,
  setCharacterThemeIdentity,
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

const app = express();
app.use(express.json({ limit: "8mb" }));
app.use("/shared", express.static(path.join(PUBLIC, "shared")));
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
app.use("/journal", express.static(path.join(PUBLIC, "journal")));
app.use("/screen", express.static(path.join(PUBLIC, "screen")));
app.use("/music", express.static(path.join(PUBLIC, "music")));
// /character/<id> serves the sheet shell; the page reads the id from the URL.
app.get("/character/:id", (_req, res) => res.sendFile(path.join(PUBLIC, "character", "index.html")));
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
      res.status(400).json({ error: err.message });
    }
  };
}

function guardAsync(handler) {
  return async (req, res) => {
    try {
      await handler(req, res);
    } catch (err) {
      res.status(400).json({ error: err.message });
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

// --- character creator & party (player-facing; the table is trusted) ---
app.get("/api/reference", guard((_req, res) => {
  if (!state.reference) throw new Error("Reference data missing — run the reference build.");
  res.json(state.reference);
}));

app.get("/api/party", (_req, res) => res.json(partyListView()));

app.get("/api/character-drafts", (_req, res) => res.json(state.characterDrafts.map((entry) => ({
  id: entry.id,
  name: entry.draft?.name || "",
  player: entry.draft?.player || "",
  step: entry.step || 0,
  savedAt: entry.savedAt || null
}))));

app.get("/api/character-drafts/:id", guard((req, res) => {
  const entry = state.characterDrafts.find((candidate) => candidate.id === req.params.id);
  if (!entry) return res.status(404).json({ error: "No such character draft." });
  res.json(entry);
}));

app.put("/api/character-drafts/:id", guard((req, res) => {
  if (!/^draft_[a-zA-Z0-9_-]{6,80}$/.test(req.params.id)) throw new Error("Invalid draft identifier.");
  if (!req.body.draft || typeof req.body.draft !== "object") throw new Error("A character draft is required.");
  if (JSON.stringify(req.body.draft).length > 200_000) throw new Error("That character draft is too large.");
  const incoming = {
    id: req.params.id,
    version: 2,
    step: Math.max(0, Number.parseInt(req.body.step, 10) || 0),
    part: Math.max(0, Number.parseInt(req.body.part, 10) || 0),
    savedAt: String(req.body.savedAt || new Date().toISOString()),
    draft: req.body.draft
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
  const pc = req.body;
  if (!pc.name || !pc.name.trim()) throw new Error("A name is required.");
  pc.id = `pc_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
  pc.createdAt = new Date().toISOString();
  pc.level = pc.level || 1;
  state.pcs.push(pc);
  addLog({ type: "party", summary: `${pc.name.trim()} takes their place in the settlement.`, published: true });
  persist();
  // Theme generation is separate from character persistence: a provider
  // failure must never keep a player from finishing their character.
  void generateCharacterTheme(pc)
    .then(() => broadcast())
    .catch((err) => console.warn(`Character theme could not be queued: ${err.message}`));
  broadcast();
  res.json(playerCharacterView(pc.id));
}));

app.put("/api/party/:id", guard((req, res) => {
  const i = state.pcs.findIndex((p) => p.id === req.params.id);
  if (i === -1) throw new Error("No such character.");
  if (Object.hasOwn(req.body, "conditions")) throw new Error("Use the Conditions control.");
  const prev = state.pcs[i];
  const next = { ...prev, ...req.body, id: prev.id };
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

app.get("/api/items/consumables", (_req, res) => res.json(consumables(state.reference)));

app.put("/api/party/:id/conditions", guard((req, res) => {
  const pc = state.pcs.find((p) => p.id === req.params.id);
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
  const pc = state.pcs.find((entry) => entry.id === id);
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
    ? state.pcs
    : state.pcs.filter((pc) => pc.id === target);
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
  const i = state.pcs.findIndex((p) => p.id === req.params.id);
  if (i === -1) throw new Error("No such character.");
  const [gone] = state.pcs.splice(i, 1);
  delete state.journalDoodles[gone.id];
  persist();
  broadcast();
  res.json({ removed: gone.name });
}));

// --- GM API ---
app.get("/api/state", (_req, res) => res.json(gmView()));

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
app.get("/api/music", (_req, res) => res.json(musicView(state.pcs)));

app.get("/api/music/themes/:pcId", guard((req, res) => {
  if (!state.pcs.some((pc) => pc.id === req.params.pcId)) throw new Error("No such character.");
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
  const pc = state.pcs.find((candidate) => candidate.id === req.params.pcId);
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
  const pc = state.pcs.find((candidate) => candidate.id === req.params.pcId);
  if (!pc) throw new Error("No such character.");
  const theme = publishCharacterTheme(req.body.songId, pc);
  broadcast();
  res.json(theme);
}));

app.put("/api/music/themes/:pcId/identity", guard((req, res) => {
  if (!state.pcs.some((pc) => pc.id === req.params.pcId)) throw new Error("No such character.");
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

// --- the drafting board (GM whiteboard): items + camera pins ---
const board = loadJson("board.json", { items: [], pins: [] });

app.get("/api/board", (_req, res) => res.json(board));

app.put("/api/board", guard((req, res) => {
  if (Array.isArray(req.body.items)) board.items = req.body.items;
  if (Array.isArray(req.body.pins)) board.pins = req.body.pins;
  saveJson("board.json", board);
  res.json({ ok: true });
}));

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
  if (level !== undefined) {
    if (!Number.isInteger(level) || level < 1) throw new Error("Level must be 1 or higher.");
    b.level = level;
  }
  if (foremanId !== undefined) b.foremanId = foremanId || null;
  persist();
  broadcast();
  res.json({ ok: true });
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
  state.characters[i] = { ...prev, ...req.body, id: prev.id, hidden: { ...prev.hidden, ...(req.body.hidden || {}) } };
  persist();
  broadcast();
  res.json(state.characters[i]);
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

// ComfyUI portrait request. Not wired yet — the prompt is kept so the request
// can be replayed once the workshop is connected (docs/comfyui/).
app.post("/api/people/:id/portrait", guard((req, res) => {
  const person = state.people.find((p) => p.id === req.params.id);
  if (!person) throw new Error("Unknown person.");
  person.portraitPrompt = (req.body.prompt || "").trim();
  persist();
  res.json({
    queued: false,
    message: "The portrait workshop isn't connected yet. The prompt is saved and will be used once ComfyUI is wired in."
  });
}));

app.post("/api/places", guard((req, res) => {
  const b = req.body;
  if (!b.name || !b.name.trim()) throw new Error("A name is required.");
  const place = {
    id: `place_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    name: b.name.trim(),
    kind: b.kind || "",
    description: b.description || "",
    portrait: b.portrait || null,
    revealed: b.revealed !== false,
    fixed: false,
    hidden: { notes: "", ...(b.hidden || {}) }
  };
  state.places.push(place);
  persist();
  broadcast();
  res.json(place);
}));

app.put("/api/places/:id", guard((req, res) => {
  const i = state.places.findIndex((p) => p.id === req.params.id);
  if (i === -1) throw new Error("Unknown place.");
  const prev = state.places[i];
  state.places[i] = {
    ...prev,
    ...req.body,
    id: prev.id,
    fixed: prev.fixed,
    hidden: { ...prev.hidden, ...(req.body.hidden || {}) }
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
  persist();
  broadcast();
  res.json({ removed: gone.name });
}));

// --- the table screen: GM projects, everyone sees ---

app.get("/api/screen", (_req, res) => res.json(screenView()));

const SCREEN_TYPES = new Set(["image", "text", "paper", "stores", "buildings", "folk", "person", "place"]);

app.put("/api/screen", guard((req, res) => {
  const { type, refId, url, caption, title, body } = req.body;
  if (type === null) {
    state.screen.current = null;
  } else {
    if (!SCREEN_TYPES.has(type)) throw new Error("Unsupported screen type.");
    if (type === "image" && (!url || !url.trim())) throw new Error("An image needs a URL.");
    if (type === "text" && !(title || "").trim() && !(body || "").trim()) throw new Error("Write something first.");
    if (type === "paper" && !state.pcs.some((pc) => (pc.inventory || []).some((item) => typeof item === "object" && item.id === refId && item.kind === "paper"))) throw new Error("Unknown paper.");
    if (type === "folk" && !state.characters.find((c) => c.id === refId)) throw new Error("Unknown folk.");
    if (type === "person" && !state.people.find((p) => p.id === refId)) throw new Error("Unknown person.");
    if (type === "place" && !state.places.find((p) => p.id === refId)) throw new Error("Unknown place.");
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
  if (!state.pcs.some((p) => p.id === req.params.pcId)) throw new Error("No such character.");
  res.json(state.journalDoodles[req.params.pcId] || { journal: [], people: [], places: [] });
}));

app.put("/api/journal-doodles/:pcId/:page", guard((req, res) => {
  const { pcId, page } = req.params;
  if (!state.pcs.some((p) => p.id === pcId)) throw new Error("No such character.");
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
  const pc = state.pcs.find((p) => p.id === pcId);
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
