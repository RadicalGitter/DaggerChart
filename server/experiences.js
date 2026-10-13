// A character's Experiences: two to begin with, each +2 (Daggerheart SRD,
// "Create your character"). Players record their own first two freely;
// changing them afterwards needs the GM's approval, like a change of name.
import { GM_NAME } from "../public/shared/gm-name.js";

export const EXPERIENCE_NAME_LIMIT = 80;
export const STARTING_EXPERIENCE_COUNT = 2;
export const STARTING_EXPERIENCE_BONUS = 2;
export const MAX_EXPERIENCES = 6;
export const MAX_EXPERIENCE_BONUS = 9;

export function normalizeExperienceName(value) {
  if (typeof value !== "string") throw new Error("An Experience needs a name.");
  const name = value.trim().replace(/\s+/g, " ");
  if (!name) throw new Error("An Experience needs a name.");
  if (name.length > EXPERIENCE_NAME_LIMIT) throw new Error(`Experience names must be at most ${EXPERIENCE_NAME_LIMIT} characters.`);
  if (/[\u0000-\u001f\u007f]/.test(name)) throw new Error("Experience names cannot contain control characters.");
  return name;
}

function normalizeBonus(value) {
  const bonus = typeof value === "string" && value.trim() !== "" ? Number(value) : value;
  if (!Number.isInteger(bonus) || bonus < 0 || bonus > MAX_EXPERIENCE_BONUS) {
    throw new Error(`An Experience bonus must be a whole number from 0 to ${MAX_EXPERIENCE_BONUS}.`);
  }
  return bonus;
}

function assertDistinct(list) {
  const seen = new Set();
  for (const { name } of list) {
    const key = name.toLocaleLowerCase();
    if (seen.has(key)) throw new Error("Each Experience needs its own name.");
    seen.add(key);
  }
}

export const hasNoExperiences = (pc) => !Array.isArray(pc?.experiences) || pc.experiences.length === 0;

export function describeExperiences(list) {
  return list.map((e) => `${e.name} +${e.bonus}`).join(", ");
}

// Returns { kind: "start" | "edit", before, after, changed }.
// - No Experiences yet: exactly two names are recorded at +2 each, no approval.
// - Otherwise: the whole list is replaced, and only with { gmApproved: true }.
export function setExperiences(pc, request) {
  const requested = request?.experiences;
  if (!Array.isArray(requested)) throw new Error("Experiences are required.");

  if (hasNoExperiences(pc)) {
    if (requested.length !== STARTING_EXPERIENCE_COUNT) throw new Error("Name both of your starting Experiences.");
    const after = requested.map((entry) => ({ name: normalizeExperienceName(entry?.name), bonus: STARTING_EXPERIENCE_BONUS }));
    assertDistinct(after);
    pc.experiences = after;
    return { kind: "start", before: [], after, changed: true };
  }

  if (request.gmApproved !== true) throw new Error(`Confirm that ${GM_NAME} approved this change.`);
  if (requested.length < 1 || requested.length > MAX_EXPERIENCES) {
    throw new Error(`A character keeps between 1 and ${MAX_EXPERIENCES} Experiences.`);
  }
  const before = pc.experiences.map((e) => ({ name: e.name, bonus: e.bonus }));
  const after = requested.map((entry) => ({
    name: normalizeExperienceName(entry?.name),
    bonus: normalizeBonus(entry?.bonus)
  }));
  assertDistinct(after);
  const changed = JSON.stringify(before) !== JSON.stringify(after);
  if (changed) pc.experiences = after;
  return { kind: "edit", before, after, changed };
}
