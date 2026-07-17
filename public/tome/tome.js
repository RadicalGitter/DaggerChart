// The Tome — aged player-shell visual. Same contract as /table-book:
// /api/table only, SSE refetch, settlement-pc identity, stable embeds.
//
// The keepsakes ARE the navigation: real things stuffed between the pages.
// Each entry in KEEPSAKES is one object — silhouette, colors, sway, where its
// little label sits. When players one day choose their own bookmark at
// character creation, that choice should resolve to a key in this registry
// (or a player-supplied variant of one); nothing else needs to change.
import { t, term, termify, initI18n, seasonLabel, lang } from "/shared/i18n.js";
import { CONDITIONS, conditionIcon } from "/shared/conditions.js";
import { paperArtifactHtml } from "/shared/paper.js";
import { sessionPoolsHtml } from "/shared/session-pools.js";
import { mountPlayerChat } from "/shared/player-chat.js";
import { setTelemetryMode } from "/shared/telemetry.js";
import "/shared/feedback.js";
import "/shared/player-tools.js";

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
  },
  keyring: {
    label: { right: "42px", top: "28%", tilt: "1deg" },
    art: `<svg viewBox="0 0 168 46" aria-hidden="true">
      <path d="M0 22 C 32 20, 65 24, 96 22" stroke="#39281c" stroke-width="2" fill="none"/>
      <circle cx="102" cy="22" r="8" fill="none" stroke="#8b6a2d" stroke-width="2.2"/>
      <path d="M109 22 L145 22 L151 27 L145 31 L139 26 L131 31 L126 26 L109 26 Z"
        fill="#b38a3d" stroke="#6d5227" stroke-width="0.9"/>
      <path d="M113 23 L143 23" stroke="#e1c477" stroke-width="0.8" opacity="0.65"/>
    </svg>`
  },
  cord: {
    label: { right: "38px", top: "52%", tilt: "-1deg" },
    art: `<svg viewBox="0 0 168 46" aria-hidden="true">
      <path d="M0 23 C 28 15, 51 31, 78 22 S 126 13, 158 24" fill="none" stroke="#33575a" stroke-width="3" stroke-linecap="round"/>
      <path d="M0 21.8 C 28 14, 51 29.8, 78 20.8 S 126 12, 158 22.8" fill="none" stroke="#6f9da0" stroke-width="0.8" opacity="0.8"/>
      <g fill="#bda35b" stroke="#604b25" stroke-width="0.7">
        <circle cx="47" cy="27" r="4.5"/><circle cx="94" cy="18" r="4.5"/><circle cx="136" cy="18" r="4.5"/>
      </g>
      <path d="M42 22 C 47 17, 53 19, 53 25 C 52 31, 44 33, 41 27 Z" fill="none" stroke="#274447" stroke-width="1.4"/>
      <path d="M89 16 C 94 10, 101 13, 100 19 C 98 24, 91 25, 88 20 Z" fill="none" stroke="#274447" stroke-width="1.4"/>
      <path d="M131 16 C 136 11, 143 13, 142 20 C 140 25, 133 25, 130 21 Z" fill="none" stroke="#274447" stroke-width="1.4"/>
    </svg>`
  }
};

// Chapter order + which keepsake marks it. Inventory sits beside Character,
// deliberately: the sheet is two paper pages; possessions live in their own
// chapter and may occupy further spreads without making either page scroll.
// The keepsakes hang from the TOP edge as a fixed left→right row of tabs — they
// never change sides, so the eye can always find a chapter where it left it.
// `tab` is the section's signature colour; `sway` still animates the emblem.
const SECTION_ORDER = [
  { key: "journal", title: "journal.title", keepsake: "flower", tab: "#9d7fae", sway: "8.1s" },
  { key: "character", title: "table.character", keepsake: "charm", tab: "#c3ad7e", sway: "5.2s" },
  { key: "inventory", title: "table.inventory", keepsake: "keyring", tab: "#b5893c", sway: "6.1s" },
  { key: "rules", title: "rules.title", keepsake: "cord", tab: "#4f7e82", sway: "7.2s" }
];
const tomeParams = new URLSearchParams(location.search);
const requestedSectionIndex = SECTION_ORDER.findIndex((section) => section.key === tomeParams.get("section"));

let data = null;
let characterData = null;
let selectedIndex = requestedSectionIndex >= 0 ? requestedSectionIndex : 0;
let spreadIndex = 0;
let bookOpen = false;
let turning = false;
let sideKeys = { left: null, right: null };
let characterOverride = null; // "picker" | "create" | null
let turnFallback = null;
let editingItem = null;
let openOnArrival = tomeParams.get("open") === "1" || requestedSectionIndex >= 0;

const getPC = () =>
  localStorage.getItem("settlement-pc") || localStorage.getItem("settlement-journal-pc");
const setPC = (id) => {
  localStorage.setItem("settlement-pc", id);
  window.dispatchEvent(new Event("settlement:identity"));
};
const playerChat = mountPlayerChat({ slot: "#player-chat-slot", getPcId: getPC });
const myIdentity = () => {
  const id = getPC();
  return (id && (data?.identities || data?.party || []).find((pc) => pc.id === id)) || null;
};
const chunks = (items, size) => Array.from({ length: Math.max(1, Math.ceil(items.length / size)) }, (_, i) => items.slice(i * size, i * size + size));

function pageHeading(title, kicker = "") {
  return `<div class="chapter-kicker">${esc(kicker)}</div><h1 class="chapter-title">${esc(title)}</h1><div class="chapter-rule"></div>`;
}

