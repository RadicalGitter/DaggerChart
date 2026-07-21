import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import {
  addTruthZone,
  beginBlueprintConfirmation,
  blueprintCoverage,
  cartographyGmView,
  cartographyPlayerView,
  cleanCartographyStrokes,
  compileRenderPlan,
  diffBlueprintCoverage,
  normalizeCartographyDocument,
  replaceBlueprintStrokes,
  submitSheetToDreamer,
  updateTruthZone
} from "../server/cartography.js";

const owner = { id: "pc_oore", name: "Oore", active: true };
const line = (points, layer = "structure") => ({
  tool: "pen",
  layer,
  color: "#4f3928",
  width: .004,
  points
});

function documentWithSheets() {
  return normalizeCartographyDocument({
    ownerPcId: owner.id,
    sheets: [
      {
        id: "issued",
        title: "Issued map",
        visibility: "cartographer",
        image: { file: "secret-source.jpg", mimeType: "image/jpeg" },
        truth: { overview: "GM truth", zones: [{ id: "zone_one", name: "Hidden room", x: .1, y: .1, width: .2, height: .2 }] }
      },
      { id: "source", title: "Complete source", visibility: "gm", truth: { overview: "Deepest truth" } }
    ]
  });
}

test("cartographer projection includes only issued sheets and strips the true layer", () => {
  const document = documentWithSheets();
  const player = cartographyPlayerView(document, owner.id, [owner]);
  assert.equal(player.sheets.length, 1);
  assert.equal(player.sheets[0].id, "issued");
  assert.equal(player.sheets[0].imageUrl, "/api/cartography/images/issued?pc=pc_oore");
  assert.equal(Object.hasOwn(player.sheets[0], "truth"), false);
  assert.equal(Object.hasOwn(player.sheets[0], "blueprint"), false);
  assert.equal(JSON.stringify(player).includes("secret-source.jpg"), false);
  assert.equal(JSON.stringify(player).includes("Deepest truth"), false);
});

test("a different character cannot receive the cartographer projection", () => {
  const document = documentWithSheets();
  assert.equal(cartographyPlayerView(document, "pc_someone_else", [{ id: "pc_someone_else", name: "Else" }]), null);
});

test("GM projection keeps blueprint truth and render planning fields", () => {
  const gm = cartographyGmView(documentWithSheets(), [owner]);
  assert.equal(gm.sheets.length, 2);
  assert.equal(gm.sheets[0].truth.overview, "GM truth");
  assert.ok(gm.sheets[0].blueprint);
  assert.ok(gm.sheets[0].renderPlan);
});

test("the GM receives only the latest field map explicitly sent to the Dreamer", () => {
  const document = normalizeCartographyDocument({
    ownerPcId: owner.id,
    sheets: [{ id: "field", title: "First reading", visibility: "cartographer", strokes: [line([[.1, .1]])] }]
  });
  let gm = cartographyGmView(document, [owner]);
  assert.equal(gm.sheets[0].strokes.length, 0);
  assert.equal(gm.sheets[0].submission.revision, 0);

  const first = submitSheetToDreamer(document, "field");
  assert.equal(first.revision, 1);
  document.sheets[0].strokes.push(line([[.8, .8]]));
  gm = cartographyGmView(document, [owner]);
  assert.equal(gm.sheets[0].strokes.length, 1);
  assert.equal(gm.sheets[0].submission.hasDraftChanges, true);
  assert.equal(cartographyPlayerView(document, owner.id, [owner]).sheets[0].strokes.length, 2);

  const second = submitSheetToDreamer(document, "field");
  assert.equal(second.revision, 2);
  assert.equal(document.sheets[0].submissions.length, 2);
  assert.equal(cartographyGmView(document, [owner]).sheets[0].strokes.length, 2);
  assert.throws(() => submitSheetToDreamer(document, "field"), /already matches/);
});

test("map marks are bounded and preserve structural classification", () => {
  const strokes = cleanCartographyStrokes([
    line([[-1, .5], [2, .75]]),
    line([[.1, .1]], "detail")
  ]);
  assert.deepEqual(strokes[0].points, [[0, .5], [1, .75]]);
  assert.equal(strokes[0].layer, "structure");
  assert.equal(strokes[1].layer, "detail");
  assert.throws(() => cleanCartographyStrokes([{ tool: "charcoal", points: [[.2, .2]] }]), /Unknown map drawing tool/);
});

