// The writing implements, collected in one list. Chosen separately from the
// shell (the two are independent axes of "make it yours") and stored on the
// character. A pen contributes three things: the ink colour its doodle strokes
// are drawn in, a small `thumb` for the creator's picker, and the larger `art`
// used for the quill-and-inkpot tool that lies beside the tome — pressing it
// arms the pen (see the doodle dock in tome.js). `name` is an i18n key.

export const PENS = [
  {
    id: "quill",
    name: "pen.quill.name",
    ink: "#c6a86a",
    thumb: `<svg viewBox="0 0 120 90" aria-hidden="true">
      <path d="M86 20 C 58 30, 40 50, 30 72 C 44 66, 40 68, 56 60 C 50 66, 60 60, 74 48 C 66 54, 76 48, 86 34 C 80 40, 88 34, 92 24 Z" fill="#2c2a3e" stroke="#14121c" stroke-width="1"/>
      <path d="M90 22 L 30 72" stroke="#cfc9ba" stroke-width="1.6"/>
      <path d="M32 70 l-4 8 8 -3 z" fill="#caa25a"/>
    </svg>`,
    art: penArt("#2c2a3e", "#cfc9ba", "#c6a86a")
  },
  {
    id: "reed",
    name: "pen.reed.name",
    ink: "#b5825a",
    thumb: `<svg viewBox="0 0 120 90" aria-hidden="true">
      <path d="M88 22 L 34 70" stroke="#b9945c" stroke-width="6" stroke-linecap="round"/>
      <path d="M88 22 L 34 70" stroke="#7c5a33" stroke-width="1.2"/>
      <path d="M34 70 l-3 7 7 -2 z" fill="#8f5f38"/>
      <path d="M60 46 l6 6" stroke="#6f4d2c" stroke-width="1.2"/>
    </svg>`,
    art: penArt("#b9945c", "#7c5a33", "#b5825a")
  },
  {
    id: "brush",
    name: "pen.brush.name",
    ink: "#5b6a7a",
    thumb: `<svg viewBox="0 0 120 90" aria-hidden="true">
      <path d="M90 22 L 46 62" stroke="#7a5a3c" stroke-width="5" stroke-linecap="round"/>
      <path d="M46 60 C 40 66, 34 72, 30 78 C 38 76, 42 74, 47 70 C 50 66, 49 63, 46 60 Z" fill="#2f3742" stroke="#1b2028" stroke-width="0.8"/>
      <rect x="84" y="16" width="10" height="8" rx="2" transform="rotate(42 89 20)" fill="#a8843f"/>
    </svg>`,
    art: penArt("#2f3742", "#7a5a3c", "#5b6a7a")
  }
];

export const DEFAULT_PEN = "quill";

// One silhouette shared by every implement: a nib rising out of an inkpot.
// `body` colours the feather/reed/brush, `spine` its central line, `ink` the pot.
function penArt(body, spine, ink) {
  return `<svg viewBox="0 0 96 230" aria-hidden="true">
    <ellipse cx="48" cy="212" rx="30" ry="8" fill="rgba(0,0,0,0.35)"/>
    <path d="M22 170 q26 -11 52 0 l-5 30 q-21 9 -42 0 z" fill="#3a2f28" stroke="#1f150d" stroke-width="1.4"/>
    <ellipse cx="48" cy="170" rx="26" ry="7.5" fill="#241a14" stroke="#1f150d" stroke-width="1"/>
    <ellipse cx="48" cy="169" rx="19" ry="5" fill="${ink}" opacity="0.9"/>
    <path d="M52 174 C 40 120, 34 70, 30 22" stroke="${spine}" stroke-width="2.2" fill="none"/>
    <path d="M52 174 C 44 118, 40 78, 30 22 C 22 60, 20 110, 34 150 C 30 120, 34 96, 44 150 C 42 128, 46 118, 52 174 Z" fill="${body}" opacity="0.96"/>
    <path d="M30 22 l-4 -6 6 2 z" fill="${spine}"/>
  </svg>`;
}

const byId = (id) => PENS.find((p) => p.id === id) || null;

export const penInk = (id) => (byId(id) || byId(DEFAULT_PEN)).ink;
export const penArtFor = (id) => (byId(id) || byId(DEFAULT_PEN)).art;
