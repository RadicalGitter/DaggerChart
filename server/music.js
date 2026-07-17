// Music library, character themes, and the provider boundary.
// Stored metadata belongs to The Settlement; Suno is only a renderer.
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { Blob } from "node:buffer";
import { ROOT, loadJson, saveJson } from "./store.js";

const MUSIC_FILE = "music.json";
const LIBRARY_ROOT = path.resolve(process.env.MUSIC_LIBRARY_DIR || path.join(ROOT, "Visseren"));
const CHARACTER_THEMES_DIR = path.join(LIBRARY_ROOT, "Character Themes");
const GENERATED_DIR = path.join(LIBRARY_ROOT, "Generated");
const SUNO_API_BASE = (process.env.SUNO_API_URL || "https://api.sunoapi.org").replace(/\/$/, "");
const SUNO_UPLOAD_URL = process.env.SUNO_UPLOAD_URL || "https://sunoapiorg.redpandaai.co/api/file-stream-upload";
const SEED_AUDIO = [
  "The Vessel of Ash - Punchy Master.wav",
  "The Vessel of Ash - Tribal Psy Master.wav"
];

const DEFAULT_MUSIC = {
  version: 1,
  songs: [],
  playlists: [
    { id: "library", name: "Library", fixed: true, songIds: [] },
    { id: "character_themes", name: "Character Themes", fixed: true, songIds: [] }
  ],
  characterThemes: {}
};

export const music = loadJson(MUSIC_FILE, DEFAULT_MUSIC);
const providerCache = { credits: null, checkedAt: null, error: null };

function now() {
  return new Date().toISOString();
}

function id(prefix) {
  return `${prefix}_${Date.now()}_${crypto.randomBytes(3).toString("hex")}`;
}

function cleanText(value, max = 4000) {
  return String(value || "").replace(/\s+/g, " ").trim().slice(0, max);
}

function safeSegment(value, fallback = "Untitled") {
  const safe = cleanText(value, 120)
    .replace(/[<>:\"/\\|?*\x00-\x1f]/g, "-")
    .replace(/[. ]+$/g, "")
    .trim();
  return safe || fallback;
}

function inside(parent, candidate) {
  const rel = path.relative(path.resolve(parent), path.resolve(candidate));
  return rel === "" || (!rel.startsWith("..") && !path.isAbsolute(rel));
}

function ensureShape() {
  music.version = 1;
  music.songs = Array.isArray(music.songs) ? music.songs : [];
  music.playlists = Array.isArray(music.playlists) ? music.playlists : [];
  music.characterThemes ||= {};
  for (const fixed of DEFAULT_MUSIC.playlists) {
    const found = music.playlists.find((p) => p.id === fixed.id);
    if (found) {
      found.fixed = true;
      found.songIds = Array.isArray(found.songIds) ? found.songIds : [];
    } else {
      music.playlists.push(structuredClone(fixed));
    }
  }
}

function bootstrapLocalMasters() {
  const library = music.playlists.find((p) => p.id === "library");
  let changed = false;
  for (const filename of SEED_AUDIO) {
    const absolute = path.join(ROOT, filename);
    if (!fs.existsSync(absolute)) continue;
    const relative = path.relative(ROOT, absolute);
    let song = music.songs.find((s) => s.audioFile === relative);
    if (!song) {
      song = {
        id: `song_local_${crypto.createHash("sha1").update(filename).digest("hex").slice(0, 10)}`,
        title: path.parse(filename).name,
        prompt: "Imported local master.",
        status: "ready",
        source: "local",
        mode: "create",
        pcId: null,
        tagIds: [],
        settings: { instrumental: true },
        audioFile: relative,
        provider: { name: "local", generationId: null, sourceId: null },
        createdAt: fs.statSync(absolute).mtime.toISOString(),
        publishedAt: null
      };
      music.songs.push(song);
      changed = true;
    }
    if (!library.songIds.includes(song.id)) {
      library.songIds.push(song.id);
      changed = true;
    }
  }
  return changed;
}

export function persistMusic() {
  // Root-level masters are discovered from this machine on every start. Keep
  // them in the live library without making a clean checkout dirty merely by
  // launching the server; generated drafts and all user metadata still save.
  const stored = structuredClone(music);
  stored.songs = stored.songs.filter((song) => song.source !== "local");
  saveJson(MUSIC_FILE, stored);
}

ensureShape();
bootstrapLocalMasters();

export function providerStatus() {
  const keyConfigured = Boolean(process.env.SUNO_API_KEY);
  const mode = process.env.SUNO_MODE === "live" ? "live" : "mock";
  return {
    name: "Suno API",
    mode,
    keyConfigured,
    endpointConfigured: true,
    ready: mode === "mock" || keyConfigured,
    credits: providerCache.credits,
    checkedAt: providerCache.checkedAt,
    error: providerCache.error
  };
}

async function providerRequest(route, options = {}) {
  const key = process.env.SUNO_API_KEY;
  if (!key) throw new Error("SUNO_API_KEY is not configured.");
  const response = await fetch(`${SUNO_API_BASE}${route}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${key}`,
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      ...(options.headers || {})
    }
  });
  let body;
  try {
    body = await response.json();
  } catch {
    throw new Error(`Suno API returned ${response.status} without JSON.`);
  }
  if (!response.ok || (body.code !== undefined && body.code !== 200)) {
    throw new Error(cleanText(body.msg || body.message || `Suno API returned ${response.status}.`, 300));
  }
  return body.data;
}

