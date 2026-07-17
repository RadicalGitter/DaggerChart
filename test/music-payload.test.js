import assert from "node:assert/strict";
import test from "node:test";
import { musicDescription, sunoGenerationPayload } from "../server/music-payload.js";

const song = {
  title: "A Long Road Home",
  description: "  Short overture, no sung words  ",
  prompt: "warm fiddle, restrained frame drum",
  settings: {
    instrumental: true,
    style: "minor scale",
    negativeTags: "bright synths",
    styleWeight: 0.65,
    weirdnessConstraint: 0.45,
    audioWeight: 0.7
  }
};

test("music descriptions are preserved verbatim inside a bracketed lyrics instruction", () => {
  const payload = sunoGenerationPayload(song, { model: "V5_5", callBackUrl: "http://localhost/callback" });
  assert.equal(payload.customMode, true);
  assert.equal(payload.instrumental, false);
  assert.equal(payload.prompt, "[  Short overture, no sung words  ]");
  assert.equal(payload.style, "warm fiddle, restrained frame drum, minor scale");
  assert.equal(payload.audioWeight, 0.7);
});

test("audio reference influence is emitted as a bounded fraction", () => {
  const payload = sunoGenerationPayload({
    ...song,
    settings: { ...song.settings, audioWeight: 1.4 }
  }, { model: "V5_5", callBackUrl: "http://localhost/callback" });
  assert.equal(payload.audioWeight, 1);
});

test("ordinary instrumental generation keeps its existing provider shape", () => {
  const payload = sunoGenerationPayload({ ...song, description: "" }, { model: "V5_5", callBackUrl: "http://localhost/callback" });
  assert.equal(payload.customMode, true);
  assert.equal(payload.instrumental, true);
  assert.equal("prompt" in payload, false);
});

test("overlong music descriptions are rejected instead of silently changing verbatim text", () => {
  assert.throws(() => musicDescription("x".repeat(501)), /too long/);
});
