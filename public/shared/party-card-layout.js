export const clampPartyCardValue = (value, min, max) => Math.max(min, Math.min(max, value));

export function partyCardWidthBounds(viewportWidth) {
  return viewportWidth <= 560
    ? { min: 82, max: Math.min(220, viewportWidth - 16), fallback: 108 }
    : { min: 104, max: Math.min(290, viewportWidth - 24), fallback: 148 };
}

export function partyCardHeight(width) {
  return width * 4 / 3;
}

export function partyCardPosition({ saved, index, viewportWidth, viewportHeight }) {
  const bounds = partyCardWidthBounds(viewportWidth);
  const width = clampPartyCardValue(Number(saved?.size) || bounds.fallback, bounds.min, bounds.max);
  const height = partyCardHeight(width);
  const maxX = Math.max(0, viewportWidth - width);
  const maxY = Math.max(0, viewportHeight - height);
  const columns = Math.max(1, Math.floor((viewportWidth - 20) / (bounds.fallback + 16)));
  const fallbackX = 12 + (index % columns) * (bounds.fallback + 14);
  const fallbackY = 76 + Math.floor(index / columns) * (partyCardHeight(bounds.fallback) + 14);
  const left = Number.isFinite(saved?.x) ? saved.x * maxX : fallbackX;
  const top = Number.isFinite(saved?.y) ? saved.y * maxY : fallbackY;
  return {
    width,
    left: clampPartyCardValue(left, 0, maxX),
    top: clampPartyCardValue(top, 0, maxY)
  };
}

export function normalizePartyCardLayout({ left, top, width, viewportWidth, viewportHeight }) {
  const maxX = Math.max(1, viewportWidth - width);
  const maxY = Math.max(1, viewportHeight - partyCardHeight(width));
  return {
    x: clampPartyCardValue(left / maxX, 0, 1),
    y: clampPartyCardValue(top / maxY, 0, 1),
    size: Math.round(width)
  };
}
