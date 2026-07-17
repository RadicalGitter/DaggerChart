# Master plan — agreed features, backend-first

Implementation plans for the next five features, written so any agent can pick
one up cold. Read [CLAUDE.md](../CLAUDE.md) and
[settlement-design-spec.md](settlement-design-spec.md) first; the hard rules
there (spoiler safety, exact roll math, tone) override anything here.

The GM will bring specific design objectives per feature when it's picked up.
Treat each plan's **Backend** section as settled architecture and its
**Frontend sketch** as a starting point only.

## Shared foundations (read before any feature)

- **Every player-facing payload goes through an explicit whitelist in
  `server/views.js`.** New player surface = new/extended view function. Never
  render player UI from `gmView()`. Never let a fallback (`??`, spread) widen
  a payload. This has been the project's most defended invariant — keep it.
- **`data/session.json` (new)** — live *table* state, as opposed to
  settlement/season state: `{ "fear": 0, "showFearToPlayers": true }`.
  Features 1 and 2 introduce it; later table-session things (spotlight,
  countdowns) belong here too. Load in `state.js`, save in `persist()`.
- **Boards become named (feature 2)** — `data/boards.json` `{ "main": {...},
  "hud": {...} }` with a one-time boot migration from legacy `board.json`.
- **Secrets via environment only.** `ANTHROPIC_API_KEY` is read from
  `process.env`, never from a file in the repo. The retelling module is the
  only consumer.
- **SSE stays broadcast-and-refetch.** Clients own their gating by fetching
  their whitelisted endpoints. Do not push payloads through the stream.
- **i18n**: any new player-facing string lands in `public/shared/i18n.js` in
  both EN and SV. GM console stays English. Buttons are verbs from the
  fiction.
- **New player-shell sections** register in `SECTIONS` (`table.js`) and get a
  keepsake in the `KEEPSAKES` registry (`tome.js`) per
  [player-shell-visuals.md](player-shell-visuals.md).

Suggested order (dependencies, not importance): **7 → 1 → 2 → 3 → 5 → 6 → 4**.
7 (soft delete) is small and removes a live data-loss bug; 1 is an afternoon;
2 sets up boards for the hotbar; 3 is independent; 5 is mostly data
authoring; 6 (campaigns) must land before 4, which is campaign-scoped and the
only feature needing network access.

---

## 1. Fear/Hope tracker

**Goal.** A GM tracker for the Daggerheart Fear pool, always at hand;
players' Hope already lives on their sheets (`pcs.json` `hope`/`hopeMax`,
tap-pips on `/character/:id`). Optionally show the Fear count to players —
in Daggerheart the GM gains Fear openly, so default to visible.

**Data.** `data/session.json` (new, see foundations):
`{ "fear": 0, "showFearToPlayers": true }`. Fear is an integer ≥ 0; the SRD
caps the pool at 12 — clamp 0..12 server-side.

**API.**
- Fold `session: { fear, showFearToPlayers }` into `gmView()`.
- `PUT /api/session` `{ fear?, showFearToPlayers? }` — guard'd, validate
  integer + clamp, `persist()`, `broadcast()`.
- `tableView()` gains `fear: state.session.showFearToPlayers ?
  state.session.fear : null`. Add `hope`/`hopeMax` to `tableView().party`
  entries if the players' shell should show the party's Hope row (it's their
  own open information; the table is trusted).

**Spoiler notes.** None — Fear is public by rule. The toggle exists for GMs
who want drama.

**Frontend sketch.** GM: a counter in the hotbar (feature 2) — click to
spend, right-click/long-press to add, always visible. Players: a quiet row of
fear tokens on `/table`/`/tome` folio. The in-app 4d6−1d6 roller (separate
roadmap item) must NOT be entangled with this; Fear here is bookkeeping only.

---

## 2. GM overlay & hovering hotbar

**Goal.** A small always-available hotbar on GM surfaces that can summon a
full-screen overlay: all active PCs' live stats, standard difficulty tables,
conditions, and whatever the GM pins — a dedicated, purpose-built form of the
drafting board.

