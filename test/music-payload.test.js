import assert from "node:assert/strict";
import test from "node:test";
import { musicDescription, sunoExtensionPayload, sunoGenerationPayload } from "../server/music-payload.js";

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

test("a mood-preserving extension reuses the source parameters", () => {
  const payload = sunoExtensionPayload({ provider: { audioId: "audio-1" } }, "sustain", {
    model: "V5_5",
    callBackUrl: "http://localhost/callback"
  });
  assert.deepEqual(payload, {
    defaultParamFlag: false,
    audioId: "audio-1"
  });
});

test("directed extensions preserve the source identity and continue near its end", () => {
  const payload = sunoExtensionPayload({
    title: "The Road",
    prompt: "fiddle and frame drum",
    duration: 181.4,
    settings: { style: "minor scale" },
    provider: { audioId: "audio-2" }
  }, "escalate", { model: "V5", callBackUrl: "http://localhost/callback" });
  assert.equal(payload.defaultParamFlag, true);
  assert.equal(payload.continueAt, 180);
  assert.match(payload.style, /fiddle and frame drum/);
  assert.match(payload.prompt, /increasing urgency/);
});

test("holding mood switches to custom continuation only when an influence is selected", () => {
  const payload = sunoExtensionPayload({
    title: "The Road",
    prompt: "fiddle and frame drum",
    duration: 90,
    settings: {},
    provider: { audioId: "audio-3" }
  }, "sustain", { model: "V5_5", callBackUrl: "http://localhost/callback", modifiers: ["the hero's brass leitmotif"] });
  assert.equal(payload.defaultParamFlag, true);
  assert.match(payload.style, /hero's brass leitmotif/);
  assert.match(payload.prompt, /same dramatic register/);
});
