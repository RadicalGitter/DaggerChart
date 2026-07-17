import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const gmHtml = await readFile(new URL("../public/gm/index.html", import.meta.url), "utf8");
const musicHtml = await readFile(new URL("../public/music/index.html", import.meta.url), "utf8");
const gmJs = await readFile(new URL("../public/gm/gm.js", import.meta.url), "utf8");
const musicJs = await readFile(new URL("../public/music/music.js", import.meta.url), "utf8");

test("the embedded music desk grants audio playback permission", () => {
  assert.match(
    gmHtml,
    /<iframe[^>]+src="\/music\/?\?embed=1"[^>]+allow="autoplay"[^>]*>/
  );
});

test("the music transport exposes an inline preloaded audio element", () => {
  assert.match(musicHtml, /<audio id="audio" preload="metadata" playsinline><\/audio>/);
});

test("the embedded music desk remounts bubbles when its GM section becomes visible", () => {
  assert.match(gmJs, /type: "settlement:music-visible"/);
  assert.match(musicJs, /event\.data\?\.type !== "settlement:music-visible"/);
  assert.match(musicJs, /if \(!bubblePhysics\.items\.size\) mountBubblePhysics\(\)/);
});
