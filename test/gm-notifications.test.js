import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "gm-notifications-"));
process.env.DATA_DIR = dir;
const {
  createScreenRequest,
  gmNotificationsView,
  notificationById,
  resolveNotification
} = await import("../server/gm-notifications.js");

test("player screen requests stay pending until the GM resolves them", () => {
  const request = createScreenRequest(
    { id: "pc_test", name: "Mara" },
    { source: { route: "/character/pc_test", label: "Portrait" } },
    { type: "image", url: "/generated/portrait.png", caption: "Portrait" }
  );
  assert.equal(request.status, "pending");
  assert.equal(request.actor.pcId, "pc_test");
  assert.equal(gmNotificationsView()[0].payload.projection.url, "/generated/portrait.png");

  const approved = resolveNotification(request.id, "approved");
  assert.equal(approved.status, "approved");
  assert.ok(approved.resolvedAt);
  assert.throws(() => resolveNotification(request.id, "dismissed"), /already been handled/);
  assert.equal(notificationById(request.id).status, "approved");
});

test("notification summaries are bounded and status values are closed", () => {
  const request = createScreenRequest(
    { id: "pc_test", name: "Mara" },
    { source: { label: "x".repeat(500) } },
    { type: "text", title: "A note", body: "Visible words" }
  );
  assert.equal(request.summary.length, 180);
  assert.throws(() => resolveNotification(request.id, "read"), /approve or dismiss/);
});
