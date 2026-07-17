import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const gmHtml = await readFile(new URL("../public/gm/index.html", import.meta.url), "utf8");
const musicHtml = await readFile(new URL("../public/music/index.html", import.meta.url), "utf8");

test("the embedded music desk grants audio playback permission", () => {
  assert.match(
    gmHtml,
    /<iframe[^>]+src="\/music\/?\?embed=1"[^>]+allow="autoplay"[^>]*>/
  );
});

test("the music transport exposes an inline preloaded audio element", () => {
  assert.match(musicHtml, /<audio id="audio" preload="metadata" playsinline><\/audio>/);
});