export async function checkProviderCredits() {
  try {
    providerCache.credits = await providerRequest("/api/v1/generate/credit");
    providerCache.checkedAt = now();
    providerCache.error = null;
  } catch (err) {
    providerCache.error = err.message;
    providerCache.checkedAt = now();
    throw err;
  }
  return providerStatus();
}

function audioPath(song) {
  if (!song?.audioFile) return null;
  const absolute = path.resolve(ROOT, song.audioFile);
  if (!inside(ROOT, absolute) || !fs.existsSync(absolute)) return null;
  return absolute;
}

export function songAudioPath(songId) {
  return audioPath(music.songs.find((song) => song.id === songId));
}

function songView(song, { includePrompt = true } = {}) {
  const view = {
    id: song.id,
    title: song.title,
    status: song.status,
    source: song.source,
    mode: song.mode,
    pcId: song.pcId,
    tagIds: song.tagIds || [],
    selectedTagIds: song.selectedTagIds || [],
    promptEnvelope: song.promptEnvelope || null,
    settings: song.settings || {},
    provider: song.provider || null,
    createdAt: song.createdAt,
    publishedAt: song.publishedAt || null,
    error: song.error || null,
    duration: song.duration || null,
    imageUrl: song.imageUrl || null,
    audioUrl: audioPath(song) ? `/api/music/songs/${encodeURIComponent(song.id)}/audio` : null
  };
  if (includePrompt) view.prompt = song.prompt || "";
  return view;
}

export function publishedThemeForPc(pcId) {
  const theme = music.characterThemes[pcId];
  const song = theme?.publishedSongId
    ? music.songs.find((candidate) => candidate.id === theme.publishedSongId)
    : null;
  if (!song) return null;
  return {
    ...songView(song, { includePrompt: false }),
    identity: theme.identity || ""
  };
}

export function musicView(pcs = []) {
  return {
    provider: providerStatus(),
    songs: music.songs.map((song) => songView(song)),
    playlists: music.playlists.map((playlist) => ({ ...playlist, songIds: [...playlist.songIds] })),
    characterTags: pcs
      .map((pc) => {
        const theme = publishedThemeForPc(pc.id);
        return theme ? { pcId: pc.id, name: pc.name, theme } : null;
      })
      .filter(Boolean)
  };
}

