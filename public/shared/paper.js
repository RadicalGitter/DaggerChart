import { t } from "/shared/i18n.js";

const esc = (value) => String(value ?? "").replace(/[&<>"']/g, (char) =>
  ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);

export function covenantArticlesHtml() {
  return `<h3>${esc(t("contract.articles"))}</h3>
    <p>${esc(t("contract.clause1"))}</p>
    <p>${esc(t("contract.clause2"))}</p>
    <p>${esc(t("contract.clause3"))}</p>
    <p>${esc(t("contract.clause4"))}</p>`;
}

export function paperArtifactHtml(item, { id = "paper-title" } = {}) {
  const covenant = item?.paperType === "covenant";
  const title = covenant ? t("contract.title") : (item?.name || t("paper.untitled"));
  const body = covenant ? covenantArticlesHtml() : `<div class="paper-body">${esc(item?.body || "")}</div>`;
  const author = item?.author ? `<div class="paper-author">${esc(t("paper.writtenBy", { name: item.author }))}</div>` : "";
  const signature = covenant ? `<div class="paper-signed">
      <span>${esc(t("contract.signed"))}</span>
      <strong>${esc(item?.signedName || "")}</strong>
      ${item?.signedAt ? `<small>${esc(new Date(item.signedAt).toLocaleDateString())}</small>` : ""}
    </div>` : "";
  return `<article class="paper-sheet ${covenant ? "paper-covenant" : "paper-note"}">
    <div class="paper-kicker">${esc(covenant ? t("contract.kicker") : t("paper.kicker"))}</div>
    <h2 id="${esc(id)}">${esc(title)}</h2>
    ${covenant ? `<p class="paper-decree">${esc(t("contract.decree"))}</p>` : ""}
    <div class="paper-copy">${body}</div>
    ${author}${signature}
    ${covenant ? `<p class="paper-foot">${esc(t("contract.foot"))}</p>` : ""}
  </article>`;
}
