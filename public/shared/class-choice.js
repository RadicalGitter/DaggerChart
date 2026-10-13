import { lang, t, termify } from "/shared/i18n.js";

const esc = (value) => String(value ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const localized = (entry) => lang === "sv" && entry?.sv ? entry.sv : entry;
export const localizedFeature = localized;
const nameOf = (entry) => lang === "sv" && entry.svName ? entry.svName : entry.name;
const paragraphs = (text) => String(text || "").split(/\n\n/).map((p) => `<p>${termify(esc(p)).replace(/\n/g, "<br>")}</p>`).join("");
const featureHtml = (entry) => { const f = localized(entry); return `<article class="class-choice-rule"><h4>${esc(f.name)}</h4>${paragraphs(f.text)}</article>`; };
const tierHtml = (subclass, tier) => `<details class="class-choice-tier" ${tier === "foundation" ? "open" : ""}><summary>${esc(t(`classChoice.${tier}`))}</summary>${(subclass[tier] || []).map(featureHtml).join("")}</details>`;

function guideHtml(definition, subclass = null) {
  return `<div class="class-choice-guide">
    <h3>${esc(nameOf(definition))} <small>v${esc(definition.version)}</small></h3>
    ${paragraphs(lang === "sv" ? definition.svDescription : definition.description)}
    ${(definition.guide || []).slice(0, 2).map(featureHtml).join("")}
    ${definition.hopeFeature ? featureHtml(definition.hopeFeature) : ""}
    ${(definition.classFeatures || []).map(featureHtml).join("")}
    ${(subclass ? [subclass] : definition.subclasses).map((entry) => `<section><h3>${esc(nameOf(entry))}</h3>${paragraphs(lang === "sv" ? entry.svDescription : entry.description)}${["foundation", "specialization", "mastery"].map((tier) => tierHtml(entry, tier)).join("")}</section>`).join("")}
    ${(definition.guide || []).slice(2).map(featureHtml).join("")}
  </div>`;
}

const automaticShown = new Set();
const fetching = new Map();
let dialog = null;
let activePcId = null;

function styles() {
  if (document.querySelector('link[data-class-choice-style]')) return;
  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = "/shared/class-choice.css";
  link.dataset.classChoiceStyle = "";
  document.head.append(link);
}

async function readOffer(pcId) {
  if (fetching.has(pcId)) return fetching.get(pcId);
  const request = fetch(`/api/party/${encodeURIComponent(pcId)}/class-choice`, { cache: "no-store", signal: AbortSignal.timeout(6000) }).then(async (response) => {
    if (!response.ok) throw new Error(t("classChoice.loadError"));
    const offer = await response.json();
    return offer;
  }).finally(() => fetching.delete(pcId));
  fetching.set(pcId, request);
  return request;
}

function closeDialog() {
  if (dialog?.open) dialog.close();
}

function createDialog(pcId) {
  closeDialog();
  dialog?.remove();
  styles();
  dialog = document.createElement("dialog");
  dialog.className = "class-choice-dialog";
  dialog.setAttribute("aria-labelledby", "class-choice-title");
  dialog.addEventListener("cancel", (event) => {
    if (dialog?.dataset.saving === "true") event.preventDefault();
  });
  document.body.append(dialog);
  activePcId = pcId;
  return dialog;
}

function showGuide(pc, offer) {
  const root = createDialog(pc.id);
  root.innerHTML = `<div class="class-choice-top"><h2 id="class-choice-title">${esc(t("classChoice.guide"))}</h2><button type="button" data-close>${esc(t("classChoice.close"))}</button></div><div class="class-choice-scroll">${offer.definitions.map((definition) => guideHtml(definition)).join("")}</div>`;
  root.querySelector("[data-close]").onclick = closeDialog;
  root.showModal();
}

function showChoice(pc, offer, onSaved) {
  const root = createDialog(pc.id);
  const choices = offer.definitions.flatMap((definition) => definition.subclasses.map((subclass) => ({ definition, subclass })));
  root.innerHTML = `<div class="class-choice-top"><div><p class="class-choice-kicker">${esc(pc.name)}</p><h2 id="class-choice-title">${esc(t("classChoice.title"))}</h2></div><button type="button" data-close>${esc(t("classChoice.later"))}</button></div>
    <form class="class-choice-form">
      <div class="class-choice-scroll">
        <p>${esc(t("classChoice.intro"))}</p>
        <div class="class-choice-options" role="group" aria-label="${esc(t("classChoice.options"))}">
          ${choices.map(({ definition, subclass }) => `<button type="button" data-choice="${esc(subclass.id)}" aria-pressed="false"><strong>${esc(nameOf(definition))}</strong><span>${esc(nameOf(subclass))}</span><small>${esc(lang === "sv" ? subclass.svDescription : subclass.description)}</small></button>`).join("")}
          <button type="button" data-choice="keep-current" aria-pressed="false"><strong>${esc(t("classChoice.keep"))}</strong><span>${esc(offer.current.className)} · ${esc(offer.current.subclassName)}</span><small>${esc(t("classChoice.keepDescription"))}</small></button>
        </div>
        <div data-selection hidden></div>
      </div>
      <footer class="class-choice-footer"><p class="class-choice-error" role="alert" data-error></p><label class="class-choice-consent"><input type="checkbox" data-confirm disabled required><span>${esc(t("classChoice.consent"))}</span></label><button type="submit" class="class-choice-confirm" disabled>${esc(t("classChoice.confirm"))}</button></footer>
    </form>`;
  root.querySelector("[data-close]").onclick = closeDialog;
  const form = root.querySelector("form");
  const selectionRoot = root.querySelector("[data-selection]");
  const consent = root.querySelector("[data-confirm]");
  const submit = root.querySelector('[type="submit"]');
  let selected = null;
  root.querySelectorAll("[data-choice]").forEach((button) => {
    button.onclick = () => {
      selected = button.dataset.choice;
      root.querySelectorAll("[data-choice]").forEach((entry) => entry.setAttribute("aria-pressed", String(entry === button)));
      consent.checked = false;
      consent.disabled = false;
      submit.disabled = true;
      root.querySelector("[data-error]").textContent = "";
      selectionRoot.hidden = false;
      if (selected === "keep-current") {
        selectionRoot.innerHTML = `<h3>${esc(t("classChoice.keep"))}</h3><p>${esc(t("classChoice.keepDescription"))}</p>`;
        return;
      }
      const { definition, subclass } = choices.find((entry) => entry.subclass.id === selected);
      const traits = definition.setup?.traits || [];
      const materialCount = definition.setup?.familiarMaterialCount || 0;
      selectionRoot.innerHTML = `<section class="class-choice-change"><h3>${esc(t("classChoice.changes"))}</h3>${paragraphs(lang === "sv" ? definition.migration?.svText : definition.migration?.text)}</section>
        <fieldset class="class-choice-setup"><legend>${esc(t("classChoice.setup"))}</legend>
          ${traits.length ? `<label>${esc(t("classChoice.trait"))}<select name="trait">${traits.map((trait) => `<option value="${esc(trait)}" ${trait === offer.recommendedTrait ? "selected" : ""}>${esc(trait)} (${Number(pc.traits?.[trait]) >= 0 ? "+" : ""}${esc(pc.traits?.[trait] ?? 0)})</option>`).join("")}</select></label><p>${esc(t("classChoice.traitHint"))}</p>` : ""}
          ${Array.from({ length: materialCount }, (_, i) => `<label>${esc(t("classChoice.material", { n: i + 1 }))}<input name="material-${i}" maxlength="80" required autocomplete="off" placeholder="${esc(t("classChoice.materialExample"))}"></label>`).join("")}
          ${materialCount ? `<p>${esc(t("classChoice.materialHint"))}</p>` : ""}
        </fieldset>${guideHtml(definition, subclass)}`;
    };
  });
  consent.onchange = () => { submit.disabled = !consent.checked; };
  form.onsubmit = async (event) => {
    event.preventDefault();
    if (!selected || !consent.checked || !form.reportValidity()) return;
    const payload = { offerId: offer.offerId, version: offer.version, choiceId: selected, confirmed: true };
    if (selected !== "keep-current") {
      const { definition } = choices.find((entry) => entry.subclass.id === selected);
      payload.trait = form.elements.namedItem("trait")?.value;
      payload.familiarMaterials = Array.from({ length: definition.setup?.familiarMaterialCount || 0 }, (_, i) => form.elements.namedItem(`material-${i}`).value.trim());
      if (new Set(payload.familiarMaterials.map((value) => value.toLocaleLowerCase("sv"))).size !== payload.familiarMaterials.length) {
        root.querySelector("[data-error]").textContent = t("classChoice.differentMaterials");
        return;
      }
    }
    root.dataset.saving = "true";
    root.querySelectorAll("button, input, select").forEach((control) => { control.disabled = true; });
    submit.textContent = t("classChoice.saving");
    try {
      const response = await fetch(`/api/party/${encodeURIComponent(pc.id)}/class-choice`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload), signal: AbortSignal.timeout(12000)
      });
      if (!response.ok) throw new Error(t("classChoice.saveError"));
      const updated = await response.json();
      root.dataset.saving = "false";
      closeDialog();
      await onSaved(updated);
    } catch {
      root.dataset.saving = "false";
      root.querySelectorAll("button, input, select").forEach((control) => { control.disabled = false; });
      root.querySelector("[data-error]").textContent = t("classChoice.saveError");
      submit.textContent = t("classChoice.confirm");
    }
  };
  root.showModal();
}

