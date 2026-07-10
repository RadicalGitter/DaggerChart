// The character sheet. Renders one PC; HP/Stress/Hope/Armor pips are tappable
// and persist. Live-updates when the GM (or another device) changes the character.
import { t, term, termify, initI18n } from "/shared/i18n.js";

const $ = (sel) => document.querySelector(sel);
const esc = (s) =>
  String(s ?? "").replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

const id = location.pathname.split("/").filter(Boolean).pop();
let PC = null;

const featHtml = (f) => `<div class="featline"><strong>${esc(f.name)}</strong> ${termify(esc(f.text))}</div>`;
const TRAITS = ["Agility", "Strength", "Finesse", "Instinct", "Presence", "Knowledge"];

function pips(kind, marked, max, harm) {
  return `<div class="pips" data-pips="${kind}">${Array.from({ length: max }, (_, i) =>
    `<button class="pip ${kind === "hope" ? "hope" : ""} ${i < marked ? `marked ${harm ? "harm" : ""}` : ""}" data-i="${i}" aria-label="${kind} ${i + 1}"></button>`
  ).join("")}</div>`;
}

function render() {
  const p = PC;
  const w = p.weapons || {};
  const weaponRow = (label, wp) =>
    wp
      ? `<tr><td>${label}</td><td><strong>${esc(wp.name)}</strong></td><td>${term("trait-" + wp.trait.toLowerCase(), esc(wp.trait))}</td><td>${term("range", esc(wp.range))}</td><td>${term("damage", esc(wp.damage))}</td><td>${termify(esc(wp.feature || ""))}</td></tr>`
      : "";
  $("#sheet").innerHTML = `
    <header>
      <div class="portrait">${p.portrait ? `<img src="${esc(p.portrait)}" alt="">` : esc(p.name[0] || "?")}</div>
      <div>
        <h1>${esc(p.name)}</h1>
        <div class="muted">${esc(p.ancestry.name)} ${esc(p.class.name)} — ${esc(p.subclass.name)} · ${term("level", t("sheet.level"))} ${p.level}</div>
        <div class="muted" style="font-size:0.85rem;">${esc(p.community.name)}${p.pronouns ? ` · ${esc(p.pronouns)}` : ""}${p.player ? ` · ${esc(p.player)}` : ""}</div>
      </div>
    </header>

    <div class="defenses card">
      <div><div class="value">${p.evasion}</div><div class="smallcaps">${term("evasion", t("vital.evasion"))}</div></div>
      <div><div class="value">${p.armor ? p.armor.score : 0}</div><div class="smallcaps">${term("armor-score", t("vital.armor"))}</div></div>
      <div><div class="value">${p.thresholds.major} / ${p.thresholds.severe}</div><div class="smallcaps">${term("thresholds", t("arms.thresholds"))}</div></div>
    </div>

    <div class="card vitals">
      <div class="vital"><span class="smallcaps">${term("hp", t("vital.hp"))}</span>${pips("hp", p.hp, p.hpMax, true)}</div>
      <div class="vital"><span class="smallcaps">${term("stress", t("vital.stress"))}</span>${pips("stress", p.stress, p.stressMax, true)}</div>
      <div class="vital"><span class="smallcaps">${term("hope", t("vital.hope"))}</span>${pips("hope", p.hope, p.hopeMax, false)}</div>
      ${p.armor ? `<div class="vital"><span class="smallcaps">${term("armor-slots", t("vital.armorslots"))}</span>${pips("armorMarked", p.armorMarked, p.armor.score, true)}</div>` : ""}
    </div>

    <div class="traits-grid">${TRAITS.map(
      (tr) => `<div class="card trait-tile"><div class="v">${p.traits[tr] >= 0 ? "+" : ""}${p.traits[tr]}</div><div class="smallcaps">${term("trait-" + tr.toLowerCase(), tr)}</div></div>`
    ).join("")}</div>

    <div class="sheet-section">
      <span class="smallcaps">${t("sheet.arms")}</span>
      <div class="card" style="overflow-x:auto;">
        <table class="ledger">
          <tr><th></th><th>${t("sheet.weapon")}</th><th>${t("sheet.trait")}</th><th>${t("sheet.range")}</th><th>${t("sheet.damage")}</th><th>${t("sheet.notes")}</th></tr>
          ${weaponRow(t("sheet.primary"), w.primary)}${weaponRow(t("sheet.secondary"), w.secondary)}
        </table>
        ${p.armor ? `<div class="featline" style="margin-top:0.6rem;"><strong>${esc(p.armor.name)}</strong> ${termify(esc(p.armor.feature || ""))}</div>` : ""}
      </div>
    </div>

    <div class="sheet-section">
      <span class="smallcaps">${term("experience", t("sheet.exp"))}</span>
      <div class="card">${p.experiences.map((e) => `<div class="featline"><strong>${esc(e.name)}</strong> +${e.bonus}</div>`).join("")}</div>
    </div>

    <div class="sheet-section">
      <span class="smallcaps">${term("domain", t("sheet.cards"))}</span>
      ${handHtml(p)}
    </div>

    <div class="sheet-section">
      <span class="smallcaps">${t("sheet.features")}</span>
      <div class="card">
        ${p.features.hopeFeature ? `<div class="smallcaps">${term("hope", t("sheet.hopefeat"))}</div>${featHtml(p.features.hopeFeature)}` : ""}
        <div class="smallcaps">${t("sheet.class")}</div>${(p.features.classFeatures || []).map(featHtml).join("")}
        <div class="smallcaps">${esc(p.subclass.name)}</div>${(p.features.foundation || []).map(featHtml).join("")}
        ${p.subclass.spellcastTrait ? `<div class="featline muted">${term("spellcast", t("sheet.spellcast"))} ${esc(p.subclass.spellcastTrait)}</div>` : ""}
        <div class="smallcaps">${esc(p.ancestry.name)}</div>${(p.features.ancestry || []).map(featHtml).join("")}
        <div class="smallcaps">${esc(p.community.name)}</div>${(p.features.community || []).map(featHtml).join("")}
      </div>
    </div>

    <div class="sheet-section">
      <span class="smallcaps">${t("sheet.carried")}</span>
      <div class="card"><ul>${p.inventory.map((i) => `<li>${esc(i)}</li>`).join("")}</ul></div>
    </div>

    ${p.background.length
      ? `<div class="sheet-section"><span class="smallcaps">${t("sheet.background")}</span><div class="card">${p.background
          .map((b) => `<div class="qa"><div class="q">${esc(b.q)}</div><div>${esc(b.a)}</div></div>`)
          .join("")}</div></div>`
      : ""}

    ${p.connections.length
      ? `<div class="sheet-section"><span class="smallcaps">${t("sheet.connections")}</span><div class="card">${p.connections
          .map((c) => `<div class="qa"><div class="q">${esc(c.q)}</div><div>${esc(c.note)}</div></div>`)
          .join("")}</div></div>`
      : ""}
  `;
  wirePips();
  wireHand();
}

