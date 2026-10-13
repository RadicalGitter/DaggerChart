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

## Music under table pressure

- Treat the bubble desk as provisional. The first session mixed real
  navigation friction with live bug hunting, so measure time to find a cue,
  accidental playback, confidence in the queue, and visibility of what is
  currently playing before choosing a replacement layout.
- Trial named music pockets as playlist-backed cue groups. If the spatial
  bubble metaphor survives, pockets may look like named whirlpools; the stored
  structure remains an ordinary playlist so another interface can replace it.
- Compare recorded submit-to-ready times for V4.5, V5, and V5.5 after normal
  use. Do not run automatic benchmarks that consume credits. Extensions must
  retain the source model, so model speed is chosen when the source is made,
  not while it is being continued.

## GM notifications and subscriptions

- Player requests to show visible material are the first producer for the
  reusable GM inbox. Review whether phone interruption timing and desktop
  queue density are appropriate during play.
- Later producers may let the GM subscribe to changes in a player's notes or
  background. Each notice should identify its source, link to it, and include
  a bounded compact diff where appropriate.
- Never turn the inbox into a firehose, auto-project a player request, or use a
  subscription to bypass existing server-side audience whitelists.
