import { initI18n, lang, t } from "/shared/i18n.js";
import { fetchJsonWithRetry } from "/shared/reliable-fetch.js";
import "/shared/feedback.js";
import "/shared/player-tools.js";

const $ = (selector) => document.querySelector(selector);
const esc = (value) => String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]));
const query = new URLSearchParams(location.search);
const pcId = query.get("pc") || localStorage.getItem("settlement-pc");
let DATA = null;
let selectedId = null;
let busy = false;

async function api(path, options = {}) {
  const response = await fetch(path, {
    ...options,
    headers: { "Content-Type": "application/json", ...(options.headers || {}) },
    body: options.body === undefined ? undefined : JSON.stringify(options.body)
  });
  const payload = response.status === 204 ? null : await response.json();
  if (!response.ok) throw new Error(payload?.error || "The ledger could not be updated.");
  return payload;
}

function header(titleKey, subtitleKey) {
  return `<header class="studio-head"><div><span class="beast-kicker">${esc(t("presentation.tool"))}</span><h1>${esc(t(titleKey))}</h1><p>${esc(t(subtitleKey))}</p></div><a class="root-link" href="/player">← ${esc(t("presentation.back"))}</a></header>`;
}

function portrait(item, fallback) {
  return item?.portrait ? `<img src="${esc(item.portrait)}" alt="">` : `<span class="blank-face" aria-hidden="true">${esc(fallback || "?")}</span>`;
}

function activeRibbon(kind, id) {
  return DATA.studio.active?.kind === kind && DATA.studio.active?.refId === id ? `<span class="active-ribbon">${esc(t("presentation.active"))}</span>` : "";
}

function personaDetail(persona) {
  const item = persona || { id: "", name: "", description: "", prompt: "", portrait: null };
  return `<div class="detail-inner">
    ${activeRibbon("persona", item.id)}
    <h2>${esc(item.name || t("presentation.newPersona"))}</h2>
    <label>${esc(t("presentation.personaName"))}<input id="face-name" value="${esc(item.name)}" maxlength="80"></label>
    <label>${esc(t("presentation.description"))}<textarea id="face-description" rows="3" maxlength="6000">${esc(item.description)}</textarea></label>
    <label>${esc(t("presentation.prompt"))}<textarea id="face-prompt" rows="6" maxlength="6000">${esc(item.prompt)}</textarea></label>
    <div class="detail-actions">
      <button id="face-save" type="button">${esc(t("presentation.save"))}</button>
      ${item.id ? `<button id="face-generate" type="button" ${DATA.art.ready ? "" : "disabled"}>${esc(t("presentation.generate"))}</button><button id="face-activate" type="button">${esc(t("presentation.activate"))}</button><button class="quiet" id="face-remove" type="button">${esc(t("presentation.remove"))}</button>` : ""}
    </div>
  </div>`;
}

