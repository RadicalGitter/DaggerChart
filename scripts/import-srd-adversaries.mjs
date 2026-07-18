import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

export const SRD_SOURCE_ID = "daggerheart-srd-1.0";

export const SRD_SOURCE = {
  id: SRD_SOURCE_ID,
  name: "Daggerheart SRD 1.0",
  version: "SEP-09-2025",
  url: "https://www.daggerheart.com/srd/",
  license: "Darrington Press Community Gaming License",
  structuredSource: "https://github.com/seansbox/daggerheart-srd",
  structuredSourceCommit: "c84b20b9b7c237d832eda7e64df46440eb983ed1",
  modifications: "Format, taxonomy, practical rule references, and source metadata."
};

const CAMPAIGN_SOURCE = {
  id: "vesserin",
  name: "Vessa'rin campaign bestiary",
  license: "Private campaign material"
};

const FAMILY_RULES = [
  ["The Jagged Knife", /\bJagged Knife\b/i],
  ["The Restless Dead", /Zombie|Skeleton|Spectral|Necromancer|Vampire|Stonewraith/i],
  ["Outer Realms & Cults", /Chaos|Demon|Demonic|Cult |Fallen|Hallowed|High Seraph|Outer Realms|Oracle of Doom/i],
  ["Constructs & Experiments", /Construct|Battle Box|Failed Experiment|Vault Guardian|Gravemaw/i],
  ["Wildwood", /Deeproot|Treant|Dryad|Sylvan|Tangle/i],
  ["Elementals & Oozes", /Elemental|Ooze/i],
  ["Legendary Beasts", /Gorgon|Flickerfly|Hydra|Dragon/i],
  ["Giants & Breakers", /Ogre|Giant Beastmaster|Giant Brawler|Giant Recruit|Minotaur/i],
  ["Courts & Intrigue", /Courtier|Merchant|Noble|Courtesan|Royal Advisor|Secret-Keeper|Spy|Monarch/i],
  ["Assassins & Thieves", /Assassin|Masked Thief|Mortal Hunter|Shadowbolt/i],
  ["Pirates", /Pirate/i],
  ["Mages & Ritualists", /Arcanist|War Wizard|Spellblade/i],
  ["Guards & Soldiers", /Guard|Sellsword|Weaponmaster|Archer Squadron|Conscript|Elite Soldier|Knight of the Realm|Stag Knight|Legionary/i],
  ["Deeps & Tides", /Electric Eels|Shark|Kraken|Siren/i],
  ["Beasts & Swarms", /Burrower|Bear|Wolf|Mosquito|Giant Rat|Giant Scorpion|Glass Snake|Harrier|Swarm of Rats|Giant Eagle|Dire Bat|Silkwing/i]
];

