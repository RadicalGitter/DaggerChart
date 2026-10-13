# Remote access — reaching the settlement from outside the LAN

## Current setup — October 13, 2026

Oscar chose direct player access without passwords or invitation links, plus
a separate GM password. This explicitly replaces the earlier public-exposure
prerequisites below for this five-person table. Character selection and
`?pc=` still operate on trust. This is a GM gate, not per-player authentication:
public player actions, character creation, and player generation tools remain
reachable by anyone with the address. The chosen GM password is owner-managed;
use a stronger password if protection against guessing is needed.

- Local server: `http://localhost:4626/`.
- Private Tailscale HTTPS: `https://radicalhaven.tailb63508.ts.net:4627/`.
- Public HTTPS through Funnel: `https://radicalhaven.tailb63508.ts.net:10000/`.
- Point the **web/URL redirect** for `vesserin.oscarbergqvist.se` at the public
  HTTPS address above. Use a normal redirect, not masked forwarding or just a
  DNS CNAME: the TLS certificate belongs to the Tailscale hostname. Players
  will see that hostname after redirection. The redirect provider must also
  serve HTTPS for the custom domain if players enter it with `https://`.
- GM console: append `/gm/`; pocket controls: `/gm-remote/`; projector: `/screen/`.

Start with **Start The Settlement.vbs**. Its system-tray keeper owns the Node
server. Right-click its icon and choose **Close the settlement** to stop it.
From Codex, launch that script through the verified Explorer helper in
`Z:/Programmering/Tools/Desktop/Window-Utilities/Independent-Launch/README.md`.
This keeps the application independent of Codex. The installed user Startup
shortcut starts the keeper automatically at Oscar's Windows sign-in after a
reboot. It does not start before sign-in. Tailscale's Windows service already
starts automatically and retains the Serve/Funnel mappings; the keeper starts
the app behind them. Keep the host awake during play.

`tools/install-startup.ps1` installs the `Vesserin - The Settlement.lnk`
shortcut in the current user's Windows Startup folder; run it with `-Remove`
to disable automatic startup. It touches no other startup entries. The keeper
prevents duplicate launches and stays quiet when startup finds it already open.
Server output is in gitignored `.runtime/server.log` and `server-error.log`.
The tray's **Close the settlement**, or `tools/stop-settlement.ps1`, requests
a graceful HTTP shutdown through a local filesystem marker. A deliberate stop
stays stopped until the next sign-in or manual launch.

The persistent proxy mappings can be inspected with `tailscale serve status`.
Only these mappings belong to this project; preserve other applications:

```powershell
tailscale serve --bg --https=4627 http://127.0.0.1:4626
tailscale funnel --bg --https=10000 http://127.0.0.1:4626
# To stop public access only:
tailscale funnel --https=10000 off
```

`server/access.js` sits before all pages and APIs. When both
`TABLE_SESSION_KEY` and `TABLE_GM_PASSWORD_HASH` are configured in `.env.local`,
GM routes require a signed HttpOnly cookie (Secure on HTTPS, SameSite Strict,
seven-day lifetime). API routes default to GM-only unless explicitly listed
as player operations. Shared player/GM payloads reject administrative PC
fields and forged GM message senders. Cross-origin browser writes are rejected;
GM password guesses are limited to eight per fifteen minutes globally, without
retaining IP addresses. This is an in-memory limit, reset on server restart.
Passwords are stored as salted scrypt hashes; changing the session key revokes
existing GM cookies. Missing half the configuration prevents startup; omitting
both preserves the original ungated LAN setup. Never remove both while Funnel
is enabled. The Suno snapshot helper/provider callback cannot bypass this GM
gate; server-side polling still updates already-submitted music tasks.

Remote telemetry review: this remains the same small, known playtest, but
anonymous public traffic can now reach it. Collection remains content-free
and local, with no new fields; reading/resetting the aggregate requires GM
access. Existing retention is unchanged. This does not establish consent for
a wider audience; reassess or disable it if the audience actually grows.

Verification: `npm test` includes a synthetic HTTP campaign that exercises
restart persistence, private notes/messages, retirement/restore, single-result
rolls, and GM authorization. It creates temporary data and dummy tables, never
resolves the real campaign, and cleans up its server and temporary files.

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

## Earlier full-authentication plan (deferred)

The earlier plan required all of these before public exposure. The owner
chose the lighter GM-only setup above instead. Per-player identity isolation
remains future work; the implemented GM gate does not claim to provide it.

1. **Per-player claim tokens + signed cookies.** Replace trusting `?pc=` and
   the honor-system `settlement-pc` with a per-device token that binds a device
   to its PC server-side. Personal notes, correspondence, and the credit meter
   then key off the cookie, not a guessable query param. (`server/views.js` is
   where the `?pc=` trust currently lives.)
2. **A GM key (now implemented).** `/gm`, `/board`, `/api/state`, and GM
   mutations require Keeper access when configured. `/screen` remains a public
   whitelisted projection; changing it requires Keeper access.
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

## Private Tailscale alternative

If the goal is just "players use the app from home between sessions", a mesh
VPN gets there **without opening any port and without building items 1–2 yet**:
install Tailscale on the server and each player device; the server stays
on the private network and the network layer is the boundary. Tailscale Serve
provides HTTPS, which also lights up PWA install. This remains available on
port 4627 for devices with Tailscale; tonight's public Funnel address on port
10000 does not require the players to install it.

## Port-forward checklist (once the gate above is met)

1. Static IP returned / DuckDNS beacon confirmed updating.
2. Router: forward external 443 → server host, proxied to Express 4626.
3. HTTPS terminating at the proxy with a valid cert on the DuckDNS name.
4. Claim tokens and the GM key deployed and verified from an outside network.
5. Confirm `/gm` is unreachable without the key from an external device.
6. Confirm a player device installs the PWA and reaches only player surfaces.
