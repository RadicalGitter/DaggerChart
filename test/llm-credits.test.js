import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

// The module persists through store.js, which binds DATA_DIR at load. Point it
// at a throwaway dir BEFORE importing so no test ever touches real credits.
// node --test isolates each test file in its own process, so this is safe.
const dir = fs.mkdtempSync(path.join(os.tmpdir(), "credits-"));
process.env.DATA_DIR = dir;
const {
  playerCreditView,
  hasCredit,
  spendCredit,
  requestTopOff,
  grantCredits,
  gmLedgerView
} = await import("../server/llm-credits.js");

const PC = "pc_test_aaaa";
const DRAFT = "draft_test_bbbb";

test("a fresh account reads the default grant without being written", () => {
  const view = playerCreditView(PC);
  assert.deepEqual(view, { granted: 15, used: 0, remaining: 15, requested: false });
  // Nothing persisted yet: the ledger has no such account.
  assert.equal(gmLedgerView().accounts.find((a) => a.owner === PC), undefined);
});

test("spending deducts and is denied at zero", () => {
  const fresh = "pc_spend_cccc";
  for (let i = 0; i < 15; i += 1) {
    assert.equal(hasCredit(fresh), true);
    spendCredit(fresh);
  }
  assert.equal(hasCredit(fresh), false);
  assert.equal(playerCreditView(fresh).remaining, 0);
});

test("a spent account can be topped off, and granting clears the request", () => {
  const owner = "pc_topoff_dddd";
  for (let i = 0; i < 15; i += 1) spendCredit(owner);
  const requested = requestTopOff(owner, "  Want to write more backstory  ");
  assert.equal(requested.requested, true);
  assert.equal(requested.remaining, 0);

  const granted = grantCredits(owner, 10);
  assert.equal(granted.requested, false);
  assert.equal(granted.remaining, 10);
  assert.equal(granted.granted, 25);
  assert.equal(hasCredit(owner), true);
});

test("grant amounts are bounded and a non-positive grant is refused", () => {
  const owner = "pc_bounds_eeee";
  assert.equal(grantCredits(owner, 9999).granted, 15 + 200); // clamped to the per-grant step
  assert.throws(() => grantCredits(owner, 0), /at least one/i);
});

test("malformed owner ids are rejected everywhere", () => {
  for (const bad of ["", "nope", "pc_", "  ", "pc_" + "x".repeat(200)]) {
    assert.throws(() => playerCreditView(bad), /valid character or draft/i);
    assert.throws(() => hasCredit(bad), /valid character or draft/i);
    assert.throws(() => spendCredit(bad), /valid character or draft/i);
  }
});

test("the GM ledger lists only touched accounts with their standing", () => {
  const owner = DRAFT;
  spendCredit(owner);
  requestTopOff(owner, "portrait brief please");
  const row = gmLedgerView().accounts.find((a) => a.owner === owner);
  assert.ok(row);
  assert.equal(row.used, 1);
  assert.equal(row.remaining, 14);
  assert.equal(row.requested, true);
  assert.equal(row.note, "portrait brief please");
});

test.after(() => fs.rmSync(dir, { recursive: true, force: true }));
