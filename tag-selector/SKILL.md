---
name: tag-selector
description: Build a hierarchical tag selector ("tag board") like the Music Desk's prompt instrument — circular tag bubbles, dive-in navigation, explicit/inherited/excluded tri-state selection, freeform pinned words, and payload compilation into a prompt, filter, or API body. Use this whenever the user asks for a tag selector, tag board, tag picker, keyword picker, mood/emotive-keyword chooser, taxonomy browser, or a curated-vocabulary prompt builder for any surface in this project (scene cards, Places imagery, portraits, music, filters) — even if they don't mention the music frontend by name.
---

# Tag selector (tag board)

The reference implementation is the Music Desk's "prompt instrument":

- [public/music/taxonomy.js](../public/music/taxonomy.js) — authored vocabulary + flattening
- [public/music/music.js](../public/music/music.js) — selection model (~line 817), board rendering (~line 900), wiring (~line 1200)
- [public/music/music.css](../public/music/music.css) — bubble styling and dive animations (~lines 247–348)
- [public/music/index.html](../public/music/index.html) — markup (forge column, ~lines 78–97)

A distilled, copy-adaptable skeleton (taxonomy, state, renderer, CSS) lives in
[references/skeleton.md](references/skeleton.md). Read it before writing code —
it saves you from untangling the pattern out of the 1400-line music.js, which
mixes in song bubbles, playback, and Suno mirroring that you do not want.

## What the pattern is

A tag board turns a **curated vocabulary tree** into a compiled text payload
(an AI prompt, a filter, a request body) through a small spatial UI:

- One navigation depth is visible at a time. Roots appear as a grid of
  circular bubbles; diving into a tag shows its two labeled groups of children
  (upper row / lower row) around a centered "current" bubble that navigates
  back when pressed.
- **Single click toggles selection, double-click dives.** A ~230 ms timer on
  click prevents the toggle from firing before a double-click is recognized.
- Selection is **tri-state with inheritance**: a tag is `explicit` (chosen),
  `inherited` (an ancestor is explicit, so the whole branch contributes), or
  `excluded` (carved out of an ancestor's selection, shown struck-through).
  Toggling cycles sensibly: unselected → explicit, inherited → excluded,
  excluded → back to inherited.
- Every node carries a **payload** — the text it contributes when active —
  separate from its display label. Compilation walks the *effective* set
  (explicit tags plus all non-excluded descendants), dedupes payloads
  case-insensitively, and joins them into an **editable** field. The board is
  an instrument, not a cage: the user can always hand-edit the compiled text.
- **Pins** let the user add freeform words the taxonomy missed. A pinned word
  that matches an authored tag reuses it (so it can still dive); otherwise it
  becomes a groupless tag whose payload is the word itself.

## Why it's shaped this way

- The taxonomy is *authored*, not user-managed. Curating payload phrasing is
  the real design work — payloads are prompt fragments and must obey the
  project tone (steward's ledger, grounded warmth, no "EPIC LOOT" energy).
- Ids are slugged paths (`tavern-fiddle-reel`) built at load time, so authored
  labels stay display-only and renames don't corrupt stored selections.
- Two groups × three children per node is the house shape — it is what keeps
  the board readable as upper-row / current / lower-row. Roots are the allowed
  exception (the music desk has seven). Deviate only with a reason.
- **Selected vs. effective matters.** `selectedTagIds()` (explicit minus
  excluded) is what you persist and use for *filtering* — a broad tag must not
  become a strict filter. `effectiveTagIds()` (with descendant expansion) is
  generation metadata used only for compiling the payload. Confusing the two
  was a real bug; see the comment near music.js line 510.
- Records that store compiled output also store an envelope version
  (`PROMPT_ENVELOPE = "tag-board-v1"`) plus `tagIds`/`selectedTagIds`, so
  later UI can re-highlight what was chosen even after the taxonomy evolves.

## Building a new one

1. **Author the taxonomy** in its own `taxonomy.js` beside the page. Copy the
   authoring shape and the flattening code from the skeleton — the flattener
   is fully generic. Spend your effort on payload phrasing: each payload
   should read as a competent fragment of the final compiled text.
2. **Copy the selection model and renderer** from the skeleton: state
   (`route`, `explicit`, `excluded`, `pins`), the derived-state helpers, the
   click/double-click wiring, and `renderTags()`.
3. **Keep the dive transition.** It's what makes navigation legible — the
   swoosh is seeded from the clicked bubble's position via `--dive-x/--dive-y`
   and must be skipped entirely under `prefers-reduced-motion`.
4. **Wire compilation to the output** this surface needs (textarea, filter,
   request body). Dedupe payloads, join with `", "`, keep the result editable.
5. **Style for the surface.** GM surfaces ride light `ledger.css`, player
   surfaces ride dark `lamplight.css`. Keep the state classes (`explicit`
   filled, `inherited` tinted, `excluded` faded + line-through) and swap the
   accent variables. Player-facing labels and notes need EN/SV strings in
   `public/shared/i18n.js`; game terms stay English.
6. **Telemetry**: if the surface participates, call
   `setTelemetryMode("tags:depth-N")` on render like the music desk does.
7. **No frameworks, no build step** — vanilla ES modules, innerHTML templates
   with the local `esc()` helper, rewire buttons after each render.
8. **Verify in the browser preview** (launch config `settlement`, port 4626):
   toggle, dive, back, exclusion inside a selected branch, pins, reduced
   motion, and the compiled output. Clean up any test data you created.

## Adaptation knobs

- **Root count**: the roots grid is 4 columns; the music desk centers its odd
  row with `.tag-roots .tag-button:nth-child(n+5) { translate: 50% 0; }`.
  Recompute that offset for your root count (it assumes rows of 4 then 3).
- **Depth**: the music taxonomy is three tiers (root → child → leaf). The
  renderer doesn't care — leaves are just nodes without `groups`, and they
  show the "no finer branches yet" note.
- **Pins are optional** but cheap; drop them only if freeform words genuinely
  make no sense for the surface.
- **Persistence**: the music desk keeps pins in localStorage
  (`settlement-music-pins`); namespace your key per surface.
