---
name: encounter-builder
description: Prepare Daggerheart combat encounters for this table and make them selectable presets in the /board ⚔ Encounter menu. Use whenever Oscar asks for encounters, fights, ambushes, a combat for tonight, a backup fight, or "something with wolves/bandits/…" — even if he doesn't mention presets or the board. Covers Battle Point budgeting from the SRD, picking stat blocks from data/adversaries.json, writing data/encounter-presets.json, running notes, and checking the result.
---

# Building encounters for The Settlement

Encounters are prepared as **presets**: hand-edited rosters in
`data/encounter-presets.json`. On `/board` → **⚔ Encounter**, the
**+ From a preset…** menu turns one into a live encounter: every active PC card
on the left, the preset's adversaries placed on the right, and the preset's
running notes shown in the Details panel whenever no card is selected. Which
PCs appear: if a session is running in /gm → Sessions, only those ticked under
**Who is in play**; otherwise every active character. A PC can also be taken off
with **Not at the table tonight** on their card. Either way the Battle Point
budget in the header follows the PCs on the stage.

## 1. Settle the brief

Get (or assume, and say so): party size, party level/tier, how hard
(easier / standard / harder), theme, and where it happens. If unattended, assume
the current active party and a standard fight, and write the assumption into the
preset's `budget` or `notes`.

Read the party from `data/pcs.json` only for numbers that matter to balance:
level, Evasion, thresholds, HP, and who is active (`active !== false`).

## 2. Budget with Battle Points (SRD)

Base budget = **3 × number of PCs + 2**. Adjust:

| Adjustment | Points |
|---|---|
| Easier or shorter fight | −1 |
| Using 2 or more Solo adversaries | −2 |
| Adding +1d4 (or +2) to all adversary damage | −2 |
| Choosing a lower-tier adversary | +1 |
| No Bruisers, Hordes, Leaders or Solos | +1 |
| Harder or longer fight | +2 |

Costs: Minions 1 per group of minions equal to the party size; Social or
Support 1; Horde, Ranged, Skulk or Standard 2; Leader 3; Bruiser 4; Solo 5.
The board computes the same numbers (`TYPE_COST` in
`public/board/encounter.js`), minus the situational adjustments.

## 3. Pick stat blocks

Use only ids that exist in `data/adversaries.json` (`adversaries[].id`).
Prefer the campaign's own blocks (`sourceId: "vesserin"`, ids `adv_*`) when one
fits the theme; fall back to the SRD (`srd_*`) or Julia's Arsenal (`julia_*`).
The server never writes `adversaries.json`; if a needed creature is missing,
add a block there in the same RAW shape rather than inventing stats in notes.

Match tier to the party (tier 1 for levels 1–4). Read each block's features
before choosing: things like Pack Tactics, Restrain, or Fear-cost actions
decide how the fight plays, not just its numbers.

## 4. Write the preset

Add an object to `presets` in `data/encounter-presets.json`:

```json
{
  "id": "preset_short_slug",
  "name": "Short evocative name",
  "partySize": 3,
  "budget": "10 of 11 Battle Points (standard)",
  "summary": "One sentence: who, where, what kind of fight.",
  "notes": "How to run it: opening move, what each creature wants, the lever the PCs can find, the escalation you are holding back, and when the enemy breaks.",
  "adversaries": [
    { "refId": "srd_jagged_knife_lieutenant", "label": "Toll-Taker", "x": 0.8, "y": 0.45 }
  ]
}
```

- `budget` must start with the points actually spent (`"<spent> of <budget>"`);
  `test/encounter-presets.test.js` recomputes it.
- Positions are fractions of the 16:9 stage. PCs stand at x ≈ 0.14–0.24 on the
  left, so place adversaries at x ≈ 0.55–0.92 and spread y between 0.12 and 0.85.
  Ranged and Hidden creatures go furthest back.
- Labels are short and tell creatures apart at a glance ("Bandit (left bank)").
- Notes follow the house tone (AGENTS.md §Tone): plain, grounded, no
  exclamation marks. Include a retreat or surrender condition so fights end on
  a decision, not on the last hit point, and say when to telegraph big moves.
- Don't spend the whole budget when an escalation is written into the notes;
  say what the escalation costs.

## 5. Check it

```bash
node --test test/encounter-presets.test.js
```

Then restart the server: presets are read once at boot, like the bestiary.
`GET /api/encounters/presets` and `POST /api/encounters { presetId }` are
Keeper-only routes. Never create encounters by editing `data/encounters.json`
while the server runs; its in-memory copy overwrites the file on the next save.

If Oscar wants a printed prep sheet as well, add a Markdown file under
`docs/encounters/` in the style of `the-changed-knives.md`.

## Spoiler rules still apply

Encounter work never needs `data/event-tables/*` or `data/tables/*`. Don't open
them (AGENTS.md, Hard rules).
