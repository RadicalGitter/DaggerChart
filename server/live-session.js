import { randomUUID } from "node:crypto";

export const SHADOW_POSITIONS = Object.freeze(["light", "neutral", "shadow"]);
export const DEFAULT_LIVE_SESSION = Object.freeze({
  version: 1,
  shadowPcId: null,
  sessions: [],
  shadowStates: {}
});

const iso = (value, fallback = null) => {
  const time = Date.parse(String(value || ""));
  return Number.isFinite(time) ? new Date(time).toISOString() : fallback;
};
const boundedMs = (value) => Number.isFinite(Number(value)) ? Math.max(0, Math.round(Number(value))) : 0;
const position = (value) => SHADOW_POSITIONS.includes(value) ? value : "neutral";
const uniqueStrings = (value) => [...new Set((Array.isArray(value) ? value : []).map(String).filter(Boolean))];

function normalizeClock(value) {
  const startedAt = iso(value?.startedAt, new Date().toISOString());
  const status = ["running", "paused", "ended"].includes(value?.status) ? value.status : "ended";
  return {
    id: String(value?.id || `live_${randomUUID()}`),
    campaignId: String(value?.campaignId || ""),
    status,
    participants: uniqueStrings(value?.participants),
    startedAt,
    lastTickAt: status === "running" ? iso(value?.lastTickAt, startedAt) : null,
    pausedAt: status === "paused" ? iso(value?.pausedAt, startedAt) : null,
    endedAt: status === "ended" ? iso(value?.endedAt, startedAt) : null,
    elapsedMs: boundedMs(value?.elapsedMs)
  };
}

function normalizeShadowState(value) {
  const current = position(value?.position);
  return {
    position: current,
    changedAt: iso(value?.changedAt),
    totalsMs: Object.fromEntries(SHADOW_POSITIONS.map((key) => [key, boundedMs(value?.totalsMs?.[key])])),
    transitions: (Array.isArray(value?.transitions) ? value.transitions : []).slice(-500).map((entry) => ({
      from: position(entry?.from),
      to: position(entry?.to),
      at: iso(entry?.at, new Date().toISOString()),
      sessionId: entry?.sessionId ? String(entry.sessionId) : null,
      source: entry?.source === "gm" ? "gm" : "player",
      counted: entry?.counted === true
    })),
    invocations: (Array.isArray(value?.invocations) ? value.invocations : []).slice(-500).map((entry) => ({
      at: iso(entry?.at, new Date().toISOString()),
      sessionId: entry?.sessionId ? String(entry.sessionId) : null,
      fearAdded: entry?.fearAdded === 1 ? 1 : 0
    }))
  };
}

export function normalizeLiveSessionDocument(value) {
  const source = value && typeof value === "object" && !Array.isArray(value) ? value : DEFAULT_LIVE_SESSION;
  return {
    version: 1,
    shadowPcId: source.shadowPcId ? String(source.shadowPcId) : null,
    sessions: (Array.isArray(source.sessions) ? source.sessions : []).slice(-100).map(normalizeClock),
    shadowStates: Object.fromEntries(Object.entries(source.shadowStates || {}).map(([pcId, state]) => [String(pcId), normalizeShadowState(state)]))
  };
}

function timestamp(now) {
  const value = now instanceof Date ? now : new Date(now === undefined ? Date.now() : now);
  if (!Number.isFinite(value.getTime())) throw new Error("The session clock received an invalid time.");
  return value;
}

function activeClock(document, campaignId) {
  return [...document.sessions].reverse().find((clock) => clock.campaignId === campaignId && clock.status !== "ended") || null;
}

function shadowState(document) {
  if (!document.shadowPcId) return null;
  document.shadowStates[document.shadowPcId] ||= normalizeShadowState({ position: "neutral" });
  return document.shadowStates[document.shadowPcId];
}

function elapsedSince(clock, now) {
  if (clock?.status !== "running" || !clock.lastTickAt) return 0;
  return Math.max(0, timestamp(now).getTime() - Date.parse(clock.lastTickAt));
}

export function settleLiveSession(document, campaignId, now = Date.now()) {
  const clock = activeClock(document, campaignId);
  if (!clock || clock.status !== "running") return 0;
  const at = timestamp(now);
  const elapsed = elapsedSince(clock, at);
  clock.elapsedMs += elapsed;
  const state = shadowState(document);
  if (state && clock.participants.includes(document.shadowPcId)) state.totalsMs[state.position] += elapsed;
  clock.lastTickAt = at.toISOString();
  return elapsed;
}

export function startLiveSession(document, campaignId, participants, now = Date.now()) {
  if (activeClock(document, campaignId)) throw new Error("A live session is already running or paused for this campaign.");
  const at = timestamp(now).toISOString();
  const clock = normalizeClock({
    id: `live_${randomUUID()}`,
    campaignId,
    status: "running",
    participants: uniqueStrings(participants),
    startedAt: at,
    lastTickAt: at,
    elapsedMs: 0
  });
  document.sessions.push(clock);
  if (document.sessions.length > 100) document.sessions.splice(0, document.sessions.length - 100);
  return clock;
}

