// The arms rack: one dialog, shared by every surface that shows a character's
// weapons and armor (field sheet, aged tome). Reference arms come from the SRD
// data; anything found in play is written in by hand. The server recomputes
// damage thresholds and records the change in the Keeper's ledger.
import { t, term, termify } from "/shared/i18n.js";
import { gearEvasion } from "/shared/gear-modifiers.js";

const TRAITS = ["Agility", "Strength", "Finesse", "Instinct", "Presence", "Knowledge"];
const RANGES = ["Melee", "Very Close", "Close", "Far", "Very Far"];
const BURDENS = ["One Handed", "Two Handed"];
const CURRENT = "__current";
const CUSTOM = "__custom";
const NONE = "";

const esc = (value) => String(value ?? "").replace(/[&<>"']/g, (char) =>
  ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]));

let referencePromise = null;
function loadReference() {
  referencePromise ||= fetch("/api/reference").then((response) => {
    if (!response.ok) throw new Error(t("arms.loadError"));
    return response.json();
  }).catch((error) => { referencePromise = null; throw error; });
  return referencePromise;
}

function installStyles() {
  if (document.querySelector('link[data-arms-editor]')) return;
  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = "/shared/arms-editor.css";
  link.dataset.armsEditor = "";
  document.head.append(link);
}

const sameWeapon = (a, b) => a && b && a.name === b.name && a.damage === b.damage && a.trait === b.trait && a.range === b.range;
const sameArmor = (a, b) => a && b && a.name === b.name && Number(a.score) === Number(b.baseScore ?? b.score);

function weaponFacts(weapon) {
  return `<p class="arms-facts">${term(`trait-${weapon.trait.toLowerCase()}`, esc(weapon.trait))} · ${term("range", esc(weapon.range))} · ${term("damage", esc(weapon.damage))} · ${esc(weapon.burden)}</p>
    ${weapon.feature ? `<p class="arms-feature">${termify(esc(weapon.feature))}</p>` : ""}`;
}

function armorFacts(armor, level) {
  const score = armor.baseScore ?? armor.score;
  const major = armor.baseMajorThreshold;
  const severe = armor.baseSevereThreshold;
  const thresholds = Number.isInteger(major) && Number.isInteger(severe)
    ? ` · ${term("thresholds", t("arms.thresholds"))} ${major + level}/${severe + level}`
    : "";
  return `<p class="arms-facts">${term("armor-score", t("arms.score"))} ${esc(score)}${thresholds}</p>
    ${armor.feature ? `<p class="arms-feature">${termify(esc(armor.feature))}</p>` : ""}`;
}

const options = (values, selected) => values.map((value) =>
  `<option value="${esc(value)}"${value === selected ? " selected" : ""}>${esc(value)}</option>`).join("");

function customWeaponFields(slot, weapon) {
  const w = weapon || {};
  return `<div class="arms-custom" data-custom="${slot}">
    <label class="arms-wide">${esc(t("arms.field.name"))}<input name="name" maxlength="80" value="${esc(w.name || "")}" required></label>
    <label>${esc(t("sheet.trait"))}<select name="trait">${options(TRAITS, w.trait || "Strength")}</select></label>
    <label>${esc(t("sheet.range"))}<select name="range">${options(RANGES, w.range || "Melee")}</select></label>
    <label>${esc(t("sheet.damage"))}<input name="damage" maxlength="24" value="${esc(w.damage || "")}" placeholder="d8 phy" required></label>
    ${slot === "secondary"
      ? `<input type="hidden" name="burden" value="One Handed">`
      : `<label>${esc(t("arms.field.burden"))}<select name="burden">${options(BURDENS, w.burden || "One Handed")}</select></label>`}
    <label class="arms-wide">${esc(t("arms.field.feature"))}<input name="feature" maxlength="400" value="${esc(w.feature || "")}"></label>
  </div>`;
}

function customArmorFields(armor) {
  const a = armor || {};
  return `<div class="arms-custom arms-custom-armor" data-custom="armor">
    <label class="arms-wide">${esc(t("arms.field.name"))}<input name="name" maxlength="80" value="${esc(a.name || "")}" required></label>
    <label>${esc(t("arms.score"))}<input name="score" type="number" min="0" max="12" inputmode="numeric" value="${esc(a.score ?? 3)}" required></label>
    <label>${esc(t("arms.field.major"))}<input name="baseMajorThreshold" type="number" min="1" max="60" inputmode="numeric" value="${esc(a.baseMajorThreshold ?? "")}" required></label>
    <label>${esc(t("arms.field.severe"))}<input name="baseSevereThreshold" type="number" min="2" max="90" inputmode="numeric" value="${esc(a.baseSevereThreshold ?? "")}" required></label>
    <label class="arms-wide">${esc(t("arms.field.feature"))}<input name="feature" maxlength="400" value="${esc(a.feature || "")}"></label>
    <p class="arms-hint arms-wide">${esc(t("arms.baseHint"))}</p>
  </div>`;
}

