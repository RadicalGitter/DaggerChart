const GLYPHS = {
  Agility: `<svg class="trait-glyph" viewBox="0 0 64 64" aria-hidden="true"><path d="M13 45c13 0 20-8 20-21"/><path d="m24 31 9-9 9 9"/><path d="M12 35h12M15 26h11M22 17h16"/></svg>`,
  Strength: `<svg class="trait-glyph" viewBox="0 0 64 64" aria-hidden="true"><path d="M12 20h40l-7 12H36v12h8v7H20v-7h8V32h-9z"/><path d="M22 26h20M31 32v12"/></svg>`,
  Finesse: `<svg class="trait-glyph" viewBox="0 0 64 64" aria-hidden="true"><path d="M15 49 46 18"/><path d="m42 14 8-1-1 8"/><path d="M18 45c-8-8 2-18 10-10s-2 18-10 10Z"/><path d="M39 25 50 36"/></svg>`,
  Instinct: `<svg class="trait-glyph" viewBox="0 0 64 64" aria-hidden="true"><circle cx="32" cy="32" r="17"/><path d="m37 17-2 13-13 10 7-13z"/><circle cx="32" cy="32" r="3"/><path d="M32 9v6M32 49v6M9 32h6M49 32h6"/></svg>`,
  Presence: `<svg class="trait-glyph" viewBox="0 0 64 64" aria-hidden="true"><path d="M32 15c7 6 10 12 10 18a10 10 0 0 1-20 0c0-6 3-12 10-18Z"/><path d="M32 27v18M24 47h16"/><path d="M17 21c-4 7-4 15 0 22M47 21c4 7 4 15 0 22"/></svg>`,
  Knowledge: `<svg class="trait-glyph" viewBox="0 0 64 64" aria-hidden="true"><path d="M8 17c10-4 18-2 24 4v30c-6-6-14-8-24-4z"/><path d="M56 17c-10-4-18-2-24 4v30c6-6 14-8 24-4z"/><path d="M15 26c5-1 9 0 13 3M15 34c5-1 9 0 13 3M49 26c-5-1-9 0-13 3M49 34c-5-1-9 0-13 3"/></svg>`
};

export const TRAIT_ACCENTS = {
  Agility: "#7fb9a7",
  Strength: "#cf765e",
  Finesse: "#d0a75d",
  Instinct: "#7f9cc9",
  Presence: "#c17ca0",
  Knowledge: "#9b8bc3"
};

export function traitGraphic(name) {
  return GLYPHS[name] || GLYPHS.Knowledge;
}

export function traitAccent(name) {
  return TRAIT_ACCENTS[name] || "#d0a75d";
}
