# Agent worklog — coordination between Claude & Sol (and any future hands)

Two agents work this repo (plus Oscar). This file is how we avoid trampling
each other. Rules of the road:

1. **Before starting work**: read this file, run `git status`. Uncommitted
   changes belong to whoever logged them here — do not touch those files,
   do not `git add -A`, do not commit or stash someone else's WIP.
2. **Claim a lane** with an entry below (newest first): date, agent, files
   or feature you're on, status. Update it when you finish.
3. Prefer additive work (new files, new branches) when the other agent has
   an open lane. Merge conflicts are cheaper than lost WIP, but neither is
   free.
4. Spoiler rules (CLAUDE.md / AGENTS.md) bind every agent equally: never read
   `data/event-tables/*` event text or `data/tables/*` entry text/rewards;
   player payloads only via the whitelists in `server/views.js`.

---

## Lanes

**2026-07-18 — Codex** · status: DONE
Lane: resilient player feedback capture. Normalized modern CSS colors in the
screenshot clone and added a drawable fallback canvas so capture failures can
no longer prevent a player from filing a ticket. Verified on the live character
sheet and covered the fallback contract with a client regression test.

**2026-07-18 — Codex** · status: DONE
Lane: universal player return control. Added one shared floating route back to
`/player` across every top-level player surface, suppressed it inside embeds
and on the player/login hubs, and verified live route coverage and navigation.

**2026-07-18 — Codex** · status: DONE
Lane: settlement construction and stores. Adding data-driven building costs,
GM-resolved check gates, audited construction/upgrades, and responsive GM and
player-facing building/store views. Working on top of the current live server
and feature-gating changes without reverting their uncommitted work.

**2026-07-17 — Codex** · status: DONE
Lane: player-session release pass. Added campaign-scoped feature rollout
controls, player navigation gates, duality dice and GM critical feedback (with
the unfinished player roller mount held back for review),
world-theme music references, an embedded GM drafting board, shared floating
Folk portrait cards, the two-pane Folk/portrait workshop, structured age/bond/
experience fields, and desktop scroll containment. Shortened initial character
creation to its finished-character essentials, preserved drafts across the
step migration, corrected language/scroll/two-handed flows, and replaced
clickable choice divs with buttons. Verified 21 tests, syntax, complete mobile
creation, EN/SV retention, portrait workflow readiness, Folk public whitelists,
desktop/mobile layouts, and no horizontal overflow. Existing campaign data,
event text, generated media, the resource-economy audit, missing-Folk research,
and the parked background studio remain outside this commit.

**2026-07-17 — Claude + Codex** · status: DONE
Lane: integrate Claude commit `31288bd` (GM Almanac). Retained beta's newer
34-page public rules corpus and shared ranking module, then grafted Claude's
eight private lore pages and three reveal-one-result chance tables into a
single responsive GM tool. Replaced duplicate public routes with bounded
GM-namespaced lore CRUD, explicit roll-response whitelists, uniform dice,
seen-count metadata, and failure-safe controls. Verified structure without
printing entry prose, scratch-only CRUD/repeats/range gates/travel rolls,
desktop/390px/320px layouts, and no horizontal overflow. Live campaign data,
table state, local audio, and map work remain outside the commit.

**2026-07-17 — Codex** · status: DONE
Lane: session perspectives and reviewed Opus retellings (feature 4). Campaign-
scoped session records, strict player whitelists, isolated Anthropic adapter,
GM gathering/review flow, and the player Chronicle prompt. Verified campaign
isolation, own-draft-only payloads, completion booleans, missing-key failure,
mocked 5xx retry, review publication, restart recovery, EN/SV, and 390px/320px
layouts. One isolated dummy Opus request verified the configured provider; no
live campaign content was sent. Live campaign data and unrelated local media
stay outside the commit.

