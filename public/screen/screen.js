// The table screen. Renders exactly one thing: whatever the GM projected.
// Data arrives already whitelisted (server/views.js screenView).
// No initI18n(): a projected surface gets no toggle, no popovers — the
// language follows whatever was last chosen on this device.
import { t, seasonLabel } from "/shared/i18n.js";
import { paperArtifactHtml } from "/shared/paper.js";
import { ENCOUNTER_STAGE_ASPECT, encounterEngagements, engagedIds } from "/shared/encounter-stage.js";

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
          (b) => `<div class="b-card ${b.constructed ? "built" : "unraised"}">
            <strong>${esc(b.name)}</strong>
            <div class="muted">${b.constructed
              ? `${esc(b.resource)} · ${t("table.level")} ${b.level}`
              : `${t("table.unraised")} · ${t("table.willproduce", { resource: esc(b.resource) })}`}</div>
            <div>${b.foreman ? esc(b.foreman) : `<span class="muted">${t("table.noforeman")}</span>`}</div>
            ${b.project ? `<div class="b-cost"><span>${t("table.project.cost")}</span>${Object.entries(b.project.cost).map(([resource, amount]) => `<b>${amount} ${esc(resource)}</b>`).join("")}</div>` : ""}
          </div>`
        )
        .join("")}</div>`;
    case "text":
      return `
        ${v.title ? `<div class="text-title">${esc(v.title)}</div><hr class="divider">` : ""}
        ${v.body ? `<p class="text-body">${esc(v.body)}</p>` : ""}`;
    case "rule":
      return `<div class="rule-path smallcaps">${esc((v.path || []).join(" · "))}</div>
        <div class="text-title">${esc(v.title)}</div><hr class="divider">
        <p class="text-body rule-body">${esc(v.body)}</p>`;
    case "paper":
      return paperArtifactHtml(v, { id: "projected-paper-title" });
    case "encounter":
      return encounterHtml(v);
    default: // idle
      return `
        <div class="idle-name">${esc(v.name)}</div>
        <hr class="divider">
        <div class="idle-season smallcaps">${esc(seasonLabel(v.seasonLabel))}</div>`;
  }
}

// The encounter: the GM's card arrangement, letterboxed to the shared 16:9
// stage so melee reads exactly as it does on the drafting board.
function encounterHtml(v) {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  let w = vw;
  let h = w / ENCOUNTER_STAGE_ASPECT;
  if (h > vh) { h = vh; w = h * ENCOUNTER_STAGE_ASPECT; }
  const entities = v.entities || [];
  const engaged = engagedIds(entities);
  const pairs = encounterEngagements(entities);
  const byId = Object.fromEntries(entities.map((e) => [e.id, e]));
  // Cards project larger than they draft: scale up while keeping positions.
  const scale = 1.35;
  return `
    <div class="enc-stage" style="width:${w}px;height:${h}px;">
      ${v.name ? `<div class="enc-title smallcaps">${esc(v.name)}</div>` : ""}
      <svg class="enc-tethers" viewBox="0 0 ${w} ${h}">
        ${pairs.map(([a, b]) => {
          const ea = byId[a]; const eb = byId[b];
          return `<line x1="${ea.x * w}" y1="${ea.y * h}" x2="${eb.x * w}" y2="${eb.y * h}"></line>
            <text class="enc-melee-mark" x="${((ea.x + eb.x) / 2) * w}" y="${((ea.y + eb.y) / 2) * h}">⚔</text>`;
        }).join("")}
      </svg>
      ${entities.map((entity) => {
        const hostile = entity.kind === "adversary";
        const classes = ["enc-card", hostile ? "hostile" : "", engaged.has(entity.id) ? "engaged" : "", entity.defeated ? "defeated" : ""].filter(Boolean).join(" ");
        const styleVars = [
          `--enc-w:${(entity.w * w * scale).toFixed(1)}px`,
          `left:${(entity.x * 100).toFixed(2)}%`,
          `top:${(entity.y * 100).toFixed(2)}%`,
          entity.appearance?.primaryColor ? `--enc-primary:${esc(entity.appearance.primaryColor)}` : "",
          entity.appearance?.secondaryColor ? `--enc-secondary:${esc(entity.appearance.secondaryColor)}` : ""
        ].filter(Boolean).join(";");
        const glyph = hostile ? "☠" : esc((entity.label || "?").slice(0, 1));
        return `
          <article class="${classes}" style="${styleVars}">
            <div class="enc-card-surface">
              <div class="enc-portrait">
                ${entity.portrait ? `<img src="${esc(entity.portrait)}" alt="">` : `<span class="enc-glyph" aria-hidden="true">${glyph}</span>`}
              </div>
              <strong class="enc-name">${esc(entity.label)}</strong>
            </div>
          </article>`;
      }).join("")}
    </div>`;
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
window.addEventListener("resize", () => {
  // Encounter cards are laid out in pixels; a projector resize needs a repaint.
  lastPayload = "";
  render();
});
render();
