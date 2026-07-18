import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const encounterSource = await readFile(new URL("../public/board/encounter.js", import.meta.url), "utf8");
const serverSource = await readFile(new URL("../server/index.js", import.meta.url), "utf8");
const viewsSource = await readFile(new URL("../server/views.js", import.meta.url), "utf8");

test("encounters provide creature exploration and searchable quick rules", () => {
  assert.match(encounterSource, /createCreatureExplorer/);
  assert.match(encounterSource, /searchRuleNodes/);
  assert.match(encounterSource, /Relevant to this creature/);
  assert.match(encounterSource, /Hold to show only while pressed/);
});

test("rule projection stores a validated reference and resolves public text server-side", () => {
  assert.match(serverSource, /SCREEN_TYPES = new Set\(\[.*"rule"/);
  assert.match(serverSource, /type === "rule" && !rulesCorpus\.nodes\.find/);
  assert.match(viewsSource, /case "rule":/);
  assert.match(viewsSource, /rulesCorpus\?\.nodes/);
});
