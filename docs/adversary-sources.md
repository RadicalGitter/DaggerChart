# Adversary source audit

The encounter bestiary deliberately distinguishes official SRD cards,
third-party cards, and Vessa'rin campaign originals. Source is visible in the
GM inspector and can be filtered in the creature ledger. Community cards are
ready to run, but they are not presented as official balance references.

## Imported library

| Source | Cards | Status | Snapshot |
| --- | ---: | --- | --- |
| Vessa'rin campaign bestiary | 12 | Campaign originals | Repository data |
| [Daggerheart SRD 1.0](https://www.daggerheart.com/srd/) | 129 | Official Public Game Content under DPCGL | SEP-09-2025 via `seansbox/daggerheart-srd` commit `c84b20b9b7c237d832eda7e64df46440eb983ed1` |
| [Julia's Arsenal](https://github.com/juliaisaway/julias-arsenal-for-daggerheart) | 12 | Community cards by Julia Alberto, CC BY 4.0 and DPCGL | commit `79a45be5195be2c9cf147c79235fc20b21964033` |
| **Total** | **153** | | |

The SRD source repository contains 130 adversary Markdown files but 129 rows in
its generated JSON. The extra file is a spelling-variant duplicate of Outer
Realms Corruptor. The generated JSON and the official September 2025 SRD index
are treated as canonical, so the application imports 129 unique cards.

Imported text is normalized into the local JSON schema. Changes are limited to
format, broad exploratory taxonomy, source metadata, and inferred links to the
local rules reference. Julia's Markdown links and formatting are flattened to
plain text for the compact inspector. Mechanical values and feature text are
otherwise retained.

## Reproducing the import

Clone the two public source repositories outside this repository, then run:

```powershell
node scripts/import-srd-adversaries.mjs <srd>\.build\03_json\adversaries.json data\adversaries.json --write
node scripts/import-julias-arsenal-adversaries.mjs <arsenal>\data\adversaries data\adversaries.json --write
```

Both importers replace only cards owned by their source ID. They preserve
campaign cards and are safe to run repeatedly. Update the recorded source
commit and review upstream changes before importing a newer snapshot.

## Located but not imported

These are useful discovery leads, but their text is not copied into the
repository:

- [The Void](https://www.daggerheart.com/thevoid/) currently offers 16 official
  experimental adversaries and four environments. It is playtest material, not
  part of the current SRD snapshot, so it remains a link until redistribution
  terms are confirmed.
- [Age of Umbra adversaries](https://www.daggerheart.com/wp-content/uploads/2025/07/Age-of-Umbra-Adversaries.pdf)
  are a free official packet, including unusually deadly versions built for the
  streamed campaign. The packet is not identified as SRD Public Game Content.
- [Hope & Fear](https://www.daggerheart.com/pre-order/) advertises more than 130
  new adversaries. It is a paid 2026 expansion and is not imported.
- Community repositories and card builders such as DaggerheartBrews and Heart
  of Daggers expose useful individual cards, but ownership and redistribution
  terms vary per submission. Import only a collection with an explicit license
  and stable author/source metadata.
- Commercial bestiaries located during the audit include *Archibald's Almanac
  of Adversaries* (300 cards), *Martial Adversaries for Daggerheart* (60),
  *Menagerie of Mayhem: Volume 1* (35), and the *Incredible Creatures* line
  (100+ planned). These are catalog leads, not redistributable application data.

## License notices

This product includes materials from the Daggerheart System Reference Document
1.0, © Critical Role, LLC. All rights reserved. The SRD was created by
Darrington Press and is used under the Darrington Press Community Gaming
(DPCGL) License. The Public Game Content is available at
https://www.daggerheart.com/srd/ and the license at
https://darringtonpress.com/license/. The structured-source conversion by
`seansbox/daggerheart-srd` is a previous modification. This application further
modifies format, structure, taxonomy, practical rule references, and source
metadata.

Julia's Arsenal content is © 2026 Julia Alberto and licensed under Creative
Commons Attribution 4.0 International. The local copies indicate the source,
link the license, and describe the modifications above.