// Both the standalone sheet and native tome use this entry point. Refreshes
// update the notice without rebuilding an open draft or stealing its focus.
export async function attachClassChoice(pc, { host, onSaved, autoOpen = true }) {
  if (!pc || !host) return;
  const pcId = pc.id;
  if (dialog?.open && activePcId !== pcId) closeDialog();
  try {
    const offer = await readOffer(pcId);
    if (!host.isConnected) return;
    if (!offer) { host.replaceChildren(); if (activePcId === pcId) closeDialog(); return; }
    styles();
    const pending = offer.status === "pending";
    if (!pending && activePcId === pcId && dialog?.querySelector("form")) closeDialog();
    host.innerHTML = `<div class="class-choice-notice"><span>${esc(t(pending ? "classChoice.waiting" : "classChoice.adopted"))}</span><button type="button">${esc(t(pending ? "classChoice.open" : "classChoice.guide"))}</button></div>`;
    const open = () => pending ? showChoice(pc, offer, onSaved) : showGuide(pc, offer);
    host.querySelector("button").onclick = open;
    if (pending && autoOpen && !automaticShown.has(pcId)) {
      automaticShown.add(pcId);
      open();
    }
  } catch {
    if (!host.isConnected) return;
    host.innerHTML = `<div class="class-choice-notice"><span>${esc(t("classChoice.loadError"))}</span><button type="button">${esc(t("classChoice.retry"))}</button></div>`;
    host.querySelector("button").onclick = () => { void attachClassChoice(pc, { host, onSaved, autoOpen }); };
  }
}
