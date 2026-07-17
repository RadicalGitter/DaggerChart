import { initI18n, t, termify } from "/shared/i18n.js";
import { prepareRuleNodes, searchRuleNodes } from "/shared/rules-search.js";
import { setTelemetryMode } from "/shared/telemetry.js";
import "/shared/feedback.js";

const $ = (selector) => document.querySelector(selector);
const esc = (value) => String(value ?? "").replace(/[&<>"']/g, (char) =>
  ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]));
const embedded = new URLSearchParams(location.search).get("embed") === "1";

document.body.classList.toggle("embed", embedded);

const state = {
  corpus: null,
  nodes: [],
  byId: new Map(),
  query: "",
  results: [],
  selectedId: null,
  mobilePane: "browse"
};

function bodyMarkup(body) {
  return String(body || "").split(/\n{2,}/).map((block) => {
    const lines = block.split("\n").map((line) => line.trim()).filter(Boolean);
    if (lines.length && lines.every((line) => line.startsWith("- "))) {
      return `<ul>${lines.map((line) => `<li>${termify(esc(line.slice(2)))}</li>`).join("")}</ul>`;
    }
    return `<p>${termify(esc(lines.join(" ")))}</p>`;
  }).join("");
}

function sourceMarkup() {
  const source = state.corpus?.source;
  if (!source) return "";
  return `<footer class="article-source"><span>${esc(t("rules.source"))}: </span><a href="${esc(source.url)}" target="_blank" rel="noreferrer">${esc(source.title)}</a><br>${esc(source.license)}</footer>`;
}

function renderArticle() {
  const node = state.byId.get(state.selectedId) || state.nodes[0];
  if (!node) return;
  state.selectedId = node.id;
  const related = (node.seeAlso || []).map((id) => state.byId.get(id)).filter(Boolean);
  $("#rule-article").innerHTML = `
    <p class="article-kicker">${node.path.map(esc).join(" / ")}</p>
    <h2 tabindex="-1">${esc(node.title)}</h2>
    <div class="article-rule" aria-hidden="true"><i></i><i></i><i></i></div>
    <div class="article-body">${bodyMarkup(node.body)}</div>
    ${related.length ? `<section class="see-also"><h3>${esc(t("rules.seeAlso"))}</h3><div class="see-also-links">${related.map((entry) => `<button type="button" data-rule="${esc(entry.id)}">${esc(entry.title)}</button>`).join("")}</div></section>` : ""}
    ${sourceMarkup()}`;
  setTelemetryMode(`article:${node.id}`);
  document.title = `${node.title} - ${t("rules.title")}`;
}

function treeMarkup(nodes) {
  const groups = new Map();
  for (const node of nodes) {
    const category = node.path[0] || "Rules";
    const subgroup = node.path[1] || "Reference";
    if (!groups.has(category)) groups.set(category, new Map());
    const subgroups = groups.get(category);
    if (!subgroups.has(subgroup)) subgroups.set(subgroup, []);
    subgroups.get(subgroup).push(node);
  }

  return [...groups.entries()].map(([category, subgroups]) => `
    <section class="tree-group">
      <h2>${esc(category)}</h2>
      ${[...subgroups.entries()].map(([subgroup, entries]) => `
        <div class="tree-subgroup">
          <h3>${esc(subgroup)}</h3>
          ${entries.sort((a, b) => a.title.localeCompare(b.title)).map((node) => `<button type="button" class="rule-link ${node.id === state.selectedId ? "active" : ""}" data-rule="${esc(node.id)}">${esc(node.title)}</button>`).join("")}
        </div>`).join("")}
    </section>`).join("");
}

function searchMarkup(nodes) {
  if (!nodes.length) return `<p class="no-results">${esc(t("rules.noResults"))}</p>`;
  return `<div class="search-results">${nodes.map((node) => `
    <button type="button" class="search-result ${node.id === state.selectedId ? "active" : ""}" data-rule="${esc(node.id)}">
      <strong>${esc(node.title)}</strong>
      <span>${node.path.map(esc).join(" / ")}</span>
    </button>`).join("")}</div>`;
}