export function characterThemeView(pcId) {
  return {
    songs: music.songs.filter((song) => song.pcId === pcId).map((song) => songView(song)),
    published: publishedThemeForPc(pcId),
    provider: providerStatus()
  };
}

export function characterThemePrompt(pc) {
  const identity = [
    pc.ancestry?.name,
    pc.class?.name,
    pc.subclass?.name,
    pc.community?.name ? `from the ${pc.community.name} community` : ""
  ].filter(Boolean).join(", ");
  const experiences = (pc.experiences || []).map((entry) => entry.name).filter(Boolean).join("; ");
  const story = (pc.background || []).map((entry) => entry.a).filter(Boolean).join(" ");
  const connections = (pc.connections || []).map((entry) => entry.note).filter(Boolean).join(" ");
  const domains = (pc.domainCards || []).map((card) => card.name).filter(Boolean).join(", ");
  const arms = [pc.weapons?.primary?.name, pc.weapons?.secondary?.name, pc.armor?.name]
    .filter(Boolean)
    .join(", ");
  return [
    "Short overture for an adventurer. Instrumental, concise, with a memorable leitmotif.",
    pc.name ? `Character: ${pc.name}.` : "",
    identity ? `Identity: ${identity}.` : "",
    experiences ? `Experiences: ${experiences}.` : "",
    story ? `Story: ${story}` : "",
    connections ? `Connections: ${connections}` : "",
    domains ? `Motifs: ${domains}.` : "",
    arms ? `Symbols: ${arms}.` : ""
  ].filter(Boolean).join(" ").slice(0, 6000);
}

function mockAudioFor(seed) {
  const files = SEED_AUDIO
    .map((filename) => path.join(ROOT, filename))
    .filter((filename) => fs.existsSync(filename));
  if (!files.length) return null;
  const digest = crypto.createHash("sha1").update(seed).digest();
  return path.relative(ROOT, files[digest[0] % files.length]);
}

function callbackUrl() {
  return process.env.SUNO_CALLBACK_URL || `http://127.0.0.1:${process.env.PORT || 4626}/api/music/provider/callback`;
}

function modelName(settings) {
  const allowed = new Set(["V4", "V4_5", "V4_5PLUS", "V4_5ALL", "V5", "V5_5"]);
  return allowed.has(settings.model) ? settings.model : "V5_5";
}

function livePayload(song) {
  const instrumental = song.settings.instrumental !== false;
  const direction = cleanText([song.prompt, song.settings.style].filter(Boolean).join(", "), 1000);
  const base = {
    customMode: instrumental,
    instrumental,
    model: modelName(song.settings),
    callBackUrl: callbackUrl()
  };
  if (instrumental) {
    base.style = direction;
    base.title = song.title.slice(0, base.model === "V4_5ALL" ? 80 : 100);
    if (song.settings.negativeTags) base.negativeTags = cleanText(song.settings.negativeTags, 200);
    for (const key of ["styleWeight", "weirdnessConstraint", "audioWeight"]) {
      const value = Number(song.settings[key]);
      if (Number.isFinite(value)) base[key] = Math.max(0, Math.min(1, value));
    }
  } else {
    base.prompt = direction.slice(0, 500);
  }
  return base;
}

