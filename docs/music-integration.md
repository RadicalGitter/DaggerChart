# Music integration

The app owns its song metadata and local audio. Suno is a replaceable renderer,
not the library of record.

## Local configuration

Put machine-local values in `.env.local` at the repository root. The server
loads it automatically and Git ignores it.

```dotenv
SUNO_API_KEY=your-key
SUNO_MODE=mock
```

`SUNO_MODE=mock` returns two drafts backed by the local seed masters and spends
no provider credits. Change it to `live` only when real generation is wanted.
Optional values are documented in `.env.local.example`:

- `SUNO_API_URL` overrides the API base.
- `SUNO_CALLBACK_URL` gives the provider a public callback. The server also
  polls task records, so a local-only server does not depend on callback
  delivery after the request is accepted.
- `MUSIC_LIBRARY_DIR` moves the default `Visseren` audio root.

The browser receives only `keyConfigured: true/false`; the key itself stays in
the server process. `POST /api/music/provider/check` checks account credits
without starting a generation.

## Generation lifecycle

1. A request creates a queued song record in `data/music.json`.
2. Live mode posts to the provider and polls its task record. The provider
   returns two songs, which become separate library records.
3. Ready audio is downloaded into `Visseren/Generated` instead of relying on
   expiring provider URLs.
4. Publishing copies the chosen file to
   `Visseren/Character Themes/<Character Name>` and records that theme as the
   character's cover source.

Removing a song from the desk removes metadata only. It never deletes audio.

## Suno web-library mirror

The configured generation API does not expose the playlists from the user's
Suno web account. The desk therefore has a deliberately separate browser
snapshot bridge for one named collection, `Vessa'rin` by default.

The Settings dialog provides an installable bookmark helper. Run it while the
target collection is open on `suno.com`; it scrolls through lazy-loaded rows,
collects each song UUID and visible metadata, and posts the snapshot back to
`POST /api/music/suno-snapshot`. If the browser blocks an HTTPS-to-localhost
request, the helper copies the same JSON for the desk's **Import copied
snapshot** fallback.

The server does not trust media URLs from the browser. It validates Suno UUIDs,
derives `https://cdn1.suno.ai/<uuid>.mp3`, limits each download to 80 MB, and
caches successful files under `Visseren/Suno Mirror`. The fixed mirror playlist
is replaced with the snapshot's exact order on every pull. A song removed from
Suno leaves that playlist but its metadata and cached audio remain in the main
Library; synchronization never deletes local files.

`PUT /api/music/suno-mirror` changes the exact collection name. A snapshot with
a different heading or no visible songs is rejected without changing the
mirror. This bridge consumes no generation API credits, but it depends on
Suno's public web markup and CDN convention and should be smoke-tested after a
material Suno interface change.

## Character themes

Finishing character creation queues an instrumental short overture. The prompt
uses narrative identity, experiences, background, connections, domain-card
names, and equipment names; it excludes mutable rules statistics. Failure to
queue music is logged server-side and never blocks character creation.

The GM can hand-curate a published theme's musical identity in `/music`.
Selecting that character on the tag board switches generation to cover mode
and includes the curated identity; deselecting returns to normal generation.

## Review trigger

This is intentionally an unrestricted trusted-table workflow for the current
five known players. There are no per-player quotas, approval gates, or spend
limits. Revisit that decision before remote/public access, a materially larger
group, or any change that makes provider cost consequential.
