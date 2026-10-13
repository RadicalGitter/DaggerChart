import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { hashGmPassword } from "../server/access.js";

const root = fileURLToPath(new URL("..", import.meta.url));

test("play flows persist and public views protect private data over HTTP", { timeout: 30000 }, async () => {
  // Entirely synthetic campaign and tables. Never resolve against real data.
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "settlement-http-"));
  const save = (name, value) => {
    const target = path.join(dir, name);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, JSON.stringify(value));
  };
  const campaignId = "cmp_preflight";
  save("campaigns.json", { currentId: campaignId, campaigns: [{ id: campaignId, name: "Test", status: "active" }] });
  save("pcs.json", ["one", "two"].map((id) => ({
    id: `pc_${id}`, campaignId, name: `Test ${id}`, level: 1,
    hp: 0, hpMax: 6, stress: 0, stressMax: 6, hope: 2, hopeMax: 6,
    class: { id: "warrior", name: "Warrior", domains: [] }, inventory: [],
    hidden: { notes: "PRIVATE_PC_SENTINEL" }
  })));
  save("characters.json", [{ id: "npc_test", name: "Test foreman", status: "alive",
    description: "Public description", hidden: { inspiration: 1, penalty: -1, notes: "PRIVATE_FOLK_SENTINEL" } }]);
  save("settlement.json", { name: "Test", population: 50, season: { name: "Spring", year: 1 },
    constructionVersion: 1, resources: { Lumber: 10 }, buildings: {
      lumber_camp: { id: "lumber_camp", name: "Test camp", resource: "Lumber", level: 1,
        constructed: true, foremanId: "npc_test", spent: [], effects: [], producedTotal: 0 }
    } });
  save("event-tables/dummy.json", { buildings: { lumber_camp: { name: "Test camp", resource: "Lumber",
    results: Object.fromEntries(Array.from({ length: 31 }, (_, n) => [n, {
      tier: "Test", resource: 3, event: `DUMMY_EVENT_${n}`
    }])) } } });
  save("tables/dummy.json", { id: "dummy", name: "Test chance table", die: 2, entries: {
    1: { text: "DUMMY_CHANCE_ONE", reward: "Dummy reward" },
    2: { text: "DUMMY_CHANCE_TWO" }
  } });
  save("daggerheart/rules.json", { nodes: [
    { id: "test_attack", title: "Test attack", path: ["Test"], body: "Dummy public rule." },
    { id: "test_rest", title: "Test rest", path: ["Test"], body: "Another dummy public rule." }
  ] });
  save("portrait-workflow.json", {
    "1": { class_type: "CLIPTextEncode", inputs: { text: "{{prompt}}" } },
    "2": { class_type: "TextEncodeQwenImage21", inputs: { prompt: "{{prompt}}", "images.image_1": ["4", 0] } },
    "3": { class_type: "LoadImagesFromURL", inputs: { url: "" } },
    "4": { class_type: "ComfySwitchNode", inputs: { switch: false, on_true: ["3", 0] } }
  });

  let generatorOnline = false;
  let queuedPortraits = 0;
  const generator = http.createServer(async (req, res) => {
    res.setHeader("Content-Type", "application/json");
    if (req.url === "/system_stats") {
      res.statusCode = generatorOnline ? 200 : 503;
      return res.end(JSON.stringify({ system: {}, devices: [] }));
    }
    if (req.method === "POST" && req.url === "/upload/image") {
      for await (const _chunk of req) { /* Consume the synthetic reference. */ }
      return res.end(JSON.stringify({ name: "dummy-reference.png", subfolder: "" }));
    }
    if (req.method === "POST" && req.url === "/prompt") {
      for await (const _chunk of req) { /* Consume the synthetic graph. */ }
      queuedPortraits++;
      return res.end(JSON.stringify({ prompt_id: "dummy-portrait" }));
    }
    if (req.url === "/history/dummy-portrait") {
      return res.end(JSON.stringify({ "dummy-portrait": { outputs: {
        "1": { images: [{ filename: "dummy.png", subfolder: "", type: "output" }] }
      } } }));
    }
    if (req.url.startsWith("/view?")) {
      res.setHeader("Content-Type", "image/png");
      return res.end(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
    }
    res.statusCode = 404;
    res.end();
  });
  await new Promise((resolve) => generator.listen(0, "127.0.0.1", resolve));

  let child;
  const start = async (access = {}) => {
    child = spawn(process.execPath, ["--input-type=module", "-e",
      'import http from "node:http"; const listen = http.Server.prototype.listen; http.Server.prototype.listen = function (...args) { this.once("listening", () => console.log("TEST_PORT=" + this.address().port)); return listen.apply(this, args); }; await import("./server/env.js"); const { artWorkshop } = await import("./server/art.js"); artWorkshop.publicRoot = process.env.TEST_ART_ROOT; await import("./server/index.js");'
    ], { cwd: root, windowsHide: true, env: { ...process.env, DATA_DIR: dir, PORT: "0",
      MUSIC_LIBRARY_DIR: path.join(dir, "audio"), SUNO_API_KEY: "", ANTHROPIC_API_KEY: "",
      COMFYUI_URL: `http://127.0.0.1:${generator.address().port}`,
      COMFYUI_CHARACTER_WORKFLOW: path.join(dir, "portrait-workflow.json"), TEST_ART_ROOT: path.join(dir, "art"),
      SETTLEMENT_STOP_FILE: path.join(dir, "settlement.stop"),
      BEACON_DUCKDNS_DOMAIN: "", BEACON_GIST_ID: "", TABLE_SESSION_KEY: "", TABLE_GM_PASSWORD_HASH: "",
      ...access }, stdio: ["ignore", "pipe", "pipe"] });
    let output = "";
    let errors = "";
    child.stderr.on("data", (chunk) => { errors += chunk; });
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("Scratch server startup timed out")), 8000);
      child.once("error", (error) => { clearTimeout(timer); reject(error); });
      child.once("exit", () => { clearTimeout(timer); reject(new Error(`Scratch server exited: ${errors}`)); });
      child.stdout.on("data", (chunk) => {
        output += chunk;
        const match = output.match(/TEST_PORT=(\d+)/);
        if (match) { clearTimeout(timer); resolve(`http://127.0.0.1:${match[1]}`); }
      });
    });
  };
  const stop = async () => {
    if (child && child.exitCode === null && child.signalCode === null) {
      const exited = once(child, "exit");
      child.kill();
      await exited;
    }
  };
  try {
    let base = await start();
    const request = async (route, method = "GET", body, expected = 200) => {
      const response = await fetch(base + route, { method, signal: AbortSignal.timeout(5000),
        headers: { "Content-Type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
      assert.equal(response.status, expected, `${method} ${route}`);
      return response.json();
    };
    const publicView = await request("/api/table");
    assert.ok(!JSON.stringify(publicView).includes("PRIVATE_"));
    assert.ok(!JSON.stringify(publicView).includes("DUMMY_EVENT_"));
    const sheet = await request("/api/party/pc_one", "PUT", { hp: 2 });
    assert.equal(sheet.hp, 2);
    assert.equal(Object.hasOwn(sheet, "hidden"), false);
    assert.deepEqual(await request("/api/party/pc_one/rule-pins"), { pins: [] });
    assert.deepEqual(await request("/api/party/pc_one/rule-pins", "PUT", { ruleId: "test_attack", pinned: true }), { pins: ["test_attack"] });
    // Incremental updates preserve pins set by another device and deduplicate retries.
    await request("/api/party/pc_one/rule-pins", "PUT", { ruleId: "test_rest", pinned: true });
    assert.deepEqual(await request("/api/party/pc_one/rule-pins", "PUT", { ruleId: "test_attack", pinned: true }), { pins: ["test_attack", "test_rest"] });
    assert.deepEqual(await request("/api/party/pc_two/rule-pins"), { pins: [] });
    for (const body of [{ ruleId: "unknown", pinned: true }, { ruleId: "test_attack", pinned: "yes" }, { pins: ["test_attack"] }]) {
      await request("/api/party/pc_one/rule-pins", "PUT", body, 400);
    }
    for (const route of ["/api/table", "/api/party", "/api/party/pc_one", "/api/lore?pc=pc_two"]) {
      assert.ok(!JSON.stringify(await request(route)).includes("rulePins"), route);
    }
    const pinRead = await fetch(base + "/api/party/pc_one/rule-pins");
    assert.equal(pinRead.headers.get("cache-control"), "private, no-store");
    await request("/api/notes", "POST", { kind: "journal", scope: "personal", pcId: "pc_one", text: "PRIVATE_NOTE_SENTINEL" });
    await request("/api/messages", "POST", { pcId: "pc_one", from: "player", text: "PRIVATE_MESSAGE_SENTINEL" });
    assert.ok(JSON.stringify(await request("/api/lore?pc=pc_one")).includes("PRIVATE_NOTE_SENTINEL"));
    for (const route of ["/api/table", "/api/lore", "/api/lore?pc=pc_two", "/api/messages?pc=pc_two"]) {
      assert.ok(!JSON.stringify(await request(route)).includes("PRIVATE_"), route);
    }
    assert.equal((await request("/api/messages?pc=pc_one")).messages.length, 1);
    await request("/api/screen", "PUT", { type: "folk", refId: "npc_test" });
    const projection = JSON.stringify(await request("/api/screen"));
    // The table screen shows a card's name and picture only: no description.
    assert.ok(projection.includes("Test foreman"));
    assert.ok(!projection.includes("Public description"));
    assert.ok(!projection.includes("PRIVATE_"));
    const metadata = JSON.stringify(await request("/api/gm/tables"));
    assert.ok(!metadata.includes("DUMMY_CHANCE_"));
    assert.ok(!metadata.includes('"entries"'));
    const chance = await request("/api/gm/tables/dummy/roll", "POST", { raw: 1 });
    assert.equal(chance.entry.text, "DUMMY_CHANCE_ONE");
    assert.ok(!JSON.stringify(chance).includes("DUMMY_CHANCE_TWO"));
    assert.equal((await request("/api/gm/tables/dummy/roll", "POST", { raw: 1 })).seenBefore, true);
    const roll = await request("/api/downtime/resolve", "POST", { buildingId: "lumber_camp", raw: 10 });
    assert.equal(roll.final, 11);
    assert.equal(roll.event, "DUMMY_EVENT_11");
    const repeat = await request("/api/downtime/resolve", "POST", { buildingId: "lumber_camp", raw: 10 });
    assert.equal(repeat.event, null);
    assert.equal(repeat.alreadySpent, true);
    assert.equal(repeat.pools.Lumber, 16);
    assert.ok(fs.readdirSync(path.join(dir, "backups")).length > 0);
    await stop();
    base = await start();
    assert.equal((await request("/api/party/pc_one")).hp, 2);
    assert.deepEqual(await request("/api/party/pc_one/rule-pins"), { pins: ["test_attack", "test_rest"] });
    assert.equal((await request("/api/messages?pc=pc_one")).messages.length, 1);
    await request("/api/party/pc_one", "DELETE");
    await request("/api/party/pc_one/rule-pins", "GET", undefined, 400);
    await request("/api/party/pc_one/rule-pins", "PUT", { ruleId: "test_attack", pinned: false }, 400);
    await request("/api/messages?pc=pc_one", "GET", undefined, 400);
    await request("/api/party/pc_one/portrait-workshop", "GET", undefined, 400);
    await request("/api/party/pc_one/portrait-workshop", "POST", { prompt: "Dummy retired portrait" }, 400);
    assert.ok(!(await request("/api/party")).some((pc) => pc.id === "pc_one"));
    await request("/api/party/pc_one/restore", "POST", {});
    assert.deepEqual(await request("/api/party/pc_one/rule-pins"), { pins: ["test_attack", "test_rest"] });
    assert.equal((await request("/api/messages?pc=pc_one")).messages.length, 1);
    await stop();
    base = await start({ TABLE_SESSION_KEY: "test-session-key-at-least-32-characters", TABLE_GM_PASSWORD_HASH: hashGmPassword("test-gm-password") });
    assert.equal((await fetch(base + "/login/")).status, 200);
    assert.equal((await request("/api/party")).length, 2);
    // The optional GM password never prevents players from managing their own pins.
    assert.deepEqual(await request("/api/party/pc_one/rule-pins"), { pins: ["test_attack", "test_rest"] });
    assert.deepEqual(await request("/api/party/pc_one/rule-pins", "PUT", { ruleId: "test_attack", pinned: false }), { pins: ["test_rest"] });
    assert.deepEqual(await request("/api/party/pc_two/rule-pins", "PUT", { ruleId: "test_attack", pinned: true }), { pins: ["test_attack"] });
    assert.deepEqual(await request("/api/party/pc_one/rule-pins"), { pins: ["test_rest"] });
    for (const route of ["/api/state", "/api/messages/gm", "/api/gm/tables", "/api/feedback", "/api/telemetry", "/api/board", "/api/music", "/api/art/library", "/API/STATE"]) {
      await request(route, "GET", undefined, 403);
    }
    for (const [route, method, body] of [
      ["/api/downtime/resolve", "POST", { buildingId: "lumber_camp", raw: 10 }],
      ["/api/screen", "PUT", { type: null }],
      ["/api/party/pc_one", "DELETE", undefined],
      ["/api/party/pc_one", "PUT", { active: false }],
      ["/api/party/pc_one", "PUT", { rulePins: ["unknown"] }],
      ["/api/messages", "POST", { pcId: "pc_one", from: "gm", text: "forged" }],
      ["/api/messages/read", "PUT", { pcId: "pc_one", side: "gm" }]
    ]) await request(route, method, body, 403);
    assert.equal((await request("/api/party/pc_one", "PUT", { hp: 3 })).hp, 3);
    const gmPage = await fetch(base + "/gm/", { redirect: "manual" });
    assert.equal(gmPage.status, 303);
    assert.ok(gmPage.headers.get("location").startsWith("/access/gm"));
    const login = (password, origin) => fetch(base + "/access/gm", { method: "POST", redirect: "manual",
      headers: { "Content-Type": "application/x-www-form-urlencoded", ...(origin ? { Origin: origin } : {}) },
      body: new URLSearchParams({ password, next: "/gm/" }) });
    assert.equal((await login("wrong")).status, 401);
    assert.equal((await login("test-gm-password", "https://foreign.invalid")).status, 403);
    const admitted = await login("test-gm-password");
    assert.equal(admitted.status, 303);
    const setCookie = admitted.headers.get("set-cookie");
    assert.match(setCookie, /HttpOnly/i);
    assert.match(setCookie, /SameSite=Strict/i);
    const sessionCookie = setCookie.split(";")[0];
    assert.equal((await request("/api/art/status")).generation.reason, "generator-offline");
    for (const route of ["/api/art/portrait", "/api/party/pc_one/portrait"]) {
      const unavailable = await request(route, "POST", { draftId: "draft_test_offline", prompt: "Dummy portrait" }, 503);
      assert.equal(unavailable.errorKey, "portrait.unavailable");
      assert.equal(unavailable.reason, "generator-offline");
      assert.match(unavailable.error, /Ask Oscar at the start of the session/);
    }
    assert.equal(queuedPortraits, 0);
    // Public player requests can generate with healthy ComfyUI and no GM page.
    generatorOnline = true;
    assert.equal((await request("/api/art/status")).generation.ready, true);
    const portrait = await request("/api/art/portrait", "POST", { draftId: "draft_test_online", prompt: "Dummy portrait" });
    assert.match(portrait.url, /^\/generated\/art\/portrait\//);
    assert.equal(queuedPortraits, 1);
    assert.equal(fs.existsSync(path.join(dir, "art", portrait.url)), true);
    // The same public player can revisit portraits after character creation.
    assert.equal((await fetch(base + "/portrait/?pc=pc_one")).status, 200);
    let studio = await request("/api/party/pc_one/portrait-workshop");
    assert.equal(studio.workshop.portrait, null);
    assert.ok(!JSON.stringify(studio).includes("PRIVATE_"));
    const partyCount = (await request("/api/party")).length;
    const generated = await request("/api/party/pc_one/portrait-workshop", "POST", { prompt: "Dummy post-creation portrait", hp: 999 });
    assert.equal((await request("/api/party/pc_one")).portrait, null);
    assert.equal((await request("/api/party/pc_one")).hp, 3);
    studio = await request("/api/party/pc_one/portrait-workshop", "PUT", { action: "keep", pendingId: generated.workshop.pending.id });
    const original = studio.workshop.portrait;
    const edited = await request("/api/party/pc_one/portrait-workshop", "POST", { prompt: "Dummy cloak change", referenceImageUrl: original });
    assert.equal((await request("/api/party/pc_one")).portrait, original);
    await request("/api/party/pc_one/portrait-workshop", "PUT", { action: "keep", pendingId: "stale" }, 400);
    await request("/api/party/pc_one/portrait-workshop", "PUT", { action: "keep", pendingId: edited.workshop.pending.id });
    studio = await request("/api/party/pc_one/portrait-workshop");
    assert.equal(studio.workshop.request.referenceImageUrl, edited.url);
    await request("/api/party/pc_one/portrait-workshop", "PUT", { action: "restore" });
    assert.equal((await request("/api/party/pc_one")).portrait, original);
    const discarded = await request("/api/party/pc_one/portrait-workshop", "POST", { prompt: "Another dummy cloak change", referenceImageUrl: original });
    await request("/api/party/pc_one/portrait-workshop", "PUT", { action: "discard", pendingId: discarded.workshop.pending.id });
    assert.equal((await request("/api/party/pc_one")).portrait, original);
    assert.equal((await request("/api/party")).length, partyCount);
    for (const route of ["/api/table", "/api/party", "/api/party/pc_one", "/api/lore?pc=pc_two"]) {
      assert.ok(!JSON.stringify(await request(route)).includes("Dummy post-creation portrait"));
    }
    await request("/api/party/pc_retired/portrait-workshop", "GET", undefined, 400);
    await request("/api/party/pc_retired/portrait-workshop", "POST", { prompt: "Dummy" }, 400);
    await request("/api/party/pc_retired/portrait-workshop", "PUT", { action: "restore" }, 400);
    generatorOnline = false;
    const gmRead = await fetch(base + "/api/state", { headers: { Cookie: sessionCookie } });
    assert.equal(gmRead.status, 200);
    const forged = sessionCookie.replace(/.$/, (char) => char === "a" ? "b" : "a");
    assert.equal((await fetch(base + "/api/state", { headers: { Cookie: forged } })).status, 403);
    const crossSite = await fetch(base + "/api/screen", { method: "PUT", headers: {
      Cookie: sessionCookie, Origin: "https://foreign.invalid", "Content-Type": "application/json"
    }, body: JSON.stringify({ type: null }) });
    assert.equal(crossSite.status, 403);
    for (let i = 0; i < 8; i++) assert.equal((await login("wrong")).status, 401);
    assert.equal((await login("wrong")).status, 429);
    // Exercise the keeper's graceful stop protocol only on this scratch server.
    const exited = once(child, "exit");
    fs.writeFileSync(path.join(dir, "settlement.stop"), "stop");
    const [exitCode] = await exited;
    assert.equal(exitCode, 0);
  } finally {
    await stop();
    await new Promise((resolve) => generator.close(resolve));
    // dir is the exact mkdtemp-owned path; it contains no external directory links.
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
