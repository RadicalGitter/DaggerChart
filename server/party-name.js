export const CHARACTER_NAME_LIMIT = 80;

export function normalizeCharacterName(value) {
  if (typeof value !== "string") throw new Error("A character name is required.");
  const name = value.trim();
  if (!name) throw new Error("A character name is required.");
  if (name.length > CHARACTER_NAME_LIMIT) throw new Error(`Character names must be at most ${CHARACTER_NAME_LIMIT} characters.`);
  if (/[\u0000-\u001f\u007f]/.test(name)) throw new Error("Character names cannot contain control characters.");
  return name;
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function renamedCharacterThemeTitle(title, previousName, name) {
  const currentTitle = String(title || "");
  const pattern = new RegExp(`^${escapeRegExp(previousName)}'s Overture(?<suffix> II| [2-9][0-9]*)?$`);
  const match = currentTitle.match(pattern);
  return match ? `${name}'s Overture${match.groups?.suffix || ""}` : currentTitle;
}

export function renameCharacter(pc, request) {
  if (request?.gmApproved !== true) throw new Error("Confirm that the GM approved this name change.");
  const previousName = pc.name;
  const name = normalizeCharacterName(request.name);
  if (name === previousName) return { previousName, name, changed: false };

  pc.name = name;
  for (const item of pc.inventory || []) {
    if (item && typeof item === "object" && item.kind === "paper" && item.paperType !== "covenant" && item.author === previousName) {
      item.author = name;
    }
  }
  return { previousName, name, changed: true };
}
