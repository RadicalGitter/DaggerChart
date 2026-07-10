// Player table view. Read-only. Data arrives already whitelisted by the server.
import { t, term, initI18n, seasonLabel, TERMS } from "/shared/i18n.js";

const $ = (sel) => document.querySelector(sel);
const esc = (s) =>
  String(s ?? "").replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

const TRAITS = ["Agility", "Strength", "Finesse", "Instinct", "Presence", "Knowledge"];

async function render() {
  const t$ = await (await fetch("/api/table")).json();

  $("#t-name").textContent = t$.settlement.name;
  $("#t-season").innerHTML = `<span class="term" data-term="season">${esc(seasonLabel(t$.settlement.seasonLabel))}</span> · ${t("table.folkcount", { n: t$.settlement.population })}`;

  $("#t-stats").innerHTML = Object.entries(t$.resources)
    .map(([name, v]) => {
      const key = `res-${name.toLowerCase()}`;
      const label = TERMS[key] ? term(key, esc(name)) : esc(name);
      return `<div class="stat"><div class="value">${v}</div><div class="smallcaps">${label}</div></div>`;
    })
    .join("");

  $("#t-buildings").innerHTML = t$.buildings.length
    ? t$.buildings
        .map(
          (b) => `<div class="card">
            <strong>${esc(b.name)}</strong>
            <div class="muted" style="font-size:0.9rem;">${esc(b.resource)} · ${term("building-level", t("table.level"))} ${b.level}</div>
            <div style="font-size:0.95rem;">${b.foreman ? term("foreman", esc(b.foreman)) : `<span class="muted">${t("table.noforeman")}</span>`}</div>
          </div>`
        )
        .join("")
    : `<p class="empty">${t("table.nobuildings")}</p>`;

  $("#t-folk").innerHTML = t$.characters.length
    ? t$.characters
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
            <p style="font-size:0.92rem;">${esc(c.backstory || "")}</p>
            ${traits}
          </div>`;
        })
        .join("")
    : `<p class="empty">${t("table.nofolk")}</p>`;

  $("#t-chronicle").innerHTML = t$.chronicle.length
    ? t$.chronicle
        .map(
          (e) => `<div class="entry"><div class="season">${esc(seasonLabel(e.season))}</div><div>${esc(e.text)}</div></div>`
        )
        .join("")
    : `<p class="empty">${t("table.nochronicle")}</p>`;
}

initI18n();

// Live updates: re-render whenever the GM changes anything.
const stream = new EventSource("/api/stream");
stream.onmessage = () => render();

render();
