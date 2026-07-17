import test from "node:test";
import assert from "node:assert/strict";
import { normalizeFolkProfile } from "../server/folk-profile.js";

test("folk profiles receive stable empty defaults", () => {
  assert.deepEqual(normalizeFolkProfile(), {
    age: { band: "unknown", years: null },
    connections: [],
    experiences: []
  });
});

test("folk profiles bound and deduplicate structured biography fields", () => {
  const profile = normalizeFolkProfile({
    age: { band: "elder", years: "72" },
    connections: [
      { folkId: "chr_mira", kind: "partner" },
      { folkId: "chr_mira", kind: "rival" },
      { folkId: "chr_rowan", kind: "nonsense" }
    ],
    experiences: ["Long journey", { name: "long journey" }, { id: "exp_craft", name: "Practiced craft" }]
  });

  assert.deepEqual(profile.age, { band: "elder", years: 72 });
  assert.deepEqual(profile.connections, [
    { folkId: "chr_mira", kind: "partner" },
    { folkId: "chr_rowan", kind: "other" }
  ]);
  assert.deepEqual(profile.experiences, [
    { id: "exp_long-journey", name: "Long journey" },
    { id: "exp_craft", name: "Practiced craft" }
  ]);
});
