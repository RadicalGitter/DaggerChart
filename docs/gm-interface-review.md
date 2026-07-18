# GM interface review

The encounter-stage pass established a reusable creature explorer and exposed
the main layout question for the next GM-console overhaul: the console has good
individual tools, but too many unrelated page shapes and too many top-level
destinations.

## Keep

- The persistent left navigation. It preserves place while embedded tools work
  at full height.
- The Party workspace's roster / working surface split.
- The encounter stage's public/private boundary: the battlefield is projectable
  while the inspector remains GM-only.
- Folk portrait cards as the selection surface, with the private record beside
  them.
- The Almanac's index / article relationship and ranked search.
- Shared projector actions rather than separate presentation workflows.

## Consolidate

The eventual navigation should describe a few working contexts, not every data
type. A useful first grouping is:

| Context | Tools that can share the screen |
| --- | --- |
| Run the table | Party, encounters, Fear, quick rules, Screen controls |
| Settlement | Season, Stores, Buildings, Ledger |
| World | Folk, People, Places, Images, private lore |
| Chronicle | Sessions, published ledger, player correspondence |
| Review | Feedback tickets and UX evidence |

Music should remain globally reachable during play, either as a persistent
transport/drawer or a Run-the-table tool, rather than consuming an unrelated
full console destination every time playback needs attention.

## Shared workspace contract

New GM tools should be mountable into the same four slots:

1. **Navigator:** compact cards, tags, search results, or a roster.
2. **Working surface:** stage, document, board, image, or character sheet.
3. **Inspector:** details and edits for the current selection.
4. **Action rail:** projection, creation, destructive commands, and status.

On wide screens, Navigator / Surface / Inspector can coexist. On constrained
screens, they become explicit panes without changing the tool's state. The
creature explorer and encounter stage now use this contract as a first working
example.

## Next-pass priorities

1. Group and shorten the left navigation while preserving direct hash routes.
2. Extract a shared GM workspace shell with responsive pane switching.
3. Move projector controls into a persistent contextual rail.
4. Combine Folk, People, Places, and Images around one entity selection model.
5. Combine Season, Stores, Buildings, and Ledger around one settlement work
   surface.
6. Keep rules search, Fear, correspondence, and music transport available
   without leaving the active working context.
7. Standardize loading, saving, empty, error, and destructive-confirmation
   states across embedded and native tools.

This is groundwork, not a mandate to merge domain logic. Each module should own
its data and mutations while exposing selection and actions to the shared shell.
