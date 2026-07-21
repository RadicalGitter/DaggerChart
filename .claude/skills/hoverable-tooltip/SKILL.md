---
name: hoverable-tooltip
description: Add an explanatory hover/focus/long-press tooltip to a UI control, reusing this project's glossary popover — the same styled note used for game-term definitions. Use whenever the user wants a tooltip, hover hint, info popover, "explain this button" affordance, or ⓘ helper on any player- or GM-facing control (buttons, toggles, icons). The pattern attaches a `data-hint` attribute pointing at a `TERMS` entry in public/shared/i18n.js; the note opens on hover, keyboard focus, and touch long-press, and never hijacks the control's own click. Distinct from the glossary term links themselves, which explain inline words and stay click/long-press only.
---

This skill lives at the repository root so it doubles as project documentation.
Read [hoverable-tooltip/SKILL.md](../../../hoverable-tooltip/SKILL.md) and follow
it; the glossary popover engine it reuses is in
[public/shared/i18n.js](../../../public/shared/i18n.js) (`TERMS`, `showTerm`,
and the `data-hint` wiring inside `wireTerms()`).
