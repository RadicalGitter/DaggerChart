# Local UX telemetry

This system collects bounded, content-free interaction evidence from the
player-facing routes during the private five-player playtest. It exists to
find confusing controls, neglected modes, poor viewport use, and places where
players repeatedly tap something that is not interactive.

The original design spec rejected telemetry. The user explicitly expanded
that scope for the current trusted table. There is intentionally no consent
gate for these five known players.

## Critical review trigger

Stop and review this decision before the project becomes remote, public,
commercial, shared with unknown players, or materially larger than the current
group. That review must cover informed notice, opt-out/withdrawal, retention,
access control, transport security, and whether telemetry should exist at all.

## Collection boundary

`public/shared/telemetry.js` records:

- a normalized surface key such as `/music`, `/character/:id`, or
  `/journal@embed`;
- a code-defined mode such as `settings`, `journal`, or `tags:depth-1`;
- coarse viewport class: mobile, tablet, or desktop;
- active visible/focused time;
- normalized click coordinates from 0 to 1;
- a code-defined element signature such as `button#open-settings`; and
- whether a short, stationary click landed on a disabled or non-interactive
  surface.

It does **not** collect names, character or song text, prompts, notes, input
values, query strings, full URLs, screenshots, IP addresses, user agents,
browser history, device fingerprints, or persistent user/session identifiers.
Annotated screenshots belong only to the separate, player-triggered feedback
ticket system.

A "dead click" is deliberately labelled a candidate. The collector only knows
that a short tap landed outside browser-recognized interactive semantics; it
cannot prove the player expected an action.

## Storage and limits

The server aggregates into gitignored `data/telemetry.json`. The file is local
to the GM machine and is included in normal top-level data backups.

- at most 200 events are accepted per request;
- the browser queue retains at most 400 unsent events;
- each surface retains its latest 900 click points;
- each surface retains at most 120 target signatures and 60 modes; and
- each duration event is capped at 60 seconds.

Aggregate counters remain while their storage shape stays bounded. The GM can
clear the complete history from **GM console -> UX map**.

## API and review surface

- `POST /api/telemetry/batch` accepts a whitelisted surface and event batch.
- `GET /api/telemetry` returns the local aggregate for the GM review surface.
- `DELETE /api/telemetry` replaces the file with a fresh empty aggregate.

The UX map filters by surface and viewport, draws productive and dead-click
signals separately, and ranks mode dwell time and dead target signatures. A
telemetry heartbeat never broadcasts over SSE or causes campaign clients to
refetch state.