async function uploadCoverSource(song) {
  const source = audioPath(song);
  if (!source) throw new Error("The character theme has no local audio to cover.");
  const form = new FormData();
  const bytes = fs.readFileSync(source);
  form.append("file", new Blob([bytes]), path.basename(source));
  form.append("uploadPath", "audio/settlement-character-themes");
  form.append("fileName", `${song.id}${path.extname(source) || ".wav"}`);
  const response = await fetch(SUNO_UPLOAD_URL, {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env.SUNO_API_KEY}` },
    body: form
  });
  const body = await response.json();
  if (!response.ok || body.code !== 200 || !body.data?.downloadUrl) {
    throw new Error(cleanText(body.msg || "The character theme could not be uploaded.", 300));
  }
  return body.data.downloadUrl;
}

async function beginLiveTask(song, sourceSong) {
  const payload = livePayload(song);
  let route = "/api/v1/generate";
  if (song.mode === "cover") {
    route = "/api/v1/generate/upload-cover";
    payload.uploadUrl = await uploadCoverSource(sourceSong);
  }
  const data = await providerRequest(route, { method: "POST", body: JSON.stringify(payload) });
  if (!data?.taskId) throw new Error("Suno API did not return a task ID.");
  song.status = "rendering";
  song.provider.taskId = data.taskId;
  song.provider.generationId = data.taskId;
  song.provider.resultIndex = 0;
}

function extensionFromUrl(value) {
  try {
    const ext = path.extname(new URL(value).pathname).toLowerCase();
    return [".mp3", ".wav", ".m4a", ".ogg"].includes(ext) ? ext : ".mp3";
  } catch {
    return ".mp3";
  }
}

async function downloadGeneratedAudio(song, remoteUrl) {
  fs.mkdirSync(GENERATED_DIR, { recursive: true });
  const ext = extensionFromUrl(remoteUrl);
  const destination = path.join(GENERATED_DIR, `${song.id}${ext}`);
  const temp = `${destination}.tmp`;
  const response = await fetch(remoteUrl);
  if (!response.ok) throw new Error(`Generated audio download returned ${response.status}.`);
  fs.writeFileSync(temp, Buffer.from(await response.arrayBuffer()));
  fs.renameSync(temp, destination);
  song.audioFile = path.relative(ROOT, destination);
}

function siblingFrom(template, index) {
  return {
    ...structuredClone(template),
    id: id("song"),
    title: `${template.title} ${index + 1}`,
    audioFile: null,
    publishedAt: null,
    provider: { ...template.provider, resultIndex: index, audioId: null }
  };
}

async function refreshTask(taskId) {
  const data = await providerRequest(`/api/v1/generate/record-info?taskId=${encodeURIComponent(taskId)}`);
  const members = music.songs.filter((song) => song.provider?.taskId === taskId);
  if (!members.length) return false;
  const failed = data?.status === "FAILED" || data?.errorCode;
  if (failed && !data?.response?.sunoData?.length) {
    for (const song of members) {
      song.status = "failed";
      song.error = cleanText(data.errorMessage || "Suno could not generate this music.", 300);
    }
    return true;
  }
  const tracks = data?.response?.sunoData || [];
  if (!tracks.length) return false;
  const template = members[0];
  const library = music.playlists.find((playlist) => playlist.id === "library");
  let changed = false;
  for (let index = 0; index < tracks.length; index += 1) {
    const track = tracks[index];
    let song = music.songs.find((candidate) =>
      candidate.provider?.taskId === taskId && candidate.provider?.resultIndex === index);
    if (!song) {
      song = siblingFrom(template, index);
      music.songs.unshift(song);
      library.songIds.unshift(song.id);
    }
    song.title = cleanText(track.title, 100) || (index ? `${template.title} ${index + 1}` : template.title);
    song.duration = Number(track.duration) || null;
    song.imageUrl = cleanText(track.imageUrl, 2000) || null;
    song.provider.audioId = track.id || null;
    song.provider.remoteAudioUrl = track.audioUrl || null;
    song.error = null;
    if (track.audioUrl && !audioPath(song)) {
      try {
        await downloadGeneratedAudio(song, track.audioUrl);
      } catch (err) {
        song.error = err.message;
      }
    }
    song.status = audioPath(song) ? "ready" : "rendering";
    changed = true;
  }
  return changed;
}

let refreshing = false;
export async function refreshPendingMusic() {
  if (refreshing || providerStatus().mode !== "live" || !providerStatus().ready) return false;
  refreshing = true;
  let changed = false;
  try {
    const taskIds = [...new Set(music.songs
      .filter((song) => ["queued", "rendering", "waiting"].includes(song.status) && song.provider?.taskId)
      .map((song) => song.provider.taskId))];
    for (const taskId of taskIds) changed = (await refreshTask(taskId)) || changed;
    if (changed) persistMusic();
  } finally {
    refreshing = false;
  }
  return changed;
}

export async function generateSong({
  title,
  prompt,
  pcId = null,
  mode = "create",
  sourceSongId = null,
  tagIds = [],
  selectedTagIds = [],
  promptEnvelope = null,
  settings = {}
}) {
  const provider = providerStatus();
  const sourceSong = sourceSongId ? music.songs.find((song) => song.id === sourceSongId) : null;
  if (mode === "cover" && !sourceSong) throw new Error("Choose a published character theme first.");
  const cleanedPrompt = cleanText(prompt, 7000);
  if (!cleanedPrompt) throw new Error("The music needs a prompt.");

  // REVIEW IF THE PROJECT CHANGES DIRECTION: this is intentionally an
  // unrestricted trusted-table workflow for five known players. Reconsider
  // access controls or spend limits only if remote/public use, player count,
  // or API cost becomes materially different.
  const song = {
    id: id("song"),
    title: cleanText(title, 100) || (pcId ? "A new overture" : "An untitled cue"),
    prompt: cleanedPrompt,
    status: "queued",
    source: provider.mode === "mock" ? "mock" : "suno",
    mode: mode === "cover" ? "cover" : "create",
    pcId,
    tagIds: Array.isArray(tagIds) ? tagIds.slice(0, 80) : [],
    selectedTagIds: Array.isArray(selectedTagIds) ? selectedTagIds.slice(0, 24) : [],
    promptEnvelope: promptEnvelope?.start === "tag-board-v1" && promptEnvelope?.end === "tag-board-v1"
      ? { start: "tag-board-v1", end: "tag-board-v1" }
      : null,
    settings: {
      instrumental: settings.instrumental !== false,
      style: cleanText(settings.style, 1000),
      duration: cleanText(settings.duration, 80),
      model: modelName(settings),
      negativeTags: cleanText(settings.negativeTags, 200),
      styleWeight: settings.styleWeight,
      weirdnessConstraint: settings.weirdnessConstraint,
      audioWeight: settings.audioWeight
    },
    audioFile: null,
    provider: {
      name: provider.mode === "mock" ? "mock" : "Suno",
      generationId: null,
      sourceId: sourceSong?.provider?.generationId || sourceSong?.id || null
    },
    createdAt: now(),
    publishedAt: null
  };

  if (provider.mode === "mock") {
    song.audioFile = mockAudioFor(`${song.id}:${cleanedPrompt}`);
    song.status = song.audioFile ? "ready" : "waiting";
    if (!song.audioFile) song.error = "No local mock audio is available.";
    song.provider.resultIndex = 0;
  } else {
    if (!provider.ready) throw new Error("Suno is not configured on this server.");
    await beginLiveTask(song, sourceSong);
  }

  const library = music.playlists.find((playlist) => playlist.id === "library");
  const drafts = [song];
  if (provider.mode === "mock") {
    const alternate = siblingFrom(song, 1);
    alternate.title = `${song.title} II`;
    alternate.audioFile = mockAudioFor(`${alternate.id}:${cleanedPrompt}:alternate`);
    alternate.status = alternate.audioFile ? "ready" : "waiting";
    if (!alternate.audioFile) alternate.error = "No local mock audio is available.";
    drafts.push(alternate);
  }
  music.songs.unshift(...drafts);
  library.songIds.unshift(...drafts.map((draft) => draft.id));
  persistMusic();
  return songView(song);
}

export async function generateCharacterTheme(pc, overrides = {}) {
  return generateSong({
    title: cleanText(overrides.title, 100) || `${pc.name}'s Overture`,
    prompt: cleanText(overrides.prompt, 7000) || characterThemePrompt(pc),
    pcId: pc.id,
    settings: { instrumental: true, ...(overrides.settings || {}) }
  });
}

