import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { state, persist, addLog, advanceSeason, resolveDowntime, modifierBreakdown } from "./state.js";
import { gmView, tableView } from "./views.js";
import { loadJson, saveJson } from "./store.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC = path.join(__dirname, "..", "public");
const PORT = process.env.PORT || 4626;

const app = express();
app.use(express.json());
app.use("/shared", express.static(path.join(PUBLIC, "shared")));
app.use("/gm", express.static(path.join(PUBLIC, "gm")));
app.use("/board", express.static(path.join(PUBLIC, "board")));
app.use("/table", express.static(path.join(PUBLIC, "table")));
app.use("/create", express.static(path.join(PUBLIC, "create")));
app.use("/character", express.static(path.join(PUBLIC, "character")));
// /character/<id> serves the sheet shell; the page reads the id from the URL.
app.get("/character/:id", (_req, res) => res.sendFile(path.join(PUBLIC, "character", "index.html")));
app.get("/", (_req, res) => res.redirect("/gm"));

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

// --- table (player) API: whitelisted server-side ---
app.get("/api/table", (_req, res) => res.json(tableView()));

// --- character creator & party (player-facing; the table is trusted) ---
app.get("/api/reference", guard((_req, res) => {
  if (!state.reference) throw new Error("Reference data missing — run the reference build.");
  res.json(state.reference);
}));

app.get("/api/party", (_req, res) => res.json(state.pcs));

app.get("/api/party/:id", guard((req, res) => {
  const pc = state.pcs.find((p) => p.id === req.params.id);
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
  broadcast();
  res.json(pc);
}));

app.put("/api/party/:id", guard((req, res) => {
  const i = state.pcs.findIndex((p) => p.id === req.params.id);
  if (i === -1) throw new Error("No such character.");
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
  res.json(next);
}));

app.delete("/api/party/:id", guard((req, res) => {
  const i = state.pcs.findIndex((p) => p.id === req.params.id);
  if (i === -1) throw new Error("No such character.");
  const [gone] = state.pcs.splice(i, 1);
  persist();
  broadcast();
  res.json({ removed: gone.name });
}));

// --- GM API ---
app.get("/api/state", (_req, res) => res.json(gmView()));

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
  if (!reason || !reason.trim()) throw new Error("A reason is required — everything is auditable.");
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
    backstory: c.backstory || "",
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
});
