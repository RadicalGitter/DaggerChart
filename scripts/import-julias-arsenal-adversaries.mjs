import { readdir, readFile, writeFile } from "node:fs/promises";
import { extname, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import {
  adversaryFront,
  parseExperiences,
  parseFeature,
  practicalRuleRefs
} from "./import-srd-adversaries.mjs";

export const JULIA_SOURCE_ID = "julias-arsenal-cc-by-4.0";

export const JULIA_SOURCE = {
  id: JULIA_SOURCE_ID,
  name: "Julia's Arsenal",
  author: "Julia Alberto",
  url: "https://julias-arsenal.vercel.app/",
  repository: "https://github.com/juliaisaway/julias-arsenal-for-daggerheart",
  repositoryCommit: "79a45be5195be2c9cf147c79235fc20b21964033",
  license: "Creative Commons Attribution 4.0 (CC BY 4.0) and DPCGL",
  licenseUrl: "https://creativecommons.org/licenses/by/4.0/",
  modifications: "Markdown normalized to the local card schema; taxonomy and practical rule references added."
};

const titleCase = (value) => String(value || "").replace(/\b\w/g, (letter) => letter.toUpperCase());

function slug(value) {
  return String(value)
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function plainText(markdown) {
  return String(markdown || "")
    .replace(/\[([^\]]+)]\([^)]*\)/g, "$1")
    .replace(/[*_`]/g, "")
    .replace(/^\s*[-+]\s+/gm, "")
    .replace(/\s+/g, " ")
    .trim();
}

function parseFrontmatter(markdown) {
  const match = String(markdown).match(/^---\s*\r?\n([\s\S]*?)\r?\n---\s*\r?\n/);
  if (!match) throw new Error("Community adversary is missing frontmatter.");
  const meta = {};
  for (const line of match[1].split(/\r?\n/)) {
    const field = line.match(/^([^:]+):\s*(.*)$/);
    if (field) meta[field[1].trim()] = field[2].trim();
  }
  return { meta, body: markdown.slice(match[0].length) };
}

function section(body, heading) {
  const escaped = heading.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const headingMatch = body.match(new RegExp(`^## ${escaped}\\s*$`, "im"));
  if (!headingMatch) return "";
  const remainder = body.slice(headingMatch.index + headingMatch[0].length);
  const nextHeading = remainder.search(/^##\s+/m);
  return (nextHeading >= 0 ? remainder.slice(0, nextHeading) : remainder).trim();
}

function parseFeatures(body) {
  const featureSection = section(body, "Features");
  const headings = [...featureSection.matchAll(/^###\s+(.+)$/gm)];
  return headings.map((heading, index) => {
    const textStart = heading.index + heading[0].length;
    const textEnd = headings[index + 1]?.index ?? featureSection.length;
    return parseFeature({ name: heading[1], text: plainText(featureSection.slice(textStart, textEnd)) });
  });
}

function bracketValues(value) {
  return String(value || "").replace(/^\[|\]$/g, "").split(/\s*,\s*/).filter(Boolean);
}

export function convertCommunityAdversary(markdown) {
  const { meta, body } = parseFrontmatter(markdown);
  const name = body.match(/^#\s+(.+)$/m)?.[1]?.trim();
  if (!name) throw new Error("Community adversary is missing a name.");
  const description = plainText(body.slice(body.indexOf(`\n`, body.indexOf(`# ${name}`)) + 1, body.search(/^## /m)));
  const motives = plainText(section(body, "Motives & Tactics"));
  const features = parseFeatures(body);
  const type = titleCase(meta.role);
  const experienceText = bracketValues(meta.experience).join(", ");
  const thresholds = bracketValues(meta.thresholds).map((value) => Number.parseInt(value, 10));
  const damageType = String(meta.damageType || "").toLowerCase() === "magic" ? "mag" : "phy";
  const ruleRow = {
    attack: meta.weapon,
    damage: `${meta.damage} ${damageType}`,
    description,
    motives_and_tactics: motives,
    experience: experienceText || "None",
    feature: features
  };

  return {
    id: `julia_${slug(name)}`,
    name,
    front: /Crimson Rite/i.test(name) ? "Outer Realms & Cults" : adversaryFront(name),
    tier: Number.parseInt(meta.tier, 10),
    type,
    sourceId: JULIA_SOURCE_ID,
    ruleRefs: practicalRuleRefs(ruleRow, type),
    description,
    motives,
    difficulty: Number.parseInt(meta.difficulty, 10),
    thresholds: { major: thresholds[0] ?? null, severe: thresholds[1] ?? null },
    hp: Number.parseInt(meta.healthPoints, 10),
    stress: Number.parseInt(meta.stress, 10),
    atk: Number.parseInt(meta.attack, 10),
    weapon: {
      name: meta.weapon,
      range: meta.range,
      damage: `${meta.damage} ${damageType}`
    },
    experiences: parseExperiences(experienceText),
    features
  };
}

async function markdownFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await markdownFiles(path));
    else if (entry.isFile() && extname(entry.name).toLowerCase() === ".md") files.push(path);
  }
  return files;
}

export async function importJuliasArsenal(sourceDirectory, targetPath, { write = false } = {}) {
  const files = await markdownFiles(sourceDirectory);
  const imported = (await Promise.all(files.map(async (file) => convertCommunityAdversary(await readFile(file, "utf8")))))
    .sort((a, b) => a.tier - b.tier || a.name.localeCompare(b.name));
  const existing = JSON.parse(await readFile(targetPath, "utf8"));
  const adversaries = (existing.adversaries || []).filter((card) => card.sourceId !== JULIA_SOURCE_ID && !String(card.id || "").startsWith("julia_"));
  const sources = (existing.sources || []).filter((source) => source.id !== JULIA_SOURCE_ID);
  const merged = { ...existing, sources: [...sources, JULIA_SOURCE], adversaries: [...adversaries, ...imported] };
  if (write) await writeFile(targetPath, `${JSON.stringify(merged, null, 2)}\n`, "utf8");
  return merged;
}

async function main() {
  const [, , sourceArgument, targetArgument = "data/adversaries.json", flag] = process.argv;
  if (!sourceArgument) throw new Error("Usage: node scripts/import-julias-arsenal-adversaries.mjs <adversary directory> [target] --write");
  const document = await importJuliasArsenal(resolve(sourceArgument), resolve(targetArgument), { write: flag === "--write" });
  const imported = document.adversaries.filter((card) => card.sourceId === JULIA_SOURCE_ID).length;
  console.log(`${flag === "--write" ? "Wrote" : "Validated"} ${imported} Julia's Arsenal adversaries; ${document.adversaries.length} total.`);
}

const invokedPath = process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : "";
if (invokedPath === import.meta.url) main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
