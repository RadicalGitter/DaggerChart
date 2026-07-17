# First-session review

Review these workflows after the first live play session, using tickets and
the content-free UX map as evidence rather than trying to predict every table
need in advance.

## Before the next play session

- Move character naming from the creator's opening identity fields to the
  final step, after the character is otherwise complete. Wait until the
  current live drafts are finished before changing step order, preserve those
  drafts during migration, and recheck every name-dependent output: portrait
  prompts, review copy, covenant signature, automatic theme generation, and
  the post-completion redirect.

## Images and world records

- Check whether the Images library makes character portraits and recent scene
  views fast to find during play.
- Review whether canonical Location → optional Sub-location is the right
  amount of structure, and whether opening a location's existing Places page
  is enough of a wiki link.
- Check projector timing, especially the **show when ready** option and whether
  multiple returned variants need a deliberate chooser before casting.
- Review the scene tag hierarchy against actual prompts. Revise payloads and
  branches without rewriting stored `tag-board-v1` records.
- Decide which location interactions belong directly in the library once the
  GM has used it under table pressure.

## Wiki writing aid

Add bounded LLM-assisted fill-out tools to the in-app wiki only after the live
workflow is understood. The tool should propose editable text for a chosen
field, show exactly what context will be sent, and require GM review before any
save. It must not read or send chance-table entries, hidden player material, or
unrelated lore.
