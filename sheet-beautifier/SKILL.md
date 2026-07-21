---
name: sheet-beautifier
description: Extend or audit DaggerChart's deterministic, token-funded character-sheet beautification system. Use when adding a class motif, information-triggered flourish, fixed decoration slot, tier maturation, preview/history behavior, or any visual treatment that must remain reproducible and restorable.
---

# Sheet Beautifier

Maintain character sheets as versioned personal artifacts. Treat decoration as
a deterministic recipe over named semantic slots, never as random coordinates
or accumulating marks.

## Workflow

1. Read [character-sheet-vision.md](../docs/character-sheet-vision.md) and
   [slot-contract.md](references/slot-contract.md). Read
   [semantic-adornment.md](../docs/semantic-adornment.md) when the work changes
   renderer boundaries, shared interface decoration, or another player-facing
   artifact.
2. Run `node sheet-beautifier/scripts/audit-recipes.mjs` to inspect the current
   characters without changing data.
3. Extend `server/sheet-beauty.js` first. Put new class identities in
   `CLASS_MOTIFS`, new information gates in `characterSignals`, and new
   decoration regions in `KNOWN_SLOTS`.
4. Project only bounded recipe metadata through `sheetBeautyView`; never ship
   private prose merely because it unlocked a slot.
5. Add or refine the corresponding fixed selector in
   `public/character/field-sheet.css`. Use existing primary/secondary character
   colors and preserve all control hit areas.
6. Add EN and SV copy to `public/shared/i18n.js` for new player-facing text.
7. Add deterministic tests to `test/sheet-beauty.test.js`, run `npm test`, then
   preview a real sheet at desktop and phone widths.

## Invariants

- Preview is free; committing a current candidate spends one token.
- Entitlement is two tokens at level 1 and one additional token per level.
- Restoring a committed version or the unadorned baseline is free and does not
  refund a commit.
- Candidate IDs derive from stable character inputs, pass, and complete recipe.
  Revalidate the ID on commit so stale previews cannot spend twice.
- A committed version stores a complete recipe snapshot and remains visually
  exact even when the character later changes level, class, or background.
- One slot has at most one value in a recipe. A later pass replaces or matures
  that slot; it does not append another decoration in the same region.
- Class and tier always influence a candidate. Optional facts unlock treatment
  but their written content never becomes CSS, HTML, or a candidate identifier.
- Do not use `Math.random()`, timestamps, freeform coordinates, or generated
  markup to decide appearance.
- Keep decorations `pointer-events: none`, responsive, and still legible with
  `prefers-reduced-motion`.

## Renderer Boundary

Treat the recipe engine and visual renderer as separate systems:

- The recipe engine decides *what semantic treatment exists*.
- The sheet markup declares *where supported treatments may render*.
- A versioned style pack decides *how that treatment looks*.

Do not target incidental IDs, wrapper order, `:last-child`, or content-shaped
selectors when adding new work. Prefer explicit anchors such as
`data-beauty-slot="domainSeal"`. A sheet may reorder, wrap, or replace its
modules without changing those semantic anchors.

Before a substantial sheet redesign, audit every existing selector. Migrate
anchors deliberately and preserve the prior renderer while committed recipes
still reference it. Adding `recipeVersion` without retaining or migrating its
renderer does not make an old visual version immutable.

The current implementation predates this full renderer boundary and still has
selectors coupled to `#sheet-story`, `#sheet-cards`, `.inventory-paper`, and
`.sheet-section:last-child`. Treat replacing those with explicit anchors,
extracting the atelier controller/renderer from `sheet.js`, and introducing a
versioned style pack as required hardening before a major sheet overhaul.

## Adding A Motif

Add one stable motif ID to the server class registry and a matching
`body[data-beauty-motif="..."]` treatment. The motif should change geometry,
not only hue. Use the existing class visual hypotheses as the starting point.

For a bespoke class, prefer its canonical class ID. Name-based fallback is
acceptable only as a migration bridge; add the explicit ID once finalized.

## Adding An Unlock

Derive a boolean from bounded character structure. Add exactly one named slot
when true, localize its explanation, and style that slot in its semantic region.
Do not expose the underlying answer text in `sheetBeautyView`.

Good examples: all defined background fields completed, a portrait present,
owned Domain cards, a signed covenant, or completed connections.

## Generalizing Beyond Sheets

Use the same system for another interface only when the decoration represents
persistent identity, earned history, or meaningful state. Do not turn ordinary
navigation and controls into versioned recipes.

Create a surface-specific namespace and anchor contract, for example
`data-adornment-slot="folio:chapterEdge"`. Share the recipe/versioning engine
only after two surfaces demonstrate the same lifecycle; keep their renderers
and style packs separate. See
[semantic-adornment.md](../docs/semantic-adornment.md).

## Verification

Run:

```powershell
node sheet-beautifier/scripts/audit-recipes.mjs
node --test test/sheet-beauty.test.js
npm test
```

In browser QA, test an unadorned sheet, both candidate finishes, commit,
historical preview, restore, no-token state, and a narrow viewport. Confirm
that HP, Stress, Hope, navigation, Beastform state, and private character tools
remain unobstructed.
