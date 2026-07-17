# DESIGN SPEC — "The Settlement" (working title)

A GM-side settlement management tool for a West Marches–style Daggerheart campaign.
This document is the source of truth. When in doubt, re-read **Design Philosophy** and **Spoiler Safety** — those two sections outrank everything else.

---

## 1. What this is

A locally-run web app (single machine, local server, opened in a browser) that helps one GM run a drop-in/drop-out West Marches campaign in the Daggerheart system. Roughly 50 settlers have arrived in an unexplored world with nothing, and the players build a town from wilderness while exploring a hex map where each hex is an adventure.

The app has two faces:

- **GM Console** — private. Full control: resolve downtime, look up event results, manage foremen, buildings, resources, hidden stats.
- **Player Dashboard** — shareable/projectable (second browser tab or window is fine for v1). Shows the town's visible state: population, resources, buildings and their levels, character cards, and the revealed portion of the hex map. Never shows anything from the Hidden layer (§8).

There is exactly one real user: the GM. No accounts, no auth, no multi-user editing. The player view is read-only.

---

## 2. Setting & tone

Get this right — it shapes every label, empty state, and piece of microcopy in the UI.

**The premise.** ~50 settlers have crossed into a new world. It is not empty — other towns, cities, and powers exist out in the dark hexes — but the settlers start knowing nothing and owning nothing. No buildings, no map, no allies. The hex map begins as a black grid; they pick a direction and walk.

**The scale is intimate.** This is medieval-realistic smallness, not fantasy-city bombast. Fifty people is a community where every individual matters, every death is a name, and one good foreman changes everything. The UI should feel like a well-kept steward's ledger, not a 4X strategy game. Prefer words like *settlement, stores, folk, season, ledger* over *base, inventory, units, turn, database*.

**The tone curve: grounded warmth, rare wonder.** Daily life is mud, timber, rationing, and small human moments — a squirrel stealing lunches, a work-song, a stray dog. Magic and the fantastical exist but are *rare and enormous* when they appear: a sword found inside a log, a wolf that speaks. The event tables already encode this curve (mundane middle, legendary top). The UI must not undercut it — no cartoon fantasy iconography, no "EPIC LOOT!" energy. Quiet, warm, slightly worn. Think hand-drawn map margins, ink and parchment sensibilities — executed with restraint, not a parchment-texture theme park.

**Consequences are real.** A roll of 0 burns a building down and can kill a named character. The tool should present catastrophe soberly, not gamified ("Achievement unlocked: fire!"). When the app reports a result, it reports it like a ledger entry, and the GM narrates the drama at the table.

