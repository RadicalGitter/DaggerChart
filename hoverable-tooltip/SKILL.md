---
name: hoverable-tooltip
description: Add an explanatory hover/focus/long-press tooltip to a UI control, reusing this project's glossary popover — the same styled note used for game-term definitions. Use whenever the user wants a tooltip, hover hint, info popover, "explain this button" affordance, or ⓘ helper on any player- or GM-facing control (buttons, toggles, icons). The pattern attaches a `data-hint` attribute pointing at a `TERMS` entry in public/shared/i18n.js; the note opens on hover, keyboard focus, and touch long-press, and never hijacks the control's own click. Distinct from the glossary term links themselves, which explain inline words and stay click/long-press only.
---

# Hoverable tooltip (control hint)

The reference implementation is the background studio's aid buttons — Expand,
Kindle sparks, Weave it together, Draw a muse — each of which explains itself:

- [public/shared/i18n.js](../public/shared/i18n.js) — the shared glossary and
  popover engine: `TERMS` dictionary (~line 1354), `showTerm`/`hideTerm`
  (~line 1538), `hintKey` helper (~line 1568), and the hint wiring inside
  `wireTerms()` (~line 1570: `pointerover`/`pointerout`/`focusin`/`focusout`).
- [public/background/index.html](../public/background/index.html) — the buttons
  carry `data-hint="bg.expand"` etc. (in `.leaf-actions` and `.studio-actions`).
- [public/background/background.css](../public/background/background.css) — the
  quiet `[data-hint]::after { content: "ⓘ" }` discoverability cue.

## What the pattern is

A **hint** reuses the exact glossary popover that explains game terms, but
attaches to an action control and answers "what does this button do?" It shares
the definition system's look, positioning, and content store, so hints and
definitions are visually identical.

Two attributes, one popover engine:

- `data-term="<key>"` — the existing glossary link for an inline *word* (a rule
  term inside prose). Opens on **click** and **long-press**. The click handler
  deliberately opens the note *instead of* whatever the word sits inside.
- `data-hint="<key>"` — the new tooltip for a *control*. Opens on **hover**
  (desktop pointer), **focus** (keyboard tab), and **long-press** (touch). A
  normal click is left alone, so the button still performs its action.

Both read their `[name, text]` content from the same `TERMS` object, keyed by
language (`en`/`sv`). `hintKey(el)` returns `el.dataset.term || el.dataset.hint`
so the long-press path serves either.

## Why it's shaped this way

- **A control's click must survive.** Terms hijack the click because a rule word
  has no other job; a button does. So hints never touch the click path — the
  generic `[data-term]` click handler simply doesn't match them, and their
  action fires normally. (A side effect worth knowing: clicking a hinted button
  closes any open note via the "click elsewhere closes it" branch. That's fine —
  you clicked to act, not to read.)
- **Hover suits controls; it would wreck dense text.** Rules bodies auto-link
  many capitalized terms via `termify()`; hover-opening every one of those on
  mouseover would be miserable. So hover/focus opening is scoped to `[data-hint]`
  only, leaving `[data-term]` click-only.
- **Reuse the glossary, don't build a second tooltip.** One popover engine means
  one visual language and one content store. New explanations live in `TERMS`
  beside the game-term definitions, in both languages.
- **Focus parity for keyboard and screen readers.** `focusin`/`focusout` mirror
  hover so tabbing onto a control reveals the same note; this replaces a native
  `title=` (which would double up against the styled popover).

## Building a new one

1. **Write the content in `TERMS`** (public/shared/i18n.js, ~line 1354). Add an
   entry keyed by a namespaced id — prefix by surface, e.g. `bg.weave`,
   `board.snap`, `almanac.roll`. Each entry is
   `{ en: [name, text], sv: [name, text] }`. `name` is the control's own label;
   `text` says plainly what it does and any cost/consequence. Keep the tone
   (steward's ledger, grounded warmth) and always supply both languages.
   These keys are *not* auto-linked — `termify()` only wraps the explicit
   `TERM_PATTERNS` list — so a namespaced hint key never leaks into rules text.
2. **Attach `data-hint="<key>"` to the control** in the markup. It composes with
   `data-i18n` for the label; `applyStatic()` sets `textContent`, so put any
   glyph in CSS, not the HTML.
3. **Add the ⓘ cue** (optional but recommended): `[data-hint]::after { content:
   "ⓘ"; ... }` on the surface's stylesheet, dimmed, brightening on
   `:hover`/`:focus-visible`. Scope it to the surface so it only marks your
   controls.
4. **Nothing to wire per control.** `initI18n()` already calls `wireTerms()`,
   whose document-level delegation covers any `[data-hint]` present now or added
   later — including dynamically rendered controls.
5. **Drop redundant `title=`** on the control; the styled popover replaces it and
   two tooltips on one element look broken.

## The engine (already in i18n.js — reference, don't re-add)

The hint half of `wireTerms()` is delegated and generic:

```js
const hintKey = (el) => el.dataset.term || el.dataset.hint;

// inside wireTerms():
document.addEventListener("pointerdown", (e) => {         // long-press (touch)
  const el = e.target.closest("[data-term],[data-hint]");
  if (!el) { hideTerm(); return; }
  clearTimeout(pressTimer);
  pressTimer = setTimeout(() => { suppressClick = true; showTerm(hintKey(el), el); }, 450);
});
document.addEventListener("pointerover", (e) => {         // hover (desktop)
  if (e.pointerType === "touch") return;
  const el = e.target.closest("[data-hint]");
  if (el) showTerm(el.dataset.hint, el);
});
document.addEventListener("pointerout", (e) => {
  const el = e.target.closest("[data-hint]");
  if (el && !el.contains(e.relatedTarget)) hideTerm();
});
document.addEventListener("focusin", (e) => {             // keyboard
  const el = e.target.closest?.("[data-hint]");
  if (el) showTerm(el.dataset.hint, el);
});
document.addEventListener("focusout", (e) => {
  if (e.target.closest?.("[data-hint]")) hideTerm();
});
```

If you are on a page that does not already call `initI18n()`, call
`initTerms()` from i18n.js once to wire the delegation.

## Verify

In the browser preview (launch config `settlement`, port 4626): hover the
control — the styled note appears with the term name and explanation; tab to it
by keyboard — the same note appears; on a touch viewport, long-press opens it
and a short tap still runs the action; a normal click still does the control's
job. Confirm the note reads correctly in both EN and SV via the language toggle.
