# AGENTS.md — working rules for this repo

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
  the fiction when the metaphor is literal (*Open the journal*, *Advance the
  season*); utility navigation stays direct (*Choose your character*, *Next*),
  and destructive actions state exactly what they remove.
- GM surfaces: light `ledger.css`. Player surfaces: dark `lamplight.css`.
- i18n: game terms stay English (match the physical cards); UI phrasing has
  EN/SV strings in `public/shared/i18n.js`; long-press glossary (`TERMS`)
  explains terms per language. New player-facing strings need both languages.
- After changes, verify in the browser preview (`.Codex/launch.json`,
  server name `settlement`, port 4626) and clean up any test PCs, log
  entries, or board plates you created in real data.

## Decisions already made (don't relitigate)

- One trusted table: no auth, no passwords; players reach the server over LAN.
  Bare `/` opens `/login`, an identity chooser rather than a security boundary:
  GM opens `/gm`, projector opens `/screen`, and a PC choice stores
  `settlement-pc` before entering `/player`. See `docs/player-identity.md`.
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
- Journal doodles are normalized vector strokes in `data/journal-doodles.json`,
  split by PC and chapter (`journal`, `people`, `places`). Pen and eraser marks
  render on a transparent canvas above the page, so resizing never bakes them
  into journal content.
- The ComfyUI portrait request on People saves `portraitPrompt` and returns a
  stub message; wiring comes later. Places will get their own workflow later.
- `/table` navigation is the card deck: a proportional row of big section
  cards; opening one docks the deck into a stack (selection on top) beside the
  content panel; pressing the stack (or the masthead) returns. New sections =
  one `.big-card` button in `public/table/index.html` plus an entry in
  `SECTIONS` in `table.js`; the layout compresses automatically. The ❧ link
  (bottom right) is the quiet door back to `/gm`.
- `/player` is the player root. It switches the device's `settlement-pc` and
  presents the aged personal tome, settlement folio, and general arcana deck
  as distinct tools. `settlement-shell` stores only a device preference.
- `/table` is the broad general shell: Journal and Character cards embed
  the existing pages in the panel via same-origin iframes (`?embed=1` hides
  their masthead). Device identity is one localStorage key, `settlement-pc`
  (picker on the Character card, the journal's picker, or finishing `/create`
  all set it; storage events keep the shell in sync). Embed panels carry a
  stable `panelKey` so SSE refreshes never reload an iframe mid-use. Under
  640px the deck lays out as banner rows and the docked stack sits above the
  panel.
- `/table-book` is the settlement folio for Town, Folk, and Chronicle. It
  renders a closed front-facing cover with right-edge bookmarks;
  opening a chapter reveals a two-page spread, migrates earlier bookmarks to
  the left edge, and uses directional leaf turns between chapters. It consumes
  only `/api/table`.
  Shared rules for future visual options live in
  `docs/player-shell-visuals.md`.
- `/tome` is the personal aged keepsake shell for Journal, Character, and
  Inventory. Character is one native two-page spread; adjacent Inventory owns
  arms, armor, carried items, and further Domain-card spreads. Larger
  collections turn through spreads inside one keepsake rather than adding
  bookmarks. Chosen-character data comes from `playerCharacterView()`. Its
  bottom utility dock shows that PC's Conditions and mounts the reusable
  private GM/PC correspondence client at `#player-chat-slot`.
- Unfinished creator state lives in `data/character-drafts.json`, is mirrored
  from local autosave, and appears only in the login's separate draft view.
  The final signed covenant is an immutable `paper` inventory artifact; a
  failed draft cleanup after PC creation must never make character creation
  retry and duplicate the PC.
- PC removal is reversible retirement only. Missing `active` means true;
  `DELETE /api/party/:id` sets it false and `POST .../restore` returns it.
  Player whitelists and mutations exclude retired PCs, while inventory,
  papers, notes, doodles, and music files remain untouched. There is no PC
  hard-delete endpoint.
- PC inventory uses typed entries with lazy migration from legacy strings.
  Standard Consumables resolve from `data/daggerheart/reference.json`, stack
  to five, and use atomic server-side reactions. Contract and extension rules:
  `docs/inventory.md`.
- `/music` mirrors exactly one named Suno web collection through an installable
  browser snapshot helper because the configured generation API has no account
  playlist endpoint. The server validates song UUIDs, derives CDN URLs itself,
  caches MP3s under `Visseren/Suno Mirror`, and never deletes cached audio when
  a song leaves the upstream collection. See `docs/music-integration.md`.
- Player feedback tickets are explicit: the bug control captures the current
  viewport for annotation and creates a local ticket. GM triage reads all
  tickets for crosstalk before presenting one problem at a time; see
  `docs/feedback-triage-agent.md`.
- Content-free ambient UX telemetry is an explicit scope expansion for the
  current five-person private playtest. It has no consent gate, stores only
  normalized routes/modes/coordinates/semantic targets and aggregate timing,
  and must never collect written content, identities, screenshots, IPs, user
  agents, or browser history. `data/telemetry.json` is gitignored. **Review
  consent, retention, access, and whether this should exist at all if the
  project becomes remote, public, or materially larger.** See
  `docs/ux-telemetry.md`.

- `/screen` is the projector in front of the table (the drafting board owns
  `/board`): it shows exactly one thing, chosen by the GM — a mood image,
  a folk/person/place card, the stores, the buildings, or free text.
  `screenView()` resolves the projection at read time through the public
  whitelists, so even deliberately shown unrevealed entries expose only
  public fields. "Show at the table" buttons live on GM cards; the Screen
  section in `/gm` holds the forms and the darken control.
- `/gm` and `/board` share `public/shared/gm-tools.*`: a hovering Fear hotbar
  opens a responsive quick table with active-PC vitals, static SRD reference
  rows, and the dedicated `hud` drafting board. Boards persist in named
  `data/boards.json` documents (`main`, `hud`); boot migrates legacy
  `board.json` once, and `/api/board` remains a non-broadcasting `main` alias.
- Private correspondence persists as flat rows in `data/messages.json`.
  Active players fetch only their own thread through `/api/messages?pc=`; the
  GM hotbar fetches all threads through `/api/messages/gm`. General player and
  GM views expose unread counts only, never message text. Retiring a PC keeps
  the GM-readable thread but blocks player reads and new messages.

## What's next (agreed ambitions, in rough order)
- **The remaining planned features have backend implementation plans in
  [docs/master-plan.md](docs/master-plan.md).** Read its Shared foundations
  before starting one; character lifecycle (feature 7), the Fear/Hope tracker
  (feature 1), GM quick tools (feature 2), and private messages (feature 3) are
  built, so the remaining suggested dependency order is 5 → 6 → 4.
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
