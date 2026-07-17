# Player inventory and consumables

Inventory has two deliberately different weights:

- A **mundane item** is a name, an optional description, and a quantity. Rope
  should remain as easy to edit as a line in a notebook.
- A **Consumable** may point to the standard catalog. Catalog rules and
  reactions are authoritative; the player can change quantity and personal
  notes, but cannot accidentally rewrite what a Health Potion does. A custom
  Consumable has freeform rules and consumes one quantity without automatic
  bookkeeping.
- A **paper artifact** is a physical note or signed covenant. Notes carry
  explicit body/author metadata and can be opened from the sheet or tome.
  Covenants carry the signed name/time and are immutable inventory records.

The complete 60-entry standard Consumables table lives in
`data/daggerheart/reference.json`. It includes the loot-table roll, English
and Swedish rules text, a small illustration family, and an optional
declarative `reaction`. The English source is the Daggerheart SRD via the
existing `daggersearch/daggerheart-data` reference source (DPCGL).

## Stored and player-facing shapes

New ordinary stored entries use:

```json
{
  "id": "item_...",
  "kind": "mundane | consumable",
  "name": "50 feet of rope",
  "description": "Knotted every five feet",
  "quantity": 1
}
```

A standard Consumable replaces `name` and `description` with
`catalogId` and may add `notes`. The explicit whitelist in
`playerCharacterView()` resolves the catalog name, localized descriptions,
icon, and reaction. Old string entries remain valid and appear as typed
player items. They migrate to the object shape only when that inventory is
mutated.

Catalog Consumables stack by `catalogId`, with the SRD limit of five of each.
Using one and changing the character sheet happen in one server mutation, so
a lost response cannot remove the item without applying its bookkeeping (or
vice versa).

Paper entries use `kind: "paper"` and `paperType: "note" | "covenant"`.
Player-created notes retain the PC name as `author`; GM-delivered private and
group notes are copied into each target inventory. The final creator step puts
one signed covenant directly into the completed PC's starting inventory.
`playerCharacterView()` exposes only the paper rendering fields. It does not
turn inventory into a path around the normal hidden-data whitelist.

## Reactions

`reaction` is data, not item-name branching in the UI. The current engine
supports:

- `clear`: ask for a die result, then clear HP or Stress with an optional flat
  bonus;
- `choose-clear`: choose HP or Stress and apply a die result;
- `gain`: gain a fixed tracked resource;
- `adjust`: apply one or more fixed mark/clear operations;
- `spend-clear`: spend Hope and clear the same number of Armor Slots;
- `sun-tree`: the standard d6 branches, including the non-automated scar
  reminder;
- `feast`: clear all HP and Stress and gain the entered d4 Hope result.

Thirteen standard Consumables currently map cleanly to tracked sheet state:
the three Health Potions, three Stamina Potions, Varik Leaves, Snap Powder,
Armor Stitcher, Circle of the Void, Sun Tree Sap, Feast of Xuria, and Sweet
Moss. The other catalog entries still show their full rules and consume one
quantity after confirmation, but do not pretend the app can resolve fictional
positioning, attack damage, rests, or lasting narrative effects.

To add a custom automated reaction, add a data descriptor to the catalog,
teach `applyReaction()` in `server/inventory.js` how to validate and apply the
new kind, and add only the required input controls to `useFields()` in
`public/tome/tome.js`. Keep the server authoritative and return structured
changes for the animation/result copy.

## API

- `GET /api/items/consumables` - lightweight standard catalog for GM search.
- `POST /api/party/:id/inventory` - add a mundane or custom Consumable.
- `POST /api/party/inventory/paper` - deliver a GM paper to one PC or the
  whole group.
- `PUT/DELETE /api/party/:id/inventory/:itemId` - edit or remove one entry.
- `POST /api/party/:id/inventory/grant` - give a standard Consumable by
  `catalogId`.
- `POST /api/party/:id/inventory/:itemId/use` - validate reaction inputs,
  atomically apply tracked changes, and consume one quantity.

All inventory responses use `playerCharacterView()`; stored PC objects are
never returned directly.
