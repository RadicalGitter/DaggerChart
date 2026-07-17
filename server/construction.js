export const RESOURCE_NAMES = ["Lumber", "Food", "Morale", "Security", "Supplies"];
export const MAX_BUILDING_LEVEL = 5;

// The founding stores cover all five basic buildings exactly. Checks gate the
// work, but a failed check never consumes materials.
export const STARTER_BUILDING_COSTS = Object.freeze({
  lumber_camp: Object.freeze({ Food: 1, Morale: 1, Supplies: 3 }),
  hunters_lodge: Object.freeze({ Lumber: 2, Security: 1, Supplies: 2 }),
  bunkhouse: Object.freeze({ Lumber: 3, Food: 1, Supplies: 1 }),
  watchtower: Object.freeze({ Lumber: 3, Morale: 1, Supplies: 2 }),
  storehouse: Object.freeze({ Lumber: 3, Security: 1, Supplies: 2 })
});

const UPGRADE_COSTS = Object.freeze({
  2: Object.freeze({ Lumber: 4, Supplies: 2, focus: 2 }),
  3: Object.freeze({ Lumber: 7, Supplies: 4, focus: 3 }),
  4: Object.freeze({ Lumber: 11, Supplies: 6, focus: 5 }),
  5: Object.freeze({ Lumber: 16, Supplies: 9, focus: 8 })
});

function addCost(target, resource, amount) {
  if (!RESOURCE_NAMES.includes(resource) || !Number.isInteger(amount) || amount <= 0) return;
  target[resource] = (target[resource] || 0) + amount;
}

export const STARTER_STORES = Object.freeze(
  Object.freeze(RESOURCE_NAMES.reduce((totals, resource) => {
    totals[resource] = Object.values(STARTER_BUILDING_COSTS)
      .reduce((sum, cost) => sum + (cost[resource] || 0), 0);
    return totals;
  }, {}))
);

export function constructionCost(building) {
  const configured = STARTER_BUILDING_COSTS[building?.id];
  if (configured) return { ...configured };
  return { Lumber: 6, Morale: 2, Supplies: 4 };
}

export function upgradeCost(building) {
  const targetLevel = Number(building?.level || 1) + 1;
  const band = UPGRADE_COSTS[targetLevel];
  if (!band) return null;
  const cost = {};
  addCost(cost, "Lumber", band.Lumber);
  addCost(cost, "Supplies", band.Supplies);
  addCost(cost, building?.resource, band.focus);
  return cost;
}

export function normalizeProjectCheck(raw) {
  const status = ["pending", "passed", "failed"].includes(raw?.status) ? raw.status : "pending";
  return {
    status,
    note: String(raw?.note || "").trim().slice(0, 240),
    updatedAt: raw?.updatedAt ? String(raw.updatedAt) : null
  };
}

export function projectFor(building, resources = {}) {
  if (!building) return null;
  const constructed = building.constructed === true;
  if (constructed && Number(building.level || 1) >= MAX_BUILDING_LEVEL) return null;
  const cost = constructed ? upgradeCost(building) : constructionCost(building);
  if (!cost) return null;
  const shortages = {};
  for (const [resource, amount] of Object.entries(cost)) {
    const missing = amount - Number(resources[resource] || 0);
    if (missing > 0) shortages[resource] = missing;
  }
  return {
    kind: constructed ? "upgrade" : "construction",
    targetLevel: constructed ? Number(building.level || 1) + 1 : 1,
    cost,
    affordable: Object.keys(shortages).length === 0,
    shortages,
    check: normalizeProjectCheck(building.projectCheck)
  };
}

function pristineBuilding(building) {
  return Number(building?.level || 1) === 1
    && Number(building?.producedTotal || 0) === 0
    && (!Array.isArray(building?.spent) || building.spent.length === 0)
    && (!Array.isArray(building?.effects) || building.effects.length === 0);
}

export function normalizeSettlementConstruction(settlement) {
  const before = JSON.stringify(settlement);
  const buildings = Object.values(settlement?.buildings || {});
  const legacy = settlement?.constructionVersion !== 1;
  const emptyStores = RESOURCE_NAMES.every((resource) => Number(settlement?.resources?.[resource] || 0) === 0);
  const freshStart = legacy && buildings.length > 0 && emptyStores && buildings.every(pristineBuilding);

  settlement.constructionVersion = 1;
  settlement.resources ||= {};
  for (const resource of RESOURCE_NAMES) {
    if (!Number.isFinite(settlement.resources[resource])) settlement.resources[resource] = 0;
    if (freshStart) settlement.resources[resource] = STARTER_STORES[resource];
  }

  for (const building of buildings) {
    if (typeof building.constructed !== "boolean") building.constructed = legacy ? !freshStart : false;
    building.level = Math.max(1, Math.min(MAX_BUILDING_LEVEL, Number(building.level || 1)));
    building.projectCheck = normalizeProjectCheck(building.projectCheck);
    if (!Array.isArray(building.constructionHistory)) building.constructionHistory = [];
  }

  return { changed: before !== JSON.stringify(settlement), freshStart };
}

export function recordProjectCheck(building, { status, note = "", now = new Date().toISOString() }) {
  if (!building) throw new Error("Unknown building.");
  if (!["pending", "passed", "failed"].includes(status)) throw new Error("Choose whether the check is pending, passed, or failed.");
  building.projectCheck = normalizeProjectCheck({ status, note, updatedAt: now });
  return building.projectCheck;
}

export function completeProject(settlement, building, now = new Date().toISOString()) {
  if (!building) throw new Error("Unknown building.");
  const project = projectFor(building, settlement.resources);
  if (!project) throw new Error(`${building.name} is already at the highest supported level.`);
  if (project.check.status !== "passed") throw new Error("Record a successful check before completing the work.");
  if (!project.affordable) {
    const missing = Object.entries(project.shortages).map(([resource, amount]) => `${amount} ${resource}`).join(", ");
    throw new Error(`The stores are short ${missing}.`);
  }

  for (const [resource, amount] of Object.entries(project.cost)) settlement.resources[resource] -= amount;

  const fromLevel = building.constructed === true ? Number(building.level || 1) : 0;
  building.constructed = true;
  building.level = project.targetLevel;
  if (project.kind === "construction") building.builtAt = now;
  else building.upgradedAt = now;
  building.constructionHistory.unshift({
    kind: project.kind,
    at: now,
    fromLevel,
    toLevel: building.level,
    cost: { ...project.cost },
    checkNote: project.check.note
  });
  building.constructionHistory = building.constructionHistory.slice(0, 20);
  building.projectCheck = normalizeProjectCheck({ status: "pending" });

  return {
    kind: project.kind,
    fromLevel,
    toLevel: building.level,
    cost: { ...project.cost },
    resources: { ...settlement.resources },
    nextProject: projectFor(building, settlement.resources)
  };
}

export function costText(cost) {
  return RESOURCE_NAMES
    .filter((resource) => Number(cost?.[resource] || 0) > 0)
    .map((resource) => `${cost[resource]} ${resource}`)
    .join(", ");
}
