// Address beacon: publishes the server's current public IP and port so player
// devices can find it after the GM's home IP changes. Off unless configured
// through the environment (.env.local). Two optional targets, both tiny:
//
//   DuckDNS   — updates a free hostname (BEACON_DUCKDNS_DOMAIN + _TOKEN).
//               Recommended: a stable name keeps installed PWAs working across
//               IP changes and unlocks Let's Encrypt HTTPS on that name.
//   Gist      — patches a private GitHub gist (BEACON_GIST_ID + _GITHUB_TOKEN)
//               with settlement-address.json — the GM's "password-protected
//               note" of the current address.
//
// The beacon never crashes the server: every failure is logged and swallowed.
// Target-building and payload shaping are pure so they can be tested offline.

const IP_LOOKUP_URL = "https://api.ipify.org?format=json";
const GIST_FILENAME = "settlement-address.json";

function cleanDomain(value) {
  // DuckDNS wants the subdomain label(s) without the .duckdns.org suffix.
  return String(value || "").trim().replace(/^https?:\/\//, "").replace(/\.duckdns\.org.*$/i, "").replace(/[^a-z0-9.-]/gi, "");
}

// Which publishers are configured, given an environment. Pure — no I/O.
export function beaconTargets(env = process.env) {
  const targets = [];
  const duckDomain = cleanDomain(env.BEACON_DUCKDNS_DOMAIN);
  if (duckDomain && env.BEACON_DUCKDNS_TOKEN) {
    targets.push({ kind: "duckdns", domain: duckDomain, token: env.BEACON_DUCKDNS_TOKEN });
  }
  const gistId = String(env.BEACON_GIST_ID || "").trim();
  if (gistId && env.BEACON_GITHUB_TOKEN) {
    targets.push({ kind: "gist", gistId, token: env.BEACON_GITHUB_TOKEN });
  }
  return targets;
}

export function beaconIntervalMs(env = process.env) {
  const minutes = Number(env.BEACON_INTERVAL_MINUTES);
  if (!Number.isFinite(minutes) || minutes < 1) return 15 * 60_000;
  return Math.min(24 * 60, Math.round(minutes)) * 60_000;
}

// The gist body for a resolved address. Pure.
export function gistPayload(address) {
  return {
    files: {
      [GIST_FILENAME]: {
        content: JSON.stringify(address, null, 2) + "\n"
      }
    }
  };
}

// The DuckDNS update URL for a target + ip. Pure. DuckDNS derives IPv4 from the
// caller when ip is blank, but we pass the looked-up address explicitly.
export function duckdnsUrl(target, ip) {
  const params = new URLSearchParams({ domains: target.domain, token: target.token, ip: ip || "" });
  return `https://www.duckdns.org/update?${params.toString()}`;
}

async function publishOne(target, address, fetchImpl) {
  if (target.kind === "duckdns") {
    const response = await fetchImpl(duckdnsUrl(target, address.ip), { method: "GET" });
    const text = (await response.text()).trim();
    if (text !== "OK") throw new Error(`DuckDNS declined the update (${text || response.status}).`);
    return `duckdns:${target.domain}.duckdns.org`;
  }
  if (target.kind === "gist") {
    const response = await fetchImpl(`https://api.github.com/gists/${encodeURIComponent(target.gistId)}`, {
      method: "PATCH",
      headers: {
        "authorization": `Bearer ${target.token}`,
        "accept": "application/vnd.github+json",
        "content-type": "application/json",
        "user-agent": "settlement-beacon"
      },
      body: JSON.stringify(gistPayload(address))
    });
    if (!response.ok) throw new Error(`Gist update failed (${response.status}).`);
    return `gist:${target.gistId}`;
  }
  throw new Error(`Unknown beacon target ${target.kind}.`);
}

// Resolve the public IP, then publish to every configured target. Returns the
// address and per-target outcomes; never throws.
export async function publishOnce(targets, { port, fetchImpl = globalThis.fetch } = {}) {
  if (!targets.length) return { skipped: true, targets: [] };
  let ip = null;
  try {
    const response = await fetchImpl(IP_LOOKUP_URL);
    ip = String((await response.json())?.ip || "").trim() || null;
  } catch (error) {
    return { error: `Public IP lookup failed: ${error.message}`, targets: [] };
  }
  if (!ip) return { error: "Public IP lookup returned nothing.", targets: [] };

  const address = { ip, port, updatedAt: new Date().toISOString() };
  const results = await Promise.all(targets.map(async (target) => {
    try {
      return { ok: true, target: target.kind, where: await publishOne(target, address, fetchImpl) };
    } catch (error) {
      return { ok: false, target: target.kind, error: error.message };
    }
  }));
  return { address, targets: results };
}

// Start the recurring beacon if any target is configured. Safe to call always;
// a no-op when unconfigured. Returns a stop() handle (mainly for tests).
export function startBeacon({ port, env = process.env } = {}) {
  const targets = beaconTargets(env);
  if (!targets.length) return { stop() {} };

  const kinds = targets.map((target) => target.kind).join(", ");
  const run = () => {
    void publishOnce(targets, { port }).then((result) => {
      if (result.error) return console.warn(`Address beacon: ${result.error}`);
      for (const outcome of result.targets) {
        if (outcome.ok) console.log(`Address beacon: published ${result.address.ip}:${port} to ${outcome.where}`);
        else console.warn(`Address beacon: ${outcome.target} failed — ${outcome.error}`);
      }
    }).catch((error) => console.warn(`Address beacon: ${error.message}`));
  };

  console.log(`Address beacon on (${kinds}), every ${Math.round(beaconIntervalMs(env) / 60_000)} min.`);
  run();
  const timer = setInterval(run, beaconIntervalMs(env));
  timer.unref?.();
  return { stop() { clearInterval(timer); } };
}
