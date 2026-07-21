# Character-specific states

Character-specific tools must be keyed by stable PC ID and projected through
the narrowest audience view that needs them. They do not belong in the party,
table, projector, or general identity payload merely because they affect how a
particular character is played.

## Live session clock

`data/live-session.json` contains a campaign-scoped play clock independent of
the retrospective Session Chronicle. The GM explicitly starts play with a
participant roster and may pause, resume, or end it. Timed character states
accrue only while the clock is `running` and that character is on the roster.

The clock stores timestamps and settled elapsed milliseconds rather than
depending on a browser interval. Browser timers are display-only. This keeps
accounting correct across refreshes and allows exact tests. A server restart
does not implicitly end active play; the persisted timestamp continues until
the GM pauses or ends the session.

## Heliga Erik: balance of light and shadow

Stable PC ID: `pc_1784315090465_aouy`.

The private balance has three positions:

- `neutral`: no bonus and no penalty;
- `light`: +1 to lightward action, -1 to shadowward action;
- `shadow`: +1 to shadowward action, -1 to lightward action.

The table decides whether an action is lightward or shadowward. The app does
not infer that from a roll. While in Shadow and actively present in a running
session, Erik may invoke the shadow for +1 at zero Hope cost. The endpoint
atomically adds one Fear to the GM pool and records the invocation. It refuses
the invocation outside active play, outside Shadow, or when Fear is full.

The Dreamer may use the current direction to grant +1 or impose -1 elsewhere
without spending Fear. That remains a GM ruling rather than an automated roll
mutation.

The state is included only in Erik's direct character projection and the
private GM projection. Other party identities, the general table, and the
projector never receive it. This is trusted-LAN audience isolation rather than
authentication.

The character sheet renders a generated-light treatment around Erik's
existing portrait in Light and an animated miasma in Shadow. A future
Erik-specific GM art workshop may generate dedicated Light/Neutral/Shadow
portrait variants; it should preserve the canonical portrait and attach
variants to this state instead of overwriting the base image.

## Shared presentation seam

Bob Naslos's disguises and Kaya's Beastforms use one active presentation
record with separate rule adapters:

- a disguise changes party-facing name/portrait presentation but not canonical
  mechanics;
- a Beastform uses SRD-authored tier gating and an explicit mechanical overlay,
  with a reversible return to the untouched canonical sheet;
- personal generated portraits belong to the presentation/form record, not the
  PC's canonical portrait history.

The canonical PC remains untouched in `data/pcs.json`. Active state, personas,
and per-form portrait customization live in
`data/character-presentations.json`. `/presentation` is the private player
workshop for both roles. Party identity payloads receive only the current
presented name, portrait, and broad presentation kind; they do not receive
persona records, canonical comparison values, or the Beastform catalog.

Kaya's card back is a Beast-sheet comparing canonical and transformed values.
Standard transformation marks one Stress. Evolution spends 3 Hope and records
the chosen +1 trait. Returning does not refund either cost, and marking the
last Hit Point clears the form automatically.

The catalog in `data/daggerheart/beastforms.json` is derived from the official
Daggerheart SRD Beastform sheets. Legendary/Mythic evolved and hybrid templates
are retained but require component configuration before activation; Kaya
cannot reach those tiers yet.
