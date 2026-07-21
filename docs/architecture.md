# Architecture

Boring on purpose: Node + Express, no build step, vanilla ES-module frontend,
pretty-printed JSON on disk. One machine (the GM's), players connect over LAN.

```
server/
  index.js    routes, SSE stream, static serving
  almanac.js  private lore CRUD and reveal-one-result chance-table boundary
  music.js    song metadata, playlists, character themes, Suno provider boundary
  retell.js   isolated Anthropic prompt and retry boundary for session accounts
  portrait-suggest.js bounded Anthropic writing aid for portrait briefs
  llm-credits.js per-player budget for the Anthropic writing aids
  beacon.js   env-gated publisher of the server's current public IP/port
  telemetry.js bounded, content-free local UX aggregation
  state.js    domain logic: roll resolution, modifiers, season, log
  live-session.js campaign play clock and timed private character states
  character-presentations.js canonical identity, disguises, and Beastform overlays
  sheet-beauty.js deterministic sheet recipes, token entitlement, and immutable versions
  store.js    atomic JSON read/write (unique tmp+rename), timestamped backups
  views.js    audience whitelists for GM, shells, lore, PCs, and messages
public/
  shared/     themes, i18n, dark GM worktable layer, session pools, GM tools/messages, rules search, player chat/notes, feedback and UX collectors
  gm/         GM console (campaign/session controls, Almanac, correspondence, quick table, feedback queue, and UX review map)
  login/      trusted-table chooser: movable portrait cards + draft side view
  player/     player root: identity switcher, everyday tools, and visual-tool shelf
  table/      general arcana-card shell over six player sections, including Rules
  table-book/ settlement folio: town, folk, and chronicle
  tome/       personal tome: journal, character, inventory, Rules, and private correspondence
  screen/     the projector client (renders whatever the GM casts via /api/screen)
  create/     character creation wizard
  character/  live character sheet + hand manager
  background/ post-creation memory studio + explicit AI expansion drafts
  music/      GM music desk: bubble library, prompt tag board, generation controls
  rules/      searchable public SRD table reference
  journal/    players' Chronicle accounts and notes on people, places, and days
  board/      named Main/HUD drafting boards (infinite canvas, plates, pins)
data/         all persistent state (see README)
docs/         this file, the design spec, ComfyUI workflow
```

Persistent visual treatments use the domain/recipe/anchor/renderer separation
documented in [semantic-adornment.md](semantic-adornment.md). General interface
work should preserve that boundary rather than importing character-sheet CSS
or slot names into unrelated surfaces. Sheet-specific implementation work
continues in the [Sheet Beautifier skill](../sheet-beautifier/SKILL.md) and its
[slot contract](../sheet-beautifier/references/slot-contract.md).

## Server

- **`store.js`** — `loadJson(name, fallback)` / `saveJson(name, obj)`; writes are
  atomic (write a process-unique `.tmp`, rename). Unique temp names prevent
  overlapping local server instances from contending during restarts and test
  runs. `snapshot()` copies every `data/*.json` into
  `data/backups/<timestamp>/`; called on each downtime resolution. `DATA_DIR`
  env var overrides the data directory (used by tests/scratch runs).
- **`state.js`** — owns the mutable `state` (settlement, campaigns, live and
  recorded sessions, characters, PCs, messages, log, event tables).
  `campaigns.json` identifies the current campaign; boot seeds it from the
  settlement name and adopts legacy PCs, drafts, sessions, and log entries.
  An interrupted `retelling` session becomes retryable `failed` state on boot
  because network work cannot survive a process restart.
  `session.json` holds the bounded 0..12 Fear pool and
  its player-visibility switch. `resolveDowntime(buildingId, raw, effort)` implements §5 of the
  spec exactly: raw −2..23 validated, modifiers summed, clamp 0–30, spent-number
  tracking per building, stockpile wipe on 0, standing `effect` capture, log
  entry, snapshot. `modifierBreakdown()` returns visible modifiers itemized and
  hidden ones only as part of the total (spoiler rule §8B).
- **`live-session.js`** — owns the explicit start/pause/resume/end play clock
  and attendance-aware timed private states.
- **`character-presentations.js`** — preserves canonical PCs while projecting
  Bob's active persona or Kaya's tier-gated Beastform into party and sheet views.
  and settles reusable timed character states only for present participants.
  Heliga Erik's private Light/Neutral/Shadow balance is the first consumer; its
  Shadow invocation atomically feeds the shared Fear pool through `index.js`.
  See [character-special-states.md](character-special-states.md).
- **`sheet-beauty.js`** — derives two stable character-sheet treatment
  candidates from class, Tier, and bounded completion signals. Commits spend
  level-derived tokens and store complete immutable recipes; restoring a prior
  recipe or baseline is free. The extension contract lives in
  `sheet-beautifier/SKILL.md`.
- **`views.js`** — **the** spoiler boundary. `tableView()`, `loreView()`, and
  `playerCharacterView()`
  build player payloads from explicit whitelists; hidden fields, unrevealed
  people/places, and unfired event text never leave the server on `/api/table`
  or `/api/lore`. A person standing in an unrevealed place gets `placeId: null`.
  Personal notes ship only when the request carries the owner's `?pc=`.
  `playerMessagesView(pcId)` returns only that active PC's thread;
  `gmMessagesView()` returns the GM thread list. `gmView()` and `loreView()`
  carry unread counts only, while `tableView()` carries neither counts nor text.
  `tableView()` exposes Fear only when the session switch permits it and adds
  public Hope totals to current-campaign party identities. Its separate
  `identities` whitelist carries all active-campaign PCs for trusted seat
  selection without mixing their Hope into the current table. Never render
  player surfaces from `gmView()`.
  Session views follow the same split: `gmView()` carries current-campaign
  working records, while `loreView(pcId)` exposes only that PC's perspective,
  participant completion booleans, coarse status, and published accounts from
  their campaign.
- **`index.js`** — routes below, plus `GET /api/stream` (SSE). Mutating
  endpoints call `broadcast()` so open pages refresh. Named drafting-board PUTs
  deliberately do *not* broadcast (would echo the GM's own edits back); when
  `boards.json` is absent, boot migrates legacy `board.json` into `main` once.
  The static `daggerheart/rules.json` corpus is loaded once at boot and served
  cacheably; it contains no campaign state.
- **`almanac.js`** — combines the public rules corpus with bounded, editable
  private lore for the GM, and loads `data/tables/*.json` as reveal-one-result
  chance tables. Metadata explicitly omits entry structures; roll responses
  whitelist only the one result's text and optional reward. Seen-number state
  lives in `tables-state.json`. See [almanac.md](almanac.md).
- **`music.js`** — owns `music.json`, playlist/theme metadata, safe local-audio
  paths, publishing, the mock/live provider adapter, and the validated Suno
  web-library mirror. Generated files are downloaded into
  `Visseren/Generated`; mirrored web-library audio is cached under
  `Visseren/Suno Mirror`; published themes are copied to
  `Visseren/Character Themes/<Character Name>`. See
  [music-integration.md](music-integration.md).
- **`retell.js`** — builds the Anthropic prompt exclusively from the GM's
  shareable summary/emphasis, chosen player perspectives, and earlier
  published same-campaign retellings. It uses `ANTHROPIC_API_KEY` from the
  environment, defaults `RETELL_MODEL` to `claude-opus-4-8`, times out after
  60 seconds, and retries one 429/5xx response. See
  [session-retellings.md](session-retellings.md).
- **`art.js`** — validates tokenized ComfyUI API-format workflows, applies
  bounded relative sampler modifiers and the two portrait style pairs without
  fixed node IDs, queues them, polls one prompt's history, and copies returned
  images into the gitignored player-static art directory. Portrait and scenic setup is documented in
  [comfyui/README.md](comfyui/README.md).
- **`art-library.js`** — owns the canonical 1536 × 864 scenic request shape,
  location-name uniqueness, the versioned `tag-board-v1` metadata envelope,
  hierarchical tag compilation, and public GM-library records. Selecting a
  broad tag includes its descendants; explicit exclusions remove only the
  inherited branch. Generated files are immutable; deleting a library entry
  removes metadata only.
- **`portrait-suggest.js`** — sends only bounded, player-known portrait context
  to Anthropic and returns one editable prose suggestion. It never generates
  an image or writes character state.
- **`llm-credits.js`** — a per-owner budget (`data/llm-credits.json`, tracked,
  hand-editable) for the player-reachable Anthropic aids. One account per PC or
  unfinished draft; fresh accounts read the `defaultGrant` without being
  written. Routes check `hasCredit` and return **HTTP 402** with the standing
  when exhausted, then `spendCredit` only *after* a successful provider call —
  a failed call is free. `requestTopOff`/`grantCredits` drive the player's
  ask-the-steward flow and the GM Expansions panel. It is a courtesy meter for
  the trusted table, not a security boundary.
- **`beacon.js`** — env-gated; publishes the server's current public IP and
  port to DuckDNS and/or a private gist on a timer so player devices survive a
  home-IP change. Target-building and payloads are pure; every failure is
  logged and swallowed. `startBeacon` runs after `app.listen`. See
  [remote-access.md](remote-access.md).
- **`telemetry.js`** — owns gitignored `telemetry.json`, validates the fixed
  player-surface whitelist, and aggregates bounded route/mode/viewport timing
  and click candidates without content or identity. See
  [ux-telemetry.md](ux-telemetry.md).

## API

| Endpoint | Purpose |
|---|---|
| `GET /api/state` | full GM state (private) |
| `GET /api/table` | whitelisted player payload |
| `POST /api/campaigns` | create an active campaign in the shared settlement world |
| `PUT /api/campaigns/:id` | rename or archive/restore a campaign; the current campaign cannot be archived |
| `PUT /api/campaigns/current` | switch the active campaign used by party, chronicle, downtime, group delivery, and music surfaces |
| `PUT /api/session` | set bounded Fear and/or its player visibility; persists and broadcasts |
| `GET/POST /api/live-session/gm`, `POST /api/live-session/{start,pause,resume,end}` | private GM play clock and participant timing controls |
| `GET/POST /api/party/:id/presentation*` | owner presentation studio, activation, persona/Beastform customization, and alternate portrait generation |
| `GET/PUT /api/party/:id/shadow`, `POST .../invoke` | Erik-only balance; invocation adds one Fear during active play |
| `POST /api/sessions` | open one current-campaign gathering record with chosen active participants |
| `PUT /api/sessions/:id` | edit GM fields/attendance while gathering or returned text during review |
| `POST /api/sessions/:id/perspectives` | create or replace only that participating active PC's perspective |
| `POST /api/sessions/:id/retell` | asynchronously send the explicit player-known bundle; never publishes automatically |
| `POST /api/sessions/:id/publish` | publish the GM-reviewed account into the campaign chronicle |
| `GET /api/messages?pc=id` | one active PC's private GM thread only |
| `GET /api/messages/gm` | all PC threads and per-thread unread counts for GM surfaces |
| `POST /api/messages` | send validated GM/PC text; stamps sender read state, persists, broadcasts |
| `PUT /api/messages/read` | bulk-mark one side of one thread read; retired threads are GM-readable only |
| `GET /api/stream` | SSE; any broadcast → clients refetch |
| `GET /api/downtime/preview?building=id` | foreman + modifier breakdown before rolling |
| `POST /api/downtime/resolve` | `{buildingId, raw, effort}` → single entry revealed |
| `POST /api/season/advance` | Spring→Summer→Autumn→Winter, year++ |
| `POST /api/resources/adjust` | `{resource, delta, reason}` (audited) |
| `PUT /api/settlement` | population, chronicle text |
| `PUT /api/buildings/:id` | trusted foreman assignment; levels cannot be edited directly |
| `PUT /api/buildings/:id/check` | record the GM's pending/passed/failed project ruling and optional note |
| `POST /api/buildings/:id/complete-project` | atomically spend the current construction/upgrade cost after a passed ruling |
| `POST/PUT /api/characters[/:id]` | folk (NPC) cards incl. hidden layer |
| `POST /api/log`, `POST /api/log/:id/publish` | chronicle notes, publish to table |
| `GET /api/reference` | SRD creation data (classes, ancestries, cards…) |
| `GET /api/rules` | public searchable rules corpus with source/license metadata; cacheable with ETag/304 |
| `GET /api/gm/almanac` | combined public rules and private lore pages for the GM console only |
| `POST/PUT/DELETE /api/gm/almanac/lore[/:id]` | bounded private lore-page authoring; public rules stay read-only |
| `GET /api/gm/tables` | chance-table names, dice, labels, totals, and seen counts only; never entry text |
| `POST /api/gm/tables/:id/roll` | reveal exactly one range-checked chance-table result, using an optional physical result |
| `POST /api/gm/tables/travel/roll` | reveal one danger-tier encounter plus one way-of-travel twist |
| `GET /api/character-drafts`, `GET/PUT/DELETE /api/character-drafts/:id` | resumable unfinished creator state, listed separately from completed PCs |
| `GET/POST/PUT/DELETE /api/party[/:id]` | active player characters; DELETE retires without destroying the stored record or keyed data |
| `PUT /api/party/:id/background` | replace the active PC's bounded, filled background memories |
| `POST /api/party/:id/background/suggest` | return one editable Anthropic expansion without saving it; charges one word-weaving credit on success, 402 when exhausted |
| `POST /api/party/:id/background/spark` | three short divergent inspiration seeds for one memory field (works on a blank field); one credit on success, 402 when exhausted |
| `POST /api/party/:id/background/weave` | one holistic read-only reflection across every written memory; one credit on success, 400 with no memories, 402 when exhausted |
| `GET /api/llm-credits?owner=<pcId\|draftId>` | one owner's word-weaving standing `{granted, used, remaining, requested}` |
| `POST /api/llm-credits/request` | player asks the steward for more; records a standing request, broadcasts |
| `GET /api/llm-credits/gm` | full credit ledger with resolved names for the GM Expansions panel |
| `POST /api/llm-credits/grant` | GM grants more expansions to one owner (bounded 1..200), clears the request, broadcasts |
| `POST /api/party/:id/restore` | return a retired character to player choosers and sheets |
| `PUT /api/party/:id/conditions` | replace a PC's validated standard Conditions; broadcasts to player clients |
| `GET /api/items/consumables` | the 60-entry standard Consumables catalog |
| `POST /api/party/:id/inventory/grant` | give a standard Consumable, stacking to the rules limit of five |
| `POST/PUT/DELETE /api/party/:id/inventory[/:itemId]` | add, edit, or remove a typed carried item |
| `POST /api/party/inventory/paper` | GM delivery of private or group paper artifacts to PC inventories |
| `POST /api/party/:id/inventory/:itemId/use` | atomically resolve a reaction and consume one quantity |
| `GET /api/music` | music desk library, playlists, provider status, and published character sources |
| `POST /api/music/generate` | create two drafts, or cover a published character source |
| `GET /api/music/themes/:pcId` | one player's overture drafts and published theme |
| `POST /api/music/themes/:pcId/generate` | write another character overture draft |
| `POST /api/music/themes/:pcId/publish` | publish a ready draft under `Visseren/Character Themes` |
| `PUT /api/music/themes/:pcId/identity` | curate the musical identity used by character cover mode |
| `POST /api/music/provider/check` | check configured provider account credits without generating |
| `PUT /api/music/suno-mirror` | set the exact Suno web collection mirrored by the desk |
| `POST /api/music/suno-snapshot` | reconcile a validated browser snapshot and cache missing Suno MP3s locally |
| `POST /api/music/playlists`, `POST /api/music/playlists/:id/songs` | create playlists and add songs |
| `PUT/DELETE /api/music/songs/:id` | rename or remove song metadata; deletion keeps audio on disk |
| `GET /api/adversaries` | the GM bestiary (`data/adversaries.json`): RAW stat blocks flavored to Visseren; never on player whitelists |
| `GET/POST /api/encounters` | saved encounter documents; creating one seeds a card per current-campaign active PC |
| `PUT/DELETE /api/encounters/:id` | rename or move validated entity cards (broadcasts so the projector follows); deleting a projected encounter clears the screen |
| `GET/PUT /api/board` | backward-compatible alias for the `main` drafting board |
| `GET/PUT /api/board/:name` | named `main` or `hud` board document `{items, pins}` |
| `GET /api/gm-screen` | static flat SRD quick-reference sections for GM surfaces |
| `POST/PUT/DELETE /api/people[/:id]` | wider-world NPCs: description public, `hidden.notes` private, `placeId` moves them, `items` carried, `revealed` gates player visibility |
| `GET /api/art/status` | report local portrait/scenic graph validity and portrait-adviser readiness |
| `GET /api/art/library` | active character portraits, canonical locations, scenic taxonomy, and saved scene records; generation seeds are omitted |
| `POST /api/art/scenes` | generate 1536 × 864 scenery for one canonical location, preserve every returned variant, and optionally cast the first only after success |
| `DELETE /api/art/scenes/:id` | remove one scenic library record while keeping its generated image file |
| `POST /api/art/portrait` | generate an optional 1104 × 1472 portrait for an unfinished character draft; accepts hidden seed reuse, Style 1/2, and `-1..+2` Steps/CFG modifiers |
| `POST /api/art/portrait/suggest` | ask Anthropic for one editable portrait-brief suggestion |
| `POST /api/party/:id/portrait` | generate and attach a player-character portrait through ComfyUI |
| `POST /api/people/:id/portrait` | save the prompt, generate, and attach a wider-world portrait through ComfyUI |
| `POST /api/places/:id/image` | save the prompt, generate, and attach a scenic image through ComfyUI |
| `POST/PUT/DELETE /api/places[/:id]` | places; the village (`place_village`, `fixed`) cannot be deleted |
| `GET /api/lore?pc=id` | whitelisted journal payload: revealed people/places, group notes + that PC's personal notes |
| `GET /api/journal-doodles/:pcId` | the chosen PC's three transparent journal drawing layers |
| `PUT /api/journal-doodles/:pcId/:page` | save normalized pen/eraser strokes for Journal, People, or Places |
| `GET/PUT /api/screen` | the table screen: GM projects one thing (image/card/stores/buildings/text, `type: null` darkens); GET resolves through `screenView()` whitelists |
| `POST/PUT/DELETE /api/notes[/:id]` | player notes (journal/person/place, group/personal); edits and strikes require the author's `pcId` |
| `GET/POST/PUT /api/feedback[/:id]` | screenshot ticket queue and GM triage state |
| `GET/DELETE /api/telemetry`, `POST /api/telemetry/batch` | read/reset GM UX evidence and ingest bounded content-free player batches |

`PUT /api/party/:id` merges partial bodies (the sheet PUTs single fields like
`{hp: 3}`); if `level` changes it shifts damage thresholds by the same delta.
Conditions are a separate validated mutation (`hidden`, `restrained`, or
`vulnerable`) and are explicitly included in `playerCharacterView()`.
Inventory uses a backward-compatible typed-item whitelist and declarative
Consumable reactions; see [inventory.md](inventory.md).

## Frontend conventions

- No framework, no build. Each page is `index.html` + one JS module; shared
  code only in `public/shared/`.
- **Installable player shell (PWA):** `public/pwa/` holds the manifest, icons,
  and service worker; the server exposes them as `/manifest.webmanifest` and
  `/sw.js` (root path, so the worker's scope covers every player surface).
  Strategy: network-first with cache fallback for player pages and the
  whitelisted API snapshot reads (`/api/table`, `/api/lore`, `/api/rules`,
  `/api/reference`, `/api/party`, `/api/messages`, consumables, doodles);
  cache-then-refresh for images; `/api/stream`, non-GET requests, and every
  GM surface (`/gm`, `/board`, `/music`, `/screen`, `/cartography`) are never
  intercepted. The worker widens nothing: it only replays responses the
  server's whitelists already released to that device. Bump `VERSION` in
  `public/pwa/sw.js` after breaking shell changes. `shared/pwa.js` registers
  the worker and adds an Android haptic tick; `shared/native-feel.css`
  hardens touch behavior (tap highlight, control selection, overscroll,
  same-frame pressed states) on all player pages.
- **Creator sub-steps:** a main creation section may define a static or
  data-driven `parts` count. The fixed footer renders secondary progress and
  moves forward content left/backward content right. Versioned `step`, `part`,
  and draft state are saved locally and mirrored through the character-draft
  API; signing the final covenant deletes the draft only after the PC exists.
- **Themes:** GM surfaces keep `ledger.css` as their dense structural base and
  load `gm-theme.css` last for the dark, lamplit worktable treatment. Player
  surfaces use `lamplight.css`. Tone per spec §2: quiet, warm, no gamified
  fanfare; microcopy per §12.
- **Live updates:** pages listen to `/api/stream` and refetch (debounced).
  Character plates on the board update as players tap their sheets.
- **Encounter stage:** `/board` carries a full-screen encounter builder
  (`board/encounter.js`). Adversaries come from the bestiary; every entity is
  one floating card (`shared/encounter-cards.css`) on a 16:9 stage with
  normalized positions, so the GM board and `/screen` lay the scene out
  identically via `shared/encounter-stage.js`. Dragging an enemy card against
  a player card derives melee (tether + ember ring) — engagement is computed,
  never stored. The header shows RAW battle points ((3 × party) + 2, costs by
  adversary role); the inspector tracks per-instance HP/Stress and defeat.
  "Show at the table" projects through `screenView()`, which whitelists
  labels, portraits, positions, and defeat only — stat blocks, vitals, and
  bestiary identities never reach players.
- **GM quick tools:** `/gm` and `/board` share a fixed hotbar with bounded Fear
  controls, unread correspondence, and a full-screen quick table. The message
  panel shows one PC thread at a time; the overlay combines live GM-whitelisted
  PC vitals, the dedicated `hud` board, static `gm-screen.json` reference rows,
  and a lazy-loaded rules search with compact article previews.
- **Player correspondence:** `shared/player-chat.*` mounts in the tome's bottom
  dock for the current `settlement-pc`. It fetches only `/api/messages?pc=`,
  marks the player side read on open, and sends with `Ctrl+Enter`; EN/SV labels
  live in `shared/i18n.js`.
- **Player field kit:** `shared/player-tools.*` mounts on standalone player
  surfaces, follows `settlement-pc`, writes quick personal/group notes through
  `/api/notes`, and keeps Character, Journal, Inventory, and Rules at hand.
  Embedded pages omit it. The standalone sheet adds a sticky section index;
  the tome accepts `?section=` deep links.
- **Party portraits:** `shared/party-cards.*` mounts beside the player field
  kit on standalone views. It reads public identities from `/api/party`,
  filters to the selected PC's campaign, and renders only portrait/name cards.
  Drag and resize layouts persist locally per viewer and peer; no placement is
  campaign state and no character-sheet fields cross the card boundary.
- **Session chronicle:** GM **Sessions** is a gathering/review folio with
  attendance, completion seals, separate factual/emphasis fields, and an
  explicit publication gate. The Journal's fourth physical bookmark shows a
  draft-safe EN/SV perspective composer and published accounts. Chronicle
  drawing tools stay disabled; active text entry survives SSE refreshes.
- **Rules reference:** `/rules` ranks client-side search as title prefix,
  title substring, keyword, path, then body. Hashes are stable rule IDs;
  `seeAlso` supplies curated links and escaped body text passes through
  `termify()`. Ranking and normalization live in `shared/rules-search.js` and
  are reused by the GM hotbar. Desktop uses independently scrolling
  index/article panes; narrow screens switch between Browse and Rule views.
  `/table` and `/tome` keep stable `?embed=1` reference iframes.
- **GM Almanac:** the console reuses the same ranking module over public rules
  and private lore, with source filters and a bounded lore editor. A segmented
  leaf switches to chance-table tools with physical-result inputs, seen-count
  rules, and one focused reveal sheet. No chance-table entry browser exists.
- **Player-shell visuals:** `/player` is the root for choosing a focused visual
  tool. `/table`, `/table-book`, and `/tome` share `/api/table`, SSE,
  `settlement-pc`, and the existing embeds. See
  [player-shell-visuals.md](player-shell-visuals.md).
- **Identity:** bare `/` redirects to `/login`. A completed-PC choice writes
  only `settlement-pc` and enters `/player`; unfinished drafts resume `/create`.
  GM and projector choices set no player identity. Login groups the public
  `/api/party` identities by active campaign without changing card position
  or paint keys. The creator inserts a campaign part only when multiple active
  campaigns exist. See [player-identity.md](player-identity.md).
- **Campaign boundary:** the settlement, buildings, folk, people/places, and
  event tables remain singular. PCs, drafts, recorded sessions, and chronicle
  entries carry `campaignId`. `tableView().party`, `loreView().party`, and the
  GM session surfaces use the current campaign; `identities` remains the
  explicit all-active-campaign public selector. Archiving removes player access
  but retains every owned record.
- **Character lifecycle:** missing `pc.active` reads as true. Retirement keeps
  the PC, inventory, papers, notes, doodles, and music files intact while all
  player whitelists and mutation routes reject the inactive identity. The GM
  can restore it from Party -> Stepped back; there is no hard-delete route.
- **Personal sheets:** class-specific compositions will share typed, stable
  character modules before layout editing is introduced. The proposed
  scissor interaction and communal vector-sketch bin are bounded in
  [character-sheet-vision.md](character-sheet-vision.md).
- **Background studio:** `/background/:id` edits optional, structured memories
  after character creation. Empty fields never enter the stored character or
  sheet. It is meant to be a playground as much as a serious tool, with three
  AI aids from `server/background-suggest.js` (each one word-weaving credit) and
  one free offline one: **Expand** rewrites the current field into a fuller
  passage; **Kindle sparks** returns three short divergent seeds for one field
  and works even when it is blank; **Weave it together** returns one holistic,
  read-only reflection across every written memory (it never overwrites a
  field); **Draw a muse** shuffles a free, offline nudge card from a local
  bilingual deck. Every AI response stays a separate draft until the player
  accepts it. All aids receive only public character identity plus the relevant
  memory text — never hidden fields — through the shared `identityBlock`.
- **i18n** (`shared/i18n.js`): per-device language (localStorage, EN/SV).
  Game terms (Hope, Stress, Evasion, Loadout…) stay English to match the
  physical cards; UI phrasing translates; the long-press glossary explains
  terms in the chosen language. `t(key)` strings, `TERMS` glossary,
  `termify(escapedText)` auto-links capitalized game terms inside rules text,
  `initI18n()` wires the toggle + popovers. GM console is English-only for now.
  The same popover doubles as a **hover/focus/long-press tooltip for controls**
  via a `data-hint="<TERMS key>"` attribute (opens without hijacking the click);
  to add one, follow the `hoverable-tooltip` skill (`hoverable-tooltip/SKILL.md`).
- **Hand manager** (`character/sheet.js`): Loadout (max 5) / Vault per SRD;
  acquiring filters reference cards by the PC's class domains and level.
- **Character overtures:** completing creation queues two drafts from a concise
  subset of the character text. The sheet can play, regenerate, and publish
  them; provider failures never block character creation.
- **UX evidence:** `shared/telemetry.js` instruments only the fixed player
  routes. It sends normalized coordinates, semantic code targets, coarse
  viewport classes, modes, and active time. It never sends written content,
  identifiers, screenshots, query strings, or browser details. The GM reviews
  it under **UX map**; see [ux-telemetry.md](ux-telemetry.md).

## The roll system (do not "improve")

`4d6 − 1d6` raw (−2..23, bell-shaped) + building level + foreman aptitude
+ player effort (+1) + hidden inspiration (−1..+2) + hidden penalty, clamped
0–30. The log-normal reward curve (2→3→5→8→13→20) is sacred. A future in-app
roller must simulate the actual dice, never a flat 0–30.

## Testing pattern

Run a scratch instance against a copy of `data/` with `DATA_DIR` pointing at a
temp dir, and use dummy event tables there. Never resolve rolls against the
real tables during development — it both spends event numbers and risks
printing unrevealed event text. Clean up test PCs/log entries if you touch the
real data dir. `.claude/launch.json` starts the dev server for browser preview.
