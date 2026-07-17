export function normalizeCharacterDraftVersion(value) {
  return Number.parseInt(value, 10) === 3 ? 3 : 2;
}
