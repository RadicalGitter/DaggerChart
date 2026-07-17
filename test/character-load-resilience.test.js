import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const source = await readFile(new URL("../public/character/sheet.js", import.meta.url), "utf8");

test("character data renders independently from optional theme data", () => {
  assert.match(source, /await fetchJsonWithRetry\(`\/api\/party\/\$\{id\}`/);
  assert.match(source, /render\(\);\s*void loadThemes\(\);/);
  assert.doesNotMatch(source, /Promise\.all\([\s\S]{0,240}music\/themes/);
});

test("owed-card notice uses only formatters available on the live sheet", () => {
  assert.match(source, /domains: entitlement\.domains\.join\(" & "\)/);
  assert.doesNotMatch(source, /entitlement\.domains[\s\S]{0,80}\btitle\(/);
});

test("sheet refreshes are serialized and ignore the SSE connection greeting", () => {
  assert.match(source, /if \(loadInFlight\) \{\s*loadQueued = true;/);
  assert.match(source, /if \(event\?\.data === "connected"\) return;/);
});
