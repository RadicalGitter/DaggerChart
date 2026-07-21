import test from "node:test";
import assert from "node:assert/strict";
import {
  beaconTargets,
  beaconIntervalMs,
  duckdnsUrl,
  gistPayload,
  publishOnce
} from "../server/beacon.js";

test("no targets are configured without env, both are with full env", () => {
  assert.deepEqual(beaconTargets({}), []);
  const targets = beaconTargets({
    BEACON_DUCKDNS_DOMAIN: "https://mytable.duckdns.org/",
    BEACON_DUCKDNS_TOKEN: "duck-token",
    BEACON_GIST_ID: "abc123",
    BEACON_GITHUB_TOKEN: "ghp_x"
  });
  assert.equal(targets.length, 2);
  // The domain suffix and scheme are stripped to the bare label.
  assert.equal(targets.find((t) => t.kind === "duckdns").domain, "mytable");
});

test("a half-configured target is ignored", () => {
  assert.deepEqual(beaconTargets({ BEACON_DUCKDNS_DOMAIN: "x" }), []);
  assert.deepEqual(beaconTargets({ BEACON_GIST_ID: "x" }), []);
});

test("the interval clamps to a sane range with a default", () => {
  assert.equal(beaconIntervalMs({}), 15 * 60_000);
  assert.equal(beaconIntervalMs({ BEACON_INTERVAL_MINUTES: "0" }), 15 * 60_000);
  assert.equal(beaconIntervalMs({ BEACON_INTERVAL_MINUTES: "5" }), 5 * 60_000);
  assert.equal(beaconIntervalMs({ BEACON_INTERVAL_MINUTES: "99999" }), 24 * 60 * 60_000);
});

test("the DuckDNS url and gist payload carry the resolved address", () => {
  const url = new URL(duckdnsUrl({ domain: "mytable", token: "tok" }, "203.0.113.7"));
  assert.equal(url.searchParams.get("domains"), "mytable");
  assert.equal(url.searchParams.get("ip"), "203.0.113.7");

  const payload = gistPayload({ ip: "203.0.113.7", port: 4626, updatedAt: "t" });
  const parsed = JSON.parse(payload.files["settlement-address.json"].content);
  assert.equal(parsed.ip, "203.0.113.7");
  assert.equal(parsed.port, 4626);
});

test("publishOnce looks up the IP and reports per-target outcomes", async () => {
  const calls = [];
  const fetchImpl = async (url, options = {}) => {
    calls.push(url);
    if (url.startsWith("https://api.ipify.org")) return { ok: true, json: async () => ({ ip: "203.0.113.7" }) };
    if (url.startsWith("https://www.duckdns.org")) return { ok: true, text: async () => "OK" };
    if (url.startsWith("https://api.github.com")) return { ok: true, json: async () => ({}) };
    throw new Error(`unexpected ${url}`);
  };
  const targets = beaconTargets({
    BEACON_DUCKDNS_DOMAIN: "mytable",
    BEACON_DUCKDNS_TOKEN: "tok",
    BEACON_GIST_ID: "abc",
    BEACON_GITHUB_TOKEN: "ghp_x"
  });
  const result = await publishOnce(targets, { port: 4626, fetchImpl });
  assert.equal(result.address.ip, "203.0.113.7");
  assert.equal(result.targets.length, 2);
  assert.ok(result.targets.every((t) => t.ok));
});

test("a failed target is isolated and never throws", async () => {
  const fetchImpl = async (url) => {
    if (url.startsWith("https://api.ipify.org")) return { ok: true, json: async () => ({ ip: "203.0.113.7" }) };
    if (url.startsWith("https://www.duckdns.org")) return { ok: true, text: async () => "KO" };
    throw new Error("unexpected");
  };
  const targets = beaconTargets({ BEACON_DUCKDNS_DOMAIN: "mytable", BEACON_DUCKDNS_TOKEN: "tok" });
  const result = await publishOnce(targets, { port: 4626, fetchImpl });
  assert.equal(result.targets[0].ok, false);
  assert.match(result.targets[0].error, /DuckDNS declined/);
});

test("publishOnce reports an IP-lookup failure without throwing", async () => {
  const fetchImpl = async () => { throw new Error("offline"); };
  const targets = beaconTargets({ BEACON_DUCKDNS_DOMAIN: "mytable", BEACON_DUCKDNS_TOKEN: "tok" });
  const result = await publishOnce(targets, { port: 4626, fetchImpl });
  assert.match(result.error, /Public IP lookup failed/);
});
