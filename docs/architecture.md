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
  telemetry.js bounded, content-free local UX aggregation
  state.js    domain logic: roll resolution, modifiers, season, log
  store.js    atomic JSON read/write (unique tmp+rename), timestamped backups
  views.js    audience whitelists for GM, shells, lore, PCs, and messages
public/
  shared/     themes, i18n, session pools, GM tools/messages, rules search, player chat, feedback and UX collectors
  gm/         GM console (campaign/session controls, Almanac, correspondence, quick table, feedback queue, and UX review map)
  login/      trusted-table chooser: movable portrait cards + draft side view
  player/     player root: identity switcher and visual-tool shelf
  table/      general arcana-card shell over six player sections, including Rules
  table-book/ settlement folio: town, folk, and chronicle
  tome/       personal tome: journal, character, inventory, Rules, and private correspondence
  screen/     the projector client (renders whatever the GM casts via /api/screen)
  create/     character creation wizard
  character/  live character sheet + hand manager
  music/      GM music desk: bubble library, prompt tag board, generation controls
  rules/      searchable public SRD table reference
  journal/    players' Chronicle accounts and notes on people, places, and days
  board/      named Main/HUD drafting boards (infinite canvas, plates, pins)
data/         all persistent state (see README)
docs/         this file, the design spec, ComfyUI workflow
```

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
  bounded relative sampler modifiers without fixed node IDs, queues them,
  polls one prompt's history, and copies returned images into the gitignored
  player-static art directory. Portrait and scenic setup is documented in
  [comfyui/README.md](comfyui/README.md).
- **`portrait-suggest.js`** — sends only bounded, player-known portrait context
  to Anthropic and returns one editable prose suggestion. It never generates
  an image or writes character state.
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
| `PUT /api/buildings/:id` | level, foreman assignment |
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
| `GET/PUT /api/board` | backward-compatible alias for the `main` drafting board |
| `GET/PUT /api/board/:name` | named `main` or `hud` board document `{items, pins}` |
| `GET /api/gm-screen` | static flat SRD quick-reference sections for GM surfaces |
| `POST/PUT/DELETE /api/people[/:id]` | wider-world NPCs: description public, `hidden.notes` private, `placeId` moves them, `items` carried, `revealed` gates player visibility |
| `GET /api/art/status` | report local portrait/scenic graph validity and portrait-adviser readiness |
| `POST /api/art/portrait` | generate an optional portrait for an unfinished character draft; accepts hidden seed reuse plus `-1..+2` Steps/CFG modifiers |
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
- **Creator sub-steps:** a main creation section may define a static or
  data-driven `parts` count. The fixed footer renders secondary progress and
  moves forward content left/backward content right. Versioned `step`, `part`,
  and draft state are saved locally and mirrored through the character-draft
  API; signing the final covenant deletes the draft only after the PC exists.
- **Themes:** GM surfaces use `ledger.css` (light, steward's-ledger). Player
  surfaces use `lamplight.css` (dark). Tone per spec §2: quiet, warm, no
  gamified fanfare; microcopy per §12.
- **Live updates:** pages listen to `/api/stream` and refetch (debounced).
  Character plates on the board update as players tap their sheets.
- **GM quick tools:** `/gm` and `/board` share a fixed hotbar with bounded Fear
  controls, unread correspondence, and a full-screen quick table. The message
  panel shows one PC thread at a time; the overlay combines live GM-whitelisted
  PC vitals, the dedicated `hud` board, static `gm-screen.json` reference rows,
  and a lazy-loaded rules search with compact article previews.
- **Player correspondence:** `shared/player-chat.*` mounts in the tome's bottom
  dock for the current `settlement-pc`. It fetches only `/api/messages?pc=`,
  marks the player side read on open, and sends with `Ctrl+Enter`; EN/SV labels
  live in `shared/i18n.js`.
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
- **i18n** (`shared/i18n.js`): per-device language (localStorage, EN/SV).
  Game terms (Hope, Stress, Evasion, Loadout…) stay English to match the
  physical cards; UI phrasing translates; the long-press glossary explains
  terms in the chosen language. `t(key)` strings, `TERMS` glossary,
  `termify(escapedText)` auto-links capitalized game terms inside rules text,
  `initI18n()` wires the toggle + popovers. GM console is English-only for now.
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
