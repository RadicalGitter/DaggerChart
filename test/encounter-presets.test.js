import test from "node:test";
import assert from "node:assert/strict";

test("encounter presets name only bestiary adversaries and fit their stated budget", async () => {
  const fs = await import("node:fs");
  const presets = JSON.parse(fs.readFileSync(new URL("../data/encounter-presets.json", import.meta.url), "utf8")).presets;
  const bestiary = JSON.parse(fs.readFileSync(new URL("../data/adversaries.json", import.meta.url), "utf8")).adversaries;
  const byId = new Map(bestiary.map((entry) => [entry.id, entry]));
  const COST = { Minion: 1, Social: 1, Support: 1, Horde: 2, Ranged: 2, Skulk: 2, Standard: 2, Leader: 3, Bruiser: 4, Solo: 5 };
  assert.ok(presets.length >= 3);
  for (const preset of presets) {
    let spent = 0;
    let minions = 0;
    for (const entry of preset.adversaries) {
      const block = byId.get(entry.refId);
      assert.ok(block, `${preset.id}: ${entry.refId} is not in the bestiary`);
      if (block.type === "Minion") minions += 1; else spent += COST[block.type] ?? 2;
    }
    spent += Math.ceil(minions / preset.partySize);
    assert.match(preset.budget, new RegExp(`^${spent} of `), `${preset.id} spends ${spent}`);
  }
});
