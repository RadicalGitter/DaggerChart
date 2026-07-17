// The character sheet. Renders one PC; HP/Stress/Hope/Armor pips are tappable
// and persist. Live-updates when the GM (or another device) changes the character.
import { t, term, termify, initI18n } from "/shared/i18n.js";
import { paperArtifactHtml } from "/shared/paper.js";
import { traitAccent, traitGraphic } from "/shared/traits.js";
import { setTelemetryMode } from "/shared/telemetry.js";
import { playerFeatureEnabled, setPlayerFeatureContext } from "/shared/player-features.js";
import "/shared/feedback.js";
import "/shared/player-tools.js";

const $ = (sel) => document.querySelector(sel);
const esc = (s) =>
  String(s ?? "").replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

const id = location.pathname.split("/").filter(Boolean).pop();
let PC = null;
let THEMES = { songs: [], published: null, provider: {} };
let sheetSectionObserver = null;
const themeAudio = new Audio();

const featHtml = (f) => `<div class="featline"><strong>${esc(f.name)}</strong> ${termify(esc(f.text))}</div>`;
const TRAITS = ["Agility", "Strength", "Finesse", "Instinct", "Presence", "Knowledge"];

function pips(kind, marked, max, harm) {
  return `<div class="pips" data-pips="${kind}">${Array.from({ length: max }, (_, i) =>
    `<button class="pip ${kind === "hope" ? "hope" : ""} ${i < marked ? `marked ${harm ? "harm" : ""}` : ""}" data-i="${i}" aria-label="${kind} ${i + 1}"></button>`
  ).join("")}</div>`;
}

function render() {
  setTelemetryMode("sheet");
  const p = PC;
  document.documentElement.style.setProperty("--sheet-primary", p.appearance?.primaryColor || "#8b7653");
  document.documentElement.style.setProperty("--sheet-secondary", p.appearance?.secondaryColor || "#9fcdb7");
  const w = p.weapons || {};
  const weaponRow = (label, wp) =>
    wp
      ? `<tr><td>${label}</td><td><strong>${esc(wp.name)}</strong></td><td>${term("trait-" + wp.trait.toLowerCase(), esc(wp.trait))}</td><td>${term("range", esc(wp.range))}</td><td>${term("damage", esc(wp.damage))}</td><td>${termify(esc(wp.feature || ""))}</td></tr>`
      : "";
  $("#sheet").innerHTML = `
    <header class="sheet-head">
      <div class="portrait">${p.portrait ? `<img src="${esc(p.portrait)}" alt="">` : esc(p.name[0] || "?")}</div>
      <div>
        <div class="sheet-name-row"><h1>${esc(p.name)}</h1><button class="name-edit" id="rename-character" type="button" aria-label="${esc(t("sheet.renameName"))}" title="${esc(t("sheet.renameName"))}">✎</button></div>
        <div class="muted">${esc(p.ancestry.name)} ${esc(p.class.name)} — ${esc(p.subclass.name)} · ${term("level", t("sheet.level"))} ${p.level}</div>
        <div class="muted" style="font-size:0.85rem;">${esc(p.community.name)}${p.pronouns ? ` · ${esc(p.pronouns)}` : ""}${p.player ? ` · ${esc(p.player)}` : ""}</div>
        ${playerFeatureEnabled("journal") ? `<div style="margin-top:0.25rem;"><a href="/journal/?pc=${esc(p.id)}" style="color:#d4b86a; font-size:0.85rem; text-decoration:none; border-bottom:1px dotted #8a7550;">${t("journal.open")} ↗</a></div>` : ""}
      </div>
    </header>

    ${sheetNavHtml(p)}

    <section class="sheet-anchor" id="sheet-overview">
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
      (tr) => `<div class="trait-tile" style="--trait-accent:${traitAccent(tr)}"><span class="trait-sheet-symbol" aria-hidden="true">${traitGraphic(tr)}</span><div class="v">${p.traits[tr] >= 0 ? "+" : ""}${p.traits[tr]}</div><div class="smallcaps">${term("trait-" + tr.toLowerCase(), tr)}</div></div>`
    ).join("")}</div>
    </section>

    <div class="sheet-section sheet-anchor" id="sheet-arms">
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

    <div class="sheet-section sheet-anchor" id="sheet-cards">
      <span class="smallcaps">${term("domain", t("sheet.cards"))}</span>
      ${handHtml(p)}
    </div>

    <div class="sheet-section sheet-anchor" id="sheet-features">
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

    ${playerFeatureEnabled("inventory") ? `<div class="sheet-section sheet-anchor" id="sheet-inventory">
      <span class="smallcaps">${t("sheet.carried")}</span>
      <div class="card"><ul class="inventory-list">${p.inventory.map((i) => i.kind === "paper"
        ? `<li><button class="inventory-paper" type="button" data-paper-open="${esc(i.id)}"><strong>${esc(i.name)}</strong><span>${esc(i.paperType === "covenant" ? t("contract.decree") : (i.body || "").slice(0, 110))}</span></button></li>`
        : `<li><strong>${esc(i.name)}</strong>${i.quantity > 1 ? ` ×${i.quantity}` : ""}${i.description ? `<div class="muted">${termify(esc(i.description))}</div>` : ""}</li>`).join("")}</ul>
        <div class="inventory-tools"><button class="quiet" id="paper-new" type="button">${t("inventory.write")}</button></div>
      </div>
    </div>` : ""}

    ${(p.background.length || p.connections.length) ? `<section class="sheet-anchor" id="sheet-story">
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
    </section>` : ""}

    ${playerFeatureEnabled("music") ? themeHtml(p) : ""}
  `;
  wirePips();
  wireHand();
  wireTheme();
  wireInventory();
  wireSheetNav();
  wireIdentity();
}

