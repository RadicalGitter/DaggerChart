// Standalone physical-book experiment for the player table.
// It consumes only the same server-whitelisted /api/table payload as /table.
import { t, term, initI18n, seasonLabel, TERMS } from "/shared/i18n.js";

const $ = (selector) => document.querySelector(selector);
const esc = (value) =>
  String(value ?? "").replace(/[&<>"']/g, (char) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]));

const TRAITS = ["Agility", "Strength", "Finesse", "Instinct", "Presence", "Knowledge"];
const SECTION_ORDER = [
  { key: "town", title: "table.town" },
  { key: "folk", title: "table.folk" },
  { key: "chronicle", title: "table.chronicle" },
  { key: "journal", title: "journal.title" },
  { key: "character", title: "table.character" }
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

function storesHtml(className = "mini-stores") {
  return `<div class="${className}">${Object.entries(data.resources)
    .map(([name, value]) => `<div class="mini-store">${esc(name)} <strong>${value}</strong></div>`)
    .join("")}</div>`;
}

function leftPageHtml(section, index) {
  const title = t(section.title);
  const count = sectionCount(section.key);
  return `<div class="chapter-kicker">${t("table.book.chapter")} ${toRoman(index + 1)}</div>
    <h1 class="chapter-title">${esc(title)}</h1>
    <div class="chapter-rule"></div>
    <div class="chapter-copy"><span class="chapter-initial">${esc(title.slice(0, 1))}</span>
      <div class="chapter-count"><strong>${count}</strong>${esc(title)}</div>
    </div>
    ${storesHtml()}`;
}

function townHtml() {
  return data.buildings.length
    ? `<h2 class="page-heading">${t("table.town")}</h2><div class="book-grid">${data.buildings
        .map((building) => `<article class="book-card">
          <strong>${esc(building.name)}</strong>
          <div class="book-muted">${esc(building.resource)} · ${term("building-level", t("table.level"))} ${building.level}</div>
          <div>${building.foreman ? term("foreman", esc(building.foreman)) : `<span class="book-muted">${t("table.noforeman")}</span>`}</div>
        </article>`)
        .join("")}</div>`
    : `<p class="book-empty">${t("table.nobuildings")}</p>`;
}

function folkHtml() {
  return data.characters.length
    ? `<h2 class="page-heading">${t("table.folk")}</h2><div class="book-grid">${data.characters
        .map((person) => {
          const gone = person.status !== "alive";
          const traits = person.traits
            ? `<div class="book-traits">${TRAITS.map((trait) =>
                `<span class="book-pill term" data-term="trait-${trait.toLowerCase()}">${trait.slice(0, 3)} ${person.traits[trait] >= 0 ? "+" : ""}${person.traits[trait] ?? 0}</span>`
              ).join("")}</div>`
            : "";
          return `<article class="book-card"${gone ? ` style="opacity:.58"` : ""}>
            <div class="folk-row">
              <div class="book-portrait">${person.portrait ? `<img src="${esc(person.portrait)}" alt="">` : esc(person.name[0] || "?")}</div>
              <div><strong>${esc(person.name)}</strong>${gone ? ` <span class="book-pill">${esc(person.status)}</span>` : ""}
              <div class="book-muted">${esc(person.role || "")}</div></div>
            </div>
            <p>${esc(person.description || "")}</p>${traits}
          </article>`;
        })
        .join("")}</div>`
    : `<p class="book-empty">${t("table.nofolk")}</p>`;
}

function chronicleHtml() {
  return data.chronicle.length
    ? `<h2 class="page-heading">${t("table.chronicle")}</h2>${data.chronicle
        .map((entry) => `<article class="book-entry"><div class="season">${esc(seasonLabel(entry.season))}</div><div>${esc(entry.text)}</div></article>`)
        .join("")}`
    : `<p class="book-empty">${t("table.nochronicle")}</p>`;
}

function pickerHtml() {
  const people = (data.party || []).map((pc) =>
    `<button type="button" data-pick="${esc(pc.id)}">${esc(pc.name)}${pc.player ? ` <span class="book-muted">· ${esc(pc.player)}</span>` : ""}</button>`
  ).join("");
  return `<div class="character-picker">
    <div class="chapter-kicker" style="text-align:center">${t("table.whoareyou")}</div>
    ${people}
    <button type="button" class="quiet" data-create>${t("create.title")} →</button>
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
      renderBookmarks();
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
  $("#cover-season").setAttribute("title", t("table.book.open"));
  $("#cover-season").closest("button")?.setAttribute("aria-label", t("table.book.open"));
  $("#folio-season").textContent = `${data.settlement.name} · ${seasonLabel(data.settlement.seasonLabel)} · ${t("table.folkcount", { n: data.settlement.population })}`;
  $("#folio-stores").innerHTML = Object.entries(data.resources)
    .map(([name, value]) => `<span class="folio-store"><strong>${value}</strong>${esc(name)}</span>`)
    .join("");
}

function renderBookmarks() {
  if (!data) return;
  const nav = $("#bookmarks");
  nav.innerHTML = SECTION_ORDER.map((section, index) => {
    const isLeft = bookOpen && index < selectedIndex;
    const slot = bookOpen ? (isLeft ? index : index - selectedIndex) : index;
    const active = bookOpen && index === selectedIndex;
    return `<button type="button" class="bookmark${isLeft ? " side-left" : ""}${active ? " active" : ""}"
      data-index="${index}" data-key="${section.key}" style="--slot:${slot}"${active ? ` aria-current="page"` : ""}>
      <span class="bookmark-name">${esc(t(section.title))}</span><span class="bookmark-count">${sectionCount(section.key)}</span>
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
  document.body.classList.add("book-open");
  renderBookmarks();
  centerBookSoon();
}

function closeBook() {
  if (!bookOpen || turning) return;
  bookOpen = false;
  $("#tome").classList.remove("open");
  $("#tome").dataset.state = "closed";
  document.body.classList.remove("book-open");
  renderBookmarks();
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
  renderBookmarks();
  if (reduced) return;

  turning = true;
  const sheet = $("#turn-sheet");
  sheet.hidden = false;
  sheet.className = `turn-sheet ${direction}`;
  sheet.addEventListener("animationend", finishTurn, { once: true });
  turnFallback = setTimeout(finishTurn, 900);
}

function toRoman(number) {
  return ["I", "II", "III", "IV", "V"][number - 1] || String(number);
}

function layoutBook() {
  const compact = window.innerWidth <= 760;
  const widthScale = (window.innerWidth - (compact ? 12 : 28)) / 1200;
  const heightScale = (window.innerHeight - (compact ? 86 : 112)) / 650;
  const closedObjectScale = (window.innerWidth - 8) / 630;
  const scale = compact ? Math.min(0.64, heightScale, closedObjectScale) : Math.min(1, widthScale, heightScale);
  $("#book-scale").style.transform = `scale(${scale})`;
  $("#book-scale").dataset.scale = String(scale);
  centerBookSoon();
}

function centerBookSoon() {
  requestAnimationFrame(() => {
    if (window.innerWidth > 760) return;
    const viewport = $("#book-viewport");
    const scale = Number($("#book-scale").dataset.scale || 0.7);
    // Closed: cover centre. Open: spine centre, leaving either page one swipe away.
    const focus = bookOpen ? 600 : 690;
    viewport.scrollLeft = Math.max(0, focus * scale - viewport.clientWidth / 2);
  });
}

async function refresh() {
  const response = await fetch("/api/table");
  if (!response.ok) throw new Error(t("error.table"));
  data = await response.json();
  renderCover();
  renderBookmarks();
  if (bookOpen) renderSpread();
}

$("#front-cover").onclick = () => {
  if (!data) return;
  renderSpread(true);
  openBook();
};
$("#close-book").onclick = closeBook;

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
  renderBookmarks();
  if (bookOpen && SECTION_ORDER[selectedIndex].key === "character") renderSpread(true);
});

let resizeFrame = null;
window.addEventListener("resize", () => {
  cancelAnimationFrame(resizeFrame);
  resizeFrame = requestAnimationFrame(layoutBook);
});

initI18n();
layoutBook();
refresh().catch((error) => {
  $("#book-instruction").textContent = error.message;
});

const stream = new EventSource("/api/stream");
let refreshTimer = null;
stream.onmessage = () => {
  clearTimeout(refreshTimer);
  refreshTimer = setTimeout(() => refresh().catch(() => {}), 180);
};