function slug(value) {
  return String(value)
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

export function adversaryFront(name) {
  return FAMILY_RULES.find(([, pattern]) => pattern.test(name))?.[0] || "Wanderers & Monsters";
}

function numberOrNull(value) {
  if (value === null || value === undefined || /^(?:none|---)$/i.test(String(value).trim())) return null;
  const parsed = Number.parseInt(String(value).trim(), 10);
  return Number.isFinite(parsed) ? parsed : null;
}

export function parseThresholds(value) {
  if (!value || /^(?:none|---)$/i.test(String(value).trim())) return null;
  const [majorText, severeText] = String(value).split("/");
  const major = numberOrNull(majorText);
  const severe = numberOrNull(severeText);
  return major === null && severe === null ? null : { major, severe };
}

export function parseExperiences(value) {
  if (!value || /^(?:none|---)$/i.test(String(value).trim())) return [];
  return String(value).split(/\s*,\s*/).map((entry) => {
    const match = entry.match(/^(.*?)\s+([+-]\d+)$/);
    if (!match) throw new Error(`Unrecognized adversary Experience: ${entry}`);
    return { name: match[1].trim(), bonus: Number.parseInt(match[2], 10) };
  });
}

export function parseFeature(feature) {
  const label = String(feature?.name || "").trim();
  const match = label.match(/^(.*?)\s*-\s*(Action|Reaction|Passive)(?::\s*(.*))?$/i);
  if (!match) throw new Error(`Unrecognized adversary feature label: ${label}`);
  const kind = match[2][0].toUpperCase() + match[2].slice(1).toLowerCase();
  return {
    name: match[1].trim(),
    kind,
    ...(match[3] ? { timing: match[3].trim() } : {}),
    text: String(feature?.text || "").trim()
  };
}

function normalizedType(value) {
  const raw = String(value || "").trim();
  return raw.startsWith("Horde") ? "Horde" : raw;
}

function attackModifier(value) {
  const raw = String(value).trim();
  return /^[+-]?\d+$/.test(raw) ? Number.parseInt(raw, 10) : raw;
}

export function practicalRuleRefs(row, type) {
  const text = [row.attack, row.damage, row.description, row.motives_and_tactics, row.experience]
    .concat((row.feature || []).flatMap((feature) => [feature.name, feature.text]))
    .join(" ")
    .toLowerCase();
  const refs = new Set(["attack-rolls", "damage-thresholds"]);

  if (["Leader", "Solo"].includes(type) || text.includes("spotlight")) refs.add("spotlight");
  if (["Leader", "Solo", "Support"].includes(type) || text.includes("fear")) refs.add("fear");
  if (["Ranged", "Support"].includes(type) || /\b(?:very close|close|far|very far|melee)\b/.test(text)) refs.add("ranges");
  if (["Horde", "Minion"].includes(type) || /all targets|each target|multiple targets|against all/.test(text)) refs.add("multi-target-attacks");
  if (type === "Social" || /reaction roll/.test(text)) refs.add("reaction-rolls");
  if (row.experience && !/^(?:none|---)$/i.test(String(row.experience).trim())) refs.add("experiences");
  if (/advantage|disadvantage/.test(text)) refs.add("advantage-disadvantage");
  if (/armor slot/.test(text)) refs.add("armor-slots");
  if (/\bstress\b/.test(text)) refs.add("stress");
  if (/resistan|immun|direct (?:physical|magic|damage)/.test(text)) refs.add("resistance-immunity-direct");
  if (/physical damage|magic damage|phy\b|mag\b/.test(text)) refs.add("damage-types");
  if (/vulnerable|restrained|hidden|cloaked|condition/.test(text)) refs.add("conditions");
  if (/line of sight|out of sight|\bcover\b|\bhidden\b/.test(text)) refs.add("line-of-sight-cover");
  if (/push|pull|knock|move (?:into|to|within)|movement/.test(text)) refs.add("movement-under-pressure");
  if (/combine the damage|same damage roll|multiple damage/.test(text)) refs.add("multiple-damage-sources");
  if (/critical/.test(text)) refs.add("critical-damage");

  return [...refs].slice(0, 8);
}

export function convertAdversary(row) {
  const type = normalizedType(row.type);
  const rawType = String(row.type || "").trim();
  return {
    id: `srd_${slug(row.name)}`,
    name: String(row.name).trim(),
    front: adversaryFront(row.name),
    tier: Number.parseInt(row.tier, 10),
    type,
    ...(rawType !== type ? { typeDetail: rawType } : {}),
    sourceId: SRD_SOURCE_ID,
    ruleRefs: practicalRuleRefs(row, type),
    description: String(row.description || "").trim(),
    motives: String(row.motives_and_tactics || "").trim(),
    difficulty: Number.parseInt(row.difficulty, 10),
    thresholds: parseThresholds(row.thresholds),
    hp: Number.parseInt(row.hp, 10),
    stress: Number.parseInt(row.stress, 10),
    atk: attackModifier(row.atk),
    weapon: {
      name: String(row.attack || "").trim(),
      range: String(row.range || "").trim(),
      damage: String(row.damage || "").trim()
    },
    experiences: parseExperiences(row.experience),
    features: (row.feature || []).map(parseFeature)
  };
}

export function mergeAdversaryDocument(existing, rows) {
  const campaignCards = (existing?.adversaries || [])
    .filter((card) => card.sourceId !== SRD_SOURCE_ID && !String(card.id || "").startsWith("srd_"))
    .map((card) => ({ ...card, sourceId: card.sourceId || CAMPAIGN_SOURCE.id }));
  const imported = rows.map(convertAdversary).sort((a, b) => a.tier - b.tier || a.name.localeCompare(b.name));
  const ids = new Set(imported.map((card) => card.id));
  if (ids.size !== imported.length) throw new Error("The SRD source produced duplicate adversary IDs.");

  const otherSources = (existing?.sources || []).filter((source) => ![CAMPAIGN_SOURCE.id, SRD_SOURCE_ID].includes(source.id));
  return {
    note: "GM bestiary for the encounter builder. Complete Daggerheart SRD cards plus campaign adversaries. Stat blocks are GM-facing; only a placed card's display label reaches the projector.",
    sources: [CAMPAIGN_SOURCE, SRD_SOURCE, ...otherSources],
    adversaries: [...campaignCards, ...imported]
  };
}

export async function importSrdAdversaries(sourcePath, targetPath, { write = false } = {}) {
  const sourceText = (await readFile(sourcePath, "utf8")).replace(/^\uFEFF/, "");
  const rows = JSON.parse(sourceText);
  const existing = JSON.parse(await readFile(targetPath, "utf8"));
  const merged = mergeAdversaryDocument(existing, rows);
  if (write) await writeFile(targetPath, `${JSON.stringify(merged, null, 2)}\n`, "utf8");
  return merged;
}

async function main() {
  const [, , sourceArgument, targetArgument = "data/adversaries.json", flag] = process.argv;
  if (!sourceArgument) {
    throw new Error("Usage: node scripts/import-srd-adversaries.mjs <source adversaries.json> [target] --write");
  }
  const document = await importSrdAdversaries(resolve(sourceArgument), resolve(targetArgument), { write: flag === "--write" });
  const imported = document.adversaries.filter((card) => card.sourceId === SRD_SOURCE_ID).length;
  console.log(`${flag === "--write" ? "Wrote" : "Validated"} ${imported} SRD adversaries; ${document.adversaries.length} total.`);
}

const invokedPath = process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : "";
if (invokedPath === import.meta.url) main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