function sheetNavHtml(p) {
  const sections = [
    ["sheet-overview", "sheet.overview"],
    ["sheet-arms", "sheet.arms"],
    ["sheet-cards", "sheet.cards"],
    ["sheet-features", "sheet.features"],
    ...(playerFeatureEnabled("inventory") ? [["sheet-inventory", "table.inventory"]] : []),
    ...((p.background?.length || p.connections?.length) ? [["sheet-story", "sheet.story"]] : []),
    ...(playerFeatureEnabled("music") ? [["sheet-theme", "theme.title"]] : [])
  ];
  return `<nav class="sheet-nav" aria-label="${esc(t("sheet.sections"))}">${sections.map(([target, label], index) =>
    `<a href="#${target}" data-sheet-target="${target}" ${index === 0 ? 'aria-current="true"' : ""}>${esc(t(label))}</a>`
  ).join("")}</nav>`;
}

function wireSheetNav() {
  sheetSectionObserver?.disconnect();
  const links = [...document.querySelectorAll("[data-sheet-target]")];
  for (const link of links) link.onclick = (event) => {
    event.preventDefault();
    const target = document.getElementById(link.dataset.sheetTarget);
    target?.scrollIntoView({ behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "start" });
  };
  sheetSectionObserver = new IntersectionObserver((entries) => {
    const visible = entries.find((entry) => entry.isIntersecting);
    if (!visible) return;
    for (const link of links) link.setAttribute("aria-current", String(link.dataset.sheetTarget === visible.target.id));
  }, { rootMargin: "-18% 0px -68%", threshold: 0 });
  for (const link of links) {
    const target = document.getElementById(link.dataset.sheetTarget);
    if (target) sheetSectionObserver.observe(target);
  }
}

function closePaperDialog() {
  $("#paper-dialog").hidden = true;
}

function wireIdentity() {
  $("#rename-character").onclick = openNameEditor;
}

function openNameEditor() {
  $("#paper-dialog-body").innerHTML = `<form class="paper-editor name-editor" id="name-editor">
    <h2 id="paper-dialog-title">${t("sheet.renameTitle")}</h2>
    <p class="rename-intro">${t("sheet.renameIntro")}</p>
    <label>${t("sheet.newName")}<input id="character-name" maxlength="80" value="${esc(PC.name)}" autocomplete="off" required></label>
    <label class="gm-approval"><input id="name-gm-approved" type="checkbox"><span>${t("sheet.gmApproved")}</span></label>
    <button type="submit">${t("sheet.saveName")}</button>
    <div class="rename-error" id="name-error" role="alert"></div>
  </form>`;
  $("#paper-dialog").hidden = false;
  $("#character-name").focus();
  $("#name-editor").onsubmit = async (event) => {
    event.preventDefault();
    const error = $("#name-error");
    if (!$("#name-gm-approved").checked) {
      error.textContent = t("sheet.gmApprovalRequired");
      return;
    }
    const submit = event.submitter;
    submit.disabled = true;
    try {
      const response = await fetch(`/api/party/${encodeURIComponent(id)}/name`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: $("#character-name").value, gmApproved: true })
      });
      const body = await response.json();
      if (!response.ok) {
        error.textContent = body.error || t("sheet.renameError");
        submit.disabled = false;
        return;
      }
      PC = body;
      document.title = PC.name;
      closePaperDialog();
      render();
    } catch {
      error.textContent = t("sheet.renameError");
      submit.disabled = false;
    }
  };
}