export function pauseLiveSession(document, campaignId, now = Date.now()) {
  const clock = activeClock(document, campaignId);
  if (!clock || clock.status !== "running") throw new Error("There is no running session to pause.");
  const at = timestamp(now);
  settleLiveSession(document, campaignId, at);
  clock.status = "paused";
  clock.pausedAt = at.toISOString();
  clock.lastTickAt = null;
  return clock;
}

export function resumeLiveSession(document, campaignId, now = Date.now()) {
  const clock = activeClock(document, campaignId);
  if (!clock || clock.status !== "paused") throw new Error("There is no paused session to resume.");
  const at = timestamp(now).toISOString();
  clock.status = "running";
  clock.pausedAt = null;
  clock.lastTickAt = at;
  return clock;
}

export function endLiveSession(document, campaignId, now = Date.now()) {
  const clock = activeClock(document, campaignId);
  if (!clock) throw new Error("There is no live session to end.");
  const at = timestamp(now);
  if (clock.status === "running") settleLiveSession(document, campaignId, at);
  clock.status = "ended";
  clock.endedAt = at.toISOString();
  clock.pausedAt = null;
  clock.lastTickAt = null;
  return clock;
}

export function setShadowPosition(document, pcId, nextPosition, campaignId, source = "player", now = Date.now()) {
  if (!document.shadowPcId || pcId !== document.shadowPcId) throw new Error("This character does not carry the balance of light and shadow.");
  const next = position(nextPosition);
  if (next !== nextPosition) throw new Error("Choose Light, Neutral, or Shadow.");
  const at = timestamp(now);
  settleLiveSession(document, campaignId, at);
  const state = shadowState(document);
  if (state.position === next) return state;
  const clock = activeClock(document, campaignId);
  state.transitions.push({
    from: state.position,
    to: next,
    at: at.toISOString(),
    sessionId: clock?.id || null,
    source: source === "gm" ? "gm" : "player",
    counted: Boolean(clock && clock.participants.includes(pcId))
  });
  state.transitions = state.transitions.slice(-500);
  state.position = next;
  state.changedAt = at.toISOString();
  return state;
}

export function recordShadowInvocation(document, pcId, campaignId, now = Date.now()) {
  if (!document.shadowPcId || pcId !== document.shadowPcId) throw new Error("This character cannot invoke this shadow.");
  const at = timestamp(now);
  settleLiveSession(document, campaignId, at);
  const clock = activeClock(document, campaignId);
  if (!clock || clock.status !== "running" || !clock.participants.includes(pcId)) throw new Error("The shadow can be invoked only while Erik is in active play.");
  const state = shadowState(document);
  if (state.position !== "shadow") throw new Error("Erik must be in Shadow to invoke its +1.");
  const invocation = { at: at.toISOString(), sessionId: clock.id, fearAdded: 1 };
  state.invocations.push(invocation);
  state.invocations = state.invocations.slice(-500);
  return invocation;
}

function projectedShadow(document, campaignId, now = Date.now()) {
  const state = shadowState(document);
  if (!state) return null;
  const clock = activeClock(document, campaignId);
  const totalsMs = { ...state.totalsMs };
  if (clock?.status === "running" && clock.participants.includes(document.shadowPcId)) {
    totalsMs[state.position] += elapsedSince(clock, now);
  }
  return { state, clock, totalsMs };
}

function clockView(clock, now) {
  if (!clock) return null;
  return {
    id: clock.id,
    status: clock.status,
    participants: [...clock.participants],
    startedAt: clock.startedAt,
    pausedAt: clock.pausedAt,
    endedAt: clock.endedAt,
    elapsedMs: clock.elapsedMs + elapsedSince(clock, now)
  };
}

export function shadowPlayerView(document, pcId, campaignId, now = Date.now()) {
  if (!document.shadowPcId || pcId !== document.shadowPcId) return null;
  const projected = projectedShadow(document, campaignId, now);
  const participating = Boolean(projected.clock?.participants.includes(pcId));
  return {
    position: projected.state.position,
    changedAt: projected.state.changedAt,
    totalsMs: projected.totalsMs,
    invocationCount: projected.state.invocations.length,
    liveSession: projected.clock ? {
      status: projected.clock.status,
      participating,
      elapsedMs: projected.clock.elapsedMs + elapsedSince(projected.clock, now)
    } : null
  };
}

export function liveSessionGmView(document, campaignId, now = Date.now()) {
  const projected = document.shadowPcId ? projectedShadow(document, campaignId, now) : null;
  const clock = activeClock(document, campaignId);
  return {
    clock: clockView(clock, now),
    shadow: projected ? {
      pcId: document.shadowPcId,
      position: projected.state.position,
      changedAt: projected.state.changedAt,
      totalsMs: projected.totalsMs,
      transitions: projected.state.transitions.slice(-20).map((entry) => ({ ...entry })),
      invocations: projected.state.invocations.slice(-20).map((entry) => ({ ...entry }))
    } : null
  };
}
