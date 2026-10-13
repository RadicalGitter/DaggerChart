import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const read = (path) => fs.readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("every feedback-enabled player surface receives the shared home control", () => {
  const feedback = read("public/shared/feedback.js");
  const entrypoints = [
    "public/background/background.js",
    "public/character/sheet.js",
    "public/cartography/cartography.js",
    "public/create/create.js",
    "public/journal/journal.js",
    "public/music/music.js",
    "public/player/player.js",
    "public/rules/rules.js",
    "public/table/table.js",
    "public/table-book/book.js",
    "public/tome/tome.js"
  ];
  assert.match(feedback, /shared\/player-home\.js/);
  for (const entrypoint of entrypoints) {
    assert.match(read(entrypoint), /shared\/feedback\.js/, `${entrypoint} must load the shared player controls`);
  }
});

test("the home control returns to player root without leaking into hubs or embeds", () => {
  const source = read("public/shared/player-home.js");
  assert.match(source, /home\.href = "\/player"/);
  assert.match(source, /params\.get\("embed"\) === "1"/);
  assert.match(source, /"\/login", "\/player", "\/gm", "\/board", "\/screen"/);
  assert.match(source, /window\.self !== window\.top/);
});

test("one Home ribbon replaces every page's own way back, and the hub carries no banner", () => {
  assert.match(read("public/shared/player-home.js"), /t\("player\.home"\)/);
  const ownLinks = /class="(view-root|journal-back|sheet-root-link|back-link)"|data-nav="player-root"/;
  for (const page of ["public/journal/index.html", "public/table/index.html", "public/table-book/index.html", "public/tome/index.html", "public/background/index.html", "public/rules/index.html", "public/character/sheet.js"]) {
    assert.doesNotMatch(read(page), ownLinks, `${page} should rely on the shared Home ribbon`);
  }
  const hub = read("public/player/index.html");
  assert.doesNotMatch(hub, /hub-head|hub-intro|hub-foot|player-home/);
  assert.match(hub, /class="player-seat" href="\/login"/);
});
