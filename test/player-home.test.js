import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const read = (path) => fs.readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("every feedback-enabled player surface receives the shared home control", () => {
  const feedback = read("public/shared/feedback.js");
  const entrypoints = [
    "public/background/background.js",
    "public/character/sheet.js",
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
