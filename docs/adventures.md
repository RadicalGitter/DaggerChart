# GM Adventures

Status: implemented. Read this when preparing an adventure, adding one to the
GM adventure shelf, changing encounter links, or projecting an adventure map.

`/gm/#adventures` replaces the GM navigation's Cartography entry. The atlas,
its data and player cartographer access are preserved for later use. Old
`#cartography` links now open Adventures. No skill for converting a discussion
into an adventure has been created yet; Oscar will review this first example.

## Source and presentation

`data/adventures.json` is the hand-edited source, with `version: 1` and an
`adventures` array. `server/adventures.js` reads it on request, rather than
adding it to the general campaign state or persistence cycle. New adventures
and content edits therefore need no restart. The GM desk lives in
`public/gm/adventures.js` and `adventures.css`.

Each adventure has a stable `id`, `name`, `summary`, preparation `status`,
`partySize`, `level`, `duration` and `overview`. Useful sections are:

- `hook`: title, player-readable note text, and private running notes.
- `openingScenes` and `scenes`: arrays of `{ title, body }`.
- `characters`: `folkId`, fallback `name`/`role`, `body`, `motivation`, `cue`.
  The detail route resolves the Folk portrait; its link opens the actual card.
- `rumours`: `text`, possible `source`, `reliability`, and private `notes`.
- `encounters`: stable `id`, `name`, `setup`, `objective`, `approaches`,
  `notes`, and an optional `presetId`.
- `places`: stable `id`, `name`, `description`, `discoveries`, private `notes`.
- `map`: owned image `file`, public `caption`, accessible `alt`, private `notes`.
- `outcomes` and `runningNotes`: arrays of `{ title, body }`.
- `followUps`: unresolved questions for later sessions.

The first prepared adventure is **The Road to Alderford**, for three level-1
players, including two beginners. Its session outcomes, recruitment and tower
activation are possibilities, not automatically recorded campaign events.

## Encounter links

`/board/?tool=encounter&preset=<id>` opens a read-only roster and running-notes
preview. Preview navigation neither creates nor saves an encounter. **Start
this encounter** explicitly creates it using the existing preset route and
current session attendance rules. The URL then identifies the live encounter
with `encounter=<id>`; reopening that link selects the same encounter.

The preset **Alderford's Last Grain** uses existing Tier 1 Jagged Knife blocks
with changed-raider labels and notes. It spends 5 Battle Points for a gentle
introduction. The base budget for three players is 11; shorter fight −1 and
no Bruisers/Hordes/Leaders/Solos +1 leave an adjusted budget of 11. A possible
additional Bandit costs 2 points and is held out of the opening roster.
Preset files remain boot-loaded, as documented by the encounter-builder skill.

## Privacy and the projector

`GET /api/adventures` lists summaries; `GET /api/adventures/:id` returns the
whole GM preparation. Both and `GET /api/adventures/:id/map` require Keeper
access when the GM gate is configured. Adventure text does not join the
player/table/lore payloads, rules corpus, or journal automatically.

Maps live under `data/adventure-maps/`. A map file must be a plain filename
with a PNG, JPEG or WebP extension; directory traversal is rejected. This
directory is not publicly served.

The GM's **Show at the table** button sends `{ type: "adventure-map", refId }`
to the existing Screen mutation. `screenView()` emits only an image URL and
the explicitly authored public caption. The public image route
`GET /api/screen/adventure-map/:id` serves exactly the currently selected map;
other IDs and maps taken off the screen return 404. Responses use `no-store`.
No adventure notes, encounter plans, or private character fields accompany it.

The Alderford map depicts the five outward landmarks: Split Ash, Abandoned
Camp, The Ford, Alderford, and Lesser Tower. **The players' current settlement
and the Tower of Vesserin are deliberately not pictured**: their appearance is
for the players to decide. The road enters from the image edge. Relative
positions are a schematic preparation choice, not a surveyed campaign map.
The map labels all outward landmarks, so displaying it reveals their locations.

The image was generated and revised with the built-in ImageGen tool. Its final
art direction is preserved alongside the image in
`data/adventure-maps/alderford-overview.prompt.txt`.

## Verification

`node --test test/adventures.test.js test/http-adventures.test.js test/encounter-presets.test.js`
checks source references, scratch-data access
boundaries, on-demand content reads, map selection/darkening, and read-only
preset retrieval. HTTP tests boot a synthetic `DATA_DIR`; they neither resolve
real event/chance tables nor mutate the live campaign. Browser verification
requires Oscar's explicit permission under his saved computer-use preference.
