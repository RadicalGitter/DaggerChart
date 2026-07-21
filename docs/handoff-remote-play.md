# Handoff: out-of-play LLM access, address beacon, public exposure prep

Context: the PWA/native-feel work is **done and verified** (see the new bullet in
CLAUDE.md and `docs/architecture.md`; worker in `public/pwa/sw.js`). This file
specs the next turn's work, agreed with the GM 2026-07-20. Explored plumbing is
cited with exact locations so implementation can start without re-discovery.

## Goal

Players use the app away from the table — especially the background studio's
Anthropic expansions — under a per-player budget they can ask the GM to top
off. The whole site will later be exposed via the GM's static IP + port
forwarding; the server should publish its current address somewhere devices can
find. ComfyUI p2p stays deferred until the server's permanent home is known.

## 1. Word-weaving credits (build first — headline feature)

**Ledger** `data/llm-credits.json` (tracked, hand-editable like other state):
```json
{ "defaultGrant": 15, "accounts": { "<pcId or draftId>": {
    "granted": 15, "used": 3, "requestedAt": null, "note": "" } } }
```

**Module** `server/llm-credits.js`, patterned on other bounded owners; use
`loadJson(name, fallback)` / `saveJson(name, obj)` from `store.js` (names
include the `.json` — `loadJson("llm-credits.json", …)`; check neighbors for
the convention). Lazy-load ledger, persist on change. Exports:
- `playerCreditView(id)` → `{granted, used, remaining, requested}`
- `assertCredit(id)` → throws when `remaining <= 0` (call BEFORE the provider)
- `spendCredit(id)` → increment used, persist (call AFTER provider success —
  failed calls never charge)
- `requestTopOff(id, note)` → bounded note (≤500), stamps `requestedAt`
- `grantCredits(id, amount)` → bounded 1..200, adds to `granted`, clears request
- `gmLedgerView()` → all accounts

**Routes** in `server/index.js` (use existing `guard`/`guardAsync`; mutations
call `broadcast()` — it's defined at index.js:180):
- `GET /api/llm-credits?owner=<pcId|draftId>` → playerCreditView
- `POST /api/llm-credits/request` `{owner, note?}` → top-off request, broadcast
- `GET /api/llm-credits/gm` → gmLedgerView + resolved PC names
- `POST /api/llm-credits/grant` `{owner, amount}` → grant, broadcast

**Enforcement points** (only player-reachable Anthropic endpoints):
- `POST /api/party/:id/background/suggest` — handler at index.js:719.
  `assertCredit(pc.id)` before `suggestBackground(...)`, `spendCredit` after
  success; add `credits: playerCreditView(pc.id)` to the JSON response.
- `POST /api/art/portrait/suggest` — handler at index.js:572. Charges the
  `draftId`. This replaces the explicit TODO comment there ("Add request
  throttling here before exposing character creation beyond that boundary").
- Do NOT charge GM-side suggest routes (`/api/characters/:id/portrait/suggest`
  index.js:1418, people/places, retell).

Out-of-credit should return **HTTP 402** with `{error, credits}` so clients can
branch on status, not message text. `guardAsync` returns 400s; handle the 402
inside the route (early `return res.status(402).json(...)`) rather than in guard.

**Background studio UI** (`public/background/background.js`; suggest flow is
`askForExpansion()` at line 128, button `#ask-expansion`, leaf
`#suggestion-leaf`):
- On load fetch `GET /api/llm-credits?owner=<pc.id>`; show a quiet remaining
  count near the ask button.
- When remaining is 0 (or on a 402), swap the ask button for a top-off request
  button → `POST /api/llm-credits/request`; then show a "asked the steward"
  state. Refetch credits after every suggest/request (SSE refetch too if the
  page already listens to `/api/stream` — verify).
- After a successful suggest, update the count from `body.credits`.

**i18n** (`public/shared/i18n.js`; EN block near line 416 `background.*`, SV
near line 982 — every new key needs both):
`background.credits.left` ("{n} expansions left" / "{n} utbyggnader kvar"),
`background.credits.none`, `background.credits.request` ("Ask the steward for
more"), `background.credits.requested`, `background.credits.requestError`.
Tone: steward's ledger, no exclamation marks.

**GM console**: small panel (near the feedback queue section in
`public/gm/index.html`) listing PCs with used/granted, pending requests
surfaced first, an amount input + grant button hitting
`/api/llm-credits/grant`. GM console is English-only.

**Creator**: server-side enforcement only; the create wizard already displays
server error text, good enough for now.

**Tests** `test/llm-credits.test.js` (pattern: `test/background-suggest.test.js`
— node:test + assert/strict, module-level, no HTTP): spend/deny-at-zero,
charge-only-on-success ordering, request/grant round trip, grant bounds,
fresh account gets defaultGrant.

## 2. Address beacon (`server/beacon.js`)

Off unless configured via env (`.env.local` — verify how index.js/retell load
it before assuming). Every `BEACON_INTERVAL_MINUTES` (default 15) and at boot:
discover public IP (`https://api.ipify.org?format=json`), publish `{ip, port,
updatedAt}`. Two targets, both tiny; never crash the server, log quietly:
- **DuckDNS (recommend to the GM)**: `BEACON_DUCKDNS_DOMAIN` +
  `BEACON_DUCKDNS_TOKEN` → one GET to duckdns.org update URL. A stable
  hostname beats an IP note: installed PWAs are origin-bound, so a fixed name
  keeps installs working across IP changes and enables Let's Encrypt HTTPS.
- **Private gist ("password-protected git note", the GM's literal ask)**:
  `BEACON_GIST_ID` + `BEACON_GITHUB_TOKEN` → PATCH the gist with
  `settlement-address.json`.
Keep target-building pure (`beaconTargets(env)`, `publishOnce(targets,
fetchImpl)`) so tests can cover it without network. Call `startBeacon({port})`
after `app.listen` (index.js:1962).

## 3. Public exposure prep (document now, gate later)

Write `docs/remote-access.md`: port-forward checklist plus **prerequisites
before opening the port** — (a) per-player claim tokens + signed cookies
(replaces trusting `?pc=`), (b) a GM key gating `/gm`, `/board`, `/api/state`
and all GM mutations, (c) HTTPS via Caddy/Let's Encrypt on the DDNS name
(required for SW/install off-localhost — LAN phones don't get the PWA today
either, same fix), (d) the telemetry consent review CLAUDE.md already mandates
when the project goes remote, (e) beacon config. The claim-token/GM-key
implementation is its own future turn; do not port-forward before it.

## 4. ComfyUI p2p — explicitly deferred

No work now (GM's call: server's permanent residence unknown). `server/art.js`
is the boundary; when resumed, it's a remote ComfyUI base-URL + reachability
concern, nothing player-facing.

## Also update when implementing

- `docs/architecture.md`: module list + API table rows; note it was edited by
  another session recently (live-session.js exists now) — re-read before editing.
- CLAUDE.md decisions bullet: credits + beacon + "no port forwarding before
  claim tokens/GM key/HTTPS".
- `public/pwa/sw.js`: nothing to add for credits (network-first API list is
  whitelist-only; credits need the network anyway).
