import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const gmJs = await readFile(new URL("../public/gm/gm.js", import.meta.url), "utf8");
const gmHtml = await readFile(new URL("../public/gm/index.html", import.meta.url), "utf8");

test("GM character sheets stay in the current workspace", () => {
  const sheetLinks = gmJs.match(/<a class="sheet-link" href="\/character\/[^>]+>/g) || [];
  assert.equal(sheetLinks.length, 1);
  for (const link of sheetLinks) assert.doesNotMatch(link, /target="_blank"/);
  assert.match(gmHtml, /id="party-gm-sheet"/);
  assert.doesNotMatch(gmHtml, /id="party-sheet-frame"/);
  assert.match(gmJs, /partySheet\.setCharacter\(selectedPartyMember\(\)\)/);
});
