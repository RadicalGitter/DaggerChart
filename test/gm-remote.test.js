import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { buildRemoteMenu, pagedBranches } from "../public/gm-remote/remote-tree.js";

const read = (path) => fs.readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const findItem = (items, id) => {
  for (const item of items) {
    if (item.id === id) return item;
    const found = item.children ? findItem(item.children, id) : null;
    if (found) return found;
  }
  return null;
};

test("the phone command tree keeps each radial level thumb-sized", () => {
  const items = Array.from({ length: 13 }, (_, index) => ({ id: `item-${index}`, label: `Item ${index}` }));
  const firstPage = pagedBranches(items, "items");
  assert.equal(firstPage.length, 6);
  assert.equal(firstPage.at(-1).label, "More");
  assert.ok(firstPage.at(-1).children.length <= 6);
});

test("the phone command tree exposes only focused music and screen actions", () => {
  const menu = buildRemoteMenu({
    music: {
      songs: [{ id: "song-1", title: "Lantern Road", status: "ready", audioUrl: "/audio/1" }],
      playlists: [{ id: "library", name: "Library", songIds: ["song-1"] }]
    },
    gm: {
      characters: [{ id: "folk-1", name: "Garrick", role: "Carpenter" }],
      people: [],
      places: [{ id: "place-1", name: "The Clearing", kind: "settlement" }]
    },
    art: { places: [], scenes: [] }
  });
  assert.deepEqual(menu.map((item) => item.id), ["music", "cast", "screen"]);
  assert.equal(findItem(menu, "continuation").children[0].action.direction, "sustain");
  assert.equal(findItem(menu, "songs").children[0].action.songId, "song-1");
  assert.deepEqual(menu[2].children.map((item) => item.action.body.type), ["stores", "buildings", null]);
});

test("the dedicated phone surface owns one persistent mobile audio element", () => {
  const html = read("public/gm-remote/index.html");
  const js = read("public/gm-remote/remote.js");
  const server = read("server/index.js");
  assert.match(html, /<audio id="audio" preload="metadata" playsinline><\/audio>/);
  assert.match(html, /class="music-constellation"/);
  assert.match(html, /data-open-branch="intent"/);
  assert.match(js, /new EventSource\("\/api\/stream"\)/);
  assert.match(js, /api\("\/api\/screen", \{ method: "PUT"/);
  assert.match(server, /app\.use\("\/gm-remote", express\.static/);
});
