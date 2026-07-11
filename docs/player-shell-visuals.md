# Player shell visuals

The player hub can have more than one visual treatment. Each treatment is a
standalone frontend over the same spoiler-safe player payload; visual choices
must not fork campaign state or widen what reaches the browser.

## Current visuals

### Card deck — `/table`

The canonical player shell. The login chooser enters this visual by default.
Five large cards open the Town, Folk of Note, Chronicle, Journal, and Character
sections. On narrow screens the cards become banner rows.

### Physical tome — `/table-book`

An optional alternate shell. The book begins closed and front-facing with all
chapter bookmarks on its right edge. Choosing a bookmark opens the cover to a
two-page spread. Chapters before the current one move to the left edge;
current and later chapters remain on the right. Moving between chapters turns
a leaf in the appropriate direction. The book can be closed from its left
page, and becomes a pannable physical spread on narrow screens.

This route is deliberately not linked as the default and does not replace or
modify `/table`.

## Shared contract

Every player-shell visual must preserve these boundaries:

- Read settlement content only from `GET /api/table`. Never render a player
  shell from `/api/state` or another GM payload.
- Listen to `/api/stream` and refetch after broadcasts.
- Use the single device identity key `settlement-pc` (the legacy
  `settlement-journal-pc` key may be read only for migration).
- Embed the Journal from `/journal/?embed=1&pc=<id>` and character sheets from
  `/character/:id`. Keep an iframe stable across SSE refreshes while its panel
  remains open.
- Put new player-facing phrasing in both EN and SV in
  `public/shared/i18n.js`. Daggerheart game terms remain English.
- Retain the quiet steward's door to `/gm` and the grounded, warm tone from the
  settlement design spec.
- Never expose hidden fields or event-table content. A visual variant changes
  presentation, not disclosure rules.

## Adding another visual

Until a visual chooser is designed, add each experiment as its own directory
under `public/` and its own static route in `server/index.js`. Do not change the
login's default player destination or replace `/table` without an explicit
product decision.

A new visual is ready for comparison when it:

1. Implements all five player sections.
2. Preserves device identity and stable embeds.
3. Works at desktop and phone widths.
4. Has EN/SV UI phrasing.
5. Has been restarted and browser-smoke-tested alongside `/table`.
6. Leaves real campaign data unchanged during visual verification.

When the project eventually offers a player-selectable visual, the selection
should choose a shell route or renderer only. It must not duplicate PCs,
notes, doodles, or settlement data.
