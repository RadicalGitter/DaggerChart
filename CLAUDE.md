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
- Folk cards are split for spoiler safety: `description` is player-facing and
  goes to `/table` word for word — keep anything players shouldn't know out of
  it. GM-only truth about a person lives in `hidden.notes`. There is no
  `backstory` field anymore.
- The same split governs People (non-villager NPCs, `data/people.json`) and
  Places (`data/places.json`): public `description`, private `hidden.notes`,
  plus a `revealed` flag gating whether the entry reaches the players' journal
  at all. `loreView()` in `server/views.js` is the whitelist. The village is
  the fixed place `place_village`; moving an NPC is just changing `placeId`.
- Player notes (`data/notes.json`) belong to a PC (`pcId`); `scope` is
  `"group"` or `"personal"`. Personal notes leave the server only for
  `?pc=<owner>` — there's no auth, it's trust plus not-shipping-by-default.
- The ComfyUI portrait request on People saves `portraitPrompt` and returns a
  stub message; wiring comes later. Places will get their own workflow later.
- `/table` navigation is the card deck: a proportional row of big section
  cards; opening one docks the deck into a stack (selection on top) beside the
  content panel; pressing the stack returns. New sections = one `.big-card`
  button in `public/table/index.html` plus an entry in `SECTIONS` in
  `table.js`; the layout compresses automatically. The ❧ link (bottom right)
  is the quiet door back to `/gm`.

- `/screen` is the projector in front of the table (the drafting board owns
  `/board`): it shows exactly one thing, chosen by the GM — a mood image,
  a folk/person/place card, the stores, the buildings, or free text.
  `screenView()` resolves the projection at read time through the public
  whitelists, so even deliberately shown unrevealed entries expose only
  public fields. "Show at the table" buttons live on GM cards; the Screen
  section in `/gm` holds the forms and the darken control.

## What's next (agreed ambitions, in rough order)
- ComfyUI wiring: the GM-side request UI exists on People cards (prompt saved
  to `portraitPrompt`, `POST /api/people/:id/portrait` is a stub) — connect it
  to the local 5090 using `docs/comfyui/waidrin-portraits-workflow.json`
  ("Waidrin Portraits"). Later: players generate portraits from `/create`
  with prompt + toggles/sliders, and a new workflow for Places images.
- In-app 4d6−1d6 roller with a reveal moment (Phase 4; simulate real dice,
  never flat 0–30).
- Magic item cards: print-ready fronts matching the physical deck; scalable
  to building cards for a physical "live board".
- Sheet personalization: per-class layouts, bookmarkable stats, click-tracked
  shortcut tray on sheets; GM-side custom groupings.
- Glossary/domain-card plate type for the drafting board (`/board`).