export function publishCharacterTheme(songId, pc) {
  const song = music.songs.find((candidate) => candidate.id === songId && candidate.pcId === pc.id);
  if (!song) throw new Error("No such character theme.");
  if (song.status !== "ready") throw new Error("That overture is not ready to publish.");
  const source = audioPath(song);
  if (!source) throw new Error("The overture has no local audio yet.");

  const characterDir = path.resolve(CHARACTER_THEMES_DIR, safeSegment(pc.name, pc.id));
  if (!inside(CHARACTER_THEMES_DIR, characterDir)) throw new Error("Invalid character theme path.");
  fs.mkdirSync(characterDir, { recursive: true });
  const ext = path.extname(source) || ".wav";
  let destination = path.join(characterDir, `${safeSegment(song.title, "Overture")}${ext}`);
  if (fs.existsSync(destination) && path.resolve(destination) !== path.resolve(source)) {
    destination = path.join(characterDir, `${safeSegment(song.title, "Overture")}-${song.id.slice(-6)}${ext}`);
  }
  if (path.resolve(destination) !== path.resolve(source)) fs.copyFileSync(source, destination);

  for (const candidate of music.songs.filter((item) => item.pcId === pc.id)) candidate.publishedAt = null;
  song.audioFile = path.relative(ROOT, destination);
  song.publishedAt = now();
  const previous = music.characterThemes[pc.id] || {};
  music.characterThemes[pc.id] = {
    publishedSongId: song.id,
    identity: previous.identity || "",
    updatedAt: now()
  };
  const themes = music.playlists.find((playlist) => playlist.id === "character_themes");
  themes.songIds = themes.songIds.filter((candidate) => {
    const item = music.songs.find((songItem) => songItem.id === candidate);
    return item && item.pcId !== pc.id;
  });
  themes.songIds.unshift(song.id);
  persistMusic();
  return publishedThemeForPc(pc.id);
}

