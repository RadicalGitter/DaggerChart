# Beautification slot contract

Related contracts:

- [Sheet Beautifier skill](../SKILL.md) — extension workflow and verification.
- [Semantic adornment heuristics](../../docs/semantic-adornment.md) — reusable
  interface-level boundaries and generalization rules.
- [Character sheet visual direction](../../docs/character-sheet-vision.md) —
  the sheet's visual intent and class compositions.

Recipes are complete visual snapshots. Their keys describe reserved sheet
regions rather than layers to append.

| Slot | Region | Current trigger |
| --- | --- | --- |
| `masthead` | Empty mark at the outer head edge | Always |
| `portraitFrame` | Existing portrait frame | Always |
| `moduleEdge` | Corners and edges of typed modules | Always |
| `tierFlourish` | Small tier mark beside the masthead | Always |
| `memoryMargin` | Background/story margin | All eight standard memories |
| `domainSeal` | Domain-card module | At least one owned Domain card |
| `covenantSeal` | Covenant inventory row | Signed covenant present |
| `connectionThread` | Connections portion of story | Three answered connections |

## Slot rules

- Add a slot to `KNOWN_SLOTS` before persisting it.
- Store bounded IDs and numbers only. Never store or project source prose.
- Give the slot one fixed responsive region in CSS.
- Reuse a slot when maturing the same visual idea. Add a new slot only for a
  genuinely distinct semantic region.
- Do not position by player-supplied data, viewport pixels, or randomness.
- A missing optional slot must leave no placeholder or broken line.
- Bind each slot to an explicit `data-beauty-slot` anchor. IDs and class names
  may support layout, but they are not the beautification contract.
- Do not infer a slot from child order, `:last-child`, visible text, or the
  presence of an unrelated element such as `strong`.

## Recipe dimensions

- `motif`: class geometry (`grove`, `veil`, `halo`, and so on).
- `finish`: `etched` or `illuminated`.
- `grade`: maturity from 1 to 4, influenced by pass and tier.
- `tier`: Daggerheart tier from 1 to 4, changing at levels 2, 5, and 8.
- `slots`: unique named regions and their bounded motif/grade metadata.

The active version is a pointer into immutable history. Baseline is represented
by a null active version, not a special fake recipe.

## Renderer versioning

A committed recipe must identify both its recipe schema and renderer/style-pack
version. If a style pack changes materially, either retain the old pack or run
an explicit recipe migration. Never silently reinterpret an immutable version
through whichever CSS happens to be current.

The intended split is:

1. `server/sheet-beauty.js`: deterministic recipe and token domain.
2. Sheet markup: stable semantic anchors.
3. Client renderer: applies a recipe to those anchors.
4. Versioned style pack: owns geometry and finish.
5. Atelier controller: preview, commit, and restore interactions.

Add a contract test that fails when a known server slot lacks a client renderer
or anchor. Visual regression coverage should exercise every motif and style
pack at desktop and phone widths.
