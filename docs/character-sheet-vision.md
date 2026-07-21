# Character sheet visual direction

Related contracts:

- [Semantic adornment heuristics](semantic-adornment.md) — general recipe,
  anchor, and renderer boundaries.
- [Sheet Beautifier skill](../sheet-beautifier/SKILL.md) — extension workflow.
- [Beautification slot contract](../sheet-beautifier/references/slot-contract.md)
  — stable sheet anchors and versioning rules.

The character sheet should feel like a personal artifact shaped by its class,
not a dashboard with fantasy decoration. Intent governs every irregular shape:
important game information stays easy to find, while the page's composition,
marks, and movement express who the character is.

## Stable rules

- Identity, traits, current resources, Conditions, and the main action tray keep
  reliable homes across every class. A player should never hunt for HP because
  their sheet is imaginative.
- Class identity determines the focal geometry rather than merely changing a
  color. A Warrior can organize around a weapon spine; a Ranger around a
  companion or trail; a Wizard around indexed marginalia and diagrams.
- Avoid a uniform grid of panels. Use lines, seals, folds, pinned scraps,
  silhouettes, and open parchment as semantic containers. Irregular placement
  must communicate hierarchy, relationship, or ownership.
- Motion explains state changes: a leaf turns, a scrap lifts, ink gathers, or a
  seal settles. Ambient movement stays subtle and never moves controls away
  from the pointer.
- The reusable trait symbols in `public/shared/traits.js` are the first shared
  visual vocabulary for creator and sheet.
- A class supplies one durable primary pigment and the player supplies a
  favorite-color secondary accent. Both travel with the PC through the
  player-facing whitelist; a surface may use less color, but it must not invent
  a conflicting identity palette.
- Persistent decoration follows the recipe → semantic anchor → versioned
  renderer boundary in [semantic-adornment.md](semantic-adornment.md). Sheet
  redesigns must preserve or explicitly migrate those anchors instead of
  relying on existing IDs, wrapper order, or child position.

## Class compositions

These are starting hypotheses, not locked mockups:

- **Bard:** experiences and bonds radiate from a refrain line; Hope and Stress
  sit like performance marks in the margin.
- **Druid:** forms and resources follow a growth ring or seasonal cycle.
- **Guardian:** armor, thresholds, and protection dominate a shield-like field.
- **Ranger:** companion and range relationships occupy the center; weapons and
  experiences follow a trail around them.
- **Rogue:** loadout and domain tools live in layered pockets and concealed
  folds, while core vitals remain exposed.
- **Seraph:** Hope and restorative abilities gather around a restrained votive
  or radiating seal.
- **Sorcerer:** volatile resources and active magic form a bounded constellation
  whose connections respond to current state.
- **Warrior:** equipped weapon and damage thresholds form the page's spine;
  techniques annotate it like a practiced combat manual.
- **Wizard:** spells and knowledge use cross-referenced notes, diagrams, and a
  strong index rather than a conventional inventory grid.

## Movable parchment

Personalization should be a deliberate edit mode, not permanent freeform
physics. Sheet content remains typed modules backed by normal character data.
Each PC stores a versioned layout document with normalized position, size,
rotation, layer, and class variant for those modules.

The scissor tool traces a closed loop over the parchment. Modules substantially
enclosed by the loop lift as one torn piece; the tear is a visual mask, not a
mutation of game data. The player can move, rotate, or resize the piece, then
put it down. Undo, reset-to-class-layout, keyboard/touch alternatives, overlap
warnings, and viewport clamping are required before this becomes player-facing.
Drawing strokes remain a separate transparent layer so rearranging parchment
does not bake or corrupt doodles.

## Sheetwright treatments

Character sheets also have deterministic beautification recipes. A recipe
uses fixed semantic slots for the masthead, portrait frame, module edges,
Tier flourish, and information-specific marks. It never generates freeform
coordinates, so a later treatment matures or replaces an existing slot instead
of covering it with a new random mark.

Players may preview two stable treatments without cost, commit one by spending
a beautifying token, and freely restore any committed version or the unadorned
baseline. Characters begin with two tokens and gain one per level. The active
version points into immutable history, while each new candidate is informed by
the current class, level/Tier, portrait, completed background, Domain cards,
covenant, and connections. Only completion booleans reach the recipe; prose is
never copied into visual metadata. The implementation contract and extension
workflow live in the [Sheet Beautifier skill](../sheet-beautifier/SKILL.md).
The current CSS still contains
several selectors coupled to today's sheet markup; replace them with explicit
`data-beauty-slot` anchors and introduce a versioned renderer/style pack before
a major sheet overhaul.

## Communal sketch bin

The bin stores normalized vector sketches with author, campaign, title, and a
small preview. Grabbing a sketch creates a personal instance on the receiving
sheet; it does not remove or edit the shared original. Players can reposition,
scale, hide, or remove their instance. The GM can project a shared original or
a composed sheet through the existing screen boundary without exposing private
notes.

## Delivery order

1. Reuse trait graphics and establish the shared sheet module contract.
2. Build one strong class composition and one deliberately different second
   class to test whether the contract is genuinely flexible.
3. Extend the pattern to the remaining classes and add resettable layout state.
4. Add the scissor interaction with undo, touch access, and overlap checks.
5. Add the communal sketch bin after sheet instances have a stable format.