function slotSelect(slot, pc, ref) {
  const current = slot === "armor" ? pc.armor : pc.weapons?.[slot];
  const catalog = slot === "armor"
    ? ref.armors
    : ref.weapons.filter((weapon) => slot === "secondary" ? weapon.type === "SECONDARY" : weapon.type.startsWith("PRIMARY"));
  const matching = current && catalog.find((entry) => slot === "armor" ? sameArmor(current, entry) : sameWeapon(current, entry));
  const selected = matching ? matching.id : current ? CURRENT : NONE;
  const option = (entry) => `<option value="${esc(entry.id)}"${entry.id === selected ? " selected" : ""}>${esc(entry.name)}</option>`;
  const groups = slot === "primary"
    ? `<optgroup label="${esc(t("arms.physical"))}">${catalog.filter((w) => w.type === "PRIMARY_PHYSICAL").map(option).join("")}</optgroup>
       <optgroup label="${esc(t("arms.magic"))}">${catalog.filter((w) => w.type === "PRIMARY_MAGIC").map(option).join("")}</optgroup>`
    : catalog.map(option).join("");
  return `<select id="arms-${slot}" data-slot="${slot}">
    ${current && !matching ? `<option value="${CURRENT}" selected>${esc(t("arms.current", { name: current.name }))}</option>` : ""}
    ${slot !== "primary" ? `<option value="${NONE}"${selected === NONE ? " selected" : ""}>${esc(t(slot === "armor" ? "arms.noArmor" : "arms.none"))}</option>` : ""}
    ${groups}
    <option value="${CUSTOM}">${esc(t("arms.custom"))}</option>
  </select>`;
}

const SLOT_LABELS = { primary: "sheet.primary", secondary: "sheet.secondary", armor: "vital.armor" };