function renderIndex() {
  state.results = searchRuleNodes(state.nodes, state.query);
  $("#rule-tree").innerHTML = state.query ? searchMarkup(state.results) : treeMarkup(state.nodes);
  const count = state.results.length;
  $("#index-count").textContent = state.query
    ? t(count === 1 ? "rules.oneMatch" : "rules.matches", { n: count })
    : t("rules.allEntries", { n: state.nodes.length });
  $("#clear-search").hidden = !state.query;
}

function setMobilePane(pane) {
  state.mobilePane = pane === "article" ? "article" : "browse";
  $("#rules-shell").classList.toggle("mobile-article", state.mobilePane === "article");
  $("#show-index").classList.toggle("active", state.mobilePane === "browse");
  $("#show-article").classList.toggle("active", state.mobilePane === "article");
  $("#show-index").setAttribute("aria-pressed", String(state.mobilePane === "browse"));
  $("#show-article").setAttribute("aria-pressed", String(state.mobilePane === "article"));
}

function selectRule(id, { updateHash = true, showArticle = true } = {}) {
  if (!state.byId.has(id)) return;
  state.selectedId = id;
  if (updateHash && location.hash !== `#${id}`) history.pushState(null, "", `#${id}`);
  renderArticle();
  renderIndex();
  if (showArticle) setMobilePane("article");
  $(".article-pane").scrollTop = 0;
  $("#rule-article").scrollTop = 0;
  $("#rule-article h2")?.focus({ preventScroll: true });
}

function clearSearch({ focus = false } = {}) {
  state.query = "";
  $("#rule-search").value = "";
  renderIndex();
  setTelemetryMode(`article:${state.selectedId}`);
  if (focus) $("#rule-search").focus();
}

function wireEvents() {
  $("#rule-search").addEventListener("input", (event) => {
    state.query = event.target.value;
    renderIndex();
    setTelemetryMode(state.query ? "search" : `article:${state.selectedId}`);
  });
  $("#rule-search").addEventListener("keydown", (event) => {
    if (event.key === "Enter" && state.query && state.results[0]) {
      event.preventDefault();
      selectRule(state.results[0].id);
    }
    if (event.key === "Escape" && state.query) {
      event.preventDefault();
      clearSearch();
    }
  });
  $("#clear-search").addEventListener("click", () => clearSearch({ focus: true }));
  document.addEventListener("click", (event) => {
    const rule = event.target.closest("[data-rule]");
    if (rule) selectRule(rule.dataset.rule);
  });
  $("#show-index").addEventListener("click", () => setMobilePane("browse"));
  $("#show-article").addEventListener("click", () => setMobilePane("article"));
  $("#article-back").addEventListener("click", () => setMobilePane("browse"));
  window.addEventListener("hashchange", () => {
    const id = decodeURIComponent(location.hash.slice(1));
    if (state.byId.has(id) && id !== state.selectedId) selectRule(id, { updateHash: false });
  });
}

async function loadRules() {
  const response = await fetch("/api/rules");
  if (!response.ok) throw new Error(`Rules request failed (${response.status}).`);
  const corpus = await response.json();
  state.corpus = corpus;
  state.nodes = prepareRuleNodes(corpus);
  state.byId = new Map(state.nodes.map((node) => [node.id, node]));
  const requested = decodeURIComponent(location.hash.slice(1));
  state.selectedId = state.byId.has(requested) ? requested : state.nodes[0]?.id;
  $("#source-mark").href = corpus.source?.url || "https://www.daggerheart.com/srd/";
  renderIndex();
  renderArticle();
  if (state.byId.has(requested)) setMobilePane("article");
}

initI18n();
wireEvents();
loadRules().catch((error) => {
  console.error(error);
  $("#rule-article").innerHTML = `<p class="article-error">${esc(t("rules.error"))}</p>`;
  $("#rule-tree").innerHTML = `<p class="no-results">${esc(t("rules.error"))}</p>`;
});
