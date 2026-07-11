// The Tome — aged player-shell visual. Same contract as /table-book:
// /api/table only, SSE refetch, settlement-pc identity, stable embeds.
//
// The keepsakes ARE the navigation: real things stuffed between the pages.
// Each entry in KEEPSAKES is one object — silhouette, colors, sway, where its
// little label sits. When players one day choose their own bookmark at
// character creation, that choice should resolve to a key in this registry
// (or a player-supplied variant of one); nothing else needs to change.
import { t, term, initI18n, seasonLabel } from "/shared/i18n.js";

const $ = (selector) => document.querySelector(selector);
const esc = (value) =>
  String(value ?? "").replace(/[&<>"']/g, (char) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]));

const TRAITS = ["Agility", "Strength", "Finesse", "Instinct", "Presence", "Knowledge"];

// ---------- the keepsake registry ----------

const KEEPSAKES = {
  ribbon: {
    label: { right: "34px", top: "50%", tilt: "-2deg" },
    art: `<svg viewBox="0 0 168 46" aria-hidden="true">
      <defs><linearGradient id="ksr-silk" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0" stop-color="#6e1f1a"/><stop offset="0.45" stop-color="#a03a2c"/>
        <stop offset="0.6" stop-color="#c05a44"/><stop offset="0.78" stop-color="#8a2c22"/>
        <stop offset="1" stop-color="#5c1813"/></linearGradient></defs>
      <path d="M0 14 C 36 11, 74 13, 106 15 L 138 17 L 130 21 L 139 25 L 128 28 L 134 32 C 96 33, 52 31, 0 32 Z" fill="url(#ksr-silk)"/>
      <path d="M0 15 C 36 12, 74 14, 104 16" stroke="rgba(255,214,178,0.3)" stroke-width="1.1" fill="none"/>
      <path d="M136 18 q 10 2 16 -1" stroke="#7c261e" stroke-width="1" fill="none"/>
      <path d="M133 27 q 12 4 20 2" stroke="#8a2f26" stroke-width="0.9" fill="none"/>
      <path d="M131 31 q 8 6 14 7" stroke="#6e1f1a" stroke-width="0.8" fill="none"/>
    </svg>`
  },
  feather: {
    label: { right: "30px", top: "74%", tilt: "1.5deg" },
    art: `<svg viewBox="0 0 168 46" aria-hidden="true">
      <defs><linearGradient id="ksf-vane" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0" stop-color="#191722"/><stop offset="0.55" stop-color="#2c2a3e"/>
        <stop offset="0.8" stop-color="#3d4460"/><stop offset="1" stop-color="#23202e"/></linearGradient></defs>
      <path d="M20 22 C 42 8, 92 4, 138 12 C 128 14, 131 15, 121 16 C 125 18, 117 19, 111 19 C 115 21, 98 22, 20 23 Z" fill="url(#ksf-vane)"/>
      <path d="M20 24 C 48 36, 96 38, 134 30 C 123 29, 127 27, 115 27 C 119 25, 102 24, 20 24 Z" fill="url(#ksf-vane)" opacity="0.92"/>
      <path d="M8 24 C 12 20, 16 26, 20 22" stroke="#2c2a3e" stroke-width="0.8" fill="none" opacity="0.7"/>
      <path d="M6 22 C 10 26, 14 19, 18 24" stroke="#2c2a3e" stroke-width="0.7" fill="none" opacity="0.55"/>
      <path d="M2 23.5 L 148 20.5" stroke="#cfc9ba" stroke-width="1.5"/>
      <path d="M2 23.5 L 148 20.5" stroke="#131019" stroke-width="0.6"/>
      <path d="M64 21.8 L 74 12" stroke="#0f0d16" stroke-width="0.5" opacity="0.6"/>
      <path d="M92 21.3 L 100 13" stroke="#0f0d16" stroke-width="0.5" opacity="0.6"/>
      <path d="M78 22.6 L 86 31" stroke="#0f0d16" stroke-width="0.5" opacity="0.55"/>
    </svg>`
  },
  scrap: {
    label: { right: "30px", top: "52%", tilt: "-1deg" },
    art: `<svg viewBox="0 0 168 46" aria-hidden="true">
      <path d="M0 12 L 148 9 L 155 14 L 148 19 L 153 26 L 145 33 L 2 35 Z"
        fill="#e7d7a8" stroke="#a98a55" stroke-width="0.8"/>
      <path d="M58 10.5 L 62 34" stroke="rgba(107,81,54,0.22)" stroke-width="1" fill="none"/>
      <path d="M0 12 L 148 9" stroke="rgba(255,248,226,0.6)" stroke-width="0.6" fill="none"/>
      <path d="M110 11 C 118 16, 112 24, 120 31" stroke="rgba(134,89,38,0.16)" stroke-width="6" fill="none"/>
    </svg>`
  },
  flower: {
    label: { right: "48px", top: "24%", tilt: "2deg" },
    art: `<svg viewBox="0 0 168 46" aria-hidden="true">
      <path d="M0 27 C 30 23, 62 29, 98 24" stroke="#6b6a3f" stroke-width="1.6" fill="none"/>
      <path d="M34 25.5 C 40 18, 48 18, 50 22 C 46 26, 38 27, 34 25.5 Z" fill="#7c7747" opacity="0.8"/>
      <path d="M64 27 C 70 33, 78 34, 81 30 C 77 26, 68 25.5, 64 27 Z" fill="#71703f" opacity="0.75"/>
      <g stroke="#8f6f9e" stroke-width="0.6" fill="#b493c4" fill-opacity="0.85">
        <path d="M116 22 C 122 8, 132 9, 130 18 C 128 22, 121 23, 116 22 Z"/>
        <path d="M116 22 C 128 12, 140 16, 136 23 C 132 27, 121 24, 116 22 Z"/>
        <path d="M116 22 C 130 22, 138 30, 130 33 C 123 34, 117 27, 116 22 Z"/>
        <path d="M116 22 C 122 34, 112 40, 108 33 C 106 28, 111 24, 116 22 Z"/>
        <path d="M116 22 C 106 30, 98 25, 102 18 C 106 14, 113 17, 116 22 Z"/>
        <path d="M116 22 C 104 16, 106 6, 114 9 C 118 11, 118 17, 116 22 Z"/>
      </g>
      <circle cx="116" cy="22" r="4" fill="#9a7c3f" stroke="#6b5136" stroke-width="0.5"/>
    </svg>`
  },
  charm: {
    label: { right: "44px", top: "76%", tilt: "-1.5deg" },
    art: `<svg viewBox="0 0 168 46" aria-hidden="true">
      <defs><linearGradient id="ksc-bone" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#e8ddc4"/><stop offset="0.6" stop-color="#cbbb95"/>
        <stop offset="1" stop-color="#b3a17f"/></linearGradient></defs>
      <path d="M0 19 C 30 17, 60 22, 92 21" stroke="#4a3220" stroke-width="1.5" fill="none"/>
      <path d="M0 24 C 30 23, 60 26, 92 23" stroke="#3c2818" stroke-width="1.3" fill="none"/>
      <circle cx="95" cy="22" r="3.4" fill="#3c2818"/>
      <rect x="100" y="14" width="38" height="16" rx="8" fill="url(#ksc-bone)" stroke="#8a795a" stroke-width="0.8"/>
      <path d="M110 17 L 109 27 M 118 16.5 L 117.5 27.5 M 126 17 L 125 27" stroke="#7a6a4c" stroke-width="1" opacity="0.75"/>
      <path d="M132 16 C 134 20, 131 24, 133 28" stroke="#8a795a" stroke-width="0.5" fill="none" opacity="0.7"/>
    </svg>`
  }
};

// Chapter order + which keepsake marks it, and where it sits on the fore-edge.
// `hang` is the bookmark's resting depth in the page block — a keepsake keeps
// its height even when it migrates to the left edge, like a real one would.
const SECTION_ORDER = [
  { key: "town", title: "table.town", keepsake: "ribbon", hang: 96, tilt: "-1.6deg", sway: "5.6s" },
  { key: "folk", title: "table.folk", keepsake: "feather", hang: 190, tilt: "1.1deg", sway: "7.3s" },
  { key: "chronicle", title: "table.chronicle", keepsake: "scrap", hang: 288, tilt: "-0.7deg", sway: "6.4s" },
  { key: "journal", title: "journal.title", keepsake: "flower", hang: 384, tilt: "2deg", sway: "8.1s" },
  { key: "character", title: "table.character", keepsake: "charm", hang: 474, tilt: "-1.2deg", sway: "5.2s" }
];

let data = null;
let selectedIndex = 0;
let bookOpen = false;
let turning = false;
let contentKey = null;
let characterOverride = null; // "picker" | "create" | null
let turnFallback = null;

const getPC = () =>
  localStorage.getItem("settlement-pc") || localStorage.getItem("settlement-journal-pc");
const setPC = (id) => localStorage.setItem("settlement-pc", id);
const myPC = () => {
  const id = getPC();
  return (id && data?.party?.find((pc) => pc.id === id)) || null;
};

function sectionCount(key) {
  if (!data) return "—";
  if (key === "town") return data.buildings.length;
  if (key === "folk") return data.characters.length;
  if (key === "chronicle") return data.chronicle.length;
  if (key === "journal") return "✎";
  const pc = myPC();
  return pc ? esc(pc.name.slice(0, 1).toUpperCase()) : "?";
}

// ---------- page content ----------

function storesHtml() {
  return `<div class="mini-stores">${Object.entries(data.resources)
    .map(([name, value]) => `<div class="mini-store">${esc(name)} <strong>${value}</strong></div>`)
    .join("")}</div>`;
}

function leftPageHtml(section, index) {
  const title = t(section.title);
  return `<div class="chapter-kicker">${t("table.book.chapter")} ${toRoman(index + 1)}</div>
    <h1 class="chapter-title">${esc(title)}</h1>
    <div class="chapter-rule"></div>
    <div class="chapter-copy"><span class="chapter-initial">${esc(title.slice(0, 1))}</span>
      <div class="chapter-count"><strong>${sectionCount(section.key)}</strong>${esc(title)}</div>
    </div>
    ${storesHtml()}`;
}

function townHtml() {
  return data.buildings.length
    ? `<h2 class="page-heading">${t("table.town")}</h2><div class="tome-grid">${data.buildings
        .map((building) => `<article class="tome-card">
          <strong>${esc(building.name)}</strong>
          <div class="tome-muted">${esc(building.resource)} · ${term("building-level", t("table.level"))} ${building.level}</div>
          <div>${building.foreman ? term("foreman", esc(building.foreman)) : `<span class="tome-muted">${t("table.noforeman")}</span>`}</div>
        </article>`)
        .join("")}</div>`
    : `<p class="tome-empty">${t("table.nobuildings")}</p>`;
}

function folkHtml() {
  return data.characters.length
    ? `<h2 class="page-heading">${t("table.folk")}</h2><div class="tome-grid">${data.characters
        .map((person) => {
          const gone = person.status !== "alive";
          const traits = person.traits
            ? `<div class="tome-traits">${TRAITS.map((trait) =>
                `<span class="tome-pill term" data-term="trait-${trait.toLowerCase()}">${trait.slice(0, 3)} ${person.traits[trait] >= 0 ? "+" : ""}${person.traits[trait] ?? 0}</span>`
              ).join("")}</div>`
            : "";
          return `<article class="tome-card"${gone ? ` style="opacity:.58"` : ""}>
            <div class="folk-row">
              <div class="tome-portrait">${person.portrait ? `<img src="${esc(person.portrait)}" alt="">` : esc(person.name[0] || "?")}</div>
              <div><strong>${esc(person.name)}</strong>${gone ? ` <span class="tome-pill">${esc(person.status)}</span>` : ""}
              <div class="tome-muted">${esc(person.role || "")}</div></div>
            </div>
            <p>${esc(person.description || "")}</p>${traits}
          </article>`;
        })
        .join("")}</div>`
    : `<p class="tome-empty">${t("table.nofolk")}</p>`;
}

function chronicleHtml() {
  return data.chronicle.length
    ? `<h2 class="page-heading">${t("table.chronicle")}</h2>${data.chronicle
        .map((entry) => `<article class="tome-entry"><div class="season">${esc(seasonLabel(entry.season))}</div><div>${esc(entry.text)}</div></article>`)
        .join("")}`
    : `<p class="tome-empty">${t("table.nochronicle")}</p>`;
}

function pickerHtml() {
  const people = (data.party || []).map((pc) =>
    `<button type="button" data-pick="${esc(pc.id)}">${esc(pc.name)}${pc.player ? ` <span class="tome-muted">· ${esc(pc.player)}</span>` : ""}</button>`
  ).join("");
  return `<div class="character-picker">
    <div class="chapter-kicker">${t("table.whoareyou")}</div>
    ${people}
    <button type="button" data-create>${t("create.title")} →</button>
  </div>`;
}

function rightPage(section) {
  if (section.key === "town") return { key: "town", html: townHtml(), volatile: true };
  if (section.key === "folk") return { key: "folk", html: folkHtml(), volatile: true };
  if (section.key === "chronicle") return { key: "chronicle", html: chronicleHtml(), volatile: true };
  if (section.key === "journal") {
    const pc = getPC();
    return {
      key: `journal:${pc || ""}`,
      embed: true,
      html: `<iframe title="${esc(t("journal.title"))}" src="/journal/?embed=1${pc ? `&pc=${encodeURIComponent(pc)}` : ""}"></iframe>`
    };
  }
  if (characterOverride === "create") {
    return { key: "create", embed: true, html: `<iframe title="${esc(t("create.title"))}" src="/create/"></iframe>` };
  }
  const pc = characterOverride === "picker" ? null : myPC();
  if (pc) {
    return {
      key: `character:${pc.id}`,
      embed: true,
      html: `<a class="switch-pc" data-switch>${t("journal.notyou")}</a><iframe title="${esc(pc.name)}" src="/character/${encodeURIComponent(pc.id)}"></iframe>`
    };
  }
  return { key: "character-picker", html: pickerHtml() };
}

function wirePageActions() {
  for (const button of $("#right-content").querySelectorAll("[data-pick]")) {
    button.onclick = () => {
      setPC(button.dataset.pick);
      characterOverride = null;
      contentKey = null;
      renderSpread(true);
    };
  }
  const create = $("#right-content").querySelector("[data-create]");
  if (create) create.onclick = () => {
    characterOverride = "create";
    contentKey = null;
    renderSpread(true);
  };
  const switcher = $("#right-content").querySelector("[data-switch]");
  if (switcher) switcher.onclick = () => {
    characterOverride = "picker";
    contentKey = null;
    renderSpread(true);
  };
}

function renderSpread(force = false) {
  if (!data) return;
  const section = SECTION_ORDER[selectedIndex];
  $("#left-content").innerHTML = leftPageHtml(section, selectedIndex);
  $("#left-number").textContent = String(selectedIndex * 2 + 1);
  $("#right-number").textContent = String(selectedIndex * 2 + 2);

  const desired = rightPage(section);
  const right = $("#right-content");
  right.classList.toggle("embed", !!desired.embed);
  if (force || desired.volatile || desired.key !== contentKey) {
    right.innerHTML = desired.html;
    contentKey = desired.key;
    wirePageActions();
  }
}

function renderCover() {
  if (!data) return;
  $("#cover-title").textContent = data.settlement.name;
  $("#cover-season").textContent = seasonLabel(data.settlement.seasonLabel);
  $("#front-cover").setAttribute("aria-label", t("table.book.open"));
  $("#folio-season").textContent = `${data.settlement.name} · ${seasonLabel(data.settlement.seasonLabel)} · ${t("table.folkcount", { n: data.settlement.population })}`;
  $("#folio-stores").innerHTML = Object.entries(data.resources)
    .map(([name, value]) => `<span class="folio-store"><strong>${value}</strong>${esc(name)}</span>`)
    .join("");
}

function renderKeepsakes() {
  if (!data) return;
  const nav = $("#keepsakes");
  nav.innerHTML = SECTION_ORDER.map((section, index) => {
    const style = KEEPSAKES[section.keepsake] || KEEPSAKES.ribbon;
    const isLeft = bookOpen && index < selectedIndex;
    const active = bookOpen && index === selectedIndex;
    const labelStyle = `--label-tilt:${style.label.tilt}; top:${style.label.top}; ${isLeft ? "left" : "right"}:${style.label.right};`;
    return `<button type="button"
      class="keepsake ks-${section.keepsake}${isLeft ? " side-left" : ""}${active ? " active" : ""}"
      data-index="${index}" style="--hang:${section.hang}px; --tilt:${section.tilt}; --sway:${section.sway}"
      ${active ? `aria-current="page"` : ""} aria-label="${esc(t(section.title))}">
      <span class="keepsake-art">${style.art}</span>
      <span class="keepsake-label" style="${labelStyle}">${esc(t(section.title))}</span>
    </button>`;
  }).join("");
  for (const button of nav.querySelectorAll("[data-index]")) {
    button.onclick = () => chooseSection(Number(button.dataset.index));
  }
}

function chooseSection(nextIndex) {
  if (turning || nextIndex < 0 || nextIndex >= SECTION_ORDER.length) return;
  characterOverride = null;
  if (!bookOpen) {
    selectedIndex = nextIndex;
    contentKey = null;
    renderSpread(true);
    openBook();
    return;
  }
  if (nextIndex === selectedIndex) return;
  turnPage(nextIndex);
}

function openBook() {
  if (bookOpen || !data) return;
  bookOpen = true;
  $("#tome").classList.add("open");
  $("#tome").dataset.state = "open";
  renderKeepsakes();
  centerBookSoon();
}

function closeBook() {
  if (!bookOpen || turning) return;
  bookOpen = false;
  $("#tome").classList.remove("open");
  $("#tome").dataset.state = "closed";
  renderKeepsakes();
  centerBookSoon();
}

function finishTurn() {
  clearTimeout(turnFallback);
  const sheet = $("#turn-sheet");
  sheet.hidden = true;
  sheet.className = "turn-sheet";
  turning = false;
}

function turnPage(nextIndex) {
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const direction = nextIndex > selectedIndex ? "forward" : "backward";
  selectedIndex = nextIndex;
  contentKey = null;
  renderSpread(true);
  renderKeepsakes();
  if (reduced) return;

  turning = true;
  const sheet = $("#turn-sheet");
  sheet.hidden = false;
  sheet.className = `turn-sheet ${direction}`;
  sheet.addEventListener("animationend", finishTurn, { once: true });
  turnFallback = setTimeout(finishTurn, 950);
}

function toRoman(number) {
  return ["I", "II", "III", "IV", "V"][number - 1] || String(number);
}

// ---------- the room ----------

function spawnDust() {
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  const dust = $("#dust");
  let html = "";
  for (let i = 0; i < 16; i += 1) {
    const size = 1.5 + Math.random() * 2.4;
    html += `<span class="mote" style="left:${(Math.random() * 100).toFixed(1)}%; top:${(24 + Math.random() * 70).toFixed(1)}%; width:${size.toFixed(1)}px; height:${size.toFixed(1)}px; animation-duration:${(9 + Math.random() * 14).toFixed(1)}s; animation-delay:${(-Math.random() * 18).toFixed(1)}s;"></span>`;
  }
  dust.innerHTML = html;
}

// ---------- layout ----------

function layoutBook() {
  const compact = window.innerWidth <= 760;
  // Total visual width: the spread plus keepsakes poking out both sides.
  const widthScale = (window.innerWidth - (compact ? 12 : 30)) / 1500;
  const heightScale = (window.innerHeight - (compact ? 96 : 120)) / 690;
  const closedObjectScale = (window.innerWidth - 8) / 780;
  const scale = compact ? Math.min(0.66, heightScale, closedObjectScale) : Math.min(1, widthScale, heightScale);
  $("#tome-scale").style.transform = `scale(${scale})`;
  $("#tome-scale").dataset.scale = String(scale);
  centerBookSoon();
}

function centerBookSoon() {
  requestAnimationFrame(() => {
    if (window.innerWidth > 760) return;
    const viewport = $("#tome-viewport");
    const scale = Number($("#tome-scale").dataset.scale || 0.7);
    // Closed: centre of the cover. Open: the spine, either page one swipe away.
    const focus = bookOpen ? 620 : 928;
    viewport.scrollLeft = Math.max(0, focus * scale - viewport.clientWidth / 2);
  });
}

// ---------- data & wiring ----------

async function refresh() {
  const response = await fetch("/api/table");
  if (!response.ok) throw new Error("The player ledger could not be opened.");
  data = await response.json();
  renderCover();
  renderKeepsakes();
  if (bookOpen) renderSpread();
}

$("#front-cover").onclick = () => {
  if (!data) return;
  renderSpread(true);
  openBook();
};
$("#close-tome").onclick = closeBook;

window.addEventListener("keydown", (event) => {
  if (!bookOpen || turning || ["INPUT", "TEXTAREA", "SELECT"].includes(document.activeElement?.tagName)) return;
  if (event.key === "Escape") closeBook();
  if (event.key === "ArrowRight" && selectedIndex < SECTION_ORDER.length - 1) chooseSection(selectedIndex + 1);
  if (event.key === "ArrowLeft" && selectedIndex > 0) chooseSection(selectedIndex - 1);
});

window.addEventListener("storage", (event) => {
  if (event.key !== "settlement-pc") return;
  characterOverride = null;
  contentKey = null;
  renderKeepsakes();
  if (bookOpen && SECTION_ORDER[selectedIndex].key === "character") renderSpread(true);
});

let resizeFrame = null;
const queueLayout = () => {
  cancelAnimationFrame(resizeFrame);
  resizeFrame = requestAnimationFrame(layoutBook);
};
window.addEventListener("resize", queueLayout);
// Some hosts settle the viewport after load without firing resize —
// track the root element's size instead of trusting the event.
new ResizeObserver(queueLayout).observe(document.documentElement);

initI18n();
layoutBook();
spawnDust();
refresh().catch((error) => {
  $("#tome-instruction").textContent = error.message;
});

const stream = new EventSource("/api/stream");
let refreshTimer = null;
stream.onmessage = () => {
  clearTimeout(refreshTimer);
  refreshTimer = setTimeout(() => refresh().catch(() => {}), 180);
};
