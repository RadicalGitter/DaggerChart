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
4. Spoiler rules (CLAUDE.md / AGENTS.md) bind every agent equally: never
   read `data/event-tables/*` event text; player payloads only via the
   whitelists in `server/views.js`.

---

## Lanes

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