function beastDetail(form) {
  const custom = form.customization || {};
  const canonicalTrait = Number(DATA.canonical.traits?.[form.trait]) || 0;
  const transformedTrait = canonicalTrait + (form.traitBonus || 0);
  const bg = custom.portrait ? `url('${String(custom.portrait).replace(/[()'"\\]/g, "")}')` : "none";
  return `<div class="detail-inner beast-sheet" style="--beast-image:${bg}">
    ${activeRibbon("beastform", form.id)}
    <span class="beast-kicker">Tier ${form.tier} · ${esc(t("presentation.changed"))}</span>
    <h2>${esc(custom.name || form.name)}</h2>
    <p class="beast-examples">${esc(t("presentation.examples"))}: ${form.examples.map(esc).join(", ")}</p>
    <table class="change-table"><thead><tr><th></th><th>${esc(t("presentation.canonicalValue"))}</th><th>${esc(t("presentation.formValue"))}</th></tr></thead><tbody>
      <tr><td>Evasion</td><td>${DATA.canonical.evasion}</td><td>${DATA.canonical.evasion + form.evasionBonus} (+${form.evasionBonus})</td></tr>
      ${form.trait ? `<tr><td>${esc(form.trait)}</td><td>${canonicalTrait >= 0 ? "+" : ""}${canonicalTrait}</td><td>${transformedTrait >= 0 ? "+" : ""}${transformedTrait} (+${form.traitBonus})</td></tr>` : ""}
      <tr><td>Attack</td><td>Weapons</td><td>${esc(form.attack.range)} · ${esc(form.attack.trait)} · ${esc(form.attack.damage)}</td></tr>
    </tbody></table>
    <div class="attack-line"><strong>${esc(form.name)}</strong> · ${esc(form.attack.range)} ${esc(form.attack.trait)} · ${esc(form.attack.damage)} · Proficiency ${DATA.pc.proficiency || ""}</div>
    <h3>${esc(t("presentation.advantages"))}</h3><ul class="advantage-list">${form.advantages.map((item) => `<li>${esc(item)}</li>`).join("") || "<li>Chosen from component forms</li>"}</ul>
    <h3>${esc(t("presentation.features"))}</h3>${form.features.map((feature) => `<p class="feature-rule"><strong>${esc(feature.name)}:</strong> ${esc(feature.text)}</p>`).join("")}
    <div class="form-customizer">
      <label>${esc(t("presentation.beastName"))}<input id="beast-name" value="${esc(custom.name || "")}" placeholder="${esc(form.examples[0] || form.name)}" maxlength="80"></label>
      <label>${esc(t("presentation.prompt"))}<textarea id="beast-prompt" rows="5" maxlength="6000">${esc(custom.prompt || "")}</textarea></label>
      <div class="detail-actions">
        <button id="beast-save" type="button">${esc(t("presentation.save"))}</button>
        <button id="beast-generate" type="button" ${DATA.art.ready ? "" : "disabled"}>${esc(t("presentation.generate"))}</button>
        ${form.requiresChoice ? `<button type="button" disabled>${esc(t("presentation.unconfigured"))}</button>` : `<button id="beast-transform" type="button">${esc(t("presentation.transform"))}</button><select id="evolution-trait" aria-label="${esc(t("presentation.evolutionTrait"))}">${Object.keys(DATA.canonical.traits).map((trait) => `<option>${esc(trait)}</option>`).join("")}</select><button class="quiet" id="beast-evolve" type="button" ${DATA.pc.hope < 3 ? "disabled" : ""}>${esc(t("presentation.evolve"))}</button>`}
      </div>
    </div>
  </div>`;
}

function renderDisguise() {
  const personas = DATA.studio.personas;
  if (selectedId === null && personas.length) selectedId = personas[0].id;
  const selected = personas.find((item) => item.id === selectedId) || null;
  $("#studio").innerHTML = `${header("presentation.disguise.title", "presentation.disguise.subtitle")}<div class="studio-grid">
    <section class="face-rail"><div class="face-rail-head"><h2>${esc(DATA.canonical.name)}</h2><button class="quiet" id="new-persona" type="button">+ ${esc(t("presentation.newPersona"))}</button></div>
      <div class="face-list">${personas.map((item) => `<button class="face-card ${item.id === selectedId ? "selected" : ""}" data-face="${esc(item.id)}" type="button">${portrait(item, item.name?.[0])}<strong>${esc(item.name)}</strong>${DATA.studio.active?.refId === item.id ? `<small>${esc(t("presentation.active"))}</small>` : ""}</button>`).join("")}</div>
      <div class="detail-actions"><button class="quiet" id="canonical" type="button">${esc(t("presentation.canonical"))}</button></div>
    </section><section class="face-detail">${personaDetail(selected)}</section></div>`;
  wireDisguise(selected);
}

function renderBeastforms() {
  const forms = DATA.studio.forms;
  if (!selectedId || !forms.some((item) => item.id === selectedId)) selectedId = forms[0]?.id || null;
  const selected = forms.find((item) => item.id === selectedId);
  $("#studio").innerHTML = `${header("presentation.beastform.title", "presentation.beastform.subtitle")}<div class="studio-grid">
    <section class="face-rail"><div class="face-rail-head"><h2>${esc(t("presentation.formTier", { tier: DATA.studio.tier }))}</h2></div>
      <div class="face-list">${forms.map((form) => `<button class="face-card ${form.id === selectedId ? "selected" : ""}" data-form="${esc(form.id)}" type="button">${portrait(form.customization, form.name[0])}<strong>${esc(form.customization?.name || form.name)}</strong><small>Tier ${form.tier}${DATA.studio.active?.refId === form.id ? ` · ${esc(t("presentation.active"))}` : ""}</small></button>`).join("")}</div>
      <div class="detail-actions"><button class="quiet" id="canonical" type="button">${esc(t("presentation.canonical"))}</button></div>
    </section><section class="face-detail">${selected ? beastDetail(selected) : ""}</section></div>`;
  wireBeastform(selected);
}

