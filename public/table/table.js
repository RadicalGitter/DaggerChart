// Player table view. Read-only. Data arrives already whitelisted by the server.
//
// Navigation: the sections are a row of big cards, sized so the row always
// fills the width (a new card compresses the others). Opening one slides the
// whole deck into a stack at the left — selection on top — and the card's
// contents take the rest of the row. Pressing the stack puts the deck back.
import { t, term, initI18n, seasonLabel, TERMS } from "/shared/i18n.js";

const $ = (sel) => document.querySelector(sel);
const esc = (s) =>
  String(s ?? "").replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

const TRAITS = ["Agility", "Strength", "Finesse", "Instinct", "Presence", "Knowledge"];

let data = null;
let selected = null; // key of the open card, or null for the horizontal row

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
  }
};

// --- deck geometry ---

function layoutDeck() {
  const area = $("#deck-area");
  const deck = $("#deck");
  const cards = [...deck.querySelectorAll(".big-card")];
  const n = cards.length;
  const docked = selected !== null;
  area.classList.toggle("docked", docked);

  if (!docked) {
    const gap = 18;
    deck.style.width = "100%";
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
    // the rest peeking out beneath it.
    const w = 190, h = 150, step = 12;
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
  $("#panel-body").innerHTML = SECTIONS[key].render(data);
  $("#panel").hidden = false;
  layoutDeck();
}

function closePanel() {
  selected = null;
  $("#panel").hidden = true;
  layoutDeck();
}

for (const el of document.querySelectorAll(".big-card")) {
  el.addEventListener("click", () => {
    if (selected === null) openCard(el.dataset.card);
    else closePanel(); // pressing the stack returns to the row
  });
}

let resizeRaf = null;
window.addEventListener("resize", () => {
  cancelAnimationFrame(resizeRaf);
  resizeRaf = requestAnimationFrame(layoutDeck);
});

// --- data ---

async function render() {
  data = await (await fetch("/api/table")).json();

  $("#t-name").textContent = data.settlement.name;
  $("#t-season").innerHTML = `<span class="term" data-term="season">${esc(seasonLabel(data.settlement.seasonLabel))}</span> · ${t("table.folkcount", { n: data.settlement.population })}`;

  $("#t-stats").innerHTML = Object.entries(data.resources)
    .map(([name, v]) => {
      const key = `res-${name.toLowerCase()}`;
      const label = TERMS[key] ? term(key, esc(name)) : esc(name);
      return `<div class="stat"><div class="value">${v}</div><div class="smallcaps">${label}</div></div>`;
    })
    .join("");

  for (const [key, sec] of Object.entries(SECTIONS)) {
    const el = $(`#count-${key}`);
    if (el) el.textContent = sec.count(data);
  }
  if (selected !== null) $("#panel-body").innerHTML = SECTIONS[selected].render(data);
  layoutDeck();
}

initI18n();

// Live updates: re-render whenever the GM changes anything.
const stream = new EventSource("/api/stream");
stream.onmessage = () => render();

render().then(() => {
  // First paint lands the cards without a slide; every change after animates.
  requestAnimationFrame(() => $("#deck").classList.remove("no-anim"));
});