test("blueprint diff reports only changed structural coverage", () => {
  const first = blueprintCoverage([line([[.1, .1], [.4, .1]])]);
  const detailed = blueprintCoverage([line([[.1, .1], [.4, .1]]), line([[.8, .8], [.9, .9]], "detail")]);
  assert.deepEqual(detailed, first);
  const changed = blueprintCoverage([line([[.1, .1], [.4, .1]]), line([[.8, .8], [.9, .8]])]);
  const diff = diffBlueprintCoverage(first, changed);
  assert.equal(diff.changed, true);
  assert.ok(diff.addedCells.length > 0);
  assert.ok(diff.bounds.x > .6);
});

test("a confirmed local structure change preserves unaffected room renders", () => {
  const document = normalizeCartographyDocument({
    ownerPcId: owner.id,
    sheets: [{ id: "cave", title: "Cave", visibility: "gm" }]
  });
  const sheet = document.sheets[0];
  addTruthZone(document, sheet.id, { id: "ignored", name: "Entrance", x: .05, y: .05, width: .3, height: .3, truth: "Stone mouth" });
  addTruthZone(document, sheet.id, { name: "Deep chamber", x: .65, y: .65, width: .25, height: .25, truth: "Occupied cavern" });

  replaceBlueprintStrokes(document, sheet.id, [line([[.1, .1], [.3, .1]])]);
  beginBlueprintConfirmation(document, sheet.id);
  compileRenderPlan(document, sheet.id);
  for (const scene of sheet.renderPlan.scenes) {
    scene.imageUrl = `/rendered/${scene.zoneId}.png`;
    scene.status = "current";
  }
  compileRenderPlan(document, sheet.id);
  const deepZone = sheet.truth.zones.find((zone) => zone.name === "Deep chamber");
  const deepBefore = sheet.renderPlan.scenes.find((scene) => scene.zoneId === deepZone.id);
  assert.equal(deepBefore.status, "current");

  replaceBlueprintStrokes(document, sheet.id, [line([[.1, .1], [.3, .1]]), line([[.12, .18], [.28, .18]])]);
  const confirmation = beginBlueprintConfirmation(document, sheet.id);
  assert.ok(confirmation.affectedZoneIds.includes(sheet.truth.zones[0].id));
  assert.equal(confirmation.affectedZoneIds.includes(deepZone.id), false);
  compileRenderPlan(document, sheet.id);

  const deepAfter = sheet.renderPlan.scenes.find((scene) => scene.zoneId === deepZone.id);
  assert.equal(deepAfter.status, "current");
  assert.equal(deepAfter.imageUrl, deepBefore.imageUrl);
  const entranceAfter = sheet.renderPlan.scenes.find((scene) => scene.zoneId === sheet.truth.zones[0].id);
  assert.equal(entranceAfter.status, "needs-render");
  assert.equal(entranceAfter.imageUrl, null);
});

test("changing a true region invalidates that room brief without requiring a structural confirmation", () => {
  const document = normalizeCartographyDocument({ ownerPcId: owner.id, sheets: [{ id: "ruin", title: "Ruin" }] });
  const zone = addTruthZone(document, "ruin", { name: "Hall", truth: "Empty" });
  compileRenderPlan(document, "ruin");
  document.sheets[0].renderPlan.scenes[0].imageUrl = "/rendered/hall.png";
  compileRenderPlan(document, "ruin");
  assert.equal(document.sheets[0].renderPlan.scenes[0].status, "current");
  updateTruthZone(document, "ruin", zone.id, { truth: "Occupied", furnishing: "Long benches" });
  compileRenderPlan(document, "ruin");
  assert.equal(document.sheets[0].renderPlan.scenes[0].status, "needs-render");
  assert.equal(document.sheets[0].renderPlan.scenes[0].imageUrl, null);
});

test("the configured cartographer is Oore and the route is wired as a player surface", () => {
  const data = JSON.parse(fs.readFileSync(new URL("../data/cartography.json", import.meta.url), "utf8"));
  const pcs = JSON.parse(fs.readFileSync(new URL("../data/pcs.json", import.meta.url), "utf8"));
  assert.equal(pcs.find((pc) => pc.id === data.ownerPcId)?.name, "Oore");
  const server = fs.readFileSync(new URL("../server/index.js", import.meta.url), "utf8");
  const player = fs.readFileSync(new URL("../public/player/player.js", import.meta.url), "utf8");
  assert.match(server, /app\.use\("\/cartography"/);
  assert.match(player, /pc\.tools\?\.includes\("cartography"\)/);
});
