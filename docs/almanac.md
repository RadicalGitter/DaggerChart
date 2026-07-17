# The Almanac

The GM console's **Almanac** combines two adjacent table tools without
changing the public rules experience:

- a searchable index over the 34 public rules pages and private GM lore;
- reveal-one-result chance tables for unusual checks, accidents, and travel.

The implementation began in Claude's `feature/gm-almanac` commit `31288bd`
and was grafted onto the newer `beta` rules, campaigns, quick tools, and
session workbench. `server/almanac.js` remains an isolated Express router;
`public/gm/` supplies the responsive two-leaf working surface.

## Pages

The two corpora share `{ id, title, path[], body, seeAlso[], keywords[] }`:

- `data/daggerheart/rules.json` is public, read-only, and still served by the
  cacheable `GET /api/rules` endpoint and standalone `/rules` page.
- `data/wiki-lore.json` is private GM material. The Almanac can create, edit,
  and remove these pages through bounded GM-namespaced endpoints.

`GET /api/gm/almanac` combines the corpora and adds `source: "rules"` or
`source: "lore"`. No player surface requests this endpoint. Search reuses
`public/shared/rules-search.js`, preserving title-prefix, title-substring,
keyword, path, then body ranking instead of maintaining a second algorithm.

Lore writes accept titles up to 120 characters, six path components, forty
keywords/related IDs, and 30,000 body characters. Rules cannot be mutated
through the Almanac routes.

## Chance Tables

Chance-table files live in `data/tables/*.json`; seen numbers live in
`data/tables-state.json`, created on the first reveal. The state file stores
numbers only. The content files stay hand-editable JSON.

Spoiler safety is the contract:

- `GET /api/gm/tables` returns names, blurbs, dice, labels, totals, and seen
  counts. It never returns entries, twists, text, or rewards.
- `POST /api/gm/tables/:id/roll` accepts optional `{ raw }` and returns exactly
  one whitelisted `{ n, entry: { text, reward? }, seenBefore }` result.
- `POST /api/gm/tables/travel/roll` accepts
  `{ danger, mode, raw?, twistRaw? }` and reveals one encounter plus one travel
  twist as a single scene.
- Physical results are range-checked. Empty inputs use `crypto.randomInt()`
  for uniform die odds.
- There is deliberately no browse, search, export, or maintenance route for
  chance-table entries.

The GM can enter a revealed result into the ordinary unpublished ledger with
one press. Repeated presses are disabled after the first successful write.

## Verification

Use a scratch `DATA_DIR` with no real campaign state. Structural tests may
copy chance-table files without printing their entry values. Verify metadata
contains no `entries`, `twists`, `text`, or `reward` keys; inspect only the
shape and length of a rolled result. Browser QA must not snapshot or dump the
revealed prose.