/** Opens the arms rack for `pc`; `onSaved(updatedPc)` receives the server's character view. */
export async function openArmsEditor(pc, { onSaved } = {}) {
  installStyles();
  document.querySelector("dialog.arms-editor")?.remove();
  const dialog = document.createElement("dialog");
  dialog.className = "arms-editor";
  dialog.setAttribute("aria-labelledby", "arms-editor-title");
  dialog.innerHTML = `<p class="arms-loading">${esc(t("arms.loading"))}</p>`;
  document.body.append(dialog);
  dialog.showModal();
  dialog.addEventListener("close", () => dialog.remove());
  dialog.addEventListener("click", (event) => { if (event.target === dialog) dialog.close(); });

  let ref;
  try { ref = await loadReference(); }
  catch (error) {
    dialog.innerHTML = `<p class="arms-error">${esc(error.message)}</p><div class="arms-actions"><button type="button" class="arms-cancel" data-close>${esc(t("arms.cancel"))}</button></div>`;
    dialog.querySelector("[data-close]").onclick = () => dialog.close();
    return;
  }
  const level = Number.isInteger(pc.level) ? pc.level : 1;
  const catalogById = new Map([...ref.weapons, ...ref.armors].map((entry) => [entry.id, entry]));

  dialog.innerHTML = `<form class="arms-form" method="dialog" novalidate>
    <header class="arms-head">
      <div><span class="arms-kicker">${esc(t("sheet.arms"))}</span><h2 id="arms-editor-title">${esc(t("arms.title"))}</h2></div>
      <button type="button" class="arms-close" data-close aria-label="${esc(t("arms.cancel"))}">×</button>
    </header>
    <p class="arms-intro">${esc(t("arms.intro"))}</p>
    <div class="arms-slots">${["primary", "secondary", "armor"].map((slot) => `
      <section class="arms-slot" data-slot-card="${slot}">
        <label class="arms-slot-label" for="arms-${slot}">${esc(t(SLOT_LABELS[slot]))}</label>
        ${slotSelect(slot, pc, ref)}
        <div class="arms-detail" data-detail="${slot}"></div>
      </section>`).join("")}
    </div>
    <p class="arms-outcome" id="arms-outcome" aria-live="polite"></p>
    <p class="arms-error" role="alert" id="arms-error"></p>
    <div class="arms-actions">
      <button type="button" class="arms-cancel" data-close>${esc(t("arms.cancel"))}</button>
      <button type="submit" class="arms-save">${esc(t("arms.save"))}</button>
    </div>
  </form>`;

  const form = dialog.querySelector("form");
  const select = (slot) => form.querySelector(`[data-slot="${slot}"]`);
  const currentOf = (slot) => slot === "armor" ? pc.armor : pc.weapons?.[slot];

  const renderDetail = (slot) => {
    const value = select(slot).value;
    const detail = form.querySelector(`[data-detail="${slot}"]`);
    if (value === CUSTOM) {
      // Seed with what is carried only when it is already hand-written.
      const seed = select(slot).querySelector(`option[value="${CURRENT}"]`) ? currentOf(slot) : null;
      detail.innerHTML = slot === "armor" ? customArmorFields(seed) : customWeaponFields(slot, seed);
    } else if (value === CURRENT) {
      const current = currentOf(slot);
      detail.innerHTML = slot === "armor" ? armorFacts(current, level) : weaponFacts(current);
    } else if (value === NONE) {
      detail.innerHTML = `<p class="arms-hint">${esc(t(slot === "armor" ? "arms.unarmoredHint" : "arms.noneHint", { major: level, severe: 2 * level }))}</p>`;
    } else {
      const entry = catalogById.get(value);
      detail.innerHTML = slot === "armor" ? armorFacts(entry, level) : weaponFacts(entry);
    }
  };

  const primaryBurden = () => {
    const value = select("primary").value;
    if (value === CUSTOM) return form.querySelector('[data-custom="primary"] [name="burden"]')?.value;
    if (value === CURRENT) return pc.weapons?.primary?.burden;
    return catalogById.get(value)?.burden;
  };

  const syncHands = () => {
    const twoHanded = primaryBurden() === "Two Handed";
    const secondary = select("secondary");
    if (twoHanded && secondary.value !== NONE) { secondary.value = NONE; renderDetail("secondary"); }
    secondary.disabled = twoHanded;
    const card = form.querySelector('[data-slot-card="secondary"]');
    card.classList.toggle("is-blocked", twoHanded);
    if (twoHanded) form.querySelector('[data-detail="secondary"]').innerHTML = `<p class="arms-hint">${esc(t("arms.twoHanded"))}</p>`;
  };

  // What the chosen kit would be, for the Evasion preview.
  const chosen = (slot) => {
    const value = select(slot).value;
    if (value === CURRENT) return currentOf(slot);
    if (value === NONE) return null;
    if (value === CUSTOM) return { feature: form.querySelector(`[data-custom="${slot}"] [name="feature"]`)?.value || "" };
    return catalogById.get(value) || null;
  };
  const baseEvasion = Number(pc.evasion) - gearEvasion(pc);
  const renderOutcome = () => {
    const next = baseEvasion + gearEvasion({ armor: chosen("armor"), weapons: { primary: chosen("primary"), secondary: chosen("secondary") } });
    const outcome = form.querySelector("#arms-outcome");
    outcome.innerHTML = Number.isFinite(next)
      ? `${term("evasion", "Evasion")} <strong>${esc(next)}</strong>${next !== Number(pc.evasion) ? ` <span class="arms-was">${esc(t("arms.was", { n: pc.evasion }))}</span>` : ""}`
      : "";
  };

  for (const slot of ["primary", "secondary", "armor"]) {
    renderDetail(slot);
    select(slot).addEventListener("change", () => { renderDetail(slot); syncHands(); renderOutcome(); form.querySelector("#arms-error").textContent = ""; });
  }
  form.addEventListener("change", (event) => { if (event.target.name === "burden") syncHands(); });
  form.addEventListener("input", (event) => { if (event.target.name === "feature") renderOutcome(); });
  syncHands();
  renderOutcome();
  for (const button of dialog.querySelectorAll("[data-close]")) button.onclick = () => dialog.close();

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const error = form.querySelector("#arms-error");
    error.textContent = "";
    const body = {};
    for (const slot of ["primary", "secondary", "armor"]) {
      const value = select(slot).value;
      if (value === CURRENT) continue;
      if (value === NONE) { if (currentOf(slot)) body[slot] = null; continue; }
      if (value === CUSTOM) {
        const fields = form.querySelector(`[data-custom="${slot}"]`);
        const custom = Object.fromEntries([...fields.querySelectorAll("[name]")].map((input) => [input.name, input.type === "number" ? Number(input.value) : input.value]));
        body[slot] = { custom };
      } else {
        body[slot] = { id: value };
      }
    }
    if (!Object.keys(body).length) { dialog.close(); return; }
    const save = form.querySelector(".arms-save");
    save.disabled = true;
    try {
      const response = await fetch(`/api/party/${encodeURIComponent(pc.id)}/equipment`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body)
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || t("arms.saveError"));
      dialog.close();
      onSaved?.(result);
    } catch (failure) {
      error.textContent = failure.message || t("arms.saveError");
      save.disabled = false;
    }
  });
}
