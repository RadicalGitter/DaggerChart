import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const gmJs = await readFile(new URL("../public/gm/gm.js", import.meta.url), "utf8");
const gmHtml = await readFile(new URL("../public/gm/index.html", import.meta.url), "utf8");

test("GM character sheet links stay in the current tab", () => {
  const sheetLinks = gmJs.match(/<a class="sheet-link" href="\/character\/[^>]+>/g) || [];
  assert.equal(sheetLinks.length, 2);
  for (const link of sheetLinks) assert.doesNotMatch(link, /target="_blank"/);
  assert.match(gmHtml, /\.sheet-link\s*\{[^}]*display:\s*inline-flex[^}]*min-height:\s*36px/s);
});
