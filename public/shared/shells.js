// The player shells, collected in one list so the creator's book-picker and the
// login chooser agree on what exists and where each one lives. A shell is a
// whole visual treatment of the same spoiler-safe player payload (see
// docs/player-shell-visuals.md); the choice is stored on the character and
// routes that device into the chosen shell at login and after creation.
//
// `thumb` is a small self-contained SVG for the picker. `name`/`blurb` are i18n
// keys resolved by the consumer with t(). Order matters: the first entry is the
// creator's default highlight.

export const SHELLS = [
  {
    id: "tome",
    route: "/tome",
    name: "shell.tome.name",
    blurb: "shell.tome.blurb",
    thumb: `<svg viewBox="0 0 120 90" aria-hidden="true">
      <rect x="26" y="14" width="68" height="68" rx="5" fill="#43281a" stroke="#22130b" stroke-width="2"/>
      <rect x="32" y="20" width="56" height="56" rx="3" fill="none" stroke="#7c5327" stroke-width="1.4" opacity="0.8"/>
      <rect x="37" y="43" width="46" height="3" rx="1.5" fill="#caa25a"/>
      <path d="M52 10 l4 0 -1 12 -2 0 z" fill="#8a2c22"/>
      <path d="M66 10 c6 3 8 8 6 13 -3 -2 -5 -2 -8 -1 2 -4 3 -8 2 -12z" fill="#2c2a3e"/>
      <path d="M64 10 l1 14" stroke="#cfc9ba" stroke-width="0.9"/>
    </svg>`
  },
  {
    id: "book",
    route: "/table-book",
    name: "shell.book.name",
    blurb: "shell.book.blurb",
    thumb: `<svg viewBox="0 0 120 90" aria-hidden="true">
      <path d="M60 20 C 48 15, 30 15, 22 19 L22 71 C 30 67, 48 67, 60 72 Z" fill="#efe4c6" stroke="#8a7346" stroke-width="1.6"/>
      <path d="M60 20 C 72 15, 90 15, 98 19 L98 71 C 90 67, 72 67, 60 72 Z" fill="#efe4c6" stroke="#8a7346" stroke-width="1.6"/>
      <path d="M60 20 L60 72" stroke="#8a7346" stroke-width="1.6"/>
      <path d="M30 30 h20 M30 38 h20 M30 46 h16" stroke="#b7a274" stroke-width="1.4"/>
      <path d="M70 30 h20 M70 38 h20 M70 46 h16" stroke="#b7a274" stroke-width="1.4"/>
      <rect x="98" y="26" width="10" height="9" rx="2" fill="#9a5030"/>
      <rect x="98" y="40" width="10" height="9" rx="2" fill="#6f7a44"/>
      <rect x="98" y="54" width="10" height="9" rx="2" fill="#4c6478"/>
    </svg>`
  },
  {
    id: "table",
    route: "/table",
    name: "shell.table.name",
    blurb: "shell.table.blurb",
    thumb: `<svg viewBox="0 0 120 90" aria-hidden="true">
      <rect x="20" y="26" width="26" height="42" rx="4" fill="#352a1c" stroke="#8a7346" stroke-width="1.4"/>
      <rect x="48" y="22" width="26" height="46" rx="4" fill="#3d3020" stroke="#a88a52" stroke-width="1.4"/>
      <rect x="76" y="26" width="26" height="42" rx="4" fill="#352a1c" stroke="#8a7346" stroke-width="1.4"/>
      <rect x="53" y="29" width="16" height="3" rx="1.5" fill="#d4b86a"/>
      <rect x="53" y="37" width="16" height="2" rx="1" fill="#8a7346"/>
      <rect x="53" y="43" width="12" height="2" rx="1" fill="#8a7346"/>
    </svg>`
  }
];

export const DEFAULT_SHELL = "table"; // the documented canonical login destination

const byId = (id) => SHELLS.find((s) => s.id === id) || null;

export const shellRoute = (id) => (byId(id) || byId(DEFAULT_SHELL)).route;
export const shellName = (id) => (byId(id) || byId(DEFAULT_SHELL)).name;
