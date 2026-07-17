# Beta review guide — rebased 2026-07-17 onto wip-snapshot

`beta` = `wip-snapshot-2026-07-17` (inventory & consumables, conditions,
pens/shells, tome development, reworked creator, history.md) plus three
cherry-picked survivors from the earlier improvement runs. Earlier bases
are preserved as `beta-old-base` and `beta-stale` — reference only.

## The three carried features

**Folk lore (dd97b06).** Upstream's spoiler-safe split kept; on top, the
greenlit crossing-history: Garrick owes Jory his passage, Calder came out
of the storm with two of three and carries the third man's knife, Lyra
feeds her brother's dogs, Ellory's manifest holds a name nobody answers
to. One public thread per description; every secret in `hidden.notes`.
Four proposed folk in [folk-proposals.md](folk-proposals.md).
*Review:* the `data/characters.json` diff; `/table` shows only public text.

**Dice roller behind a preference (3a7bf92).** A Preferences page at the
bottom of the console nav (device-local localStorage; campaign files
untouched). The 4d6 − 1d6 roller is off by default — the ledger expects
real bones. Enabled, "Cast the dice" joins the season runner: bone dice
land in turn, the dark die last, the sum writes itself into the raw
field. Manual entry is identical either way.
*Review:* Preferences → tick → Season → pick building → cast. Casting
touches no data; only resolving does.

**Board plates (793e30f).** `/board` gains **+ Card** (189 SRD domain
cards, typeahead) and **+ Term** (glossary entry, EN + SV). Event tables
remain impossible to pin, by design.

## Open question for the GM

The snapshot flattened fiction-forward microcopy ("A stranger arrives…" →
"Add folk", "Enter into the ledger" → "Record adjustment"). If that was
deliberate, fine; if not, restoring the §12 voice is a small branch.
