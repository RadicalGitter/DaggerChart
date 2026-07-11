# Player identity

The Settlement has a trusted-table identity chooser, not authentication. There
are no passwords, accounts, sessions, or permissions. Choosing a character
only tells this browser which PC owns personal notes, journal doodles, and the
Character section.

## Entry screen

Bare `/` redirects to `/login`.

The chooser has three kinds of entry:

- **Game Master** — a full-row plaque that opens `/gm`. It does not set a
  player identity.
- **Projector Screen** — a centered two-thirds-width, two-thirds-height plaque
  that opens `/screen`. It does not set a player identity.
- **Player character** — a tall portrait card. Choosing one writes its `pcId`
  to the device's `settlement-pc` localStorage key, then opens `/table`.

The character creator is the create-user path. Links from `/login` open
`/create/?return=/table`; successful creation stores the new PC identity and
returns to the player shell. Direct visits to `/create` keep the existing
behavior of opening the new character sheet after creation.

When no PCs exist, `/login` uses the public Folk of Note cards as visual
stand-ins. They are marked as stand-ins and link to creation. They never write
an NPC id to `settlement-pc` and can never own notes or doodles.

## Player-safe payload

The chooser reads only `GET /api/table`. Its `party` entries contain:

```text
id, name, player, portrait
```

These are explicit public identity fields. Hidden character or event data must
not be added to the login payload.

## Character-owned records

- Personal and group notes in `data/notes.json` retain their author `pcId`.
- Journal drawing layers in `data/journal-doodles.json` are keyed by `pcId`.
- The chosen identity is local to the browser device; selecting another PC
  simply changes `settlement-pc`.

Character creation does not copy records from an older character. A future
retirement/migration tool may move notes to a new PC, but that must be an
explicit GM/player action that rewrites note ownership atomically and records
what moved. It must not infer ownership from player names. Doodle migration
should be offered separately because drawings may belong to the old
character's journal as an artifact.

## Trust boundary

Anyone at the table can choose any entry. This is deliberate: the app runs on
a trusted LAN with no authentication. Privacy remains "not shipped by
default": personal notes leave the server only when `/api/lore` is requested
with their owning `pcId`.