function openPaper(item) {
  const mayEdit = item.paperType !== "covenant" && item.author === PC.name;
  $("#paper-dialog-body").innerHTML = `${paperArtifactHtml(item, { id: "paper-dialog-title" })}
    ${item.paperType !== "covenant" ? `<div class="paper-dialog-actions">${mayEdit ? `<button type="button" data-paper-edit="${esc(item.id)}">${t("inventory.editPaper")}</button>` : ""}<button class="quiet grave" type="button" data-paper-remove="${esc(item.id)}">${t("inventory.remove")}</button></div>` : ""}`;
  $("#paper-dialog").hidden = false;
  if ($("[data-paper-edit]")) $("[data-paper-edit]").onclick = () => openPaperEditor(item);
  if ($("[data-paper-remove]")) $("[data-paper-remove]").onclick = () => removePaper(item);
}

function openPaperEditor(item = null) {
  $("#paper-dialog-body").innerHTML = `<form class="paper-editor" id="paper-editor">
    <h2 id="paper-dialog-title">${item ? esc(item.name) : t("inventory.write")}</h2>
    <label>${t("inventory.name")}<input id="paper-name" maxlength="120" value="${esc(item?.name || "")}" required></label>
    <label>${t("inventory.paperBody")}<textarea id="paper-body" rows="12" maxlength="12000" required>${esc(item?.body || "")}</textarea></label>
    <button type="submit">${t("inventory.save")}</button>
    <div class="muted" id="paper-error"></div>
  </form>`;
  $("#paper-dialog").hidden = false;
  $("#paper-editor").onsubmit = async (event) => {
    event.preventDefault();
    const response = await fetch(`/api/party/${encodeURIComponent(id)}/inventory${item ? `/${encodeURIComponent(item.id)}` : ""}`, {
      method: item ? "PUT" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ kind: "paper", name: $("#paper-name").value, body: $("#paper-body").value })
    });
    const body = await response.json();
    if (!response.ok) { $("#paper-error").textContent = body.error || t("inventory.error"); return; }
    PC = body;
    closePaperDialog();
    render();
  };
}

async function removePaper(item) {
  if (!confirm(t("inventory.removeConfirm", { name: item.name }))) return;
  const response = await fetch(`/api/party/${encodeURIComponent(id)}/inventory/${encodeURIComponent(item.id)}`, { method: "DELETE" });
  const body = await response.json();
  if (!response.ok) return alert(body.error || t("inventory.error"));
  PC = body;
  closePaperDialog();
  render();
}

function wireInventory() {
  for (const button of document.querySelectorAll("[data-paper-open]")) button.onclick = () => openPaper(PC.inventory.find((item) => item.id === button.dataset.paperOpen));
  const create = $("#paper-new");
  if (create) create.onclick = () => openPaperEditor();
}

