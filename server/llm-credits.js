// Word-weaving credits: a bounded per-player budget for the Anthropic writing
// aids (background expansions, portrait briefs). The table is trusted, so this
// is a courtesy meter — a gentle cap players top off by asking the steward —
// not a security boundary. Keeps out-of-play use from quietly running up the
// GM's API bill.
//
// One account per owner id: a PC (pc_…) or an unfinished draft (draft_…).
// Failed provider calls must never charge; routes spend only after success.
import { loadJson, saveJson } from "./store.js";

const FILE = "llm-credits.json";
const DEFAULT_GRANT = 15;
const MAX_GRANT_STEP = 200;
const MAX_TOTAL_GRANT = 100_000; // a runaway backstop, far above any real use
const OWNER_PATTERN = /^(?:pc|draft)_[a-zA-Z0-9_-]{3,90}$/;

function freshLedger() {
  return { defaultGrant: DEFAULT_GRANT, accounts: {} };
}

let ledger = loadJson(FILE, freshLedger());

function ensureRoot() {
  ledger.defaultGrant = boundedInt(ledger.defaultGrant, DEFAULT_GRANT, 0, MAX_GRANT_STEP);
  ledger.accounts = ledger.accounts && typeof ledger.accounts === "object" ? ledger.accounts : {};
}
ensureRoot();

function boundedInt(value, fallback, min, max) {
  const n = Math.round(Number(value));
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, n));
}

function cleanOwner(value) {
  const id = String(value || "").trim();
  if (!OWNER_PATTERN.test(id)) throw new Error("A valid character or draft is required.");
  return id;
}

// A stored account, normalized. Missing accounts read as a fresh default grant
// without being written — the row is created lazily on the first spend/request.
function accountFor(id) {
  const raw = ledger.accounts[id] || {};
  return {
    granted: boundedInt(raw.granted, ledger.defaultGrant, 0, MAX_TOTAL_GRANT),
    used: boundedInt(raw.used, 0, 0, MAX_TOTAL_GRANT),
    requestedAt: typeof raw.requestedAt === "string" ? raw.requestedAt : null,
    note: typeof raw.note === "string" ? raw.note.slice(0, 500) : ""
  };
}

function viewOf(account) {
  return {
    granted: account.granted,
    used: account.used,
    remaining: Math.max(0, account.granted - account.used),
    requested: Boolean(account.requestedAt)
  };
}

// Non-mutating: the current standing for one owner (unknown owners read as a
// fresh default grant). Throws only on a malformed id.
export function playerCreditView(owner) {
  return viewOf(accountFor(cleanOwner(owner)));
}

// Cheap gate the routes check before calling the provider. Never throws for a
// well-formed but exhausted account — the route returns 402 on false.
export function hasCredit(owner) {
  const account = accountFor(cleanOwner(owner));
  return account.granted - account.used > 0;
}

// Charge one expansion. Call only after the provider answered successfully.
export function spendCredit(owner) {
  const id = cleanOwner(owner);
  const account = accountFor(id);
  account.used += 1;
  ledger.accounts[id] = account;
  saveJson(FILE, ledger);
  return viewOf(account);
}

// The player asks the steward for more. Records the standing request and an
// optional note; the balance is unchanged until the GM grants.
export function requestTopOff(owner, note = "") {
  const id = cleanOwner(owner);
  const account = accountFor(id);
  account.requestedAt = new Date().toISOString();
  account.note = String(note || "").trim().slice(0, 500);
  ledger.accounts[id] = account;
  saveJson(FILE, ledger);
  return viewOf(account);
}

// The GM grants more expansions, clearing any pending request.
export function grantCredits(owner, amount) {
  const id = cleanOwner(owner);
  const requested = Math.round(Number(amount));
  if (!Number.isFinite(requested) || requested < 1) throw new Error("Grant at least one expansion.");
  const step = Math.min(requested, MAX_GRANT_STEP);
  const account = accountFor(id);
  account.granted = Math.min(MAX_TOTAL_GRANT, account.granted + step);
  account.requestedAt = null;
  account.note = "";
  ledger.accounts[id] = account;
  saveJson(FILE, ledger);
  return viewOf(account);
}

// Every account for the GM ledger panel, with its raw standing. The caller
// resolves owner ids to names.
export function gmLedgerView() {
  ensureRoot();
  return {
    defaultGrant: ledger.defaultGrant,
    accounts: Object.entries(ledger.accounts).map(([owner, raw]) => {
      const account = accountFor(owner);
      return { owner, ...viewOf(account), note: account.note, requestedAt: account.requestedAt };
    })
  };
}
