# Remote access — reaching the settlement from outside the LAN

The server is built for **one trusted table on a LAN**: no auth, `?pc=` is
honored on trust, `/gm` is open to anyone who can reach it. That is fine on a
home network. Exposing it to the internet changes the threat model, so this
document separates **what already works today** from **what must be built
before the port is opened**.

Today the players can already use everything away from the table *if they are
on the LAN or a VPN* (see Tailscale below). The word-weaving credit meter and
the address beacon shipped so out-of-play use — especially the background
studio — is safe and reachable. Opening a public port is the remaining step,
and it is gated.

## The address beacon (built, off by default)

`server/beacon.js` publishes the server's current public IP and port on a
timer so devices can find it after the home IP changes. Configure it in
`.env.local` (see `.env.local.example`); with nothing configured it is a no-op.

- **DuckDNS (recommended).** `BEACON_DUCKDNS_DOMAIN` + `BEACON_DUCKDNS_TOKEN`.
  A free stable hostname (`yourtable.duckdns.org`) is worth far more than a
  raw IP note: an installed PWA is bound to its origin, so a fixed hostname
  keeps everyone's installed app working across IP changes, and it is what
  Let's Encrypt issues an HTTPS certificate against.
- **Private gist.** `BEACON_GIST_ID` + `BEACON_GITHUB_TOKEN` (a token scoped to
  `gist` only). The server PATCHes `settlement-address.json` into the gist —
  the GM's "password-protected note" of the current address. Use this as a
  fallback or audit trail; prefer DuckDNS as the thing players actually point
  their devices at.

The beacon publishes at boot and every `BEACON_INTERVAL_MINUTES` (default 15).
It never crashes the server; failures are logged and swallowed.

## Prerequisites before opening a port (NOT yet built)

Do **not** port-forward until all of these are in place. Each is its own piece
of work; this list is the acceptance gate.

1. **Per-player claim tokens + signed cookies.** Replace trusting `?pc=` and
   the honor-system `settlement-pc` with a per-device token that binds a device
   to its PC server-side. Personal notes, correspondence, and the credit meter
   then key off the cookie, not a guessable query param. (`server/views.js` is
   where the `?pc=` trust currently lives.)
2. **A GM key.** `/gm`, `/board`, `/screen`, `/api/state`, and every GM
   mutation must require a secret the players do not have. Right now anyone who
   reaches the origin can open the GM console.
3. **HTTPS.** Required anyway: service workers and PWA install only run in a
   secure context, so **even LAN phones do not get the installed app over plain
   `http://192.168.x.x` today** — this same fix unlocks that. Easiest path:
   Caddy or a Let's Encrypt cert on the DuckDNS hostname, reverse-proxying to
   Express on 4626. `tailscale cert` is an alternative if staying on Tailscale.
4. **Telemetry consent review.** CLAUDE.md and `docs/ux-telemetry.md` already
   flag that the content-free UX telemetry must be reviewed (consent, retention,
   whether it should exist at all) before the project goes remote or larger.
   Settle that before exposure, not after.
5. **Beacon configured** (above) so the public address stays discoverable.

## Tailscale — the zero-exposure alternative (recommended interim)

If the goal is just "players use the app from home between sessions", a mesh
VPN gets there **without opening any port and without building items 1–2 yet**:
install Tailscale on the server and each player device; the server stays
exactly as it is and the network layer is the boundary. `tailscale cert`
provides HTTPS (item 3), which also lights up PWA install. This is the safest
way to give players out-of-play access now; save true public port-forwarding
for when the claim-token/GM-key work lands.

## Port-forward checklist (once the gate above is met)

1. Static IP returned / DuckDNS beacon confirmed updating.
2. Router: forward external 443 → server host, proxied to Express 4626.
3. HTTPS terminating at the proxy with a valid cert on the DuckDNS name.
4. Claim tokens and the GM key deployed and verified from an outside network.
5. Confirm `/gm` is unreachable without the key from an external device.
6. Confirm a player device installs the PWA and reaches only player surfaces.