function townSpreads() {
  const stores = Object.entries(data.resources).map(([name, value]) =>
    `<div class="town-store"><strong>${value}</strong><span>${esc(name)}</span></div>`
  ).join("");
  const left = `<div class="town-page">${pageHeading(data.settlement.name, t("table.town"))}
    <div class="town-at-glance">
      <div><strong>${data.settlement.population}</strong><span>${t("table.population")}</span></div>
      <div><strong>${esc(seasonLabel(data.settlement.seasonLabel))}</strong><span>${t("table.season")}</span></div>
    </div>
    <h2 class="page-heading">${t("table.stores")}</h2><div class="town-stores">${stores}</div></div>`;
  const right = data.buildings.length
    ? `<h2 class="page-heading">${t("table.buildings")}</h2><div class="tome-grid">${data.buildings.map((building) => `<article class="tome-card">
        <strong>${esc(building.name)}</strong>
        <div class="tome-muted">${esc(building.resource)} · ${term("building-level", t("table.level"))} ${building.level}</div>
        <div>${building.foreman ? term("foreman", esc(building.foreman)) : `<span class="tome-muted">${t("table.noforeman")}</span>`}</div>
      </article>`).join("")}</div>`
    : `<h2 class="page-heading">${t("table.buildings")}</h2><p class="tome-empty">${t("table.nobuildings")}</p>`;
  return [{ key: "town", left: { html: left, volatile: true }, right: { html: right, volatile: true } }];
}

function folkCard(person) {
  const gone = person.status !== "alive";
  const traits = person.traits ? `<div class="tome-traits">${TRAITS.map((trait) =>
    `<span class="tome-pill term" data-term="trait-${trait.toLowerCase()}">${trait.slice(0, 3)} ${person.traits[trait] >= 0 ? "+" : ""}${person.traits[trait] ?? 0}</span>`
  ).join("")}</div>` : "";
  return `<article class="tome-card"${gone ? ` style="opacity:.58"` : ""}>
    <div class="folk-row"><div class="tome-portrait">${person.portrait ? `<img src="${esc(person.portrait)}" alt="">` : esc(person.name[0] || "?")}</div>
    <div><strong>${esc(person.name)}</strong>${gone ? ` <span class="tome-pill">${esc(person.status)}</span>` : ""}<div class="tome-muted">${esc(person.role || "")}</div></div></div>
    <p>${esc(person.description || "")}</p>${traits}</article>`;
}

function folkSpreads() {
  if (!data.characters.length) return [{ key: "folk-empty", left: { html: pageHeading(t("table.folk")), volatile: true }, right: { html: `<p class="tome-empty">${t("table.nofolk")}</p>`, volatile: true } }];
  return chunks(data.characters, 6).map((group, i) => ({
    key: `folk:${i}`,
    left: { html: `${i === 0 ? pageHeading(t("table.folk")) : `<h2 class="page-heading">${t("table.folk")}</h2>`}<div class="tome-grid">${group.slice(0, 3).map(folkCard).join("")}</div>`, volatile: true },
    right: { html: `<div class="tome-grid page-continuation">${group.slice(3).map(folkCard).join("")}</div>`, volatile: true }
  }));
}

function chronicleEntry(entry) {
  return `<article class="tome-entry"><div class="season">${esc(seasonLabel(entry.season))}</div><div>${esc(entry.text)}</div></article>`;
}

function chronicleSpreads() {
  if (!data.chronicle.length) return [{ key: "chronicle-empty", left: { html: pageHeading(t("table.chronicle")), volatile: true }, right: { html: `<p class="tome-empty">${t("table.nochronicle")}</p>`, volatile: true } }];
  return chunks(data.chronicle, 8).map((group, i) => ({
    key: `chronicle:${i}`,
    left: { html: `${i === 0 ? pageHeading(t("table.chronicle")) : `<h2 class="page-heading">${t("table.chronicle")}</h2>`}${group.slice(0, 4).map(chronicleEntry).join("")}`, volatile: true },
    right: { html: `<div class="page-continuation">${group.slice(4).map(chronicleEntry).join("")}</div>`, volatile: true }
  }));
}

function pickerHtml() {
  const people = (data.identities || data.party || []).map((pc) =>
    `<button type="button" data-pick="${esc(pc.id)}">${esc(pc.name)}${pc.player ? ` <span class="tome-muted">· ${esc(pc.player)}</span>` : ""}</button>`
  ).join("");
  return `<div class="character-picker"><div class="chapter-kicker">${t("table.whoareyou")}</div>${people}<button type="button" data-create>${t("create.title")} →</button></div>`;
}

function featureHtml(feature) {
  return feature ? `<div class="sheet-feature"><strong>${esc(feature.name)}</strong> ${termify(esc(feature.text))}</div>` : "";
}

function vitalPips(kind, marked, max) {
  return `<div class="sheet-pips" data-pips="${kind}">${Array.from({ length: max || 0 }, (_, i) =>
    `<button type="button" class="sheet-pip ${i < marked ? "marked" : ""} ${kind === "hope" ? "hope" : ""}" data-vital="${kind}" data-index="${i}" aria-label="${kind} ${i + 1}"></button>`
  ).join("")}</div>`;
}

