import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { hashGmPassword } from "../server/access.js";
import { INVENTOR } from "../server/inventor-definition.js";

const root = fileURLToPath(new URL("..", import.meta.url));

test("class offers remain private to targeted PCs and confirmation persists over HTTP/restart", { timeout: 30000 }, async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "settlement-class-choice-"));
  const save = (name, value) => {
    const target = path.join(dir, name);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, JSON.stringify(value));
  };
  const campaignId = "cmp_class_test";
  save("campaigns.json", { currentId: campaignId, campaigns: [{ id: campaignId, name: "Synthetic campaign", status: "active" }] });
  const pcs = ["rigger", "fieldwright", "keep", "other", "retired"].map((name) => ({
    id: `pc_${name}`, name: `Synthetic ${name}`, campaignId, level: 1, active: name !== "retired",
    class: { id: "core_class_seraph", name: "Seraph", domains: ["SPLENDOR", "VALOR"] },
    subclass: { id: "core_subclass_winged_sentinel", name: "Winged Sentinel", spellcastTrait: "Strength" },
    traits: { Presence: 2, Strength: 0 }, evasion: 9, hpMax: 7, hp: 3, stressMax: 6, stress: 2, hopeMax: 6, hope: 1, armorMarked: 2,
    inventory: [{ id: "rope", name: "Dummy rope" }], domainCards: [{ id: "card", name: "Dummy card", location: "vault" }],
    features: { foundation: [{ name: "Wings of Light", text: "Dummy baseline flight" }], ancestry: [{ name: "Dummy ancestry" }] },
    hidden: { notes: "PRIVATE_TEST_SENTINEL" }
  }));
  save("pcs.json", pcs);
  const offers = pcs.filter((pc) => pc.id !== "pc_other").map((pc) => ({
    id: `offer_${pc.id}`, pcId: pc.id, version: "1", definitions: [{ id: INVENTOR.id, version: INVENTOR.version }],
    expectedClassId: pc.class.id, expectedSubclassId: pc.subclass.id, expectedLevel: 1, recommendedTrait: "Presence"
  }));
  save("character-class-offers.json", { offers });
  save("daggerheart/reference.json", { classes: [{ id: "core_class_seraph", name: "Seraph", subclasses: [] }], domainCards: [] });
  // All campaign data is synthetic. No real event or chance table is read.
  save("event-tables/dummy.json", { buildings: {} });
  let child;
  let base;
  const start = async () => {
    child = spawn(process.execPath, ["--input-type=module", "-e", 'import http from "node:http"; const listen = http.Server.prototype.listen; http.Server.prototype.listen = function (...args) { this.once("listening", () => console.log("TEST_PORT=" + this.address().port)); return listen.apply(this, args); }; await import("./server/index.js");'], {
      cwd: root, windowsHide: true, stdio: ["ignore", "pipe", "pipe"],
      env: { ...process.env, DATA_DIR: dir, PORT: "0", MUSIC_LIBRARY_DIR: path.join(dir, "audio"), SUNO_API_KEY: "", ANTHROPIC_API_KEY: "", BEACON_DUCKDNS_DOMAIN: "", BEACON_GIST_ID: "", SETTLEMENT_STOP_FILE: "", TABLE_SESSION_KEY: "synthetic-class-test-key-at-least-32-chars", TABLE_GM_PASSWORD_HASH: hashGmPassword("test-only-password") }
    });
    let output = "", errors = "";
    child.stderr.on("data", (chunk) => { errors += chunk; });
    base = await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("Scratch server timed out")), 8000);
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
      const exited = once(child, "exit"); child.kill(); await exited;
    }
  };
  const request = async (route, method = "GET", body, status = 200) => {
    const response = await fetch(base + route, { method, signal: AbortSignal.timeout(5000), headers: { "Content-Type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
    assert.equal(response.status, status, `${method} ${route}`);
    return response.json();
  };
  const input = (pcId, choiceId) => ({ offerId: `offer_${pcId}`, version: "1", choiceId, confirmed: true, trait: "Presence", familiarMaterials: ["Aspträ", "Smidesjärn"] });
  try {
    await start();
    const before = fs.readFileSync(path.join(dir, "pcs.json"), "utf8");
    for (let i = 0; i < 2; i++) assert.equal((await request("/api/party/pc_rigger/class-choice")).status, "pending");
    assert.equal(fs.readFileSync(path.join(dir, "pcs.json"), "utf8"), before);
    const response = await fetch(base + "/api/party/pc_rigger/class-choice");
    assert.equal(response.headers.get("cache-control"), "private, no-store");
    assert.equal(await request("/api/party/pc_other/class-choice"), null);
    await request("/api/party/pc_retired/class-choice", "GET", undefined, 400);
    for (const route of ["/api/reference", "/api/party", "/api/table", "/api/party/pc_other"]) {
      const view = JSON.stringify(await request(route));
      assert.ok(!view.includes(INVENTOR.id), route);
      assert.ok(!view.includes("Prepared Parts"), route);
      assert.ok(!view.includes("PRIVATE_TEST_SENTINEL"), route);
      assert.ok(!view.includes("classChoice"), route);
    }
    await request("/api/party/pc_other/class-choice", "POST", input("pc_rigger", INVENTOR.subclasses[0].id), 400);
    await request("/api/party/pc_rigger/class-choice", "POST", { ...input("pc_rigger", INVENTOR.subclasses[0].id), confirmed: false }, 400);
    await request("/api/party/pc_rigger/class-choice", "POST", { ...input("pc_rigger", INVENTOR.subclasses[0].id), version: "old" }, 400);
    await request("/api/party/pc_rigger", "PUT", { classChoice: { offerId: "forged" } }, 403);
    await request("/api/party", "POST", { name: "Forged", class: { id: INVENTOR.id } }, 400);
    assert.equal(fs.readFileSync(path.join(dir, "pcs.json"), "utf8"), before);
    const adopted = await request("/api/party/pc_rigger/class-choice", "POST", input("pc_rigger", INVENTOR.subclasses[0].id));
    assert.equal(adopted.class.id, INVENTOR.id);
    assert.equal(adopted.subclass.spellcastTrait, "Presence");
    assert.equal(adopted.hp, 3); assert.equal(adopted.hope, 1); assert.equal(adopted.stress, 2); assert.equal(adopted.armorMarked, 2);
    assert.equal(adopted.features.ancestry[0].name, "Dummy ancestry");
    assert.equal(adopted.features.specialization.length, 0); assert.equal(adopted.features.mastery.length, 0);
    assert.ok(adopted.features.classFeatures[0].sv.text.includes("spelmöte"));
    assert.equal(Object.hasOwn(adopted, "classChoice"), false);
    assert.equal(Object.hasOwn(adopted, "classChoiceHistory"), false);
    assert.equal(JSON.stringify(adopted).includes("PRIVATE_TEST_SENTINEL"), false);
    const updated = await request("/api/party/pc_rigger", "PUT", { hp: 4 });
    const duplicate = await request("/api/party/pc_rigger/class-choice", "POST", input("pc_rigger", INVENTOR.subclasses[0].id));
    assert.equal(duplicate.hp, updated.hp);
    await request("/api/party/pc_rigger/class-choice", "POST", input("pc_rigger", "keep-current"), 400);
    const kept = await request("/api/party/pc_keep/class-choice", "POST", input("pc_keep", "keep-current"));
    assert.equal(kept.class.id, "core_class_seraph");
    assert.equal(await request("/api/party/pc_keep/class-choice"), null);
    assert.equal((await request("/api/party/pc_fieldwright/class-choice")).status, "pending");
    await stop(); await start();
    assert.equal((await request("/api/party/pc_rigger/class-choice")).status, "confirmed");
    assert.equal((await request("/api/party/pc_rigger")).hp, 4);
    assert.equal(await request("/api/party/pc_keep/class-choice"), null);
    assert.equal((await request("/api/party/pc_fieldwright/class-choice")).status, "pending");
    const field = await request("/api/party/pc_fieldwright/class-choice", "POST", input("pc_fieldwright", INVENTOR.subclasses[1].id));
    assert.equal(field.subclass.id, INVENTOR.subclasses[1].id);
    assert.equal(field.features.foundation[0].name, "Shared Shelter");
    assert.ok(!JSON.stringify(await request("/api/party/pc_other")).includes("Prepared Parts"));
  } finally {
    await stop();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
