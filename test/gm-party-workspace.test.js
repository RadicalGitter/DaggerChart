import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const gmHtml = await readFile(new URL("../public/gm/index.html", import.meta.url), "utf8");
const gmSource = await readFile(new URL("../public/gm/gm.js", import.meta.url), "utf8");
const sheetHtml = await readFile(new URL("../public/character/index.html", import.meta.url), "utf8");

test("the GM Party workspace keeps character sheets in a persistent right-side frame", () => {
  assert.match(gmHtml, /class="party-workspace"/);
  assert.match(gmHtml, /id="party-card-grid"/);
  assert.match(gmHtml, /id="party-sheet-frame"/);
  assert.doesNotMatch(gmHtml, /id="party-table"/);
  assert.match(gmSource, /frame\.dataset\.pcId !== selected\.id/);
  assert.match(gmSource, /`\/character\/\$\{encodeURIComponent\(selected\.id\)\}\?embed=1&gm=1`/);
});

test("embedded character sheets suppress player-shell furniture without losing sheet controls", () => {
  assert.match(sheetHtml, /document\.documentElement\.classList\.add\("sheet-embedded"\)/);
  assert.match(gmHtml, /id="party-actions-dialog"/);
  assert.match(gmSource, /renderSelectedPartyTools\(p\)/);
  assert.match(gmSource, /data-pccondition/);
  assert.match(gmSource, /data-pcart/);
  assert.match(gmSource, /data-pcretire/);
});
