// Player table view. Read-only. Data arrives already whitelisted by the server.
//
// Navigation: the sections are a row of big cards, sized so the row always
// fills the width (a new card compresses the others). Opening one slides the
// whole deck into a stack at the left — selection on top — and the card's
// contents take the rest of the row. Pressing the stack puts the deck back.
import { t, term, initI18n, seasonLabel, TERMS } from "/shared/i18n.js";
import { sessionPoolsHtml } from "/shared/session-pools.js";
import { setTelemetryMode } from "/shared/telemetry.js";
import "/shared/feedback.js";

const $ = (sel) => document.querySelector(sel);
const esc = (s) =>
  String(s ?? "").replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

const TRAITS = ["Agility", "Strength", "Finesse", "Instinct", "Presence", "Knowledge"];

let data = null;
let selected = null; // key of the open card, or null for the horizontal row
let panelKey = null; // what the panel currently holds (embeds must not be re-rendered)
let panelOverride = null; // character card: "picker" | "create" forced views

// One identity per device, shared with the journal and the creator.
const getPC = () =>
  localStorage.getItem("settlement-pc") || localStorage.getItem("settlement-journal-pc");
const setPC = (id) => localStorage.setItem("settlement-pc", id);
const myPC = () => {
  const id = getPC();
  return (id && data?.party?.find((p) => p.id === id)) || null;
};

const SECTIONS = {
  town: {
    count: (d) => d.buildings.length,
    render: (d) =>
      d.buildings.length
        ? `<div class="grid">${d.buildings
            .map(
              (b) => `<div class="card">
                <strong>${esc(b.name)}</strong>
                <div class="muted" style="font-size:0.9rem;">${esc(b.resource)} · ${term("building-level", t("table.level"))} ${b.level}</div>
                <div style="font-size:0.95rem;">${b.foreman ? term("foreman", esc(b.foreman)) : `<span class="muted">${t("table.noforeman")}</span>`}</div>
              </div>`
            )
            .join("")}</div>`
        : `<p class="empty">${t("table.nobuildings")}</p>`
  },
  folk: {
    count: (d) => d.characters.length,
    render: (d) =>
      d.characters.length
        ? `<div class="grid">${d.characters
            .map((c) => {
              const traits = c.traits
                ? `<div class="traits">${TRAITS.map(
                    (tr) => `<span class="pill term" data-term="trait-${tr.toLowerCase()}">${tr.slice(0, 3)} ${c.traits[tr] >= 0 ? "+" : ""}${c.traits[tr] ?? 0}</span>`
                  ).join("")}</div>`
                : "";
              const gone = c.status !== "alive";
              return `<div class="card" style="${gone ? "opacity:0.55;" : ""}">
                <div class="folk-head">
                  <div class="portrait">${c.portrait ? `<img src="${esc(c.portrait)}" alt="">` : esc(c.name[0] || "?")}</div>
                  <div>
                    <strong>${esc(c.name)}</strong>${gone ? ` <span class="pill">${esc(c.status)}</span>` : ""}
                    <div class="muted" style="font-size:0.85rem;">${esc(c.role || "")}</div>
                  </div>
                </div>
                <p style="font-size:0.92rem;">${esc(c.description || "")}</p>
                ${traits}
              </div>`;
            })
            .join("")}</div>`
        : `<p class="empty">${t("table.nofolk")}</p>`
  },
  chronicle: {
    count: (d) => d.chronicle.length,
    render: (d) =>
      d.chronicle.length
        ? `<div class="chronicle">${d.chronicle
            .map(
              (e) => `<div class="entry"><div class="season">${esc(seasonLabel(e.season))}</div><div>${esc(e.text)}</div></div>`
            )
            .join("")}</div>`
        : `<p class="empty">${t("table.nochronicle")}</p>`
  },
  rules: {
    count: () => "§",
    render: () => ""
  }
};

// --- the embedded panels (journal, character) ---

