# The Settlement

A locally-run GM tool for **Daggerheart** campaign dungeon-mastering. Currently written for a Westmarches-style campaign, but this can be easily tweaked.

The design source of truth is [docs/settlement-design-spec.md](docs/settlement-design-spec.md).
The code map and API live in [docs/architecture.md](docs/architecture.md).
The alternate player-shell contract lives in
[docs/player-shell-visuals.md](docs/player-shell-visuals.md); trusted device
identity is documented in [docs/player-identity.md](docs/player-identity.md).
The reviewed session chronicler is documented in
[docs/session-retellings.md](docs/session-retellings.md).
The GM lore index and reveal-one-result tables are documented in
[docs/almanac.md](docs/almanac.md).
Working rules for AI-assisted development are in [AGENTS.md](AGENTS.md) and
[CLAUDE.md](CLAUDE.md). The Music Desk's branching tag board (tri-state tag
bubbles compiling a prompt) is documented as a reusable pattern in
[tag-selector/SKILL.md](tag-selector/SKILL.md), packaged as an AI skill for
building the same selector on other surfaces.

## Quick start

```
npm install
npm start          # → http://localhost:4626
```

On Windows, double-click **Start The Settlement.vbs** instead: it starts the
server with no console window and leaves a keeper icon in the system tray —
right-click it to open the ledger/table or to close the settlement down.

Players on the same Wi-Fi can reach the server at `http://<this-machine's-ip>:4626`.
There is no auth — the table runs on trust (and the player dashboard is
whitelisted server-side regardless).

## The surfaces

| Route | Who | What |
|---|---|---|
| `/gm` | GM (private) | Console: campaign controls, reviewed session chronicler, rules/private-lore Almanac, reveal-one-result chance tables, correspondence, playtest tickets, local UX map, settlement ledger, and quick tools |
| `/board` | GM (private) | Named Main/HUD drafting boards with infinite pan/zoom, live stat plates, counters, notes, and pinned camera views |
| `/login` | players | Trusted-table character chooser: campaign-grouped movable portrait cards and a separate resumable-drafts view. Bare `/` lands here. |
| `/player` | players | Player root: switch the device's character and choose a focused physical view. |
| `/table` | players | Settlement-neutral arcana-card deck for Journal, Character, and Rules. |
| `/table-book` | players | GM-revealable settlement folio for Town, Folk of Note, and Chronicle, with directional page turns. |
| `/tome` | players | Personal keepsake tome for Journal, Character, Inventory, Rules, and private Keeper correspondence. |
| `/screen` | everyone (projector) | The table screen: shows the one thing the GM projects — mood images, NPC portraits, cards, stores, free text |
| `/create` | players | Guided Daggerheart character creation with an active-campaign choice when needed (all SRD data local) |
| `/character/:id` | one player each | Live character sheet: tap-to-mark HP/Stress/Hope/Armor, Loadout/Vault hand manager |
| `/journal` | players | Chronicle perspectives and published accounts, revealed people/places, and a season-stamped diary with private or shared notes |
| `/rules` | everyone | Searchable Daggerheart table reference with grouped browsing, deep links, cross-references, and glossary notes |
| `/music` | GM | Music desk: spatial song bubbles, local playlists, a one-collection Suno web mirror, branching prompt tags, and character-theme variations |

Player-facing pages have an EN/SV language toggle (top right, per device) and
long-press glossary popovers on underlined game terms.

## How a season resolves

1. GM opens **Downtime** in the console, picks a building.
2. Rolls physical dice: **4d6 − 1d6** (raw −2..23), types the raw result.
3. The app adds building level + foreman aptitude + player effort — and folds in
   hidden modifiers (inspiration, hidden penalties) without itemizing them.
4. Total is clamped 0–30 and looked up in that building's table. First time a
   number fires it shows the event text and pays the resource; repeats pay the
   resource only. A `0` wipes that resource's stockpile.
5. Everything lands in the season log; the GM chooses what to publish to the
   table view. A timestamped backup of `data/` is taken on every resolution.

