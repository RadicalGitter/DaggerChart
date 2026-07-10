// The table screen. Renders exactly one thing: whatever the GM projected.
// Data arrives already whitelisted (server/views.js screenView).
// No initI18n(): a projected surface gets no toggle, no popovers — the
// language follows whatever was last chosen on this device.
import { t, seasonLabel } from "/shared/i18n.js";

const esc = (s) =>
  String(s ?? "").replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

const stage = document.getElementById("stage");
let lastPayload = "";

function html(v) {
  switch (v.type) {
    case "image":
      return `<img src="${esc(v.url)}" alt="">${v.caption ? `<div class="caption">${esc(v.caption)}</div>` : ""}`;
    case "card":
      return `
        ${v.portrait ? `<div class="card-portrait ${v.wide ? "wide" : ""}"><img src="${esc(v.portrait)}" alt=""></div>` : ""}
        <div class="card-name">${esc(v.name)}</div>
        ${v.subtitle ? `<div class="card-sub">${esc(v.subtitle)}</div>` : ""}
        ${v.pill ? `<span class="pill">${esc(v.pill)}</span>` : ""}
        ${v.description ? `<hr class="divider"><p class="card-desc">${esc(v.description)}</p>` : ""}`;
    case "stores":
      return `
        <div class="idle-season smallcaps">${esc(v.name)} · ${esc(seasonLabel(v.seasonLabel))} · ${t("table.folkcount", { n: v.population })}</div>
        <hr class="divider">
        <div class="stores-strip">${Object.entries(v.resources)
          .map(([name, val]) => `<div class="stat"><div class="value">${val}</div><div class="smallcaps">${esc(name)}</div></div>`)
          .join("")}</div>`;
    case "buildings":
      return `<div class="b-grid">${v.buildings
        .map(
          (b) => `<div class="b-card">
            <strong>${esc(b.name)}</strong>
            <div class="muted">${esc(b.resource)} · ${t("table.level")} ${b.level}</div>
            <div>${b.foreman ? esc(b.foreman) : `<span class="muted">${t("table.noforeman")}</span>`}</div>
          </div>`
        )
        .join("")}</div>`;
    case "text":
      return `
        ${v.title ? `<div class="text-title">${esc(v.title)}</div><hr class="divider">` : ""}
        ${v.body ? `<p class="text-body">${esc(v.body)}</p>` : ""}`;
    default: // idle
      return `
        <div class="idle-name">${esc(v.name)}</div>
        <hr class="divider">
        <div class="idle-season smallcaps">${esc(seasonLabel(v.seasonLabel))}</div>`;
  }
}

async function render() {
  const v = await (await fetch("/api/screen")).json();
  const next = JSON.stringify(v);
  if (next === lastPayload) return; // don't restart the fade for unrelated updates
  lastPayload = next;
  stage.className = v.type;
  stage.innerHTML = html(v);
  stage.style.animation = "none";
  void stage.offsetWidth;
  stage.style.animation = "";
}

const stream = new EventSource("/api/stream");
stream.onmessage = () => render();
render();
