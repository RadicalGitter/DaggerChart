# Semantic adornment heuristics

Related contracts:

- [Character sheet visual direction](character-sheet-vision.md) — the first
  surface using these heuristics.
- [Sheet Beautifier skill](../sheet-beautifier/SKILL.md) — the operational
  extension and audit workflow.
- [Beautification slot contract](../sheet-beautifier/references/slot-contract.md)
  — current sheet slot and renderer requirements.
- [Architecture](architecture.md) — system boundaries and audience projections.

Use adornment to make an interface feel inhabited by its subject: a character
sheet develops marks from the character's life, a folio gains chapter traces,
or a map accumulates cartographic notation. The decoration must communicate
identity, earned history, ownership, or meaningful state. It is not a general
license to decorate controls or obscure information architecture.

## The four boundaries

Every persistent adornment system has four independently replaceable parts:

1. **Facts and signals** — bounded domain facts such as class, Tier, completed
   memories, or an earned artifact. Written content remains in its owning
   domain and is not copied into visual metadata.
2. **Recipe** — a deterministic, versioned description of which semantic slots
   are active and how mature they are. It contains no DOM selectors, viewport
   coordinates, or arbitrary generated markup.
3. **Anchors** — explicit stable attributes in the surface markup identifying
   where a treatment may render. Layout wrappers and incidental IDs are not a
   contract.
4. **Renderer and style pack** — surface-specific code and CSS translating a
   recipe into visuals. A committed recipe identifies the renderer version that
   gives it meaning.

This split lets the interface change shape without invalidating domain state,
and lets visual language mature without rewriting player history.

## Determinism and authorship

- The same facts, pass, variant, and version produce the same recipe.
- A semantic slot can hold one treatment. Later work replaces or matures it;
  it does not add another mark in the same space.
- Preview is reversible and has no persistent side effect.
- Commit creates an immutable snapshot. Restore changes the active pointer and
  does not rewrite or refund history.
- Randomness may animate harmless ambient details, but must not decide durable
  placement, entitlement, identity, or appearance.
- Player-selected variants should express authorship within bounded treatments,
  not expose free placement that can cover controls or information.

## Stable anchors

Prefer explicit namespaced attributes:

```html
<header data-adornment-slot="sheet:masthead"></header>
<section data-adornment-slot="sheet:memoryMargin"></section>
```

Avoid selectors based on:

- DOM position such as `:last-child`;
- visible or localized text;
- an unrelated descendant such as `:has(strong)`;
- a module ID that exists only for navigation;
- current wrapper depth or grid position.

When markup changes, move or deliberately retire the anchor. A contract test
should report missing, duplicate, and unsupported anchors.

## Versioning

Use separate versions for recipe schema and renderer/style pack. A renderer
change is material when the same recipe would look substantially different,
move to another semantic region, or risk obscuring a control.

For a material change, choose one:

- retain the old renderer for old committed versions;
- migrate old recipes explicitly and record that migration;
- retire a renderer only after intentionally flattening or replacing every
  version that depends on it.

Never claim versions are immutable while rendering all of them through mutable
global CSS with no compatibility boundary.

## Generalization threshold

Do not build a universal adornment framework after one surface. Generalize the
recipe lifecycle only when at least two surfaces need preview, commit, history,
restore, deterministic signals, and renderer versioning. Share small domain
primitives first; keep slot registries, renderers, and style packs owned by
their surfaces.

Good candidates include character sheets, personal tomes, evolving maps, and
earned card treatments. Poor candidates include utility navigation, transient
dialogs, form validation, and controls whose primary job is speed and clarity.

## Change checklist

Before changing an adorned surface:

1. Inventory its declared anchors and committed renderer versions.
2. Confirm the new markup preserves or deliberately migrates each anchor.
3. Keep recipe generation independent from DOM and CSS.
4. Verify decorations cannot intercept input or cover text at supported sizes.
5. Test baseline, every active renderer version, and representative motifs at
   desktop and phone widths.
6. Test preview cancellation, commit, restore, and no-entitlement states.
7. Update the owning skill and contract when adding a new signal, slot, motif,
   or renderer version.
