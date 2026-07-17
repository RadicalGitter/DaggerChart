# Player shell visuals

The player hub can have more than one visual treatment. Each treatment is a
standalone frontend over the same spoiler-safe player payload; visual choices
must not fork campaign state or widen what reaches the browser.

## Current visuals

### Player root — `/player`

The login chooser sends a completed PC here. It is a quiet utility hub, not
another campaign view: Character, Background, Notes, Journal, Inventory, and Rules are at
hand before the player chooses among the currently available physical shells. The player can
switch the device's `settlement-pc` identity here. The preferred shell is stored
only in `settlement-shell`; it does not fork character or campaign state. Every
shell keeps a small Views control back to this root. The settlement folio is
absent until the GM opens the campaign's **Settlement folio** player feature;
opening that one switch reveals the whole settlement mode together.

### Card deck — `/table`

The general-purpose arcana deck. Three large tarot-flavored cards open Journal,
Character, and Rules. On narrow screens the cards become banner rows. It stays
settlement-neutral so revealing the folio remains a deliberate moment.

### Physical tome — `/table-book`

The settlement folio: Town, Folk of Note, and Chronicle only. All three chapters
share the campaign's single **Settlement folio** feature gate. It begins closed
and front-facing; choosing a bookmark opens a two-page spread, and movement
between chapters turns a leaf in the appropriate direction. Earlier bookmarks
move to the left edge. On narrow screens the spread becomes one readable page
with compact horizontal chapter tabs.

### Aged tome — `/tome`

A personal weathered tome: Journal, Character, Inventory, and Rules. Cracked
leather, foxed parchment, candlelight, dust, and a restrained breathing motion
make it feel handled rather than framed in a generic app panel. Navigation is
by **keepsakes**: a pressed flower, bone charm, key ring, and knotted cord. A
keepsake keeps its resting height when it migrates to the left edge.

Character is one native two-page spread with no nested scrolling. Inventory is
its adjacent keepsake; its first spread holds equipped arms/armor and carried
items, while detailed Domain cards turn onto further spreads. Journal remains
the existing spoiler-safe embed. Rules opens the shared reference in a stable
embed opposite a lightweight chapter plate; the functional page comes first
on narrow screens.

Carried entries are buttons into a parchment editor. Mundane items expose
freeform name, description, and quantity. Standard Consumables retain their
catalog rules, expose notes and quantity, and offer a Consume flow with an
item illustration, validated die inputs when needed, atomic sheet changes,
and a restrained result animation. See [inventory.md](inventory.md).

The chosen character's standard Conditions appear in a fixed utility dock at
the foot of the tome. Each uses an original line symbol from
`public/shared/conditions.js`; pressing it opens a short EN/SV rules
explanation. `#player-chat-slot` mounts the private GM/PC thread in that same
dock through `public/shared/player-chat.*`. The unread badge appears only for
that chosen PC, the correspondence panel marks the player side read when it
opens, and `Ctrl+Enter` sends without leaving the tome.

Standalone player surfaces mount `public/shared/player-tools.*`, a fixed field
kit for quick personal/group notes plus links to Character, Background, Journal,
Inventory, and Rules. It resolves only the current `settlement-pc`, posts through the
existing notes route, and is omitted from embeds to avoid nested controls.
`/tome?open=1&section=<key>` opens a named keepsake directly.

Keepsakes are defined in the `KEEPSAKES` registry in `public/tome/tome.js` —
one entry per object (art, label placement, sway). **Future player
customization should resolve a player's choice to a key in this registry**;
nothing else needs to change. All motion respects `prefers-reduced-motion`.

## Shared contract

Every player-shell visual must preserve these boundaries:

- Read settlement content only from `GET /api/table`. Never render a player
  shell from `/api/state` or another GM payload.
- When a visual renders a chosen character natively, read it from the explicit
  player whitelist returned by `GET /api/party/:id`; never use the stored PC
  object or a GM view as a shortcut.
- Listen to `/api/stream` and refetch after broadcasts.
- Fetch private correspondence only from `GET /api/messages?pc=<chosen-id>`;
  no shell payload contains thread text, and another PC's thread must never be
  requested as a convenience.
- Render the shared `session-pools` strip from `/api/table`: the deck and folio
  show party Hope, the personal tome shows only its chosen PC, and Fear is
  omitted entirely when the payload carries `null`.
- Keep Conditions on the chosen-character whitelist and reuse the shared
  registry rather than inventing route-specific identifiers or symbols.
- Use the single device identity key `settlement-pc` (the legacy
  `settlement-journal-pc` key may be read only for migration).
- Embed the Journal from `/journal/?embed=1&pc=<id>` and character sheets from
  `/character/:id`. Keep an iframe stable across SSE refreshes while its panel
  remains open.
- Put new player-facing phrasing in both EN and SV in
  `public/shared/i18n.js`. Daggerheart game terms remain English.
- Retain the quiet steward's door to `/gm` and the grounded, warm tone from the
  settlement design spec.
- Never expose hidden fields or event-table content. A visual variant changes
  presentation, not disclosure rules.

## Adding another visual

Add each visual as its own directory under `public/`, its own static route in
`server/index.js`, and one entry in `public/shared/shells.js`. Keep `/player` as
the login destination unless an explicit product decision changes the root.

A new visual is ready for comparison when it:

1. Implements its declared tool scope completely.
2. Preserves device identity and stable embeds.
3. Works at desktop and phone widths.
4. Has EN/SV UI phrasing.
5. Has been restarted and browser-smoke-tested alongside `/table`.
6. Leaves real campaign data unchanged during visual verification.

The root selection chooses only a shell route. It must not duplicate PCs,
notes, doodles, inventory, or settlement data.