// ---------- the hand: Loadout (max 5) & Vault ----------
const LOADOUT_MAX = 5;
let REF = null; // lazy-loaded reference data for acquiring new cards
let acquiring = false;

const loc = (c) => c.location || "loadout";

// Transient hand message; lives in render state so live-refreshes keep it.
let handNote = "";
let handNoteTimer = null;
function note(msg) {
  handNote = msg;
  clearTimeout(handNoteTimer);
  handNoteTimer = setTimeout(() => { handNote = ""; render(); }, 4000);
  render();
}

function cardHtml(d, actions) {
  return `<div class="card">
    <strong>${esc(d.name)}</strong>
    <span class="pill" style="margin-left:0.4rem;">${esc(d.domain)} · ${esc(d.type)} · Lv ${d.level} · ${term("recall", "Recall")} ${d.recallCost}</span>
    <div class="featline">${termify(esc(d.text))}</div>
    ${actions ? `<div class="hand-actions">${actions}</div>` : ""}
  </div>`;
}

function handHtml(p) {
  const cards = p.domainCards || [];
  const loadout = cards.filter((c) => loc(c) === "loadout");
  const vault = cards.filter((c) => loc(c) === "vault");
  const acquirePanel = acquiring && REF ? acquireHtml(p) : "";
  return `
    <div class="hand-sub">${term("loadout", "Loadout")} <span class="muted">${loadout.length}/${LOADOUT_MAX}</span></div>
    <div class="cardstack">${loadout
      .map((d) => cardHtml(d, `<button class="quiet" data-stow="${d.id}">${t("hand.stow")}</button>`))
      .join("")}</div>
    <div class="hand-sub">${term("vault", "Vault")} <span class="muted">${vault.length}</span></div>
    <div class="cardstack">${
      vault.length
        ? vault
            .map((d) =>
              cardHtml(
                d,
                `<button class="quiet" data-readyc="${d.id}">${t("hand.ready")}</button>
                 <button class="quiet grave" data-drop="${d.id}">${t("hand.giveup")}</button>`
              )
            )
            .join("")
        : `<div class="muted" style="font-size:0.9rem;">${t("hand.vaultEmpty")}</div>`
    }</div>
    <div style="margin-top:0.8rem;">
      <button class="quiet" id="hand-acquire">${acquiring ? t("hand.done") : t("hand.acquire")}</button>
    </div>
    ${handNote ? `<div class="muted" style="margin-top:0.5rem;font-size:0.88rem;">${esc(handNote)}</div>` : ""}
    ${acquirePanel}`;
}