## How a session enters the chronicle

1. The GM opens **Sessions**, marks who attended, and ends the session.
2. Each chosen player writes the scene that mattered most from their
   character's eyes under the Journal's **Chronicle** bookmark.
3. The GM adds a factual summary and point of emphasis, then sends only those
   player-known fields and previous published accounts to the chronicler.
4. The returned account stays private until the GM edits and explicitly
   publishes it.

Provider setup and the audience boundary are in
[docs/session-retellings.md](docs/session-retellings.md).

## Data

All state is pretty-printed JSON in `data/` — hand-editable with the server
stopped (or live; the GM console re-reads on refresh):

- `settlement.json` — population, season, buildings (level, foreman, spent event numbers, effects)
- `campaigns.json` — active/archived campaign names and the campaign currently at the table
- `session.json` — live table state: bounded Fear pool and whether players may see it
- `sessions.json` — campaign-scoped attendance, perspectives, reviewed retellings, and publication state
- `characters.json` — the folk (NPCs), including the GM-only hidden layer
- `pcs.json` — campaign-owned player characters from the creator; `active: false` retires one without deleting its records
- `people.json` — the wider world's NPCs (not villagers): public description, GM-only notes, carried items, current place
- `places.json` — the map beyond the palisade; the settlement itself is the fixed first entry
- `notes.json` — the players' notes and journal entries
- `messages.json` — one private GM thread per PC, including per-side read state
- `journal-doodles.json` — per-PC pen and eraser layers for the Journal, People, and Places chapters
- `log.json` — the campaign-scoped season ledger; entries carry a `published` flag
- `boards.json` — named `main` and `hud` drafting-board documents; boot migrates a legacy `board.json` once
- `music.json` — song metadata, playlists, provider tasks, and published character-theme pointers
- `character-drafts.json` — versioned resumable creator state, separate from completed PCs
- `feedback.json` — annotated screenshot tickets and GM triage state
- `telemetry.json` — gitignored, content-free local UX aggregates; see [docs/ux-telemetry.md](docs/ux-telemetry.md)
- `event-tables/*.json` — **do not open** (see above)
- `tables/*.json` — **do not open**; chance-table entries are revealed one result at a time through the GM Almanac
- `tables-state.json` — numbers already revealed from chance tables; created on the first roll
- `wiki-lore.json` — editable private GM pages shown beside public rules in the Almanac
- `daggerheart/reference.json` — SRD reference data (classes, ancestries, communities, domain cards, weapons, armor, and the 60-entry Consumables catalog)
- `daggerheart/gm-screen.json` — compact SRD quick-reference rows for the GM overlay
- `daggerheart/rules.json` — hand-editable public rules corpus used by the searchable table reference
- `backups/` — automatic snapshots (gitignored)

Audio files live outside `data/` under `Visseren/`; see
[docs/music-integration.md](docs/music-integration.md) for local secret and
provider configuration.

## Roadmap

Per the spec's build phases, plus ambitions agreed at the table:

- **Phase 3 — The Map**: hex overlay on the GM's scanned map (deferred until the scan is available).
- **Phase 4 — Dice & depth**: the [construction and building improvement flow](docs/construction.md) is live; the in-app 4d6−1d6 reveal and library-building unlock remain deferred.
- **Board screen**: a mood/status display in front of the table (another whitelisted route, like `/table`).
- **ComfyUI art workshop**: local portrait and scenic generation accepts tokenized API-format workflows without fixed node IDs; setup lives in [docs/comfyui/README.md](docs/comfyui/README.md).
- **Magic item cards**: print-ready card fronts matching the physical deck ("mold" idea — layered paper in a sleeve).
- **Sheet personalization**: per-class sheet layouts, bookmarkable stats, a draggable shortcut tray.

Daggerheart SRD content is used under the Darrington Press Community Gaming
License. Reference data sourced from
[daggersearch/daggerheart-data](https://github.com/daggersearch/daggerheart-data).
