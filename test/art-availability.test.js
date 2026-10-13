import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { ArtWorkshop } from "../server/art.js";

const request = { kind: "portrait", entityId: "dummy", prompt: "A dummy portrait" };
const stats = () => Response.json({ system: {}, devices: [] });
async function workshop(t, options = {}) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "settlement-art-gate-"));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const file = path.join(root, "portrait.json");
  await fs.writeFile(file, JSON.stringify({
    "1": { class_type: "CLIPTextEncode", inputs: { text: "{{prompt}}" } }
  }));
  return new ArtWorkshop({ publicRoot: root, workflows: { portrait: file }, ...options });
}

test("offline, unhealthy, and invalid generator responses never submit a workflow", async (t) => {
  for (const result of [
    async () => { throw new Error("ECONNREFUSED internal detail"); },
    async () => new Response("offline", { status: 503 }),
    async () => Response.json({ unrelated: true })
  ]) {
    const paths = [];
    const art = await workshop(t, { fetchImpl: async (url) => { paths.push(url.pathname); return result(); } });
    await assert.rejects(art.request(request), (error) =>
      error.reason === "generator-offline" && error.errorKey === "portrait.unavailable"
      && !error.message.includes("ECONNREFUSED"));
    assert.deepEqual(paths, ["/system_stats"]);
    assert.equal(await fs.stat(path.join(art.publicRoot, "generated")).then(() => true, () => false), false);
  }
});

test("availability checks are read-only and need only a healthy generator", async (t) => {
  const calls = [];
  const art = await workshop(t, { fetchImpl: async (url, options) => {
    calls.push([url.pathname, options.method || "GET"]);
    return stats();
  } });
  assert.deepEqual(await art.availability(), { ready: true, reason: null });
  assert.deepEqual(calls, [["/system_stats", "GET"]]);
});

test("a connection lost during submission returns the same actionable fallback", async (t) => {
  const paths = [];
  const art = await workshop(t, { fetchImpl: async (url) => {
    paths.push(url.pathname);
    if (url.pathname === "/system_stats") return stats();
    throw new Error("connection lost");
  } });
  await assert.rejects(art.request(request), (error) => error.reason === "generator-offline");
  assert.deepEqual(paths, ["/system_stats", "/prompt"]);
});