function render() {
  if (!DATA) return;
  document.title = t(DATA.studio.role === "beastform" ? "presentation.beastform.title" : "presentation.disguise.title");
  if (DATA.studio.role === "beastform") renderBeastforms(); else renderDisguise();
}

async function reload() {
  DATA = await fetchJsonWithRetry(`/api/party/${encodeURIComponent(pcId)}/presentation`);
  render();
}

function baseWire() {
  $("#canonical")?.addEventListener("click", async () => {
    await api(`/api/party/${encodeURIComponent(pcId)}/presentation/activate`, { method: "POST", body: { kind: "canonical" } });
    await reload();
  });
  for (const card of document.querySelectorAll(".face-card")) card.onpointermove = (event) => {
    const rect = card.getBoundingClientRect();
    card.style.setProperty("--rx", `${((event.clientX - rect.left) / rect.width - .5) * 6}deg`);
    card.style.setProperty("--ry", `${-((event.clientY - rect.top) / rect.height - .5) * 5}deg`);
  };
}

function wireDisguise(persona) {
  baseWire();
  $("#new-persona").onclick = () => { selectedId = ""; render(); };
  for (const card of document.querySelectorAll("[data-face]")) card.onclick = () => { selectedId = card.dataset.face; render(); };
  $("#face-save").onclick = async () => {
    const saved = await api(`/api/party/${encodeURIComponent(pcId)}/personas`, { method: "POST", body: { id: persona?.id, name: $("#face-name").value, description: $("#face-description").value, prompt: $("#face-prompt").value } });
    selectedId = saved.id; await reload();
  };
  if (!persona) return;
  $("#face-activate").onclick = async () => { await api(`/api/party/${encodeURIComponent(pcId)}/presentation/activate`, { method: "POST", body: { kind: "persona", refId: persona.id } }); await reload(); };
  $("#face-remove").onclick = async () => { if (!confirm(t("presentation.remove"))) return; await api(`/api/party/${encodeURIComponent(pcId)}/personas/${encodeURIComponent(persona.id)}`, { method: "DELETE" }); selectedId = null; await reload(); };
  $("#face-generate").onclick = () => generatePortrait(persona.id, "#face-prompt", "#face-generate");
}

function wireBeastform(form) {
  baseWire();
  for (const card of document.querySelectorAll("[data-form]")) card.onclick = () => { selectedId = card.dataset.form; render(); };
  if (!form) return;
  const save = async () => api(`/api/party/${encodeURIComponent(pcId)}/beastforms/${encodeURIComponent(form.id)}`, { method: "PUT", body: { name: $("#beast-name").value, prompt: $("#beast-prompt").value } });
  $("#beast-save").onclick = async () => { await save(); await reload(); };
  $("#beast-generate").onclick = async () => { await save(); await generatePortrait(form.id, "#beast-prompt", "#beast-generate"); };
  $("#beast-transform")?.addEventListener("click", async () => { await save(); await api(`/api/party/${encodeURIComponent(pcId)}/presentation/activate`, { method: "POST", body: { kind: "beastform", refId: form.id, method: "stress" } }); await reload(); });
  $("#beast-evolve")?.addEventListener("click", async () => { await save(); await api(`/api/party/${encodeURIComponent(pcId)}/presentation/activate`, { method: "POST", body: { kind: "beastform", refId: form.id, method: "evolution", evolutionTrait: $("#evolution-trait").value } }); await reload(); });
}

async function generatePortrait(refId, promptSelector, buttonSelector) {
  if (busy) return;
  busy = true;
  const button = $(buttonSelector);
  const previous = button.textContent;
  button.disabled = true; button.textContent = t("presentation.generating");
  try {
    await api(`/api/party/${encodeURIComponent(pcId)}/presentation/${encodeURIComponent(refId)}/portrait`, { method: "POST", body: { prompt: $(promptSelector).value, style: "style2", stepsModifier: 0, cfgModifier: 0, embellishPrompt: true } });
    await reload();
  } catch (error) {
    alert(error.message);
    button.disabled = false; button.textContent = previous;
  } finally { busy = false; }
}

initI18n();
if (!pcId) location.replace("/player");
reload().catch((error) => { $("#studio").innerHTML = `<div class="studio-error"><p>${esc(error.message)}</p><a class="root-link" href="/player">${esc(t("presentation.back"))}</a></div>`; });
