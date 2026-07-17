# Settlement construction

Construction is a GM-resolved project loop. The app tracks costs and state; it
does not decide what a check is, who makes it, or what success requires.

## Founding stores

An untouched settlement starts with exactly enough material to raise all five
basic buildings. Building every basic project leaves the founding stores at
zero, after which seasonal production supports upgrades.

| Project | Cost |
|---|---|
| Lumber Camp | 1 Food, 1 Morale, 3 Supplies |
| Hunter's Lodge | 2 Lumber, 1 Security, 2 Supplies |
| Bunkhouse | 3 Lumber, 1 Food, 1 Supplies |
| Watchtower | 3 Lumber, 1 Morale, 2 Supplies |
| Storehouse | 3 Lumber, 1 Security, 2 Supplies |

The resulting founding stores are 11 Lumber, 2 Food, 2 Morale, 2 Security,
and 10 Supplies. Failed or pending checks spend nothing.

## Project flow

1. The GM describes and resolves whatever check fits the fiction.
2. The GM records **Passed**, **Failed**, or **Not yet**, with an optional note.
3. A passed and affordable project can be completed. The server rechecks both
   gates, spends every resource atomically, writes a ledger row, and opens the
   building's next project.
4. Raised buildings enter the seasonal downtime picker. Unraised buildings
   cannot resolve downtime.

The manual Stores adjustment remains available for fictional gains, losses,
or corrections. It requires a reason, is audited, and cannot make a pool
negative.

## Upgrades

Buildings begin at level 1 and can be improved to level 5. Every upgrade uses
Lumber, Supplies, and the resource produced by that building. If the focus
resource is Lumber or Supplies, the amounts combine.

| Target level | Lumber | Supplies | Building's resource |
|---|---:|---:|---:|
| 2 | 4 | 2 | 2 |
| 3 | 7 | 4 | 3 |
| 4 | 11 | 6 | 5 |
| 5 | 16 | 9 | 8 |

These costs are deliberately isolated in `server/construction.js` so they can
be rebalanced after real play without touching event or reward tables.
