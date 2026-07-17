# Architecture

Boring on purpose: Node + Express, no build step, vanilla ES-module frontend,
pretty-printed JSON on disk. One machine (the GM's), players connect over LAN.

```
server/
  index.js    routes, SSE stream, static serving
  music.js    song metadata, playlists, character themes, Suno provider boundary
  state.js    domain logic: roll resolution, modifiers, season, log
  store.js    atomic JSON read/write (tmp+rename), timestamped backups
  views.js    audience whitelists: gmView(), tableView(), loreView()
public/
  shared/     themes, i18n.js, and small player-facing registries
  gm/         GM console (sections: downtime, buildings, folk, people, places, party, stores, ledger, settlement)
  login/      trusted-table identity chooser (GM, projector, PCs, creator)
  table/      read-only projectable dashboard (card-deck navigation)
  table-book/ standalone physical-book shell variant (same player API)
  tome/       aged-tome shell variant: keepsake bookmarks (see player-shell-visuals.md)
  screen/     the projector client (renders whatever the GM casts via /api/screen)
  create/     character creation wizard
  character/  live character sheet + hand manager
  music/      GM music desk: bubble library, prompt tag board, generation controls
  journal/    players' journal: notes on people, places, and days
  board/      the Drafting Board (infinite canvas, plates, pins)
data/         all persistent state (see README)
docs/         this file, the design spec, ComfyUI workflow
```

## Server

- **`store.js`** — `loadJson(name, fallback)` / `saveJson(name, obj)`; writes are
  atomic (write `.tmp`, rename). `snapshot()` copies every `data/*.json` into
  `data/backups/<timestamp>/`; called on each downtime resolution. `DATA_DIR`
  env var overrides the data directory (used by tests/scratch runs).
- **`state.js`** — owns the mutable `state` (settlement, characters, pcs, log,
  event tables). `resolveDowntime(buildingId, raw, effort)` implements §5 of the
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
  Never render player surfaces from `gmView()`.
- **`index.js`** — routes below, plus `GET /api/stream` (SSE). Mutating
  endpoints call `broadcast()` so open pages refresh; `PUT /api/board`
  deliberately does *not* broadcast (would echo the GM's own board edits back).
- **`music.js`** — owns `music.json`, playlist/theme metadata, safe local-audio
  paths, publishing, and the mock/live provider adapter. Generated files are
  downloaded into `Visseren/Generated`; published themes are copied to
  `Visseren/Character Themes/<Character Name>`. See
  [music-integration.md](music-integration.md).

## API

| Endpoint | Purpose |
|---|---|
| `GET /api/state` | full GM state (private) |
| `GET /api/table` | whitelisted player payload |
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
| `GET/POST/PUT/DELETE /api/party[/:id]` | player characters; list and single-character responses are explicit player whitelists |
| `PUT /api/party/:id/conditions` | replace a PC's validated standard Conditions; broadcasts to player clients |
| `GET /api/items/consumables` | the 60-entry standard Consumables catalog |
| `POST /api/party/:id/inventory/grant` | give a standard Consumable, stacking to the rules limit of five |
| `POST/PUT/DELETE /api/party/:id/inventory[/:itemId]` | add, edit, or remove a typed carried item |
| `POST /api/party/:id/inventory/:itemId/use` | atomically resolve a reaction and consume one quantity |
| `GET /api/music` | music desk library, playlists, provider status, and published character sources |
| `POST /api/music/generate` | create two drafts, or cover a published character source |
| `GET /api/music/themes/:pcId` | one player's overture drafts and published theme |
| `POST /api/music/themes/:pcId/generate` | write another character overture draft |
| `POST /api/music/themes/:pcId/publish` | publish a ready draft under `Visseren/Character Themes` |
| `PUT /api/music/themes/:pcId/identity` | curate the musical identity used by character cover mode |
| `POST /api/music/provider/check` | check configured provider account credits without generating |
| `POST /api/music/playlists`, `POST /api/music/playlists/:id/songs` | create playlists and add songs |
| `PUT/DELETE /api/music/songs/:id` | rename or remove song metadata; deletion keeps audio on disk |
| `GET/PUT /api/board` | drafting-board document `{items, pins}` |
| `POST/PUT/DELETE /api/people[/:id]` | wider-world NPCs: description public, `hidden.notes` private, `placeId` moves them, `items` carried, `revealed` gates player visibility |
| `POST /api/people/:id/portrait` | ComfyUI request stub — saves `portraitPrompt`, returns "not wired yet" |
| `POST/PUT/DELETE /api/places[/:id]` | places; the village (`place_village`, `fixed`) cannot be deleted |
| `GET /api/lore?pc=id` | whitelisted journal payload: revealed people/places, group notes + that PC's personal notes |
| `GET /api/journal-doodles/:pcId` | the chosen PC's three transparent journal drawing layers |
| `PUT /api/journal-doodles/:pcId/:page` | save normalized pen/eraser strokes for Journal, People, or Places |
| `GET/PUT /api/screen` | the table screen: GM projects one thing (image/card/stores/buildings/text, `type: null` darkens); GET resolves through `screenView()` whitelists |
| `POST/PUT/DELETE /api/notes[/:id]` | player notes (journal/person/place, group/personal); edits and strikes require the author's `pcId` |

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
  moves forward content left/backward content right; `step`, `part`, and the
  draft are restored together from per-tab session storage.
- **Themes:** GM surfaces use `ledger.css` (light, steward's-ledger). Player
  surfaces use `lamplight.css` (dark). Tone per spec §2: quiet, warm, no
  gamified fanfare; microcopy per §12.
- **Live updates:** pages listen to `/api/stream` and refetch (debounced).
  Character plates on the board update as players tap their sheets.
- **Player-shell visuals:** `/table` is canonical; standalone alternates such
  as `/table-book` share `/api/table`, SSE, `settlement-pc`, and the existing
  embeds. See [player-shell-visuals.md](player-shell-visuals.md).
- **Identity:** bare `/` redirects to `/login`. A PC choice writes only
  `settlement-pc`; GM and projector choices set no player identity. See
  [player-identity.md](player-identity.md).
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
