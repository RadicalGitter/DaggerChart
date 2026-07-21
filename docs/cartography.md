# Cartography desk

Oore is the appointed cartographer for the current campaign. His stable PC ID
is stored in `data/cartography.json`; player navigation derives the atlas tool
from that ID rather than from the character's editable name.

## Audience boundary

- The player endpoint accepts only the appointed active PC and returns only
  sheets whose visibility is `cartographer`.
- GM source sheets, blueprint revisions, the true layer, render briefs, image
  filenames, and invalidation state never enter the player projection.
- The app remains a trusted-table LAN tool without authentication. This is an
  audience whitelist, not an account-security claim.
- Oore's working ink and pinned speculations autosave as a sealed draft. The
  GM receives only an immutable numbered snapshot after Oore completes the
  final review and chooses **Send this to the Dreamer**. Later revisions do
  not rewrite the history of what was sent. Other player surfaces never
  receive either draft or submission automatically.

`Dreamer` is deliberate setting language here, not an interface synonym for
the GM. It is the true cosmological name of the god whose mind contains this
world; sending a map places Oore's interpretation within that god's sight,
where it may affect what becomes true.

Map images live in `data/cartography-images/`, outside the public static tree.
The API serves an issued image only through its cartography sheet.

## Layers

Each sheet has four distinct records:

1. `strokes` and `notes`: Oore's field-map ink and pinned speculations.
2. `blueprint`: GM-authored structure strokes, classified as `structure` or
   `detail`, plus the last confirmed structural coverage.
3. `truth`: private overview and bounded regions containing general truth,
   furnishing/layout, and granular details.
4. `renderPlan`: a parchment-map output and one scene output per true region.

The structural diff rasterizes only `structure` strokes to a coarse 32x20
dependency grid. Detail strokes never cause expensive invalidation. A changed
structure records added and removed cells and blocks graphic generation until
the GM confirms the revised blueprint.

Confirmation increments the blueprint revision and rebuilds the render plan in
the background. The parchment map depends on the complete confirmed blueprint
and true layer. A scene depends only on the structural cells intersecting its
true region plus that region's text. A structural edit in one room therefore
preserves an existing render for an unaffected room.

## Renderer boundary

The current pass compiles stable render briefs and `needs-render` output slots;
it deliberately does not call ComfyUI. The project has no map-specific workflow
yet, and the scenic workflow should not be misused for blueprint-faithful
parchment. When workflows are supplied, mount them behind the compiled plan:

- a map workflow consumes the confirmed blueprint plus all true regions and
  returns an accurate but deliberately incomplete parchment map;
- a scene workflow consumes one region brief and a crop/reference of the
  confirmed blueprint;
- calls may begin only when `renderPlan.status === "ready"`;
- write returned dependency hashes beside outputs and keep outputs whose hash
  remains current.

The future off-session role is intentionally compatible with this boundary:
other players may eventually send map requests to Oore, while only Oore can
open the atlas and decide when to answer or distribute a field map.

## Living maps

Kaya's future map role is different from Oore's authorship. A dedicated
`nature` layer will let her paint proposed living patches onto maps the GM has
issued for tending, especially the settlement map. Each patch should record a
nature kind, intended extent, and maturity in year-rests. Her working layer is
neither cartographic speculation nor established GM truth: it becomes real
only as campaign time and the GM's ruling allow it to take root. This needs a
settlement map and year-rest advancement hook before the player tool is
exposed.