export function setCharacterThemeIdentity(pcId, identity) {
  const theme = music.characterThemes[pcId];
  if (!theme?.publishedSongId) throw new Error("Publish a character theme first.");
  theme.identity = cleanText(identity, 2000);
  theme.updatedAt = now();
  persistMusic();
  return { pcId, identity: theme.identity };
}

export function createPlaylist(name) {
  const cleanName = cleanText(name, 80);
  if (!cleanName) throw new Error("Name the playlist first.");
  const playlist = { id: id("playlist"), name: cleanName, fixed: false, songIds: [] };
  music.playlists.push(playlist);
  persistMusic();
  return playlist;
}

export function addSongToPlaylist(playlistId, songId) {
  const playlist = music.playlists.find((candidate) => candidate.id === playlistId);
  if (!playlist) throw new Error("No such playlist.");
  if (!music.songs.some((song) => song.id === songId)) throw new Error("No such song.");
  playlist.songIds = [songId, ...playlist.songIds.filter((candidate) => candidate !== songId)];
  persistMusic();
  return playlist;
}

export function renameSong(songId, title) {
  const song = music.songs.find((candidate) => candidate.id === songId);
  if (!song) throw new Error("No such song.");
  const cleanTitle = cleanText(title, 100);
  if (!cleanTitle) throw new Error("The song needs a title.");
  song.title = cleanTitle;
  persistMusic();
  return songView(song);
}

export function removeSong(songId) {
  const index = music.songs.findIndex((candidate) => candidate.id === songId);
  if (index === -1) throw new Error("No such song.");
  const [removed] = music.songs.splice(index, 1);
  for (const playlist of music.playlists) {
    playlist.songIds = playlist.songIds.filter((candidate) => candidate !== songId);
  }
  if (removed.pcId && music.characterThemes[removed.pcId]?.publishedSongId === songId) {
    delete music.characterThemes[removed.pcId];
  }
  // Metadata removal never deletes audio. Local masters and published themes
  // may be used outside the app and should not disappear from disk implicitly.
  persistMusic();
  return { removed: removed.title };
}