**2026-07-17 — Codex** · status: DONE
Lane: campaigns (feature 6). Added boot migration and atomic persistence for
campaigns, PC/draft/session/log ownership, guarded campaign management APIs,
current-campaign party/chronicle whitelists, the GM campaign ledger, conditional
creator choice, campaign-grouped draggable login bubbles, and cross-campaign
identity recognition in personal shells. Verified duplicate/invalid/archive
gates, migration idempotence, hidden/restored access, chronicle separation,
EN/SV creator text, and desktop/390px/320px layouts against dummy data. Live
campaign JSON and unrelated local media remain outside the commit.

**2026-07-17 — Codex** · status: DONE
Lane: rules wiki (feature 5). Added the official-SRD-derived
`data/daggerheart/rules.json`, cacheable public API, responsive `/rules` page,
shared ranked search, deep links/cross-references, glossary integration, i18n,
telemetry, the `/table` Rules card, the `/tome` knotted-cord spread, and GM
hotbar quick-search with full-reference links. Verified static validation,
ETag/304, keyboard navigation, EN/SV, glossary popovers, embedded/standalone
views, focus return, and desktop/390px/320px layouts against scratch data.
Live campaign JSON and local media remained outside both commits.

**2026-07-17 — Codex** · status: DONE
Lane: private GM/PC messages (feature 3): message persistence and audience
views in `server/state.js`/`server/views.js`, validated routes in
`server/index.js`, correspondence in `public/shared/gm-tools.*`, reusable
player chat in `public/shared/player-chat.*`, the tome dock, i18n, and docs.
Verified thread isolation, counts-only general payloads, active/retired gates,
sender read semantics, restart persistence, SSE badges, `Ctrl+Enter`, focus
return, and desktop/390px/320px layouts against dummy data. Browser QA also
fixed overlapping read acknowledgements, atomic temp-file contention, singular
unread copy, and the mobile feedback-button collision. Live campaign JSON and
local media remain out of the commit.

**2026-07-17 — Codex** · status: DONE
Lane: GM overlay and hovering hotbar (feature 2): named-board migration and
routes in `server/index.js`, GM party vitals in `server/views.js`, static GM
reference data, `public/shared/gm-tools.*`, `public/board/*`, `public/gm/*`,
and docs. Verified legacy migration, aliases, invalid-name rejection, isolated
writes, restart persistence, keyboard close/focus, Fear controls, and responsive
desktop/390px/320px layouts against dummy data. Live campaign JSON, generated
`boards.json`, and local media remain out of the commit.

**2026-07-17 — Codex** · status: DONE
Lane: Fear/Hope tracker (feature 1): `server/state.js`, `server/views.js`,
session route in `server/index.js`, `public/shared/session-pools.*`, the three
player shells, `public/gm/*`, and docs. Live campaign JSON and local media
remain out of the commit.

**2026-07-17 — Codex** · status: DONE
Lane: reversible PC retirement (feature 7): `server/views.js`, party routes in
`server/index.js`, `public/gm/*`, and lifecycle documentation. Live campaign
JSON and local media remain out of the commit.

**2026-07-17 (night) — Claude** · status: DONE
Lane: `docs/worklog.md` (this file), `docs/bard-systems.md` (design
blueprint for the Bard-layer systems Oscar specified tonight: LLM reward
pages, folk b-plot arcs, silent portrait aging, Suno audience milestones,
age penalties). New files only, committed to `beta` without staging
anything else. Did not touch: `server/index.js`, `server/music.js`,
`public/music/*`, any `data/*.json` (Sol's open lane).

**2026-07-17 — Sol (Codex)** · status: OPEN (observed, not self-logged)
Uncommitted at time of writing: the music desk (`server/music.js`,
`public/music/*`), `server/index.js`, several `data/*.json`, plus commits
on `beta` for player hub / drafts / papers / feedback. Sol: append your
own entries here going forward — and the untracked WAV masters +
`Visseren/` in the root are presumably yours or Oscar's; I left them
alone.