function pickerHtml() {
  return `<div class="who">
    <div class="smallcaps" style="text-align:center; font-size:1rem;">${t("table.whoareyou")}</div>
    ${(data.party || [])
      .map(
        (p) => `<button data-pick="${p.id}">${esc(p.name)}${p.player ? ` <span style="opacity:0.7; font-size:0.85rem;">· ${esc(p.player)}</span>` : ""}</button>`
      )
      .join("")}
    <button class="quiet cross" data-create>${t("create.title")} →</button>
  </div>`;
}

// What the panel should hold right now. Embeds carry a stable key so live
// refreshes never reload their iframes mid-use.
function desiredPanel() {
  if (selected === null) return null;
  if (selected === "journal") {
    const pc = getPC();
    return {
      key: `journal:${pc || ""}`,
      html: `<iframe src="/journal/?embed=1${pc ? `&pc=${encodeURIComponent(pc)}` : ""}"></iframe>`
    };
  }
  if (selected === "character") {
    if (panelOverride === "create")
      return { key: "create", html: `<iframe src="/create/"></iframe>` };
    const pc = panelOverride === "picker" ? null : myPC();
    if (pc)
      return {
        key: `char:${pc.id}`,
        html: `<a class="switch-pc" data-switch>${t("journal.notyou")}</a><iframe src="/character/${encodeURIComponent(pc.id)}"></iframe>`
      };
    return { key: "picker", html: pickerHtml() };
  }
  if (selected === "rules") {
    return {
      key: "rules",
      html: `<iframe title="${esc(t("rules.title"))}" src="/rules/?embed=1"></iframe>`
    };
  }
  return { key: `${selected}`, html: SECTIONS[selected].render(data), volatile: true };
}

function updatePanel() {
  const want = desiredPanel();
  const body = $("#panel-body");
  if (!want) {
    $("#panel").hidden = true;
    panelKey = null;
    return;
  }
  $("#panel").hidden = false;
  if (!want.volatile && want.key === panelKey) return;
  body.innerHTML = want.html;
  panelKey = want.key;
  for (const b of body.querySelectorAll("[data-pick]")) {
    b.onclick = () => { setPC(b.dataset.pick); panelOverride = null; renderFaces(); updatePanel(); };
  }
  const create = body.querySelector("[data-create]");
  if (create) create.onclick = () => { panelOverride = "create"; updatePanel(); };
  const sw = body.querySelector("[data-switch]");
  if (sw) sw.onclick = () => { panelOverride = "picker"; updatePanel(); };
}

// The creator or the journal (inside their iframes) may claim the identity;
// storage events reach us here without reloading anything.
window.addEventListener("storage", (e) => {
  if (e.key !== "settlement-pc") return;
  renderFaces();
  if (panelOverride === "create" && getPC()) {
    // The creator already sent its iframe on to the new sheet — keep it.
    panelOverride = null;
    panelKey = `char:${getPC()}`;
    return;
  }
  updatePanel();
});

// --- deck geometry ---