function characterSpreads() {
  if (characterOverride === "create") return [{ key: "character-create", left: { html: pageHeading(t("create.title")) }, right: { key: "create", embed: true, html: `<iframe title="${esc(t("create.title"))}" src="/create/?return=/tome"></iframe>` } }];
  if (characterOverride === "picker" || !characterData) return [{ key: "character-picker", left: { html: pageHeading(t("table.character")), volatile: true }, right: { html: pickerHtml(), volatile: true } }];
  const p = characterData;
  const traits = TRAITS.map((trait) => `<div class="sheet-trait"><strong>${p.traits[trait] >= 0 ? "+" : ""}${p.traits[trait]}</strong><span>${trait}</span></div>`).join("");
  const experiences = (p.experiences || []).map((e) => `<div class="sheet-line"><strong>${esc(e.name)}</strong> +${e.bonus}</div>`).join("");
  const background = (p.background || []).map((b) => `<div class="sheet-note"><strong>${esc(b.q)}</strong><span>${esc(b.a)}</span></div>`).join("");
  const connections = (p.connections || []).map((c) => `<div class="sheet-note"><strong>${esc(c.q)}</strong><span>${esc(c.note)}</span></div>`).join("");
  const left = `<div class="character-sheet-page">
    <div class="sheet-identity"><div class="sheet-portrait">${p.portrait ? `<img src="${esc(p.portrait)}" alt="">` : esc(p.name[0] || "?")}</div>
      <div><h1>${esc(p.name)}</h1><div>${esc(p.ancestry.name)} ${esc(p.class.name)} · ${esc(p.subclass.name)}</div>
      <div class="tome-muted">${esc(p.community.name)} · ${t("sheet.level")} ${p.level}${p.pronouns ? ` · ${esc(p.pronouns)}` : ""}</div></div></div>
    <div class="sheet-traits">${traits}</div>
    <h2>${t("sheet.exp")}</h2><div class="sheet-lines">${experiences}</div>
    ${background ? `<h2>${t("sheet.background")}</h2><div class="sheet-notes">${background}</div>` : ""}
    ${connections ? `<h2>${t("sheet.connections")}</h2><div class="sheet-notes">${connections}</div>` : ""}
  </div>`;
  const featureGroups = [
    p.features?.hopeFeature ? `<h2>${t("sheet.hopefeat")}</h2>${featureHtml(p.features.hopeFeature)}` : "",
    `<h2>${t("sheet.class")}</h2>${(p.features?.classFeatures || []).map(featureHtml).join("")}`,
    `<h2>${esc(p.subclass.name)}</h2>${(p.features?.foundation || []).map(featureHtml).join("")}`,
    `<div class="sheet-feature-columns"><div><h2>${esc(p.ancestry.name)}</h2>${(p.features?.ancestry || []).map(featureHtml).join("")}</div><div><h2>${esc(p.community.name)}</h2>${(p.features?.community || []).map(featureHtml).join("")}</div></div>`
  ].join("");
  const right = `<div class="character-sheet-page">
    <a class="switch-pc" data-switch>${t("journal.notyou")}</a>
    <div class="sheet-defenses"><div><strong>${p.evasion}</strong><span>${t("vital.evasion")}</span></div><div><strong>${p.armor?.score || 0}</strong><span>${t("vital.armor")}</span></div><div><strong>${p.thresholds.major}/${p.thresholds.severe}</strong><span>${t("arms.thresholds")}</span></div></div>
    <div class="sheet-vitals"><div><span>${t("vital.hp")}</span>${vitalPips("hp", p.hp, p.hpMax)}</div><div><span>${t("vital.stress")}</span>${vitalPips("stress", p.stress, p.stressMax)}</div><div><span>${t("vital.hope")}</span>${vitalPips("hope", p.hope, p.hopeMax)}</div>${p.armor ? `<div><span>${t("vital.armorslots")}</span>${vitalPips("armorMarked", p.armorMarked, p.armor.score)}</div>` : ""}</div>
    <div class="sheet-features">${featureGroups}</div>
  </div>`;
  return [{ key: `character:${p.id}`, left: { html: left, volatile: true, sheet: true }, right: { html: right, volatile: true, sheet: true } }];
}

function weaponHtml(label, weapon) {
  if (!weapon) return "";
  return `<article class="inventory-card"><div class="tome-muted">${esc(label)}</div><h3>${esc(weapon.name)}</h3>
    <div class="inventory-facts">${esc(weapon.trait)} · ${esc(weapon.range)} · ${esc(weapon.damage)} · ${esc(weapon.burden)}</div>
    ${weapon.feature ? `<p>${termify(esc(weapon.feature))}</p>` : ""}</article>`;
}

function carriedItemHtml(item) {
  if (item.kind === "paper") {
    const preview = item.paperType === "covenant" ? t("contract.decree") : item.body;
    return `<button class="inventory-card inventory-entry paper-entry" type="button" data-paper-open="${esc(item.id)}" aria-label="${esc(t("paper.open", { name: item.name }))}">
      <div class="inventory-facts">${t("inventory.paper")}</div>
      <h3>${esc(item.name)}</h3>${preview ? `<p>${esc(preview.slice(0, 150))}${preview.length > 150 ? "…" : ""}</p>` : ""}
    </button>`;
  }
  const description = lang === "sv" && item.descriptionSv ? item.descriptionSv : item.description;
  const kind = item.kind === "consumable" ? t("inventory.consumable") : t("inventory.item");
  return `<button class="inventory-card inventory-entry" type="button" data-inventory-edit="${esc(item.id)}" aria-label="${esc(t("inventory.editName", { name: item.name }))}">
    <div class="inventory-facts">${kind}${item.quantity > 1 ? ` · ${t("inventory.quantityShort", { n: item.quantity })}` : ""}</div>
    <h3>${esc(item.name)}</h3>${description ? `<p>${termify(esc(description))}</p>` : ""}${item.notes ? `<p class="inventory-note">${esc(item.notes)}</p>` : ""}
  </button>`;
}

