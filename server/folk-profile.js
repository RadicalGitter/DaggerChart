const AGE_BANDS = new Set(["unknown", "child", "young", "adult", "middle-aged", "elder", "ancient"]);
const CONNECTION_KINDS = new Set(["family", "partner", "friend", "mentor", "student", "ally", "rival", "obligation", "other"]);

const cleanText = (value, max) => String(value || "").trim().slice(0, max);

function normalizeAge(value) {
  const source = value && typeof value === "object" ? value : {};
  const band = AGE_BANDS.has(String(source.band)) ? String(source.band) : "unknown";
  const number = Number(source.years);
  const years = Number.isInteger(number) && number >= 0 && number <= 999 ? number : null;
  return { band, years };
}

function normalizeConnections(value) {
  if (!Array.isArray(value)) return [];
  const seen = new Set();
  const connections = [];
  for (const item of value.slice(0, 40)) {
    const folkId = cleanText(item?.folkId, 100);
    if (!folkId || seen.has(folkId)) continue;
    seen.add(folkId);
    connections.push({
      folkId,
      kind: CONNECTION_KINDS.has(String(item?.kind)) ? String(item.kind) : "other"
    });
  }
  return connections;
}

function normalizeExperiences(value) {
  if (!Array.isArray(value)) return [];
  const seen = new Set();
  const experiences = [];
  for (const item of value.slice(0, 40)) {
    const name = cleanText(typeof item === "string" ? item : item?.name, 120);
    const key = name.toLocaleLowerCase();
    if (!name || seen.has(key)) continue;
    seen.add(key);
    experiences.push({
      id: cleanText(item?.id, 100) || `exp_${key.replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 48) || experiences.length}`,
      name
    });
  }
  return experiences;
}

export function normalizeFolkProfile(value = {}) {
  return {
    age: normalizeAge(value.age),
    connections: normalizeConnections(value.connections),
    experiences: normalizeExperiences(value.experiences)
  };
}