function layoutDeck() {
  const area = $("#deck-area");
  const deck = $("#deck");
  const cards = [...deck.querySelectorAll(".big-card")];
  const n = cards.length;
  const docked = selected !== null;
  const narrow = window.innerWidth < 640; // players' phones
  area.classList.toggle("docked", docked);
  area.classList.toggle("stacked", docked && narrow);
  deck.classList.toggle("banners", !docked && narrow);

  if (!docked) {
    deck.style.width = "100%";
    if (narrow) {
      // A column of banners instead of a row of tall cards.
      const h = 64, gap = 10;
      const w = deck.clientWidth;
      deck.style.height = `${n * h + (n - 1) * gap}px`;
      cards.forEach((el, i) => {
        el.style.width = `${w}px`;
        el.style.height = `${h}px`;
        el.style.transform = `translate(0px, ${i * (h + gap)}px)`;
        el.style.zIndex = 1;
        el.classList.remove("on-top");
        el.setAttribute("aria-expanded", "false");
      });
      return;
    }
    const gap = 18;
    const w = Math.floor((deck.clientWidth - gap * (n - 1)) / n);
    const h = Math.round(Math.max(240, Math.min(440, window.innerHeight * 0.46)));
    deck.style.height = `${h}px`;
    cards.forEach((el, i) => {
      el.style.width = `${w}px`;
      el.style.height = `${h}px`;
      el.style.transform = `translate(${i * (w + gap)}px, 0)`;
      el.style.zIndex = 1;
      el.classList.remove("on-top");
      el.setAttribute("aria-expanded", "false");
    });
  } else {
    // The landing zone: every card in one stack, the open one on top,
    // the rest peeking out beneath it. On phones the stack shrinks and
    // sits above the panel instead of beside it.
    const w = narrow ? 150 : 190, h = narrow ? 92 : 150, step = narrow ? 8 : 12;
    deck.style.width = `${w + step * (n - 1)}px`;
    deck.style.height = `${h + step * (n - 1)}px`;
    let behind = 1;
    cards.forEach((el) => {
      const isOpen = el.dataset.card === selected;
      const depth = isOpen ? 0 : behind++;
      el.style.width = `${w}px`;
      el.style.height = `${h}px`;
      el.style.transform = `translate(${depth * step}px, ${depth * step}px)`;
      el.style.zIndex = String(10 + n - depth);
      el.classList.toggle("on-top", isOpen);
      el.setAttribute("aria-expanded", String(isOpen));
    });
  }
}

function openCard(key) {
  selected = key;
  setTelemetryMode(key);
  panelOverride = null;
  panelKey = null;
  updatePanel();
  layoutDeck();
}

function closePanel() {
  selected = null;
  setTelemetryMode("deck");
  panelOverride = null;
  updatePanel();
  layoutDeck();
}

for (const el of document.querySelectorAll(".big-card")) {
  el.addEventListener("click", () => {
    if (selected === null) openCard(el.dataset.card);
    else closePanel(); // pressing the stack returns to the row
  });
}

// The masthead is the banner home: pressing the town's name always returns
// to the card row, no matter which card is open.
$("#t-name").addEventListener("click", () => { if (selected !== null) closePanel(); });
$("#t-name").addEventListener("keydown", (e) => {
  if ((e.key === "Enter" || e.key === " ") && selected !== null) { e.preventDefault(); closePanel(); }
});

let resizeRaf = null;
window.addEventListener("resize", () => {
  cancelAnimationFrame(resizeRaf);
  resizeRaf = requestAnimationFrame(layoutDeck);
});

// --- data ---

async function render() {
  data = await (await fetch("/api/table")).json();
  setTelemetryMode(selected || "deck");

  $("#t-name").textContent = data.settlement.name;
  $("#t-season").innerHTML = `<span class="term" data-term="season">${esc(seasonLabel(data.settlement.seasonLabel))}</span> · ${t("table.folkcount", { n: data.settlement.population })}`;

  $("#t-stats").innerHTML = Object.entries(data.resources)
    .map(([name, v]) => {
      const key = `res-${name.toLowerCase()}`;
      const label = TERMS[key] ? term(key, esc(name)) : esc(name);
      return `<div class="stat"><div class="value">${v}</div><div class="smallcaps">${label}</div></div>`;
    })
    .join("");
  $("#session-pools").innerHTML = sessionPoolsHtml(data);

  renderFaces();
  updatePanel();
  layoutDeck();
}

function renderFaces() {
  if (!data) return;
  for (const [key, sec] of Object.entries(SECTIONS)) {
    const el = $(`#count-${key}`);
    if (el) el.textContent = sec.count(data);
  }
  const pc = myPC();
  $("#count-character").textContent = pc ? pc.name[0].toUpperCase() : "?";
  $("#sub-character").textContent = pc ? pc.name : t("table.whoareyou");
}

initI18n();

// Live updates: re-render whenever the GM changes anything.
const stream = new EventSource("/api/stream");
stream.onmessage = () => render();

render().then(() => {
  // First paint lands the cards without a slide; every change after animates.
  requestAnimationFrame(() => $("#deck").classList.remove("no-anim"));
});