function domainCardHtml(card) {
  return `<article class="inventory-card domain-item"><div class="tome-muted">${esc(card.location === "vault" ? "Vault" : "Loadout")} · ${esc(card.domain)} · ${esc(card.type)} · ${term("recall", "Recall")} ${card.recallCost}</div><h3>${esc(card.name)}</h3><p>${termify(esc(card.text))}</p></article>`;
}

function inventorySpreads() {
  if (characterOverride === "create") return characterSpreads();
  if (characterOverride === "picker" || !characterData) return [{ key: "inventory-picker", left: { html: pageHeading(t("table.inventory")), volatile: true }, right: { html: pickerHtml(), volatile: true } }];
  const p = characterData;
  const equipped = `${weaponHtml(t("sheet.primary"), p.weapons?.primary)}${weaponHtml(t("sheet.secondary"), p.weapons?.secondary)}${p.armor ? `<article class="inventory-card"><div class="tome-muted">${t("vital.armor")}</div><h3>${esc(p.armor.name)}</h3><div class="inventory-facts">${t("vital.armor")} ${p.armor.score} · ${t("arms.thresholds")} ${p.thresholds.major}/${p.thresholds.severe}</div>${p.armor.feature ? `<p>${termify(esc(p.armor.feature))}</p>` : ""}</article>` : ""}`;
  const carriedItems = p.inventory || [];
  const firstCarried = carriedItems.slice(0, 6).map(carriedItemHtml).join("") || `<p class="tome-empty">${t("inventory.empty")}</p>`;
  const spreads = [{
    key: `inventory:${p.id}:gear`,
    left: { html: `<h1 class="page-heading">${t("inventory.equipped")}</h1>${equipped}`, volatile: true },
    right: { html: `<div class="inventory-heading"><h1 class="page-heading">${t("inventory.pack")}</h1><button class="inventory-add" type="button" data-inventory-add>${t("inventory.add")}</button></div>${firstCarried}`, volatile: true }
  }];
  for (const [i, items] of chunks(carriedItems.slice(6), 8).entries()) {
    if (!items.length) break;
    spreads.push({
      key: `inventory:${p.id}:carried:${i}`,
      left: { html: `<h1 class="page-heading">${t("inventory.pack")}</h1>${items.slice(0, 4).map(carriedItemHtml).join("")}`, volatile: true },
      right: { html: `<div class="page-continuation">${items.slice(4).map(carriedItemHtml).join("")}</div>`, volatile: true }
    });
  }
  for (const [i, cards] of chunks(p.domainCards || [], 4).entries()) {
    if (!cards.length) break;
    const midpoint = Math.ceil(cards.length / 2);
    spreads.push({
      key: `inventory:${p.id}:cards:${i}`,
      left: { html: `<h1 class="page-heading">${t("inventory.cards")}</h1>${cards.slice(0, midpoint).map(domainCardHtml).join("")}`, volatile: true },
      right: { html: `<div class="page-continuation">${cards.slice(midpoint).map(domainCardHtml).join("")}</div>`, volatile: true }
    });
  }
  return spreads;
}

function journalSpreads() {
  const pc = getPC();
  return [{ key: `journal:${pc || ""}`, left: { html: `${pageHeading(t("journal.title"))}<p class="chapter-copy">${t("journal.sub")}</p>` }, right: { key: `journal:${pc || ""}`, embed: true, html: `<iframe title="${esc(t("journal.title"))}" src="/journal/?embed=1${pc ? `&pc=${encodeURIComponent(pc)}` : ""}"></iframe>` } }];
}

function rulesSpreads() {
  const left = `<div class="tome-rules-plate">${pageHeading(t("rules.title"), t("rules.kicker"))}
    <div class="tome-rules-knot" aria-hidden="true"><i></i><i></i><i></i></div>
    <div class="tome-rules-index"><span>At the Table</span><span>Combat</span><span>Recovery</span><span>Gear</span></div>
    <a class="tome-rules-external" href="/rules/">${esc(t("rules.openStandalone"))} <span aria-hidden="true">&#8599;</span></a>
  </div>`;
  return [{
    key: "rules",
    left: { html: left },
    right: { key: "rules", embed: true, html: `<iframe title="${esc(t("rules.title"))}" src="/rules/?embed=1"></iframe>` }
  }];
}

function spreadsFor(section = SECTION_ORDER[selectedIndex]) {
  if (section.key === "town") return townSpreads();
  if (section.key === "folk") return folkSpreads();
  if (section.key === "chronicle") return chronicleSpreads();
  if (section.key === "journal") return journalSpreads();
  if (section.key === "character") return characterSpreads();
  if (section.key === "inventory") return inventorySpreads();
  return rulesSpreads();
}

function renderSide(side, descriptor, force) {
  const root = $(`#${side}-content`);
  root.classList.toggle("embed", !!descriptor.embed);
  root.classList.toggle("sheet-page-content", !!descriptor.sheet);
  const key = descriptor.key || `${SECTION_ORDER[selectedIndex].key}:${spreadIndex}:${side}`;
  if (force || descriptor.volatile || sideKeys[side] !== key) {
    root.innerHTML = descriptor.html;
    sideKeys[side] = key;
  }
}

function pageStartNumber() {
  let pages = 1;
  for (let i = 0; i < selectedIndex; i += 1) pages += spreadsFor(SECTION_ORDER[i]).length * 2;
  return pages + spreadIndex * 2;
}

