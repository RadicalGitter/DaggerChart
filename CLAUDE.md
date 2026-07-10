# CLAUDE.md — working rules for this repo

Read [docs/settlement-design-spec.md](docs/settlement-design-spec.md) before
designing anything; it is the source of truth. Code map + API:
[docs/architecture.md](docs/architecture.md). Human-facing overview: [README.md](README.md).

## Hard rules (spoiler safety — highest priority)

1. **Never read, print, quote, grep, or diff event text** from
   `data/event-tables/*.json`. The GM (the user) has deliberately not read
   these tables; results must surprise them at the table. Structure keys
   (`tier`, `resource`, flags) are fine to inspect; `event` strings are not.
   This applies to *your own output in chat* — tool results the user can
   expand count as spoiling.
2. Never build a screen, log, export, or error path that shows more than the
   single rolled entry. No table browsers, no search across event text.
3. Player-facing payloads come only from the whitelist in `server/views.js`.
   Hidden fields (`hidden.inspiration`, `hidden.penalty`) must be excluded
   server-side, never hidden with CSS.
4. When testing downtime resolution, run against a scratch `DATA_DIR` with
   dummy tables — resolving against real data spends event numbers and can
   print real event text.

## Project conventions

- Boring stack, no build step: Express + vanilla ES modules. State is
  pretty-printed, hand-editable JSON in `data/`; writes atomic; backups on
  every resolution.
- The roll math (§5) and the reward curve (§6) are exact; do not rebalance.
- Tone (§2, §12): steward's ledger, grounded warmth. Catastrophes reported
  plainly, no exclamation marks, no "EPIC LOOT" energy. Buttons are verbs from
  the fiction (*Resolve the season*, *Open the ledger*).
- GM surfaces: light `ledger.css`. Player surfaces: dark `lamplight.css`.
- i18n: game terms stay English (match the physical cards); UI phrasing has
  EN/SV strings in `public/shared/i18n.js`; long-press glossary (`TERMS`)
  explains terms per language. New player-facing strings need both languages.
- After changes, verify in the browser preview (`.claude/launch.json`,
  server name `settlement`, port 4626) and clean up any test PCs, log
  entries, or board plates you created in real data.

## Decisions already made (don't relitigate)

- One trusted table: no auth, no accounts; players reach the server over LAN.
- PCs (players' characters) *are* in scope despite spec §10 — the user
  expanded scope deliberately: creator at `/create`, live sheets at
  `/character/:id`, Loadout/Vault hand manager. Town-side hidden-layer rules
  still apply to NPC folk.
- SRD reference data lives in `data/daggerheart/reference.json` (from
  daggersearch/daggerheart-data, DPCGL license). 189 domain cards, all levels.
- Hex map (Phase 3) deferred until the GM supplies the scanned map.

## What's next (agreed ambitions, in rough order)

- **Folk disclosure audit (user-flagged, do first):** be very careful what
  folk/NPC *descriptions* reveal on player surfaces. The `/table` whitelist
  controls which fields go out, but a backstory string itself can leak the
  hidden layer (e.g. hints of Jory's incompetence). Likely fix: split folk
  cards into a player-safe public description and GM-only notes, and audit
  the seeded backstories in `data/characters.json` for leaks.
- **Table view return control (user-flagged):** there is no button to get
  from `/table` back to the GM console. Add a discreet one — it must stay
  visually quiet since `/table` is projected for players.
- **Table view card navigation (user-specified interaction):** replace the
  section layout with big horizontal cards acting as buttons, proportionally
  arranged so adding a card compresses the others to fit. Clicking a card
  slides it to the left into a "landing zone" showing a stack of cards with
  the current selection on top, revealing that card's contents; pressing the
  stacked card returns to the horizontal card view.
- Board screen: a projectable mood/status route in front of the table —
  reuse the `/table` whitelist pattern; likely shows town art + key stats.
- ComfyUI portrait generation: local API calls to the GM's 5090; the working
  portrait workflow is `docs/comfyui/waidrin-portraits-workflow.json`
  ("Waidrin Portraits"). Players would generate portraits from `/create`
  with prompt + toggles/sliders influencing the model.
- In-app 4d6−1d6 roller with a reveal moment (Phase 4; simulate real dice,
  never flat 0–30).
- Magic item cards: print-ready fronts matching the physical deck; scalable
  to building cards for a physical "live board".
- Sheet personalization: per-class layouts, bookmarkable stats, click-tracked
  shortcut tray on sheets; GM-side custom groupings.
- Glossary/domain-card plate type for the drafting board (`/board`).
