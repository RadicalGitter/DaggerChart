import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const gmHtml = await readFile(new URL("../public/gm/index.html", import.meta.url), "utf8");
const gmSource = await readFile(new URL("../public/gm/gm.js", import.meta.url), "utf8");

test("the GM Party workspace keeps a native character sheet in the right pane", () => {
  assert.match(gmHtml, /class="party-workspace"/);
  assert.match(gmHtml, /id="party-card-grid"/);
  assert.match(gmHtml, /id="party-gm-sheet"/);
  assert.doesNotMatch(gmHtml, /id="party-table"/);
  assert.match(gmSource, /createGmPartySheet/);
  assert.match(gmSource, /function syncPartySheet\(\)/);
  assert.match(gmSource, /partySheet\.setCharacter\(selectedPartyMember\(\)\)/);
  assert.match(gmSource, /event\.target\.closest\("\[data-party-select\]"\)/);
});

test("the native sheet keeps the existing GM controls", () => {
  assert.match(gmHtml, /id="party-actions-dialog"/);
  assert.match(gmSource, /renderSelectedPartyTools\(p\)/);
  assert.match(gmSource, /data-pccondition/);
  assert.match(gmSource, /data-pcart/);
  assert.match(gmSource, /data-pcretire/);
});