function themeHtml(p) {
  const prompt = THEMES.songs?.[0]?.prompt || "";
  const bubbles = THEMES.songs?.length
    ? THEMES.songs.map((song) => `<button class="theme-bubble ${song.status !== "ready" ? "rendering" : ""}" data-theme-play="${esc(song.id)}" aria-label="${t("theme.play")}: ${esc(song.title)}">
        <strong>${esc(song.title)}</strong>
        <span>${song.publishedAt ? t("theme.published") : song.status === "ready" ? t("theme.ready") : t("theme.rendering")}</span>
      </button>`).join("")
    : `<p class="muted" style="text-align:center;align-self:center;">${t("theme.waiting")}</p>`;
  const publish = (THEMES.songs || []).filter((song) => song.status === "ready").map((song) =>
    `<button class="quiet" data-theme-publish="${esc(song.id)}" ${song.publishedAt ? "disabled" : ""}>${song.publishedAt ? t("theme.published") : `${t("theme.publish")}: ${esc(song.title)}`}</button>`
  ).join("");
  return `<section class="sheet-section sheet-anchor card theme-panel" id="sheet-theme">
    <div class="theme-head"><span class="smallcaps">${t("theme.title")}</span></div>
    <div class="theme-bubbles">${bubbles}</div>
    <div class="theme-publish">${publish}</div>
    <details class="theme-settings">
      <summary>${t("theme.settings")}</summary>
      <form class="theme-form" id="theme-form">
        <label><span>${t("theme.songtitle")}</span><input id="theme-title" maxlength="100" value="${esc(`${p.name}'s Overture`)}"></label>
        <label><span>${t("theme.direction")}</span><textarea id="theme-prompt" rows="5" maxlength="6000">${esc(prompt)}</textarea></label>
        <label><span>${t("theme.model")}</span><select id="theme-model"><option>V5_5</option><option>V5</option><option>V4_5PLUS</option><option>V4_5ALL</option><option>V4_5</option><option>V4</option></select></label>
        <label><span>${t("theme.style")}</span><input id="theme-style" maxlength="1000"></label>
        <label><span>${t("theme.exclude")}</span><input id="theme-negative" maxlength="200"></label>
        <button type="submit">${t("theme.generate")}</button>
        <div class="theme-note" id="theme-note"></div>
      </form>
    </details>
  </section>`;
}

function themePopSound() {
  try {
    const Context = window.AudioContext || window.webkitAudioContext;
    const context = new Context();
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.frequency.setValueAtTime(240, context.currentTime);
    oscillator.frequency.exponentialRampToValueAtTime(85, context.currentTime + 0.08);
    gain.gain.setValueAtTime(0.07, context.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, context.currentTime + 0.09);
    oscillator.connect(gain).connect(context.destination);
    oscillator.start();
    oscillator.stop(context.currentTime + 0.1);
    oscillator.onended = () => context.close();
  } catch {
    // Playback still works when synthesized audio is unavailable.
  }
}

function wireTheme() {
  for (const button of document.querySelectorAll("[data-theme-play]")) {
    button.onclick = () => {
      const song = THEMES.songs.find((candidate) => candidate.id === button.dataset.themePlay);
      if (!song) return;
      themePopSound();
      button.classList.remove("preview-pulse");
      void button.offsetWidth;
      button.classList.add("preview-pulse");
      if (song.audioUrl) {
        themeAudio.src = song.audioUrl;
        themeAudio.play().catch(() => {});
      }
      setTimeout(() => button.classList.remove("preview-pulse"), 420);
    };
  }
  for (const button of document.querySelectorAll("[data-theme-publish]")) {
    button.onclick = async () => {
      button.disabled = true;
      const response = await fetch(`/api/music/themes/${id}/publish`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ songId: button.dataset.themePublish })
      });
      const body = await response.json();
      if (!response.ok) {
        button.disabled = false;
        alert(body.error || t("theme.error.publish"));
        return;
      }
      await load();
      const note = $("#theme-note");
      if (note) note.textContent = t("theme.saved");
    };
  }
  const form = $("#theme-form");
  if (form) form.onsubmit = async (event) => {
    event.preventDefault();
    const note = $("#theme-note");
    const submit = form.querySelector("button[type=submit]");
    submit.disabled = true;
    note.textContent = t("theme.sending");
    const response = await fetch(`/api/music/themes/${id}/generate`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: $("#theme-title").value,
        prompt: $("#theme-prompt").value,
        settings: {
          instrumental: true,
          model: $("#theme-model").value,
          style: $("#theme-style").value,
          negativeTags: $("#theme-negative").value
        }
      })
    });
    const body = await response.json();
    if (!response.ok) {
      note.textContent = body.error || t("theme.error.generate");
      submit.disabled = false;
      return;
    }
    await load();
    const nextNote = $("#theme-note");
    if (nextNote) nextNote.textContent = t("theme.sent");
  };
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
  const [res, themeRes] = await Promise.all([
    fetch(`/api/party/${id}`),
    fetch(`/api/music/themes/${id}`)
  ]);
  const [data, themeData] = await Promise.all([res.json(), themeRes.json()]);
  if (!res.ok) {
    $("#sheet").innerHTML = `<p class="smallcaps" style="text-align:center;">${esc(data.error || t("sheet.notfound"))}</p>`;
    return;
  }
  PC = data;
  PC.playerFeatures = setPlayerFeatureContext(PC, PC.id);
  THEMES = themeRes.ok ? themeData : { songs: [], published: null, provider: {} };
  document.title = `${PC.name} — The Settlement`;
  render();
}

initI18n();
$("#paper-dialog-close").onclick = closePaperDialog;
$("#paper-dialog").onclick = (event) => { if (event.target === $("#paper-dialog")) closePaperDialog(); };

// Live updates — but don't clobber a tap in flight; simple debounce via reload.
const stream = new EventSource("/api/stream");
let pending = null;
stream.onmessage = () => {
  clearTimeout(pending);
  pending = setTimeout(load, 400);
};

load();
