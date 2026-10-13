# Character-specific class choices

Status: implemented; first offer is Redneck's Inventor v0.1 playtest.
Read when offering a custom class to one character, translating its rules,
changing confirmation or sheet migration, or adding another class choice.

The [settlement design](settlement-design-spec.md) governs the application.
Oscar authorized the first offer and its confirmation-driven sheet migration
on October 13, 2026, then requested a reusable chooser. His authorization
supersedes the earlier workshop's prohibition on implementing UI or changing
a confirmed character. No PC is changed merely by creating or viewing an offer.

## Ownership and visibility

| Artifact | Owner / authority | Exposure and change |
|---|---|---|
| `data/character-class-offers.json` | GM-authored offer configuration | Read at boot; targeted by immutable PC ID, never added to public reference or party lists. |
| `server/class-choice-definitions.js` | Reviewed class registry and migration adapters | Each adapter validates setup and constructs the exact proposed sheet changes. |
| `server/inventor-definition.js` | Inventor v0.1 bilingual executable rules | English/Swedish feature text, both subclasses, future tiers and migration explanation. Released only for the targeted PC. |
| `pc.classChoice` / `classChoiceHistory` | Confirmed player selection and recovery evidence | Written only by the dedicated confirmation path; previous class/subclass/features remain GM-readable. Never included in player views. |
| Pending selection in the dialog | Player's unsaved proposal | No authoritative change until the explicit confirmation checkbox and submit action. |
| Player sheet | Derived whitelist in `server/views.js` | Only adopted features, main trait and familiar materials; no migration history or hidden fields. |

Access follows the existing trusted PC chooser, not individual player accounts.
The offer is restricted to Redneck's PC ID; someone deliberately opening that
same character gets the same offer. Other characters, `/api/reference`, party
identities, general rules and the creator do not acquire this class.

## Reusing the chooser

Add a reviewed adapter to `CLASS_CHOICE_DEFINITIONS`, keyed by
`<definitionId>@<definitionVersion>`. Keep older accepted versions registered
so adopted rule guides can still resolve them. Its contract is:

- `definition`: versioned class ID/name, bilingual display names/description,
  `subclasses` with unique IDs and Foundation/Specialization/Mastery arrays,
  optional `hopeFeature`, `classFeatures`, `guide`, `migration`, and `setup`.
- `setup.traits`: permitted main-trait names rendered as a select.
- `setup.familiarMaterialCount`: optional material inputs. Further setup types
  require a deliberate renderer/validator extension; arbitrary executable
  configuration is never accepted from a player.
- `normalize(input, subclass)`: validate the setup and return a canonical
  selection containing choice/definition/version IDs.
- `apply(candidatePc, selection, subclass)`: apply only the declared migration.
  It receives a copy, never the live PC. Decide equipment, card, chassis and
  advancement compatibility explicitly for each new class.

Add an offer with a new unique `id`, `pcId`, offer `version`, one or more
`definitions: [{id, version}]`, and `expectedClassId`, `expectedSubclassId`,
`expectedLevel`. Optional `recommendedTrait` seeds the select without changing
trait values. `active: false` disables an offer. The last active offer for a PC
is current. Restart the service after editing this boot-loaded configuration.
Several class definitions can be offered together; each of their subclasses
becomes an option. Every offer also permits keeping the current class.

Never reuse a confirmed offer ID for a different proposal. Bump the definition
and offer versions when rules change, and issue a new offer if a player must
review a new migration. Keep versions available while their offers are active.

## API and state transitions

`GET /api/party/:id/class-choice` is `private, no-store`. It returns `null` for
an unoffered PC, a mismatched baseline, or a resolved keep-current offer.
A pending offer contains only whitelisted class descriptions, rule definitions,
current class names and setup options. An adopted class returns `confirmed`
with its rule guide, without reopening the selection prompt. The guide is
resolved from confirmed history; it survives disabled offers or a later offer
where the player keeps the already-adopted class.

`POST /api/party/:id/class-choice` accepts `offerId`, offer `version`,
`choiceId`, literal `confirmed: true`, and adapter-specific setup. Both routes
require an active PC in an active campaign, and remain player-accessible with
the optional GM password enabled. The server validates targeting, versions,
baseline, choice and setup. It saves the candidate PC collection atomically
before replacing in-memory state and broadcasting. A write failure leaves
the offer and PC unchanged. A matching duplicate is idempotent; a conflicting
second choice is rejected, including from another device.

Offers and recovery evidence cannot be forged through PC creation or general
PUTs. The creator cannot select private homebrew IDs. Normal player writes
continue to permit vitals and existing card controls only.

## Redneck's first offer

Only `pc_1784314691416_p83s` receives the options:

1. Inventor / Rigger — Färdbyggare.
2. Inventor / Fieldwright — Fältbyggare.
3. Keep Seraph / Winged Sentinel.

Inventor setup chooses any of the six traits and exactly two distinct specific
materials. Presence is suggested because it is his strongest recorded trait;
Amme can select the trait already agreed at the table. The migration replaces
class, subclass, Hope/class/Foundation features and records material choices.
It retains identity, ancestry/community features, traits, domains/cards,
equipment, inventory, thresholds, actual Evasion/HP maxima and all marked
resources. No Prayer Dice are converted into a new resource or refreshed.
Only Foundation is installed. Later tiers remain advancement choices.

The chooser mounts in `/character/:id` and the native Character spread of
`/tome`; embedded `/table` sheets inherit the standalone module. It opens
once per page visit for pending choices, with a persistent notice after
"Choose later". Selecting an option displays its exact migration and rules;
confirmation is never preselected. SSE refreshes preserve an open form.
After adoption the prompt disappears and the rule-guide button stays. English
and Swedish follow the existing per-device language setting. The sheet renders
localized custom features; future unearned tiers appear only in the guide.

## Translation and verification

The [Swedish handout](player-workshops/redneck-inventor-class-sv.md) is generated
from the same bilingual definition as the chooser. Run
`node tools/render-inventor-translation.js` after a rules translation edit,
then `node tools/render-inventor-translation.js --check`.

Tests use synthetic PCs and a scratch DATA_DIR. Cover targeting, pending reads,
explicit confirmation, all choices, resource/gear/card retention, malformed
setup, stale baselines/versions, duplicates, conflicting devices, restarts,
retired PCs, general-whitelist exclusion and GM-password player access. Active
campaign access uses the existing shared `activePcById` boundary.
Browser verification was explicitly declined for this work; code/API tests do
not constitute visual QA or tabletop balance testing.
