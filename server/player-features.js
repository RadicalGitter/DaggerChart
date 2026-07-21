export const PLAYER_FEATURE_DEFINITIONS = Object.freeze([
  { key: "settlement", label: "Settlement folio", description: "Reveals the complete folio: town, stores, buildings, folk, and the settlement chronicle." },
  { key: "folk", label: "Folk of note", description: "Legacy detail gate retained for existing campaigns.", gmVisible: false },
  { key: "chronicle", label: "Session Chronicle", description: "Player perspectives and published session history in the Journal." },
  { key: "journal", label: "Journal", description: "Shared and personal journal pages." },
  { key: "character", label: "Character sheet", description: "The live character sheet and its navigation." },
  { key: "inventory", label: "Inventory", description: "Equipment, papers, and carried items." },
  { key: "rules", label: "Rules at hand", description: "The searchable rules reference." },
  { key: "notes", label: "Quick notes", description: "The always-available personal and group note drawer." },
  { key: "partyCards", label: "Party portraits", description: "Movable portrait cards for the other active player characters." },
  { key: "dice", label: "Duality dice", description: "The physical Hope and Fear dice tray.", gmVisible: false },
  { key: "messages", label: "Private messages", description: "Private correspondence with the GM." },
  { key: "feedback", label: "Feedback tickets", description: "Annotated screenshot and feedback reporting." },
  { key: "characterCreation", label: "New character creation", description: "Links for starting a new character." },
  { key: "music", label: "Character themes", description: "Theme generation and playback on character sheets." },
  { key: "sessionPools", label: "Hope and Fear pools", description: "Shared session Hope and Fear displays." }
]);

const PLAYER_FEATURE_KEYS = new Set(PLAYER_FEATURE_DEFINITIONS.map((feature) => feature.key));

export const DEFAULT_PLAYER_FEATURES = Object.freeze(Object.fromEntries(
  PLAYER_FEATURE_DEFINITIONS.map((feature) => [feature.key, feature.key !== "settlement"])
));

export function normalizePlayerFeatures(value) {
  const source = value && typeof value === "object" && !Array.isArray(value) ? value : {};
  return Object.fromEntries(PLAYER_FEATURE_DEFINITIONS.map(({ key }) => [
    key,
    Object.hasOwn(source, key) ? source[key] !== false : DEFAULT_PLAYER_FEATURES[key]
  ]));
}

export function playerFeaturePatch(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Player features must be an object of boolean values.");
  }
  const patch = {};
  for (const [key, enabled] of Object.entries(value)) {
    if (!PLAYER_FEATURE_KEYS.has(key)) throw new Error(`Unknown player feature: ${key}.`);
    if (typeof enabled !== "boolean") throw new Error(`Player feature ${key} must be true or false.`);
    patch[key] = enabled;
  }
  return patch;
}
