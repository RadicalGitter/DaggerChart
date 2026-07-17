import { t } from "/shared/i18n.js";

const esc = (value) =>
  String(value ?? "").replace(/[&<>"']/g, (char) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]));

const bounded = (value, min, max, fallback) =>
  Number.isInteger(value) ? Math.max(min, Math.min(max, value)) : fallback;

const pips = (count, max, className) => Array.from({ length: max }, (_, index) =>
  `<span class="session-pip ${className}${index < count ? " is-filled" : ""}"></span>`
).join("");

export function sessionPoolsHtml(data, { pcId = null } = {}) {
  if (data?.playerFeatures?.sessionPools === false) return "";
  const fear = Number.isInteger(data?.fear) ? bounded(data.fear, 0, 12, 0) : null;
  const party = Array.isArray(data?.party) ? data.party : [];
  const members = pcId ? party.filter((pc) => pc.id === pcId) : party;
  const fearHtml = fear === null ? "" : `<div class="session-pool session-fear" aria-label="${esc(t("session.fear"))}: ${fear} / 12">
    <span class="session-pool-label">${esc(t("session.fear"))}</span>
    <span class="session-pips" aria-hidden="true">${pips(fear, 12, "session-fear-pip")}</span>
    <strong class="session-pool-count">${fear}<span>/12</span></strong>
  </div>`;
  const hopeHtml = members.length ? `<div class="session-pool session-hope">
    <span class="session-pool-label">${esc(t(pcId ? "session.hope" : "session.partyHope"))}</span>
    <span class="session-hope-members">${members.map((pc) => {
      const max = bounded(pc.hopeMax, 1, 12, 6);
      const count = bounded(pc.hope, 0, max, 0);
      return `<span class="session-hope-member" aria-label="${esc(pc.name)}: ${count} / ${max} ${esc(t("session.hope"))}" title="${esc(pc.name)}: ${count} / ${max}">
        <span class="session-member-name">${esc(pc.name)}</span>
        <span class="session-pips" aria-hidden="true">${pips(count, max, "session-hope-pip")}</span>
        <strong class="session-pool-count">${count}<span>/${max}</span></strong>
      </span>`;
    }).join("")}</span>
  </div>` : "";
  if (!fearHtml && !hopeHtml) return "";
  return `<div class="session-pools" role="group" aria-label="${esc(t("session.pool"))}">${fearHtml}${hopeHtml}</div>`;
}
