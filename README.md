# The Settlement

A locally-run GM tool for a West Marches–style **Daggerheart** campaign: ~50 settlers
building a town in an unexplored world. It is a steward's ledger, not a 4X game —
the tool tracks state and reveals results; the GM narrates.

The design source of truth is [docs/settlement-design-spec.md](docs/settlement-design-spec.md).
The code map and API live in [docs/architecture.md](docs/architecture.md).
Working rules for AI-assisted development are in [CLAUDE.md](CLAUDE.md).

## ⚠️ Spoiler safety (read first)

**The GM has deliberately not read the event tables.** The files under
`data/event-tables/` contain 155+ unrevealed events that are meant to surprise
the GM at the table. **Do not open them, print them, or diff them.** The app is
built so that only the single rolled entry is ever revealed. Anything — a
screen, a log, an error message, a code review — that exposes unrolled event
text is a critical bug. See §8 of the design spec.

## Quick start

```
npm install
npm start          # → http://localhost:4626
```

Players on the same Wi-Fi can reach the server at `http://<this-machine's-ip>:4626`.
There is no auth — the table runs on trust (and the player dashboard is
whitelisted server-side regardless).

## The surfaces

| Route | Who | What |
|---|---|---|
| `/gm` | GM (private) | Console: downtime runner, buildings, folk, stores, ledger, settlement |
| `/board` | GM (private) | The Drafting Board — infinite pan/zoom whiteboard with live stat plates, counters, notes, and pinned camera views |
| `/table` | everyone (projectable) | Read-only town dashboard: population, stores, buildings, folk of note, published chronicle |
| `/create` | players | Guided Daggerheart character creation (all SRD data local) |
| `/character/:id` | one player each | Live character sheet: tap-to-mark HP/Stress/Hope/Armor, Loadout/Vault hand manager |

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
- `characters.json` — the folk (NPCs), including the GM-only hidden layer
- `pcs.json` — player characters from the creator
- `log.json` — the season ledger; entries carry a `published` flag
- `board.json` — drafting-board plates and pins
- `event-tables/*.json` — **do not open** (see above)
- `daggerheart/reference.json` — SRD reference data (classes, ancestries, communities, domain cards, weapons, armor, items)
- `backups/` — automatic snapshots (gitignored)

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
