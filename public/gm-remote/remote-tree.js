import { ROOT_IDS, TAGS } from "../music/taxonomy.js";

const clean = (value) => String(value || "").trim();

export function pagedBranches(items, prefix, pageSize = 5) {
  const source = Array.isArray(items) ? items.filter(Boolean) : [];
  if (source.length <= pageSize + 1) return source;
  const build = (offset) => {
    const page = source.slice(offset, offset + pageSize);
    const remaining = source.length - offset - page.length;
    if (remaining > 0) {
      page.push({
        id: `${prefix}-more-${offset + pageSize}`,
        label: "More",
        detail: `${remaining} remain`,
        children: build(offset + pageSize)
      });
    }
    return page;
  };
  return build(0);
}

function leaf(id, label, detail, action) {
  return { id, label: clean(label) || "Untitled", detail: clean(detail), action };
}

function branch(id, label, detail, children) {
  return { id, label, detail, children: children.length ? children : [leaf(`${id}-empty`, "None ready", "", { type: "noop" })] };
}

export function buildRemoteMenu({ music = {}, gm = {}, art = {} } = {}) {
  const songs = (music.songs || []).filter((song) => song?.audioUrl && song.status === "ready");
  const songsById = new Map(songs.map((song) => [song.id, song]));
  const songLeaves = songs.map((song) => leaf(
    `song-${song.id}`,
    song.title,
    song.duration ? `${Math.floor(song.duration / 60)}:${String(Math.round(song.duration % 60)).padStart(2, "0")}` : "Ready",
    { type: "play-song", songId: song.id }
  ));

  const playlists = (music.playlists || [])
    .map((playlist) => {
      const playlistSongs = (playlist.songIds || []).map((id) => songsById.get(id)).filter(Boolean);
      if (!playlistSongs.length) return null;
      return branch(
        `playlist-${playlist.id}`,
        playlist.name,
        `${playlistSongs.length} song${playlistSongs.length === 1 ? "" : "s"}`,
        pagedBranches(playlistSongs.map((song) => leaf(
          `playlist-${playlist.id}-song-${song.id}`,
          song.title,
          "Play",
          { type: "play-song", songId: song.id, playlistId: playlist.id }
        )), `playlist-${playlist.id}`)
      );
    })
    .filter(Boolean);

  const placesById = new Map((art.places || []).map((place) => [place.id, place]));
  const sceneLeaves = (art.scenes || []).map((scene) => {
    const place = placesById.get(scene.placeId);
    return leaf(
      `scene-${scene.id}`,
      scene.name,
      [place?.name, scene.sublocation].filter(Boolean).join(" / "),
      {
        type: "project",
        body: {
          type: "image",
          url: scene.url,
          caption: [place?.name, scene.sublocation, scene.name].filter(Boolean).join(" - ")
        }
      }
    );
  });
  const folkLeaves = (gm.characters || []).map((person) => leaf(
    `folk-${person.id}`,
    person.name,
    person.role || "Folk",
    { type: "project", body: { type: "folk", refId: person.id } }
  ));
  const peopleLeaves = (gm.people || []).map((person) => leaf(
    `person-${person.id}`,
    person.name,
    person.role || "Person",
    { type: "project", body: { type: "person", refId: person.id } }
  ));
  const placeLeaves = (gm.places || []).map((place) => leaf(
    `place-${place.id}`,
    place.name,
    place.kind || "Place",
    { type: "project", body: { type: "place", refId: place.id } }
  ));

  const participants = new Set(gm.liveSession?.clock?.participants || []);
  const themesByPc = new Map((music.characterTags || []).map((entry) => [entry.pcId, entry]));
  const activePcs = (gm.party || []).filter((pc) => pc.active !== false && (!participants.size || participants.has(pc.id)));
  const characterSources = activePcs.length
    ? activePcs.map((pc) => ({ pcId: pc.id, name: pc.name, theme: themesByPc.get(pc.id)?.theme || null }))
    : (music.characterTags || []).filter((entry) => !participants.size || participants.has(entry.pcId));
  const characterInfluences = characterSources.map((entry) => leaf(
    `influence-character-${entry.pcId}`,
    entry.name,
    entry.theme ? "Leitmotif" : "Identity",
    {
      type: "toggle-influence",
      influence: {
        id: `character:${entry.pcId}`,
        label: entry.name,
        modifier: entry.theme?.identity || `${entry.name}'s established character leitmotif`
      }
    }
  ));
  const npcInfluences = (gm.people || []).map((person) => leaf(
    `influence-npc-${person.id}`,
    person.name,
    person.role || "Figure",
    {
      type: "toggle-influence",
      influence: {
        id: `npc:${person.id}`,
        label: person.name,
        modifier: `${person.name}'s recurring dramatic leitmotif${person.role ? `, ${person.role}` : ""}`
      }
    }
  ));
  const intentInfluences = ROOT_IDS.map((tagId) => leaf(
    `influence-intent-${tagId}`,
    TAGS[tagId].label,
    "Scene intent",
    {
      type: "toggle-influence",
      influence: { id: `intent:${tagId}`, label: TAGS[tagId].label, modifier: TAGS[tagId].payload }
    }
  ));
  const worldKinds = new Map();
  for (const place of gm.places || []) {
    const kind = clean(place.kind) || "Places";
    const entries = worldKinds.get(kind) || [];
    entries.push(leaf(
      `influence-world-${place.id}`,
      place.name,
      kind,
      {
        type: "toggle-influence",
        influence: {
          id: `world:${place.id}`,
          label: place.name,
          modifier: `a strong sense of place associated with ${place.name}, ${kind}`
        }
      }
    ));
    worldKinds.set(kind, entries);
  }
  const worldInfluences = [...worldKinds.entries()].map(([kind, entries]) => branch(
    `world-kind-${kind.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`,
    kind,
    `${entries.length} place${entries.length === 1 ? "" : "s"}`,
    pagedBranches(entries, `world-${kind}`)
  ));

  const musicBranches = [
    branch("transport", "Transport", "Playback", [
      leaf("previous", "Previous", "", { type: "transport", command: "previous" }),
      leaf("toggle", "Play / pause", "", { type: "transport", command: "toggle" }),
      leaf("next", "Next", "", { type: "transport", command: "next" }),
      leaf("fade", "Fade out", "", { type: "transport", command: "fade" })
    ]),
    branch("continuation", "Continue", "Next movement", [
      leaf("continue-hold", "Hold mood", "Default", { type: "extend", direction: "sustain" }),
      leaf("continue-rise", "Escalate", "Build pressure", { type: "extend", direction: "escalate" }),
      leaf("continue-ease", "De-escalate", "Release tension", { type: "extend", direction: "deescalate" })
    ]),
    branch("characters", "Characters", `${characterInfluences.length} playing`, pagedBranches(characterInfluences, "characters")),
    branch("npcs", "Major NPCs", `${npcInfluences.length} known`, pagedBranches(npcInfluences, "npcs")),
    branch("intent", "Scene intent", "Meaning", pagedBranches(intentInfluences, "intent")),
    branch("world", "World", "Place", pagedBranches(worldInfluences, "world")),
    branch("songs", "Songs", `${songs.length} ready`, pagedBranches(songLeaves, "songs")),
    branch("playlists", "Playlists", `${playlists.length} available`, pagedBranches(playlists, "playlists"))
  ];

  return [
    branch("music", "Music", "Sound", pagedBranches(musicBranches, "music")),
    branch("cast", "Cast", "Show", [
      branch("scenes", "Scenes", `${sceneLeaves.length} saved`, pagedBranches(sceneLeaves, "scenes")),
      branch("folk", "Folk", `${folkLeaves.length} known`, pagedBranches(folkLeaves, "folk")),
      branch("people", "People", `${peopleLeaves.length} known`, pagedBranches(peopleLeaves, "people")),
      branch("places", "Places", `${placeLeaves.length} known`, pagedBranches(placeLeaves, "places"))
    ]),
    branch("screen", "Screen", "Presenter", [
      leaf("stores", "Stores", "Settlement", { type: "project", body: { type: "stores" } }),
      leaf("buildings", "Buildings", "Settlement", { type: "project", body: { type: "buildings" } }),
      leaf("darken", "Darken", "Clear", { type: "project", body: { type: null } })
    ])
  ];
}
