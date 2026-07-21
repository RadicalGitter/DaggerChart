import test from "node:test";
import assert from "node:assert/strict";
import {
  endLiveSession,
  liveSessionGmView,
  normalizeLiveSessionDocument,
  pauseLiveSession,
  recordShadowInvocation,
  resumeLiveSession,
  setShadowPosition,
  shadowPlayerView,
  startLiveSession
} from "../server/live-session.js";

const ERIK = "pc_erik";
const CAMPAIGN = "campaign_one";
const at = (seconds) => new Date(Date.UTC(2026, 0, 1, 12, 0, seconds));
const fresh = () => normalizeLiveSessionDocument({ shadowPcId: ERIK, shadowStates: { [ERIK]: { position: "neutral" } } });

test("the live clock counts only running time", () => {
  const document = fresh();
  startLiveSession(document, CAMPAIGN, [ERIK], at(0));
  pauseLiveSession(document, CAMPAIGN, at(10));
  assert.equal(liveSessionGmView(document, CAMPAIGN, at(30)).clock.elapsedMs, 10_000);
  resumeLiveSession(document, CAMPAIGN, at(30));
  endLiveSession(document, CAMPAIGN, at(45));
  assert.equal(document.sessions[0].elapsedMs, 25_000);
});

test("shadow position time is attributed only while Erik is present and play is running", () => {
  const document = fresh();
  startLiveSession(document, CAMPAIGN, [ERIK], at(0));
  setShadowPosition(document, ERIK, "shadow", CAMPAIGN, "player", at(5));
  pauseLiveSession(document, CAMPAIGN, at(15));
  setShadowPosition(document, ERIK, "light", CAMPAIGN, "player", at(30));
  resumeLiveSession(document, CAMPAIGN, at(40));
  endLiveSession(document, CAMPAIGN, at(50));
  const state = document.shadowStates[ERIK];
  assert.deepEqual(state.totalsMs, { light: 10_000, neutral: 5_000, shadow: 10_000 });
  assert.equal(state.transitions[1].counted, true);

  const absent = fresh();
  startLiveSession(absent, CAMPAIGN, ["pc_someone_else"], at(0));
  setShadowPosition(absent, ERIK, "shadow", CAMPAIGN, "player", at(5));
  endLiveSession(absent, CAMPAIGN, at(20));
  assert.deepEqual(absent.shadowStates[ERIK].totalsMs, { light: 0, neutral: 0, shadow: 0 });
});

test("shadow invocation requires active play and the shadow position", () => {
  const document = fresh();
  assert.throws(() => recordShadowInvocation(document, ERIK, CAMPAIGN, at(0)), /active play/);
  startLiveSession(document, CAMPAIGN, [ERIK], at(0));
  assert.throws(() => recordShadowInvocation(document, ERIK, CAMPAIGN, at(1)), /must be in Shadow/);
  setShadowPosition(document, ERIK, "shadow", CAMPAIGN, "player", at(2));
  const invocation = recordShadowInvocation(document, ERIK, CAMPAIGN, at(3));
  assert.equal(invocation.fearAdded, 1);
  assert.equal(document.shadowStates[ERIK].invocations.length, 1);
});

test("only the configured character receives the private shadow projection", () => {
  const document = fresh();
  assert.equal(shadowPlayerView(document, "pc_other", CAMPAIGN, at(0)), null);
  assert.equal(shadowPlayerView(document, ERIK, CAMPAIGN, at(0)).position, "neutral");
});
