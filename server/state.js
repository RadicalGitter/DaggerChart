// Campaign state: load-on-boot, mutate in memory, persist on every change.
import { loadJson, saveJson, loadEventTables, snapshot } from "./store.js";

const SEASONS = ["Spring", "Summer", "Autumn", "Winter"];

const DEFAULT_SETTLEMENT = {
  name: "The Settlement",
  population: 50,
  season: { name: "Spring", year: 1 },
  chronicleNotes: "",
  resources: { Lumber: 0, Food: 0, Morale: 0, Security: 0, Supplies: 0 },
  buildings: {}
};

export const state = {
  settlement: loadJson("settlement.json", DEFAULT_SETTLEMENT),
  characters: loadJson("characters.json", []),
  pcs: loadJson("pcs.json", []),
  log: loadJson("log.json", []),
  tables: loadEventTables(),
  reference: loadJson("daggerheart/reference.json", null)
};

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
      foremanId: suggested ? suggested.id : null,
      spent: [],
      effects: [],
      producedTotal: 0
    };
  }
}

export function persist() {
  saveJson("settlement.json", state.settlement);
  saveJson("characters.json", state.characters);
  saveJson("pcs.json", state.pcs);
  saveJson("log.json", state.log);
}

export function getCharacter(id) {
  return state.characters.find((c) => c.id === id) || null;
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
    published: false,
    ...entry
  };
  state.log.unshift(row);
  return row;
}

// --- The roll (spec §5 — exact math, do not improve) ---

export function modifierBreakdown(buildingId, playerEffort) {
  const b = state.settlement.buildings[buildingId];
  if (!b) return null;
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