**Data.**
- **Named boards.** Replace `board.json` with `data/boards.json`:
  `{ "main": { items, pins }, "hud": { items, pins } }`. Boot migration in
  `index.js` (or `store.js`): if `boards.json` missing and `board.json`
  exists, wrap it as `main` and write `boards.json`; keep reading the old
  file never again. The overlay renders board `hud`.
- **GM screen reference data.** `data/daggerheart/gm-screen.json` — static,
  authored once from the SRD (DPCGL attribution already in README):
  difficulty benchmarks, condition summaries, common GM moves, damage
  thresholds cheat-sheet. Shape: `{ "sections": [{ "id", "title", "rows":
  [{ "label", "value", "note" }] }] }`. Keep it flat and boring — the overlay
  is a lookup surface, not a document.

**API.**
- `GET /api/board/:name`, `PUT /api/board/:name` — `:name` validated against
  `["main", "hud"]`. Keep `GET/PUT /api/board` as aliases for `main` so the
  existing drafting board never notices. Preserve the existing quirk: board
  PUTs do **not** broadcast (would echo the GM's own edits back).
- `GET /api/gm-screen` — returns the static JSON. It's public SRD content;
  no whitelist needed, but it's a GM convenience so don't link it from player
  surfaces.
- Extend `gmView().party` with live vitals for the overlay: `hp, hpMax,
  stress, stressMax, hope, hopeMax, evasion, armor score/marked, thresholds`.
  (GM payload — no spoiler concern; the data already updates live via the
  sheets' PUTs + broadcast.)

**Frontend sketch.** A fixed hotbar component shared by GM pages (`gm/`,
`board/`) — likely a small ES module in `public/shared/`. Buttons: Fear
counter (feature 1), Overlay, Messages (feature 3), rules quick-search
(feature 5). The overlay itself is a translucent full-screen layer: left half
live PC plates (reuse the board's plate renderer), right half `gm-screen`
sections + pinned `hud` board items. Esc closes. Nothing here is
player-visible; don't project it.

---

## 3. Private messages (GM ↔ each player)

**Goal.** One quiet thread per PC between that player and the GM. Not a group
chat, not player-to-player. Lives in the hotbar for the GM; for players, it
opens from the tome's bottom utility dock beside Conditions (mount at
`#player-chat-slot`). Other shell visuals may use their Character card or a
sheet drawer.

**Data.** `data/messages.json` — flat array:

```json
{ "id": "msg_…", "pcId": "pc_…", "from": "gm" | "player",
  "text": "…", "ts": "ISO", "read": { "gm": true, "player": false } }
```

Sender's own side of `read` starts `true`. Keep it flat (one array, filter by
`pcId`) — same pattern as `notes.json`.

**API.** Same trust model as personal notes: no auth, gate by `?pc=` and
don't ship what wasn't asked for.
- `GET /api/messages?pc=<pcId>` — that PC's thread only (player client).
- `GET /api/messages/gm` — all threads + per-thread unread counts (GM
  console/hotbar). Never reachable from player payload builders.
- `POST /api/messages` `{ pcId, from, text }` — validate PC exists, text
  non-empty, `from` ∈ {gm, player}; stamp id/ts/read; `persist()`;
  `broadcast()`.
- `PUT /api/messages/read` `{ pcId, side }` — mark that side of the thread
  read (bulk, not per-message).
- Unread badges: add `unreadMessages` count to `loreView(pcId)` (players) and
  a per-PC map to `gmView()` — counts only, never text, so the journal/shell
  can badge without fetching threads.

**Spoiler notes.** Message text is private between two parties but crosses no
spoiler boundary. The real risk is *lazy payload reuse*: never fold thread
text into `tableView`/`loreView`; only counts.

**Frontend sketch.** GM hotbar: badge with total unread; opens a panel with
one column per PC. Player tome: badge and thread panel in the existing bottom
utility dock. Other shells can badge the Character card. Use a simple thread
view (composer + messages, newest at the bottom, Ctrl+Enter sends — mirror
the journal composer's conventions).

---

## 4. Session perspectives → Opus retelling

*(Revised per GM direction 2026-07-11: simpler than first drafted, and
campaign-aware — read feature 6 first, sessions belong to a campaign.)*

**Goal.** After a session the GM creates a session entry and chooses which
characters were in it (defaulting to every active PC). Each participant then
finds a prompt waiting in their chronicle tab: *write the scene that mattered
most to your character, from their eyes.* The GM writes a short summary and,
separately, one thing they found extra interesting. When it's all in, the
server sends the bundle — **together with all previous published retellings
in this campaign** for continuity — to Opus, which writes this session's
condensed retelling. GM reviews, then publishes to the chronicle. (Live
transcription stays future work — see the last note.)

**Data.** `data/sessions.json` — array of session records:

```json
{ "id": "ses_…", "campaignId": "cmp_…", "number": 7, "date": "2026-07-11",
  "seasonLabel": "Spring, Year 1",
  "status": "gathering" | "retelling" | "review" | "published" | "failed",
  "participants": ["pc_…"],
  "gmSummary": "…",
  "gmHighlight": "…",
  "perspectives": [{ "pcId": "pc_…", "author": "Name", "text": "…", "ts": "ISO" }],
  "retelling": { "text": "…", "model": "claude-…", "createdAt": "ISO" } | null,
  "error": null,
  "transcript": null }
```

`gmHighlight` is the GM's "this was the interesting bit" note — passed to the
model as emphasis, distinct from the factual `gmSummary`. `transcript` stays
null — reserved for the listening-model future so the shape won't need
migration.

**API.**
- `POST /api/sessions` `{ participants? }` — GM opens the record (`status:
  "gathering"`, stamps number/date/seasonLabel/campaignId from the current
  campaign; `participants` defaults to all active PCs in it). One `gathering`
  session at a time per campaign; reject a second.
- `PUT /api/sessions/:id` — GM edits `gmSummary`, `gmHighlight`,
  `participants`, or the retelling text during review.
- `POST /api/sessions/:id/perspectives` `{ pcId, text }` — player endpoint;
  pcId must be in `participants`; one perspective per PC (later writes
  replace, stamp `ts`). Broadcast so the GM sees completion fill in live.
- Player read access via `loreView(pcId)`: if the open session lists them as
  a participant — the prompt state, their own perspective (for editing), and
  which PCs have written (names/booleans only, **not** other players' texts
  before publication; the reveal is part of the fun) — plus all `published`
  retellings of the campaign.
- `POST /api/sessions/:id/retell` — GM-triggered. Sets `status: "retelling"`,
  responds `202` immediately, runs the API call async; on success stores
  `retelling`, `status: "review"`; on failure `status: "failed"`, `error`
  message (message only — never dump the API response into logs a player
  surface could see). Broadcast on completion.
- `POST /api/sessions/:id/publish` — GM accepted the text (possibly after
  editing it via `PUT`): `status: "published"`, and `addLog({ type:
  "retelling", summary: <first line>, publishedText: <full text>, published:
  true })` so it flows into the existing chronicle on `/table` and the
  journal.

**The Anthropic call — `server/retell.js` (new, isolated).**
- No SDK; keep the stack boring: `fetch("https://api.anthropic.com/v1/messages")`
  with headers `x-api-key: process.env.ANTHROPIC_API_KEY`,
  `anthropic-version: 2023-06-01`. Model from `process.env.RETELL_MODEL`,
  default the newest Opus available at implementation time. Refuse cleanly at
  startup-time use if the key is missing (GM sees "The chronicler is not
  engaged — set ANTHROPIC_API_KEY.").
- **Prompt inputs are player-known material only**: `gmSummary` and
  `gmHighlight` (GM-authored for sharing), the participants' perspectives,
  and the campaign's previous **published** retellings (oldest first, as
  "the story so far" — if the accumulated history grows past a sensible
  budget, include the most recent few in full and earlier ones by their first
  paragraphs). Build the bundle from those fields explicitly — treat the
  prompt builder as a player surface. **Never** include `gmView()` output,
  `hidden.*`, unpublished log entries, or anything from
  `data/event-tables/`.
- Prompt shape (system): the steward's-ledger tone rules from spec §2/§12; a
  hard instruction that every named fact must come from the inputs (no
  invention); target length (~400–600 words); keep each PC's perspective
  represented; plain grounded prose, no exclamation marks. User turn: the
  labeled bundle. Store the template in `retell.js` as a exported constant so
  the GM can tune wording in one place.
- One retry on 429/5xx with backoff; 60s timeout; never block the event loop
  (plain async).

**Spoiler notes.** The retelling becomes *published* chronicle — the GM
review step (`review` → `publish`) is the safety valve, both for spoilers the
GM accidentally put in `gmSummary` and for tone. Don't auto-publish.

**Frontend sketch.** GM: a "The session ends" flow in the console — open
record, watch perspectives arrive, write summary, *Send to the chronicler*,
review/edit, *Enter it into the chronicle*. Players: a "your perspective"
prompt in the journal (a note composer variant bound to the open session).

**Future (explicitly out of scope now).** Live listening = a local
transcription (Whisper on the 5090) feeding `transcript`; the retell prompt
would then take transcript + a table-agreed list of "what mattered". The data
shape above already holds it; nothing else should assume audio exists.

---

## 5. Rules wiki

**Goal.** A searchable, hierarchically grouped rules reference (Combat /
Adventuring / Downtime / …) with cross-references ("you probably also meant…"),
reachable from player surfaces and the GM hotbar.

**Data.** `data/daggerheart/rules.json`:

```json
{ "nodes": [{
    "id": "attack-rolls",
    "title": "Attack Rolls",
    "path": ["Combat", "Making Attacks"],
    "body": "Markdown-ish text. Game terms stay English.",
    "seeAlso": ["damage-thresholds", "advantage"],
    "keywords": ["hit", "to-hit", "attack", "duality dice"]
  }] }
```

- `path` is the hierarchy (render as a tree; a node's children are nodes
  whose `path` extends its own). `seeAlso` is hand-curated; cheap automatic
  suggestions can come later from keyword overlap, client-side.
- Author progressively from the SRD (the reference dump in
  `data/daggerheart/reference.json` and the SRD text itself; DPCGL applies,
  attribution already in the README). Start with the ~30 rules that actually
  come up at the table; the structure invites growth.
- Hand-editable JSON first. A GM editing UI is phase two, not part of the
  initial build.

**API.**
- `GET /api/rules` — the whole corpus. It's public rules text; no whitelist
  concerns. At the sizes involved (even a few hundred KB) one fetch +
  client-side search beats building a server search engine. Cache-friendly:
  send `ETag`/304 if it ever grows heavy.
- Phase two (only if asked): `POST/PUT/DELETE /api/rules/:id` guard'd for a
  GM editor; writes back through `saveJson`.

**Search & cross-refs (client, no deps).** Normalize once on load: for each
node, a lowercase haystack of `title + path + keywords + body`. Ranking:
title prefix > title substring > keyword > path > body. Show breadcrumb
(`Combat → Making Attacks`) in results; render `seeAlso` as "See also" chips;
run `termify()` over bodies so glossary long-press works inside rules text.

**Frontend sketch.** New `public/rules/` page (lamplight themed, EN/SV
chrome, search box + tree + article pane) served at `/rules`; registered as a
shell section (card in `/table`, keepsake in `/tome` — perhaps a knotted cord).
GM hotbar gets a quick-search that opens the same corpus in the overlay.
Long-press glossary (`TERMS`) stays the "what does this word mean" layer;
the wiki is the "how does this work" layer — link the glossary popover's term
name to its wiki node when one exists.

---

## 6. Campaigns

**Goal.** Multiple campaigns in one install. The GM manages them from the
console; a player creating a character (which is how a "user" is created —
see [player-identity.md](player-identity.md)) picks which active campaign the
character belongs to; `/login` shows character selection grouped per active
campaign; chronicles/sessions are campaign-scoped.

**Scope decision (deliberate).** A campaign scopes **characters, sessions,
and retellings** — not (yet) the settlement itself. The settlement state,
buildings, folk, people/places, and event tables remain the single live world;
one campaign is marked *current* and is what `/table`, downtime, and the
chronicle operate on. Full per-campaign world state is a `DATA_DIR`-per-
campaign lift (store.js already honors `DATA_DIR`); write that migration only
when a second *world* actually exists, not before.

**Data.** `data/campaigns.json`:

```json
{ "currentId": "cmp_…",
  "campaigns": [{ "id": "cmp_…", "name": "The Settlement",
                  "status": "active" | "archived", "createdAt": "ISO" }] }
```

Seed on boot with one campaign (name from `settlement.json`) and adopt all
existing PCs/sessions into it — the migration is: any `pcs.json` entry
without `campaignId` gets the seeded id (same for sessions). PCs gain
`campaignId`.

**API.**
- `GET` folded into `gmView()` (`campaigns`, `currentId`) and, whitelisted,
  into `tableView()`/`loreView()` (active campaigns' id+name only — the login
  grid and creator need them).
- `POST /api/campaigns` `{ name }`, `PUT /api/campaigns/:id`
  `{ name?, status? }`, `PUT /api/campaigns/current` `{ id }` — all guard'd,
  broadcast. Archiving a campaign hides its characters from `/login` but
  deletes nothing.
- `POST /api/party` accepts `campaignId` (validated against active
  campaigns; default `currentId`).
- Filtering: `tableView().party` and `loreView().party` return the current
  campaign's active PCs; `/login` groups by campaign using the whitelisted
  campaign list + per-PC `campaignId` (add it to the party whitelists — it's
  public grouping data).

**Frontend sketch.** GM console: a small "Campaigns" block in the Settlement
section (list, add, rename, archive, set current). Creator: a campaign picker
step only when more than one campaign is active (skip the step entirely for
one). Login: one portrait-row per active campaign with its name as a small
header — keep Sol's card design untouched.

---

## 7. Character lifecycle (GM editor + soft delete) — built

**Goal.** A GM view to manage PCs: deactivate ("delete") a character, see a
*deleted characters* view, and restore mistakes. Glorified
activate/deactivate — nothing is ever destroyed.

**Data.** PCs gain `active: true | false` (default true; migrate by treating
missing as true). **Change the existing hard delete**: `DELETE
/api/party/:id` currently splices the PC out and deletes their journal
doodles (`delete state.journalDoodles[gone.id]`) — that is data loss and must
go. Notes, doodles, messages, and perspectives all key on `pcId` and survive
deactivation untouched, which is exactly why soft delete is the right shape.

**API.**
- Repurpose `DELETE /api/party/:id` → sets `active: false`, logs
  (`addLog({ type: "party", summary: "<name> steps back from the tale." })`),
  persists, broadcasts. Keep the route so nothing else changes; there is no
  hard-delete endpoint anymore.
- `POST /api/party/:id/restore` → `active: true`, log, broadcast.
- `gmView().party` includes inactive PCs with the flag; every player-facing
  whitelist (`tableView`, `loreView`, and therefore `/login`, the shells'
  pickers, sheets links, message threads, session participant defaults)
  filters to `active !== false`.

**Login integration.** Nothing special needed beyond the whitelist filter: a
deactivated PC disappears from `/login` and the shells' pickers; a device
still holding its id in `settlement-pc` fails `myPC()` and falls back to the
picker naturally. Verify that on implementation rather than assuming it.

**Frontend sketch.** GM console Party section: the existing table gains a
quiet "Retire" action per row and a collapsed "Stepped back" list beneath it
with "Restore" buttons. Wording stays in the fiction — retire/return, not
delete/undelete.

**Built 2026-07-17.** Missing `active` values read as true. Retirement is
idempotent, preserves all keyed records, removes stale player access, and
filters group deliveries and character-theme sources to active PCs. Desktop
uses the ledger table; narrow GM screens use stacked rows without horizontal
scrolling.

---

*When a feature lands: update [architecture.md](architecture.md) (routes +
data files), cross off the entry in CLAUDE.md's "What's next", and keep this
file's plan section as documentation of intent — mark it "(built)" rather
than deleting it.*
