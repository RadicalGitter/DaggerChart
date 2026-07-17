import test from "node:test";
import assert from "node:assert/strict";
import {
  MAX_BUILDING_LEVEL,
  RESOURCE_NAMES,
  STARTER_BUILDING_COSTS,
  STARTER_STORES,
  completeProject,
  normalizeSettlementConstruction,
  projectFor,
  recordProjectCheck
} from "../server/construction.js";

const starterBuildings = () => Object.fromEntries(Object.keys(STARTER_BUILDING_COSTS).map((id) => [id, {
  id,
  name: id,
  resource: id === "lumber_camp" ? "Lumber" : id === "hunters_lodge" ? "Food" : id === "bunkhouse" ? "Morale" : id === "watchtower" ? "Security" : "Supplies",
  level: 1,
  spent: [],
  effects: [],
  producedTotal: 0
}]));

test("the founding stores cover every basic construction cost exactly", () => {
  for (const resource of RESOURCE_NAMES) {
    const total = Object.values(STARTER_BUILDING_COSTS).reduce((sum, cost) => sum + (cost[resource] || 0), 0);
    assert.equal(STARTER_STORES[resource], total);
  }
});

test("a pristine legacy settlement becomes an unbuilt founding camp", () => {
  const settlement = {
    resources: Object.fromEntries(RESOURCE_NAMES.map((resource) => [resource, 0])),
    buildings: starterBuildings()
  };
  const result = normalizeSettlementConstruction(settlement);
  assert.equal(result.freshStart, true);
  assert.deepEqual(settlement.resources, STARTER_STORES);
  assert.ok(Object.values(settlement.buildings).every((building) => building.constructed === false));
  assert.ok(Object.values(settlement.buildings).every((building) => building.projectCheck.status === "pending"));
});

test("an established legacy settlement keeps its buildings and stores", () => {
  const buildings = starterBuildings();
  buildings.lumber_camp.producedTotal = 3;
  const settlement = {
    resources: { ...STARTER_STORES, Lumber: 9 },
    buildings
  };
  const result = normalizeSettlementConstruction(settlement);
  assert.equal(result.freshStart, false);
  assert.equal(settlement.resources.Lumber, 9);
  assert.ok(Object.values(settlement.buildings).every((building) => building.constructed === true));
});

test("construction requires a passed check and spends materials atomically", () => {
  const buildings = starterBuildings();
  const building = buildings.lumber_camp;
  const settlement = { resources: { ...STARTER_STORES }, buildings, constructionVersion: 1 };
  normalizeSettlementConstruction(settlement);
  assert.throws(() => completeProject(settlement, building), /successful check/);
  assert.deepEqual(settlement.resources, STARTER_STORES);

  recordProjectCheck(building, { status: "passed", note: "The party found dry ground.", now: "2026-01-01T00:00:00.000Z" });
  const result = completeProject(settlement, building, "2026-01-02T00:00:00.000Z");
  assert.equal(result.kind, "construction");
  assert.equal(building.constructed, true);
  assert.equal(building.level, 1);
  assert.equal(building.projectCheck.status, "pending");
  assert.equal(building.constructionHistory[0].checkNote, "The party found dry ground.");
  for (const [resource, amount] of Object.entries(STARTER_BUILDING_COSTS.lumber_camp)) {
    assert.equal(settlement.resources[resource], STARTER_STORES[resource] - amount);
  }
});

test("upgrades rise to level five and report shortages", () => {
  const building = { ...starterBuildings().watchtower, constructed: true, projectCheck: { status: "passed" }, constructionHistory: [] };
  const settlement = { resources: Object.fromEntries(RESOURCE_NAMES.map((resource) => [resource, 100])), buildings: { watchtower: building } };
  while (building.level < MAX_BUILDING_LEVEL) {
    const before = building.level;
    const project = projectFor(building, settlement.resources);
    assert.equal(project.targetLevel, before + 1);
    completeProject(settlement, building);
    if (building.level < MAX_BUILDING_LEVEL) recordProjectCheck(building, { status: "passed" });
  }
  assert.equal(projectFor(building, settlement.resources), null);

  building.level = 1;
  building.projectCheck = { status: "passed" };
  const empty = Object.fromEntries(RESOURCE_NAMES.map((resource) => [resource, 0]));
  const blocked = projectFor(building, empty);
  assert.equal(blocked.affordable, false);
  assert.ok(Object.keys(blocked.shortages).length > 0);
});