function renderSpread(force = false) {
  if (!data) return;
  document.body.dataset.tomeSection = SECTION_ORDER[selectedIndex].key;
  setTelemetryMode(`${SECTION_ORDER[selectedIndex].key}:spread-${spreadIndex + 1}`);
  const spreads = spreadsFor();
  spreadIndex = Math.min(spreadIndex, spreads.length - 1);
  const spread = spreads[spreadIndex];
  renderSide("left", spread.left, force);
  renderSide("right", spread.right, force);
  const firstPage = pageStartNumber();
  $("#left-number").textContent = String(firstPage);
  $("#right-number").textContent = String(firstPage + 1);
  $("#spread-prev").hidden = spreadIndex === 0;
  $("#spread-next").hidden = spreadIndex >= spreads.length - 1;
  $("#spread-prev").setAttribute("aria-label", t("table.book.previous"));
  $("#spread-next").setAttribute("aria-label", t("table.book.next"));
  wirePageActions();
  fitCharacterPages();
}

function fitCharacterPages() {
  requestAnimationFrame(() => {
    for (const root of document.querySelectorAll(".paper-scroll.sheet-page-content")) {
      const page = root.querySelector(".character-sheet-page");
      if (!page) continue;
      page.style.zoom = "";
      const scale = Math.min(1, (root.clientHeight - 2) / Math.max(1, page.scrollHeight));
      page.style.zoom = String(scale);
    }
  });
}

function renderCover() {
  if (!data) return;
  if (!bookOpen) setTelemetryMode("closed");
  $("#cover-title").textContent = data.settlement.name;
  $("#front-cover").setAttribute("aria-label", t("table.book.open"));
}

function renderKeepsakes() {
  if (!data) return;
  const nav = $("#keepsakes");
  nav.innerHTML = SECTION_ORDER.map((section, index) => {
    const style = KEEPSAKES[section.keepsake] || KEEPSAKES.ribbon;
    const active = bookOpen && index === selectedIndex;
    return `<button type="button" class="keepsake ks-${section.keepsake}${active ? " active" : ""}" data-index="${index}" style="--tab:${section.tab}; --sway:${section.sway}" ${active ? `aria-current="page"` : ""} aria-label="${esc(t(section.title))}"><span class="keepsake-emblem" aria-hidden="true">${style.art}</span><span class="keepsake-label">${esc(t(section.title))}</span></button>`;
  }).join("");
  for (const button of nav.querySelectorAll("[data-index]")) button.onclick = () => chooseSection(Number(button.dataset.index));
}

async function loadCharacter() {
  const identity = myIdentity();
  if (!identity || characterOverride === "picker") { characterData = null; return; }
  const response = await fetch(`/api/party/${encodeURIComponent(identity.id)}`);
  characterData = response.ok ? await response.json() : null;
}

function closeConditionPopover() {
  $("#condition-popover").hidden = true;
  delete $("#condition-popover").dataset.condition;
}

function openConditionPopover(id) {
  const condition = CONDITIONS.find((entry) => entry.id === id);
  if (!condition) return;
  $("#condition-popover-mark").innerHTML = conditionIcon(id);
  $("#condition-popover-title").textContent = condition.name;
  $("#condition-popover-copy").textContent = t(`condition.${id}.description`);
  $("#condition-popover").dataset.condition = id;
  $("#condition-popover").hidden = false;
}

function renderPlayerDock() {
  const dock = $("#player-dock");
  if (!characterData) {
    dock.hidden = true;
    closeConditionPopover();
    return;
  }
  dock.hidden = false;
  dock.setAttribute("aria-label", `${t("session.pool")}; ${t("conditions.label")}; ${t("messages.open")}`);
  $("#session-pools").innerHTML = sessionPoolsHtml(data, { pcId: characterData.id });
  const active = new Set(characterData.conditions || []);
  const shown = $("#condition-popover").dataset.condition;
  if (shown && !active.has(shown)) closeConditionPopover();
  const tokens = CONDITIONS.filter(({ id }) => active.has(id)).map((condition) =>
    `<button class="condition-token" type="button" data-status="${condition.id}" aria-label="${condition.name}" title="${condition.name}">${conditionIcon(condition.id)}<span>${condition.name}</span></button>`
  ).join("");
  $("#condition-bar").innerHTML = `<span class="condition-bar-label">${esc(t("conditions.label"))}</span>${tokens || `<span class="condition-none">${esc(t("conditions.none"))}</span>`}`;
  for (const button of document.querySelectorAll("[data-status]")) button.onclick = () => openConditionPopover(button.dataset.status);
}

const localizedItemDescription = (item) => lang === "sv" && item.descriptionSv ? item.descriptionSv : item.description;

function inventoryArt(icon = "satchel") {
  const art = {
    potion: `<path d="M9 3h6M10 3v4l-4 5.5V18c0 2 1.6 3 6 3s6-1 6-3v-5.5L14 7V3"/><path class="liquid" d="M7 14h10v4c0 1.2-1.7 1.8-5 1.8S7 19.2 7 18z"/><path d="M8.4 11h7.2"/>`,
    herb: `<path d="M12 21c-1-7 1-13 7-17-1 8-3 13-7 17z"/><path d="M12 21C9 13 6 9 3 7c0 7 3 12 9 14z"/><path d="M12 21V9"/>`,
    shard: `<path d="M12 2l6 7-3 12-7-3-2-9z"/><path d="M12 2l-1 10 4 9M6 9l5 3 7-3"/>`,
    satchel: `<path d="M7 8h10l2 13H5z"/><path d="M9 8V6a3 3 0 016 0v2M5.7 13h12.6"/>`
  };
  return `<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">${art[icon] || art.satchel}</svg>`;
}

async function inventoryRequest(path, options = {}) {
  const response = await fetch(path, { headers: { "Content-Type": "application/json" }, ...options, body: options.body ? JSON.stringify(options.body) : undefined });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || t("inventory.error"));
  return result;
}