**GM style.** The GM runs an open table in the Brennan Lee Mulligan tradition — difficulties stated aloud, honesty at the table — while keeping a small hidden layer (inspiration, one character's secret penalty) that players discover *through play*. The tool exists to protect both: openness where intended, secrecy where designed.

---

## 3. Design philosophy (rules for the builder)

1. **The tool serves the table, never replaces it.** It tracks state and reveals results; the GM narrates. No feature should generate story text, auto-resolve drama, or make decisions the table should make.
2. **Spoiler safety is a hard requirement, not a nice-to-have.** The GM has deliberately *not read* the event tables so that results surprise them too. See §8. Any screen, log, search, export, or error message that dumps unrolled event text is a bug of the highest severity.
3. **Discovery over disclosure.** Hidden mechanics (inspiration, hidden penalties) must never leak into the player view, and should be visually quiet even in the GM view — tucked away, not headlined — so the GM isn't tempted to over-signal them at the table.
4. **Start manual, automate later.** v1 is a smart ledger the GM updates by hand during downtime. Dice can be physical dice at the table with results typed in. Simulation of foreman rolls is a later phase, not a launch requirement.
5. **Everything is hand-editable.** All state lives in human-readable JSON files on disk. The GM must be able to open a file in a text editor and fix anything. No opaque database.
6. **Log-normal feel, significant steps.** The reward curve is deliberately logarithmic (2→3→5→8→13→20). Preserve it. Never flatten, rebalance, or "fix" the numbers.
7. **Small and finishable beats grand and abandoned.** Each phase in §11 must be independently useful. Resist speculative features.

---

## 4. Core concepts (glossary)

- **Settlement** — the town. Has population (~50 to start), a stock of each resource, and a set of buildings.
- **Building** — e.g. Lumber Camp. Has a *level* (starts at 1), an assigned *foreman*, a *resource* it produces, and an *event table* (0–30).
- **Foreman** — a named NPC (character card) assigned to a building. Contributes a bonus to that building's downtime roll. Recruited over the campaign; players may reassign them.
- **Character card** — name, portrait slot, short backstory, Daggerheart-style trait bonuses (e.g. Presence +2), a per-building aptitude bonus, and hidden fields (§8).
- **Downtime** — the between-adventures phase, roughly seasonal (~6 months of game time between rolls per building). Each building rolls once on its event table.
- **The roll** — see §5.
- **Event table** — 31 entries (0–30) per building. Each entry has a one-time *event* and a repeatable *resource payout*. Already authored; see §6.
- **Resources** — abstract, Rogue Trader–style town-level pools (Lumber, Food, Morale, Security, Supplies; more later). Not coinage. Personal coin belongs to player characters and is out of scope for this tool.

### Construction economy

The founding stores cover the five starter buildings exactly. Construction is
gated by a GM-recorded table ruling (pending, passed, or failed), but the app
does not prescribe the check. Only a passed project can spend materials; a
failed attempt spends nothing. Buildings start seasonal work at level 1 and
can be improved through increasingly expensive projects to level 5. Exact
costs and operating details live in [construction.md](construction.md).
- **Hex map** — a grid overlaying a scanned map image. Hexes start hidden (black); the GM reveals them as players explore. Clicking a revealed hex shows its notes.

---

## 5. The roll system (exact math — do not "improve" it)

**Dice:** 5d6 where one die is negative → `d6+d6+d6+d6−d6`.
Raw range: −2 to 23. Raw average: 11. The distribution is bell-shaped; extremes are rare. This shape is the point: each step away from average is *significantly* rarer, which is what makes high results feel earned.

**Modifiers added to the raw roll:**

- **Building level** (starts +1, grows as the building is improved)
- **Foreman aptitude** for this building (an aggregate of the character's relevant traits/domain; typically around +2 for a suited foreman — deliberately *not* raw domain stacking, which the GM judged too strong)
- **Inspiration** (hidden, −1 to +2, per character; see §8)
- **Player effort** (+1 when a PC meaningfully pitches in during downtime)
- **Hidden penalty** (specific characters only; see §8)

**Result:** clamp final total to 0–30. Look it up on the building's table.

**Calibration intent:** with a level-1 building and a decent foreman, results should hover in the low-to-mid teens — the "quiet zone." ~16 is where things start being *good*. 0 is catastrophic (building destroyed, stockpile lost, foreman possibly dead). 30 is the once-a-campaign legendary moment. Players discovering that a single +1 shifts them into a whole new tier of outcomes is the core reward loop; the tool just needs to add correctly and keep the tiers intact.

**v1:** the GM rolls physical dice and types the raw result; the app applies modifiers, shows the arithmetic (minus hidden components — see §8), and reveals the entry.
**Later phase:** an in-app roller that simulates the actual 4d6−1d6 (never a flat random 0–30 — the bell curve is sacred).

---

## 6. Event table data (already authored — treat as content, not code)

Two existing files define the format; **load them as-is**:

- `starter-buildings-event-tables.json` — five starter buildings: `lumber_camp` (Lumber, foreman Garrick), `hunters_lodge` (Food, Lyra), `bunkhouse` (Morale, Jory), `watchtower` (Security, Calder), `storehouse` (Supplies, Ellory).
- `library-event-table.json` — a later-game building in the same per-building shape; migrate it into the combined shape when the library unlocks.

Shape (combined file):

```
rewardCurve:  tierName → resource amount     (Catastrophe 0 … Legendary 20)
tierRanges:   tierName → [min, max]          (0 / 1–3 / 4–7 / 8–11 / 12–15 / 16–19 / 20–23 / 24–27 / 28–30)
buildings.<id>.results["<n>"]: {
  tier, resource, event,
  losesStockpile?   (every 0: wipe that resource's stock)
  inspirationDrop?  (every 2: nudge the GM to lower that foreman's inspiration)
  effect?           (standing mechanical bonus, e.g. every 19 grants a permanent minor efficiency)
}
```

**One-time event logic (core rule):** the *first* time a specific number is rolled for a specific building, show the full `event` text and grant the `resource`. Every subsequent time that same number comes up for that building, grant **only the resource** — display something like *"(event already spent — resource only)"* without re-showing the event text prominently. Track fired numbers per building, persistently. Structural note the app can rely on: within each building, 18 is always a stranger/recruit, 22 an adventure hook, 26 hidden treasure, 30 the signature magical moment.

Authoring convention for future tables: same tiers, same curve, same flags. A later admin feature may add new buildings, but v1 can require hand-editing JSON.

---

## 7. The two views

### GM Console (private)

- **Downtime runner** (the heart of the app): pick a building → app shows assigned foreman and current modifier total → GM enters raw dice → app computes, clamps, marks the number spent if fresh, applies resource to stores (and stockpile wipe on 0), and displays the single entry. A season log records what happened (see spoiler rules in §8 for how the log stores event text).
- **Buildings**: list with level, foreman, resource type, stock produced, standing `effect`s gained, spent-number count (e.g. "7 of 31 events discovered" — counts only, never a list of which text).
- **Characters**: card editor — name, backstory, traits, per-building aptitudes, alive/dead/missing status, plus the hidden fields in a collapsed "GM only" drawer.
- **Resources**: current pools, manual adjust with a reason field (everything auditable in the log).
- **Hex map manager**: upload map image, define grid, toggle hex revealed/hidden, attach per-hex GM notes and a player-visible summary.
- **Settlement**: population count, season counter, free-text town chronicle.

### Player Dashboard (read-only, projectable)

- Town at a glance: population, resource pools, buildings with levels and foremen.
- Character cards: portrait, name, backstory, *public* traits only. No inspiration, no hidden penalties, no aptitude numbers unless the GM marks them public.
- Hex map: revealed hexes over black; clicking a revealed hex shows the player-visible summary only.
- A "chronicle" feed of GM-published entries (the GM chooses what to publish; nothing auto-publishes).

Visual identity per §2: restrained, warm, ledger-like. When building the frontend, consult the frontend-design skill/guidance available in the build environment for execution quality, but the tone here overrides any generic aesthetic defaults.

---

## 8. Hidden layer & spoiler safety (highest-priority section)

**A. The GM must not be spoiled on event tables.**
The GM has intentionally not read the 155+ entries. Therefore:

- No screen ever lists multiple unspent event texts. No table browser, no scrolling view of entries, no search across event text.
- The downtime runner reveals exactly one entry: the one rolled.
- Logs/exports may include the text of *already-fired* events (they're known now) but must never include unfired ones.
- Error states must not dump JSON contents.
- If an "edit tables" admin feature is ever built, it must be gated behind an explicit, deliberately worded confirmation ("This will show you unrevealed events — spoil me") and should be considered a maintenance mode, not a normal screen.

**B. Inspiration (hidden, per character).**
Range −1 to +2, default 0. It reflects how the *players* treat that NPC: ignored people drift to −1; genuinely bolstered, included, helped people rise toward +2. The GM adjusts it manually after sessions. It is added to rolls silently: the GM console's modifier breakdown shows visible modifiers itemized and folds inspiration (and any hidden penalty) into the total *without itemizing them by default* — a small reveal toggle exists for the GM's own bookkeeping, collapsed by default so nothing leaks on a shared screen. The intended player experience is noticing, over many seasons, that some crews just do better, and slowly working out why.

**C. The hidden penalty (currently: Jory).**
Character cards support a hidden flat penalty (Jory: about −2) representing genuine incompetence beneath confident presentation. Table procedure the tool must support: the GM openly rolls/pitches with Jory's *stated* competence, while the actual downtime resolution quietly applies the hidden modifier. In the app this is just another hidden field folded into the total, same display rules as inspiration. The discovery arc — players gradually realizing Jory's projects fail oddly often, then facing the human problem of what to do about a kind, useless builder — is a designed story. The tool's only job is not to ruin it.

**D. Player view isolation.** The player dashboard renders from a whitelist of public fields. Hidden fields must be excluded server-side (not merely hidden with CSS), so projecting the dashboard can never leak them.

---

## 9. Data & tech constraints

- **Stack:** keep it boring and local. A small Node or Python server serving a web UI; state persisted as pretty-printed JSON files in a `data/` directory (e.g. `settlement.json`, `characters.json`, `hexes.json`, `event-tables/*.json`, `log.json`). Write atomically; corrupting the campaign file mid-session is unacceptable.
- **No cloud, no accounts, no telemetry.** Runs on the GM's machine; player view is another tab/window (same server, different route, e.g. `/gm` and `/table`).
- **Backups:** on every downtime resolution, snapshot the data directory (simple timestamped copy is fine).
- **The map image** is a scan supplied by the GM; store it locally, let the GM calibrate hex grid size/offset over it once, save the calibration.

---

## 10. Explicit non-goals (v1)

No player accounts or remote play. No PC (player character) sheets — this tool is town-side only. No trade routes, no marketplace, no economy simulation (later, after trade is discovered in fiction). No automated narrative generation. No Daggerheart 2d12 hope/fear resolution — session skill checks happen at the table; only their *outcomes* get typed in as modifiers or notes.

---

## 11. Build phases

**Phase 1 — The Ledger (MVP).** Data loading, GM console with downtime runner (manual dice entry), spent-event tracking, resource pools, character cards with hidden fields, season log, JSON persistence + backups. This alone is table-ready.

**Phase 2 — The Table View.** Player dashboard route with server-side field whitelisting, chronicle publishing, projection-friendly styling.

**Phase 3 — The Map.** Hex overlay on the scanned image, reveal toggles, per-hex notes, player-visible summaries.

**Phase 4 — The Dice & The Depth.** Construction and building improvements are implemented through GM-resolved project checks and audited resource costs. The in-app 4d6−1d6 roller, new-building authoring/unlocks, and groundwork for trade remain deferred until the fiction earns them.

Each phase ends in something the GM can actually run a session with.

---

## 12. Voice & microcopy reference

- **Clarity before atmosphere.** Use in-world language when it names the
  actual object or action: *Open the journal*, *Advance the season*, *Enter it
  in the chronicle*. Utility choices should be plain: *Choose your character*,
  *Add note*, *Next*. Do not turn navigation into a riddle. Destructive
  actions must say exactly what they remove.
- Season log entry style: *"Autumn, Year 1 — The Lumber Camp (Garrick). Rolled 17: fine boards. +5 Lumber."*
- Catastrophe style: plain and grave. *"The storehouse is lost. All Supplies destroyed."* No exclamation points, no flavor the GM didn't write.
- Empty states in-world: *"No buildings yet. The wilderness is waiting."*
- Buttons are verbs from the fiction where natural: *Resolve the season*, *Reveal hex*, *Open the ledger* — but never at the cost of clarity.

*End of spec.*
