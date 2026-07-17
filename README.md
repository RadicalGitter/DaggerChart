# The Settlement

A locally-run GM tool for **Daggerheart** campaign dungeon-mastering. Currently written for a Westmarches-style campaign, but this can be easily tweaked.

The design source of truth is [docs/settlement-design-spec.md](docs/settlement-design-spec.md).
The code map and API live in [docs/architecture.md](docs/architecture.md).
The alternate player-shell contract lives in
[docs/player-shell-visuals.md](docs/player-shell-visuals.md); trusted device
identity is documented in [docs/player-identity.md](docs/player-identity.md).
Working rules for AI-assisted development are in [AGENTS.md](AGENTS.md) and
[CLAUDE.md](CLAUDE.md).

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
| `/gm` | GM (private) | Console: campaign controls, private PC correspondence, playtest tickets, local UX map, settlement ledger, and a session quick table with rules search |
| `/board` | GM (private) | Named Main/HUD drafting boards with infinite pan/zoom, live stat plates, counters, notes, and pinned camera views |
| `/login` | everyone | Trusted-table chooser: finished-character bubbles, a separate resumable-drafts view, GM, and projector. Bare `/` lands here. |
| `/player` | players | Player root: switch the device's character and choose a focused physical view. |
| `/table` | players | General arcana-card deck over Town, Folk, Chronicle, Journal, Character, and Rules. |
| `/table-book` | players | Settlement folio for Town, Folk of Note, and Chronicle, with directional page turns. |
| `/tome` | players | Personal keepsake tome for Journal, Character, Inventory, Rules, and private Keeper correspondence. |
| `/screen` | everyone (projector) | The table screen: shows the one thing the GM projects — mood images, NPC portraits, cards, stores, free text |
| `/create` | players | Guided Daggerheart character creation (all SRD data local) |
| `/character/:id` | one player each | Live character sheet: tap-to-mark HP/Stress/Hope/Armor, Loadout/Vault hand manager |
| `/journal` | players | The party's journal: notes on people and places the GM reveals, plus a season-stamped diary — each note "for my eyes" or "for the table" |
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

## Data

All state is pretty-printed JSON in `data/` — hand-editable with the server
stopped (or live; the GM console re-reads on refresh):

- `settlement.json` — population, season, buildings (level, foreman, spent event numbers, effects)
- `session.json` — live table state: bounded Fear pool and whether players may see it
- `characters.json` — the folk (NPCs), including the GM-only hidden layer
- `pcs.json` — player characters from the creator; `active: false` retires one without deleting its records
- `people.json` — the wider world's NPCs (not villagers): public description, GM-only notes, carried items, current place
- `places.json` — the map beyond the palisade; the settlement itself is the fixed first entry
- `notes.json` — the players' notes and journal entries
- `messages.json` — one private GM thread per PC, including per-side read state
- `journal-doodles.json` — per-PC pen and eraser layers for the Journal, People, and Places chapters
- `log.json` — the season ledger; entries carry a `published` flag
- `boards.json` — named `main` and `hud` drafting-board documents; boot migrates a legacy `board.json` once
- `music.json` — song metadata, playlists, provider tasks, and published character-theme pointers
- `character-drafts.json` — versioned resumable creator state, separate from completed PCs
- `feedback.json` — annotated screenshot tickets and GM triage state
- `telemetry.json` — gitignored, content-free local UX aggregates; see [docs/ux-telemetry.md](docs/ux-telemetry.md)
- `event-tables/*.json` — **do not open** (see above)
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
- **Phase 4 — Dice & depth**: in-app 4d6−1d6 roller with a reveal moment; building improvement flow; library building migration.
- **Board screen**: a mood/status display in front of the table (another whitelisted route, like `/table`).
- **ComfyUI portraits**: in-app character portrait generation on the local 5090; the working workflow is saved at [docs/comfyui/waidrin-portraits-workflow.json](docs/comfyui/waidrin-portraits-workflow.json).
- **Magic item cards**: print-ready card fronts matching the physical deck ("mold" idea — layered paper in a sleeve).
- **Sheet personalization**: per-class sheet layouts, bookmarkable stats, a draggable shortcut tray.

Daggerheart SRD content is used under the Darrington Press Community Gaming
License. Reference data sourced from
[daggersearch/daggerheart-data](https://github.com/daggersearch/daggerheart-data).