function closeInventoryDialog() {
  $("#inventory-dialog").hidden = true;
  editingItem = null;
}

function useFields(reaction) {
  if (!reaction) return `<p>${t("inventory.consumeConfirm")}</p>`;
  if (["clear", "sun-tree", "feast"].includes(reaction.kind)) return `<label>${t("inventory.dieResult", { die: `d${reaction.die}` })}<input id="inventory-roll" type="number" min="1" max="${reaction.die}" inputmode="numeric"></label>`;
  if (reaction.kind === "choose-clear") return `<label>${t("inventory.clearWhat")}<select id="inventory-choice"><option value="hp">HP</option><option value="stress">Stress</option></select></label><label>${t("inventory.dieResult", { die: `d${reaction.die}` })}<input id="inventory-roll" type="number" min="1" max="${reaction.die}" inputmode="numeric"></label>`;
  if (reaction.kind === "spend-clear") return `<label>${t("inventory.hopeSpend")}<input id="inventory-spend" type="number" min="1" max="${Math.min(characterData.hope || 0, characterData.armorMarked || 0)}" inputmode="numeric"></label>`;
  return `<p>${t("inventory.consumeConfirm")}</p>`;
}

function effectHtml(effect) {
  const lines = effect.changes.map((entry) => {
    const target = entry.target === "armorMarked" ? t("vital.armorslots") : entry.target.toUpperCase();
    if (!entry.amount) return t("inventory.noChange", { target });
    return entry.mode === "clear" || entry.mode === "spend"
      ? t("inventory.cleared", { n: entry.amount, target })
      : t("inventory.gained", { n: entry.amount, target });
  });
  if (effect.note === "scar") lines.push(t("inventory.scar"));
  if (!lines.length) lines.push(t("inventory.consumed"));
  return `${effect.roll ? `<div class="use-roll">${effect.roll}</div>` : ""}<p>${lines.map(esc).join("<br>")}</p><p class="tome-muted">${t("inventory.remaining", { n: effect.remaining })}</p>`;
}

function openInventoryDialog(item = null, editPaper = false) {
  editingItem = item;
  const dialog = document.querySelector(".inventory-dialog");
  dialog.classList.toggle("is-paper", item?.kind === "paper" && !editPaper);
  if (item?.kind === "paper" && !editPaper) {
    const mayEdit = item.paperType !== "covenant" && item.author === characterData.name;
    $("#inventory-dialog-body").innerHTML = `${paperArtifactHtml(item, { id: "inventory-dialog-title" })}
      ${item.paperType !== "covenant" ? `<div class="inventory-dialog-actions paper-actions">${mayEdit ? `<button type="button" id="paper-edit">${t("inventory.editPaper")}</button>` : ""}<button type="button" class="quiet grave" id="inventory-remove">${t("inventory.remove")}</button></div>` : ""}`;
    $("#inventory-dialog").hidden = false;
    if ($("#paper-edit")) $("#paper-edit").onclick = () => openInventoryDialog(item, true);
    if ($("#inventory-remove")) $("#inventory-remove").onclick = removeInventoryItem;
    return;
  }
  const catalog = !!item?.catalogId;
  const description = item ? localizedItemDescription(item) : "";
  const kind = item?.kind || "mundane";
  $("#inventory-dialog-body").innerHTML = `<div class="inventory-dialog-grid">
    <div class="inventory-art ${kind === "consumable" ? "is-consumable" : ""}" id="inventory-art">${inventoryArt(item?.icon)}</div>
    <div>
      <div class="inventory-facts">${item ? (kind === "consumable" ? t("inventory.consumable") : kind === "paper" ? t("inventory.paper") : t("inventory.item")) : t("inventory.new")}</div>
      <h2 id="inventory-dialog-title">${esc(item?.name || t("inventory.new"))}</h2>
      ${catalog ? `<p class="inventory-rules">${termify(esc(description))}</p>` : ""}
    </div>
  </div>
  <div class="inventory-form">
    ${catalog ? `<label>${t("inventory.notes")}<textarea id="inventory-notes" rows="2">${esc(item.notes || "")}</textarea></label>` : `<label>${t("inventory.kind")}<select id="inventory-kind"><option value="mundane" ${kind === "mundane" ? "selected" : ""}>${t("inventory.item")}</option><option value="consumable" ${kind === "consumable" ? "selected" : ""}>${t("inventory.consumable")}</option><option value="paper" ${kind === "paper" ? "selected" : ""}>${t("inventory.paper")}</option></select></label><label>${t("inventory.name")}<input id="inventory-name" value="${esc(item?.name || "")}"></label><label id="inventory-copy-label">${kind === "paper" ? t("inventory.paperBody") : t("inventory.description")}<textarea id="inventory-description" rows="5">${esc(kind === "paper" ? (item?.body || "") : (item?.description || ""))}</textarea></label>`}
    <label id="inventory-quantity-label" ${kind === "paper" ? "hidden" : ""}>${t("inventory.quantity")}<input id="inventory-quantity" type="number" min="1" max="${kind === "consumable" ? 5 : 99}" value="${item?.quantity || 1}"></label>
  </div>
  <div class="inventory-use-panel" id="inventory-use-panel" hidden></div>
  <div class="inventory-result" id="inventory-result" hidden></div>
  <div class="inventory-dialog-actions" id="inventory-dialog-actions"><button type="button" id="inventory-save">${t("inventory.save")}</button>${item?.kind === "consumable" ? `<button type="button" class="consume" id="inventory-consume">${t("inventory.consume")}</button>` : ""}${item ? `<button type="button" class="quiet grave" id="inventory-remove">${t("inventory.remove")}</button>` : ""}</div>`;
  $("#inventory-dialog").hidden = false;
  if ($("#inventory-kind")) $("#inventory-kind").onchange = syncInventoryKind;
  $("#inventory-save").onclick = saveInventoryItem;
  if ($("#inventory-remove")) $("#inventory-remove").onclick = removeInventoryItem;
  if ($("#inventory-consume")) $("#inventory-consume").onclick = prepareInventoryUse;
}

