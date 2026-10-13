import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { hashGmPassword } from "../server/access.js";

test("private preparation projects only the chosen map and preset reads create no encounters", { timeout: 30000 }, async (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "settlement-adventures-"));
  const save = (name, value) => {
    const target = path.join(dir, name);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, JSON.stringify(value));
  };
  const adventure = (id, file) => ({ id, name: `Test ${id}`, summary: "PRIVATE_SUMMARY",
    overview: "PRIVATE_ADVENTURE_TRUTH", characters: [{ folkId: "folk_dummy", name: "Dummy" }],
    rumours: [{ text: "PRIVATE_RUMOUR" }], map: { file, caption: "Public map caption" } });
  save("adventures.json", { adventures: [adventure("one", "one.png"), adventure("two", "two.png"), adventure("unsafe", "../characters.json")] });
  save("characters.json", [{ id: "folk_dummy", name: "Dummy", description: "Public", hidden: { notes: "PRIVATE_FOLK" } }]);
  save("event-tables/dummy.json", { buildings: {} });
  save("encounters.json", { encounters: [] });
  save("encounter-presets.json", { presets: [{ id: "preset_dummy", name: "Dummy preset", partySize: 3,
    notes: "PRIVATE_RUNNING_NOTES", adversaries: [{ refId: "adv_dummy", label: "Dummy", x: .7, y: .5 }] }] });
  save("adversaries.json", { adversaries: [{ id: "adv_dummy", name: "Dummy", type: "Standard", tier: 1 }] });
  const image = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aY9sAAAAASUVORK5CYII=", "base64");
  fs.mkdirSync(path.join(dir, "adventure-maps"));
  fs.writeFileSync(path.join(dir, "adventure-maps", "one.png"), image);
  fs.writeFileSync(path.join(dir, "adventure-maps", "two.png"), image);

  const child = spawn(process.execPath, ["--input-type=module", "-e",
    'import http from "node:http"; const listen = http.Server.prototype.listen; http.Server.prototype.listen = function (...args) { this.once("listening", () => console.log("TEST_PORT=" + this.address().port)); return listen.apply(this, args); }; await import("./server/index.js");'
  ], { cwd: fileURLToPath(new URL("..", import.meta.url)), windowsHide: true,
    env: { ...process.env, DATA_DIR: dir, PORT: "0", MUSIC_LIBRARY_DIR: path.join(dir, "audio"),
      ANTHROPIC_API_KEY: "", SUNO_API_KEY: "", COMFYUI_URL: "http://127.0.0.1:9",
      BEACON_DUCKDNS_DOMAIN: "", BEACON_GIST_ID: "", SETTLEMENT_STOP_FILE: "",
      TABLE_SESSION_KEY: "synthetic-adventure-test-key-at-least-32-chars", TABLE_GM_PASSWORD_HASH: hashGmPassword("test-only-password") },
    stdio: ["ignore", "pipe", "pipe"] });
  t.after(async () => {
    if (child.exitCode === null && child.signalCode === null) {
      const exited = once(child, "exit");
      child.kill();
      await exited;
    }
    assert.equal(path.dirname(path.resolve(dir)), path.resolve(os.tmpdir()));
    assert.ok(path.basename(dir).startsWith("settlement-adventures-"));
    fs.rmSync(dir, { recursive: true, force: true });
  });
  const port = await new Promise((resolve, reject) => {
    let output = "", errors = "";
    const timer = setTimeout(() => reject(new Error("Scratch adventure server startup timed out")), 8000);
    child.once("error", (error) => { clearTimeout(timer); reject(error); });
    child.once("exit", () => { clearTimeout(timer); reject(new Error(`Scratch server exited: ${errors}`)); });
    child.stderr.on("data", (chunk) => { errors += chunk; });
    child.stdout.on("data", (chunk) => {
      output += chunk;
      const match = output.match(/TEST_PORT=(\d+)/);
      if (match) { clearTimeout(timer); resolve(Number(match[1])); }
    });
  });
  const base = `http://127.0.0.1:${port}`;
  let cookie = "";
  const request = (route, method = "GET", body, gm = true) => fetch(base + route, {
    method, headers: { "Content-Type": "application/json", ...(gm && cookie ? { Cookie: cookie } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body)
  });

  for (const route of ["/api/adventures", "/api/adventures/one", "/api/adventures/one/map", "/api/encounters/presets/preset_dummy"]) {
    assert.equal((await request(route, "GET", undefined, false)).status, 403);
  }
  const login = await fetch(base + "/access/gm", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" }, body: new URLSearchParams({ password: "test-only-password" }) });
  assert.equal(login.status, 200);
  cookie = login.headers.get("set-cookie").split(";")[0];
  const list = await (await request("/api/adventures")).json();
  assert.equal(list.adventures.length, 3);
  assert.equal(list.adventures[2].mapAvailable, false);
  assert(!JSON.stringify(list).includes("PRIVATE_ADVENTURE_TRUTH"));
  const detail = await (await request("/api/adventures/one")).json();
  assert.equal(detail.overview, "PRIVATE_ADVENTURE_TRUTH");
  assert.equal(detail.characters[0].folkId, "folk_dummy");
  assert.equal((await request("/api/adventures/missing")).status, 404);
  assert.equal((await request("/api/adventures/unsafe/map")).status, 404);
  assert.equal((await request("/api/adventures/one/map")).status, 200);
  assert.equal((await request("/api/screen/adventure-map/one", "GET", undefined, false)).status, 404);
  assert.equal((await request("/api/screen", "PUT", { type: "adventure-map", refId: "unsafe" })).status, 400);

  const preview = await (await request("/api/encounters/presets/preset_dummy")).json();
  assert.equal(preview.notes, "PRIVATE_RUNNING_NOTES");
  assert.equal(preview.adversaries.length, 1);
  assert.equal((await (await request("/api/encounters")).json()).encounters.length, 0);
  const started = await (await request("/api/encounters", "POST", { presetId: "preset_dummy" })).json();
  assert.equal(started.presetId, "preset_dummy");
  assert.equal((await (await request("/api/encounters")).json()).encounters.length, 1);

  assert.equal((await request("/api/screen", "PUT", { type: "adventure-map", refId: "one", body: "PRIVATE_INJECTED_TEXT" })).status, 200);
  const screen = await (await request("/api/screen", "GET", undefined, false)).json();
  assert.deepEqual(screen, { type: "image", url: "/api/screen/adventure-map/one", caption: "Public map caption" });
  const shown = await request(screen.url, "GET", undefined, false);
  assert.equal(shown.status, 200);
  assert.match(shown.headers.get("content-type"), /^image\/png/);
  assert.equal(shown.headers.get("cache-control"), "no-store");
  assert.deepEqual(Buffer.from(await shown.arrayBuffer()), image);
  assert.equal((await request("/api/screen/adventure-map/two", "GET", undefined, false)).status, 404);
  for (const route of ["/api/table", "/api/lore"]) {
    const publicText = await (await request(route, "GET", undefined, false)).text();
    assert(!publicText.includes("PRIVATE_"), route);
  }
  await request("/api/screen", "PUT", { type: null });
  assert.equal((await request(screen.url, "GET", undefined, false)).status, 404);
  save("adventures.json", { adventures: [{ ...adventure("one", "one.png"), name: "Updated without restart" }] });
  assert.equal((await (await request("/api/adventures")).json()).adventures[0].name, "Updated without restart");
});