function acquireHtml(p) {
  const owned = new Set((p.domainCards || []).map((c) => c.id));
  const available = REF.domainCards
    .filter((d) => p.class.domains.includes(d.domain) && !owned.has(d.id))
    .sort((a, b) => a.level - b.level || a.domain.localeCompare(b.domain));
  let lastLevel = null;
  let html = `<div class="hand-sub" style="margin-top:1rem;">${t("hand.available")}</div><div class="cardstack">`;
  for (const d of available) {
    if (d.level !== lastLevel) {
      lastLevel = d.level;
      html += `<div class="smallcaps" style="margin-top:0.4rem;">${t("sheet.level")} ${d.level}</div>`;
    }
    const locked = d.level > p.level;
    html += locked
      ? `<div style="opacity:0.45;">${cardHtml(d, `<span class="muted" style="font-size:0.82rem;">${t("hand.aboveLevel")}</span>`)}</div>`
      : cardHtml(d, `<button data-takec="${d.id}">${t("hand.take")}</button>`);
  }
  return html + "</div>";
}

async function saveCards() {
  await fetch(`/api/party/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ domainCards: PC.domainCards })
  });
}

function wireHand() {
  for (const el of document.querySelectorAll("[data-stow]")) {
    el.onclick = async () => {
      PC.domainCards.find((c) => c.id === el.dataset.stow).location = "vault";
      render();
      await saveCards();
    };
  }
  for (const el of document.querySelectorAll("[data-readyc]")) {
    el.onclick = async () => {
      if (PC.domainCards.filter((c) => loc(c) === "loadout").length >= LOADOUT_MAX) {
        note(t("hand.full"));
        return;
      }
      PC.domainCards.find((c) => c.id === el.dataset.readyc).location = "loadout";
      render();
      await saveCards();
    };
  }
  for (const el of document.querySelectorAll("[data-drop]")) {
    el.onclick = async () => {
      const card = PC.domainCards.find((c) => c.id === el.dataset.drop);
      if (!confirm(t("hand.confirmRemove", { name: card.name }))) return;
      PC.domainCards = PC.domainCards.filter((c) => c.id !== card.id);
      render();
      await saveCards();
    };
  }
  for (const el of document.querySelectorAll("[data-takec]")) {
    el.onclick = async () => {
      const card = REF.domainCards.find((d) => d.id === el.dataset.takec);
      const full = PC.domainCards.filter((c) => loc(c) === "loadout").length >= LOADOUT_MAX;
      PC.domainCards.push({ ...card, location: full ? "vault" : "loadout" });
      render();
      if (full) note(t("hand.tovault"));
      await saveCards();
    };
  }
  const acq = document.querySelector("#hand-acquire");
  if (acq) {
    acq.onclick = async () => {
      if (!acquiring && !REF) REF = await (await fetch("/api/reference")).json();
      acquiring = !acquiring;
      render();
    };
  }
}

// Tap pip N: if it's the first unmarked, mark it; tapping a marked pip at the
// end clears back to it. Net effect: tap right of the fill to add, tap the
// last filled to remove.
function wirePips() {
  for (const group of document.querySelectorAll("[data-pips]")) {
    const kind = group.dataset.pips;
    for (const pip of group.querySelectorAll(".pip")) {
      pip.onclick = async () => {
        const i = parseInt(pip.dataset.i, 10);
        const current = PC[kind];
        const next = i + 1 === current ? i : i + 1;
        PC[kind] = next;
        render();
        await fetch(`/api/party/${id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ [kind]: next })
        });
      };
    }
  }
}

async function load() {
  const res = await fetch(`/api/party/${id}`);
  const data = await res.json();
  if (!res.ok) {
    $("#sheet").innerHTML = `<p class="smallcaps" style="text-align:center;">${esc(data.error || t("sheet.notfound"))}</p>`;
    return;
  }
  PC = data;
  document.title = `${PC.name} — The Settlement`;
  render();
}

initI18n();

// Live updates — but don't clobber a tap in flight; simple debounce via reload.
const stream = new EventSource("/api/stream");
let pending = null;
stream.onmessage = () => {
  clearTimeout(pending);
  pending = setTimeout(load, 400);
};

load();
