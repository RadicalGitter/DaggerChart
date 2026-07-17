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