function syncInventoryKind() {
  const paper = $("#inventory-kind").value === "paper";
  $("#inventory-copy-label").firstChild.textContent = paper ? t("inventory.paperBody") : t("inventory.description");
  $("#inventory-quantity-label").hidden = paper;
}

async function saveInventoryItem() {
  const kind = $("#inventory-kind")?.value;
  const body = editingItem?.catalogId
    ? { notes: $("#inventory-notes").value, quantity: Number($("#inventory-quantity").value) }
    : { kind, name: $("#inventory-name").value, ...(kind === "paper" ? { body: $("#inventory-description").value } : { description: $("#inventory-description").value }), quantity: Number($("#inventory-quantity")?.value || 1) };
  try {
    characterData = await inventoryRequest(`/api/party/${encodeURIComponent(characterData.id)}/inventory${editingItem ? `/${encodeURIComponent(editingItem.id)}` : ""}`, { method: editingItem ? "PUT" : "POST", body });
    renderSpread(true);
    closeInventoryDialog();
  } catch (error) { $("#inventory-result").hidden = false; $("#inventory-result").textContent = error.message; }
}

async function removeInventoryItem() {
  if (!confirm(t("inventory.removeConfirm", { name: editingItem.name }))) return;
  try {
    characterData = await inventoryRequest(`/api/party/${encodeURIComponent(characterData.id)}/inventory/${encodeURIComponent(editingItem.id)}`, { method: "DELETE" });
    spreadIndex = Math.min(spreadIndex, inventorySpreads().length - 1);
    renderSpread(true);
    closeInventoryDialog();
  } catch (error) { $("#inventory-result").hidden = false; $("#inventory-result").textContent = error.message; }
}

function prepareInventoryUse() {
  const panel = $("#inventory-use-panel");
  panel.innerHTML = `<h3>${t("inventory.useTitle", { name: editingItem.name })}</h3>${useFields(editingItem.reaction)}<button type="button" class="consume" id="inventory-use-confirm">${t("inventory.confirmUse")}</button>`;
  panel.hidden = false;
  $("#inventory-use-confirm").onclick = useInventoryItem;
}

async function useInventoryItem() {
  const body = { roll: $("#inventory-roll")?.value, choice: $("#inventory-choice")?.value, spend: $("#inventory-spend")?.value };
  try {
    const result = await inventoryRequest(`/api/party/${encodeURIComponent(characterData.id)}/inventory/${encodeURIComponent(editingItem.id)}/use`, { method: "POST", body });
    $("#inventory-art").classList.add("is-using");
    $("#inventory-use-panel").hidden = true;
    $("#inventory-dialog-actions").hidden = true;
    const output = $("#inventory-result");
    output.innerHTML = effectHtml(result.effect);
    output.hidden = false;
    characterData = result.pc;
    setTimeout(() => {
      $("#inventory-art").classList.add("is-used");
      renderSpread(true);
      renderPlayerDock();
    }, 450);
  } catch (error) { $("#inventory-result").hidden = false; $("#inventory-result").textContent = error.message; }
}

function wirePageActions() {
  for (const button of document.querySelectorAll("[data-pick]")) {
    button.onclick = async () => {
      setPC(button.dataset.pick);
      characterOverride = null;
      await loadCharacter();
      renderPlayerDock();
      sideKeys = { left: null, right: null };
      renderSpread(true);
    };
  }
  for (const create of document.querySelectorAll("[data-create]")) create.onclick = () => {
    characterOverride = "create";
    sideKeys = { left: null, right: null };
    renderSpread(true);
  };
  for (const switcher of document.querySelectorAll("[data-switch]")) switcher.onclick = () => {
    characterOverride = "picker";
    characterData = null;
    sideKeys = { left: null, right: null };
    renderSpread(true);
  };
  for (const pip of document.querySelectorAll("[data-vital]")) pip.onclick = async () => {
    const kind = pip.dataset.vital;
    const index = Number(pip.dataset.index);
    const next = index + 1 === characterData[kind] ? index : index + 1;
    characterData[kind] = next;
    renderSpread(true);
    await fetch(`/api/party/${encodeURIComponent(characterData.id)}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ [kind]: next }) });
  };
  for (const button of document.querySelectorAll("[data-inventory-edit]")) button.onclick = () => openInventoryDialog(characterData.inventory.find((item) => item.id === button.dataset.inventoryEdit));
  for (const button of document.querySelectorAll("[data-paper-open]")) button.onclick = () => openInventoryDialog(characterData.inventory.find((item) => item.id === button.dataset.paperOpen));
  for (const button of document.querySelectorAll("[data-inventory-add]")) button.onclick = () => openInventoryDialog();
}

function chooseSection(nextIndex) {
  if (turning || nextIndex < 0 || nextIndex >= SECTION_ORDER.length) return;
  characterOverride = null;
  if (!bookOpen) {
    selectedIndex = nextIndex;
    spreadIndex = 0;
    sideKeys = { left: null, right: null };
    renderSpread(true);
    openBook();
    return;
  }
  if (nextIndex === selectedIndex) return;
  turnTo(nextIndex, 0, nextIndex > selectedIndex ? "forward" : "backward");
}

function chooseSpread(nextIndex) {
  const total = spreadsFor().length;
  if (turning || nextIndex < 0 || nextIndex >= total || nextIndex === spreadIndex) return;
  turnTo(selectedIndex, nextIndex, nextIndex > spreadIndex ? "forward" : "backward");
}

function resetMobilePagePosition() {
  if (window.innerWidth > 760) return;
  requestAnimationFrame(() => { $("#tome-viewport").scrollTop = 0; });
}

function openBook() {
  if (bookOpen || !data) return;
  bookOpen = true;
  $("#tome").classList.add("open");
  $("#tome").dataset.state = "open";
  document.body.classList.add("tome-open");
  renderKeepsakes();
  layoutBook();
  resetMobilePagePosition();
}

function closeBook() {
  if (!bookOpen || turning) return;
  bookOpen = false;
  $("#tome").classList.remove("open");
  $("#tome").dataset.state = "closed";
  document.body.classList.remove("tome-open");
  renderKeepsakes();
  layoutBook();
}

function finishTurn() {
  clearTimeout(turnFallback);
  const sheet = $("#turn-sheet");
  sheet.hidden = true;
  sheet.className = "turn-sheet";
  turning = false;
}

function turnTo(nextSection, nextSpread, direction) {
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  selectedIndex = nextSection;
  spreadIndex = nextSpread;
  sideKeys = { left: null, right: null };
  renderSpread(true);
  renderKeepsakes();
  resetMobilePagePosition();
  if (reduced) return;
  turning = true;
  const sheet = $("#turn-sheet");
  sheet.hidden = false;
  sheet.className = `turn-sheet ${direction}`;
  sheet.addEventListener("animationend", finishTurn, { once: true });
  turnFallback = setTimeout(finishTurn, 950);
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
  // Keepsakes now hang from the top edge, so the spread no longer needs side
  // room; instead reserve a little headroom above for the tab row.
  const widthScale = (window.innerWidth - (compact ? 12 : 30)) / 1290;
  const heightScale = (window.innerHeight - (compact ? 96 : 120)) / 726;
  const closedObjectScale = (window.innerWidth - 8) / 780;
  const scale = compact ? Math.min(0.66, heightScale, closedObjectScale) : Math.min(1, widthScale, heightScale);
  const scaler = $("#tome-scale");
  if (compact && bookOpen) {
    scaler.style.zoom = "";
    scaler.style.transform = "none";
    scaler.style.position = "";
    scaler.style.left = "";
    scaler.dataset.scale = "1";
    return;
  }
  // On narrow screens zoom participates in layout; a transform would leave
  // the 1240px unscaled box centred far off-screen and make panning mostly
  // empty room. Desktop keeps the smoother transform animation.
  scaler.style.zoom = compact ? String(scale) : "";
  scaler.style.transform = compact ? "none" : `scale(${scale})`;
  scaler.style.position = compact ? "relative" : "";
  scaler.style.left = compact ? `${Math.max(0, (1240 * scale - window.innerWidth) / 2)}px` : "";
  scaler.dataset.scale = String(scale);
  centerBookSoon();
}

function centerBookSoon() {
  requestAnimationFrame(() => {
    if (window.innerWidth > 760 || bookOpen) return;
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
  if (!response.ok) throw new Error(t("error.table"));
  data = await response.json();
  await loadCharacter();
  await playerChat.refresh();
  renderPlayerDock();
  renderCover();
  renderKeepsakes();
  if (openOnArrival && !bookOpen) {
    openOnArrival = false;
    document.body.classList.add("hub-entry");
    renderSpread(true);
    openBook();
  } else if (bookOpen) renderSpread();
}

$("#front-cover").onclick = () => {
  if (!data) return;
  renderSpread(true);
  openBook();
};
$("#close-tome").onclick = closeBook;
$("#spread-prev").onclick = () => chooseSpread(spreadIndex - 1);
$("#spread-next").onclick = () => chooseSpread(spreadIndex + 1);

window.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && !$("#inventory-dialog").hidden) {
    closeInventoryDialog();
    return;
  }
  if (event.key === "Escape" && !$("#condition-popover").hidden) {
    closeConditionPopover();
    return;
  }
  if (!bookOpen || turning || ["INPUT", "TEXTAREA", "SELECT"].includes(document.activeElement?.tagName)) return;
  if (event.key === "Escape") closeBook();
  if (event.key === "ArrowRight") {
    if (spreadIndex < spreadsFor().length - 1) chooseSpread(spreadIndex + 1);
    else if (selectedIndex < SECTION_ORDER.length - 1) chooseSection(selectedIndex + 1);
  }
  if (event.key === "ArrowLeft") {
    if (spreadIndex > 0) chooseSpread(spreadIndex - 1);
    else if (selectedIndex > 0) chooseSection(selectedIndex - 1);
  }
});

window.addEventListener("storage", async (event) => {
  if (event.key !== "settlement-pc") return;
  characterOverride = null;
  spreadIndex = 0;
  sideKeys = { left: null, right: null };
  await loadCharacter();
  await playerChat.refresh();
  renderPlayerDock();
  renderKeepsakes();
  if (bookOpen && ["character", "inventory"].includes(SECTION_ORDER[selectedIndex].key)) renderSpread(true);
});

$("#condition-popover-close").onclick = closeConditionPopover;
$("#inventory-dialog-close").onclick = closeInventoryDialog;
document.addEventListener("pointerdown", (event) => {
  if ($("#condition-popover").hidden || event.target.closest("#condition-popover") || event.target.closest("[data-status]")) return;
  closeConditionPopover();
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
