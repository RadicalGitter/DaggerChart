// Character creation wizard. Each step tables its choices into the draft;
// the finished draft becomes the character sheet.
import { t, term, termify, initI18n } from "/shared/i18n.js";
import { DEFAULT_SHELL } from "/shared/shells.js";
import { PENS } from "/shared/pens.js";
import { covenantArticlesHtml } from "/shared/paper.js";
import { setTelemetryMode } from "/shared/telemetry.js";
import "/shared/feedback.js";

const $ = (sel) => document.querySelector(sel);
const esc = (s) =>
  String(s ?? "").replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

let REF = null;
let PARTY = [];
let step = 0;
let part = 0;
let moving = false;
let draftSaveTimer = null;
let draftComplete = false;

const DRAFT_KEY = "settlement-create-draft";
const DRAFT_ID_KEY = "settlement-create-draft-id";
const draftParams = new URLSearchParams(location.search);
if (draftParams.get("new") === "1") {
  localStorage.removeItem(DRAFT_KEY);
  localStorage.removeItem(DRAFT_ID_KEY);
}
const draftId = draftParams.get("draft") || localStorage.getItem(DRAFT_ID_KEY) || `draft_${crypto.randomUUID?.() || `${Date.now()}_${Math.random().toString(36).slice(2, 10)}`}`;
localStorage.setItem(DRAFT_ID_KEY, draftId);

const draft = {
  name: "", player: "", pronouns: "",
  classId: null, subclassId: null, classItem: null,
  ancestryId: null, communityId: null,
  traits: { Agility: null, Strength: null, Finesse: null, Instinct: null, Presence: null, Knowledge: null },
  primaryId: null, secondaryId: null, armorId: null, potion: null,
  experiences: ["", ""],
  background: {},   // question -> answer
  domainCardIds: [],
  connections: {},  // question/name -> note
  shell: DEFAULT_SHELL,
  pen: PENS[0].id,
  covenant: { read: false, warned: false, signed: false, signedAt: null }
};

const cls = () => REF.classes.find((c) => c.id === draft.classId) || null;
const sub = () => cls()?.subclasses.find((s) => s.id === draft.subclassId) || null;
const anc = () => REF.ancestries.find((a) => a.id === draft.ancestryId) || null;
const com = () => REF.communities.find((c) => c.id === draft.communityId) || null;
const wpn = (id) => REF.weapons.find((w) => w.id === id) || null;
const arm = () => REF.armors.find((a) => a.id === draft.armorId) || null;

const featHtml = (f) => `<div class="featline"><strong>${esc(f.name)}</strong> ${termify(esc(f.text))}</div>`;

// ---------- steps ----------
const steps = [
  {
    title: () => t("step.who.title"),
    sub: () => t("step.who.sub"),
    render() {
      return `<div class="card">
        <div class="formrow"><label>${t("label.charname")}</label><input type="text" id="f-name" value="${esc(draft.name)}"></div>
        <div class="formrow"><label>${t("label.pronouns")}</label><input type="text" id="f-pronouns" value="${esc(draft.pronouns)}"></div>
        <div class="formrow"><label>${t("label.player")}</label><input type="text" id="f-player" value="${esc(draft.player)}"></div>
      </div>`;
    },
    collect() {
      draft.name = $("#f-name").value.trim();
      draft.pronouns = $("#f-pronouns").value.trim();
      draft.player = $("#f-player").value.trim();
      if (!draft.name) return t("warn.name");
    }
  },
  {
    title: () => t("step.class.title"),
    sub: () => t("step.class.sub"),
    render() {
      return `<div class="options">${REF.classes
        .map(
          (c) => `<div class="card pick ${draft.classId === c.id ? "selected" : ""}" data-pick="${c.id}">
            <h3>${esc(c.name)}</h3>
            <div class="smallcaps">${c.domains.map(esc).join(" · ")}</div>
            <div class="desc">${esc(c.description.split(". ")[0])}.</div>
            <div class="muted" style="font-size:0.82rem; margin-top:0.4rem;">${term("evasion", "Evasion")} ${c.startingEvasion} · ${term("hp", "Hit Points")} ${c.startingHitPoints}</div>
          </div>`
        )
        .join("")}</div>`;
    },
    onPick(id) {
      if (draft.classId !== id) {
        draft.subclassId = null;
        draft.classItem = null;
        draft.domainCardIds = [];
        draft.background = {};
        draft.connections = {};
      }
      draft.classId = id;
    },
    collect() {
      if (!draft.classId) return t("warn.class");
    }
  },
  {
    title: () => t("step.subclass.title"),
    sub: () => t("step.subclass.sub"),
    parts: () => cls()?.classItems.length ? 2 : 1,
    render(currentPart) {
      const c = cls();
      if (currentPart === 1) {
        return `<div class="smallcaps" style="text-align:center; margin-bottom:0.6rem;">${t("subclass.item")}</div>
          <div class="options">${c.classItems
             .map((it) => `<div class="card pick ${draft.classItem === it ? "selected" : ""}" data-item="${esc(it)}">${esc(it)}</div>`)
             .join("")}</div>`;
      }
      return `<div class="options wide">${c.subclasses
        .map(
          (s) => `<div class="card pick ${draft.subclassId === s.id ? "selected" : ""}" data-pick="${s.id}">
            <h3>${esc(s.name)}</h3>
            ${s.spellcastTrait ? `<div class="smallcaps">${term("spellcast", "Spellcast")}: ${esc(s.spellcastTrait)}</div>` : ""}
            ${s.foundation.map(featHtml).join("")}
          </div>`
        )
        .join("")}</div>`;
    },
    onPick(id) { draft.subclassId = id; },
    collect(currentPart) {
      if (currentPart === 0 && !draft.subclassId) return t("warn.subclass");
      if (currentPart === 1 && !draft.classItem) return t("warn.classitem");
    }
  },
  {
    title: () => t("step.heritage.title"),
    sub: () => t("step.heritage.sub"),
    parts: 2,
    render(currentPart) {
      if (currentPart === 0) return `<div class="smallcaps" style="text-align:center; margin-bottom:0.6rem;">${t("heritage.ancestry")}</div>
        <div class="options">${REF.ancestries
          .map(
            (a) => `<div class="card pick ${draft.ancestryId === a.id ? "selected" : ""}" data-anc="${a.id}">
              <h3>${esc(a.name)}</h3>
              ${draft.ancestryId === a.id ? a.features.map(featHtml).join("") : `<div class="desc">${esc(a.description.split(". ")[0])}.</div>`}
            </div>`
          )
          .join("")}</div>`;
      return `<div class="smallcaps" style="text-align:center; margin-bottom:0.6rem;">${t("heritage.community")}</div>
        <div class="options">${REF.communities
          .map(
            (c) => `<div class="card pick ${draft.communityId === c.id ? "selected" : ""}" data-com="${c.id}">
              <h3>${esc(c.name)}</h3>
              ${draft.communityId === c.id ? c.features.map(featHtml).join("") : `<div class="desc">${esc(c.description.split(". ")[0])}.</div>`}
            </div>`
          )
          .join("")}</div>`;
    },
    wire(root) {
      for (const el of root.querySelectorAll("[data-anc]")) el.onclick = () => { draft.ancestryId = el.dataset.anc; rerender(); };
      for (const el of root.querySelectorAll("[data-com]")) el.onclick = () => { draft.communityId = el.dataset.com; rerender(); };
    },
    collect(currentPart) {
      if (currentPart === 0 && !draft.ancestryId) return t("warn.ancestry");
      if (currentPart === 1 && !draft.communityId) return t("warn.community");
    }
  },
  {
    title: () => t("step.traits.title"),
    sub: () => t("step.traits.sub"),
    render() {
      const opts = (cur) =>
        [2, 1, 0, -1]
          .map((v) => `<option value="${v}" ${cur === v ? "selected" : ""}>${v >= 0 ? "+" : ""}${v}</option>`)
          .join("");
      return `<div class="trait-grid">${REF.traits
        .map(
          (tr) => `<div class="card trait-cell">
            <div class="smallcaps">${term("trait-" + tr.toLowerCase(), tr)}</div>
            <select data-trait="${tr}">
              <option value="" ${draft.traits[tr] === null ? "selected" : ""}>—</option>${opts(draft.traits[tr])}
            </select>
          </div>`
        )
        .join("")}</div>
        <div class="count-note">${t("traits.note")}</div>`;
    },
    wire(root) {
      for (const el of root.querySelectorAll("[data-trait]")) {
        el.onchange = () => {
          draft.traits[el.dataset.trait] = el.value === "" ? null : parseInt(el.value, 10);
        };
      }
    },
    collect() {
      const vals = Object.values(draft.traits);
      if (vals.some((v) => v === null)) return t("warn.traits.all");
      const need = [...REF.traitArray].sort().join(",");
      const got = [...vals].sort().join(",");
      if (need !== got) return t("warn.traits.set");
    }
  },
  {
    title: () => t("step.arms.title"),
    sub: () => t("step.arms.sub"),
    parts: () => wpn(draft.primaryId)?.burden === "One Handed" ? 4 : 3,
    render(currentPart) {
      const equipmentPart = currentPart > 0 && wpn(draft.primaryId)?.burden !== "One Handed" ? currentPart + 1 : currentPart;
      const c = cls();
      const wcard = (w, key) => `<div class="card pick ${draft[key] === w.id ? "selected" : ""}" data-${key === "primaryId" ? "pri" : "sec"}="${w.id}">
        <h3>${esc(w.name)}</h3>
        <div class="muted" style="font-size:0.84rem;">${term("trait-" + w.trait.toLowerCase(), esc(w.trait))} · ${term("range", esc(w.range))} · ${term("damage", esc(w.damage))} · ${term("burden", esc(w.burden))}</div>
        ${w.feature ? `<div class="featline">${termify(esc(w.feature))}</div>` : ""}
      </div>`;
      const primaries = REF.weapons.filter((w) => w.type.startsWith("PRIMARY"));
      const secondaries = REF.weapons.filter((w) => w.type === "SECONDARY");
      if (equipmentPart === 0) return `<div class="statline">
          <div class="stat"><div class="value">${c.startingEvasion}</div><div class="smallcaps">${term("evasion", "Evasion")}</div></div>
          <div class="stat"><div class="value">${c.startingHitPoints}</div><div class="smallcaps">${term("hp", "Hit Points")}</div></div>
          <div class="stat"><div class="value">${REF.startingStress}</div><div class="smallcaps">${term("stress", "Stress")}</div></div>
          <div class="stat"><div class="value">${REF.startingHope}</div><div class="smallcaps">${term("hope", "Hope")}</div></div>
        </div>
        <div class="smallcaps" style="text-align:center; margin-bottom:0.6rem;">${t("arms.primary")}</div>
        <div class="options">${primaries.map((w) => wcard(w, "primaryId")).join("")}</div>`;
      if (equipmentPart === 1) return `<div class="smallcaps" style="text-align:center; margin-bottom:0.6rem;">${t("arms.secondary")}</div>
        <div class="options">${secondaries.map((w) => wcard(w, "secondaryId")).join("")}</div>`;
      if (equipmentPart === 2) return `<div class="smallcaps" style="text-align:center; margin-bottom:0.6rem;">${t("arms.armor")}</div>
        <div class="options">${REF.armors
          .map(
            (a) => `<div class="card pick ${draft.armorId === a.id ? "selected" : ""}" data-arm="${a.id}">
              <h3>${esc(a.name)}</h3>
              <div class="muted" style="font-size:0.84rem;">${term("armor-score", "Score")} ${a.baseScore} · ${term("thresholds", t("arms.thresholds"))} ${a.baseMajorThreshold}/${a.baseSevereThreshold} (+${t("sheet.level").toLowerCase()})</div>
              ${a.feature ? `<div class="featline">${termify(esc(a.feature))}</div>` : ""}
            </div>`
          )
          .join("")}</div>`;
      return `<div class="smallcaps" style="text-align:center; margin-bottom:0.6rem;">${t("arms.potion")}</div>
        <div class="options">${REF.potionChoice
          .map((p) => `<div class="card pick ${draft.potion === p ? "selected" : ""}" data-pot="${esc(p)}">${esc(p)}</div>`)
          .join("")}</div>
        <div class="count-note">${t("arms.alsocarry")} ${REF.startingInventory.map(esc).join(", ").toLowerCase()}.</div>`;
    },
    wire(root) {
      for (const el of root.querySelectorAll("[data-pri]")) el.onclick = () => {
        draft.primaryId = el.dataset.pri;
        if (wpn(draft.primaryId)?.burden !== "One Handed") draft.secondaryId = null;
        rerender();
      };
      for (const el of root.querySelectorAll("[data-sec]")) el.onclick = () => { draft.secondaryId = draft.secondaryId === el.dataset.sec ? null : el.dataset.sec; rerender(); };
      for (const el of root.querySelectorAll("[data-arm]")) el.onclick = () => { draft.armorId = el.dataset.arm; rerender(); };
      for (const el of root.querySelectorAll("[data-pot]")) el.onclick = () => { draft.potion = el.dataset.pot; rerender(); };
    },
    collect(currentPart) {
      const equipmentPart = currentPart > 0 && wpn(draft.primaryId)?.burden !== "One Handed" ? currentPart + 1 : currentPart;
      if (equipmentPart === 0 && !draft.primaryId) return t("warn.primary");
      if (equipmentPart === 1 && draft.secondaryId && wpn(draft.primaryId)?.burden !== "One Handed") return t("warn.secondary");
      if (equipmentPart === 2 && !draft.armorId) return t("warn.armor");
      if (equipmentPart === 3 && !draft.potion) return t("warn.potion");
    }
  },
  {
    title: () => t("step.exp.title"),
    sub: () => t("step.exp.sub"),
    render() {
      return `<div class="card">
        ${[0, 1]
          .map(
            (i) => `<div class="formrow"><label>${term("experience", t("label.exp"))} ${i + 1}</label>
              <input type="text" id="f-exp-${i}" value="${esc(draft.experiences[i])}" placeholder="${t("exp.placeholder")}"></div>`
          )
          .join("")}
      </div>`;
    },
    collect() {
      draft.experiences = [0, 1].map((i) => $(`#f-exp-${i}`).value.trim());
      if (draft.experiences.some((e) => !e)) return t("warn.exp");
    }
  },
  {
    title: () => t("step.bg.title"),
    sub: () => t("step.bg.sub"),
    parts: () => cls()?.backgroundQuestions.length || 1,
    render(currentPart) {
      const q = cls().backgroundQuestions[currentPart];
      return `<div class="qa card">
        <div class="q">${esc(q)}</div>
        <textarea rows="4" data-bg="${currentPart}">${esc(draft.background[q] || "")}</textarea>
      </div>`;
    },
    wire(root) {
      for (const el of root.querySelectorAll("[data-bg]")) {
        el.onchange = () => {
          const q = cls().backgroundQuestions[parseInt(el.dataset.bg, 10)];
          draft.background[q] = el.value.trim();
        };
      }
    },
    collect(currentPart) {
      const q = cls().backgroundQuestions[currentPart];
      const field = $(`[data-bg="${currentPart}"]`);
      if (field) draft.background[q] = field.value.trim();
    }
  },
  {
    title: () => t("step.cards.title"),
    sub() { return t("step.cards.sub", { domains: cls().domains.map((d) => title(d)).join(" & ") }); },
    render() {
      const cards = REF.domainCards.filter((d) => d.level === 1 && cls().domains.includes(d.domain));
      return `<div class="options wide">${cards
        .map(
          (d) => `<div class="card pick ${draft.domainCardIds.includes(d.id) ? "selected" : ""}" data-pick="${d.id}">
            <h3>${esc(d.name)}</h3>
            <div class="smallcaps">${term("domain", esc(title(d.domain)))} · ${esc(d.type)} · ${term("recall", "Recall")} ${d.recallCost}</div>
            <div class="featline">${termify(esc(d.text))}</div>
          </div>`
        )
        .join("")}</div>
        <div class="count-note">${t("cards.count", { n: draft.domainCardIds.length })}</div>`;
    },
    onPick(id) {
      if (draft.domainCardIds.includes(id)) {
        draft.domainCardIds = draft.domainCardIds.filter((x) => x !== id);
      } else if (draft.domainCardIds.length < 2) {
        draft.domainCardIds.push(id);
      }
    },
    collect() {
      if (draft.domainCardIds.length !== 2) return t("warn.cards");
    }
  },
  {
    title: () => t("step.conn.title"),
    sub: () => t("step.conn.sub"),
    parts: () => cls()?.connectionQuestions.length || 1,
    render(currentPart) {
      const q = cls().connectionQuestions[currentPart];
      const party = PARTY.length
        ? `<div class="count-note">${t("conn.party", { names: PARTY.map((p) => esc(p.name)).join(", ") })}</div>`
        : "";
      return `<div class="qa card">
        <div class="q">${esc(q)}</div>
        <textarea rows="4" data-cn="${esc(q)}">${esc(draft.connections[q] || "")}</textarea>
      </div>${party}`;
    },
    wire(root) {
      for (const el of root.querySelectorAll("[data-cn]")) {
        el.onchange = () => { draft.connections[el.dataset.cn] = el.value.trim(); };
      }
    },
    collect(currentPart) {
      const q = cls().connectionQuestions[currentPart];
      const field = $("[data-cn]");
      if (field) draft.connections[q] = field.value.trim();
    }
  },
  {
    title: () => t("step.pen.title"),
    sub: () => t("step.pen.sub"),
    render() {
      return `<div class="options shell-options pen-options">${PENS
        .map(
          (p) => `<div class="card pick shell-pick ${draft.pen === p.id ? "selected" : ""}" data-pen="${esc(p.id)}">
            <div class="pick-thumb">${p.thumb}</div>
            <h3>${esc(t(p.name))}</h3>
          </div>`
        )
        .join("")}</div>`;
    },
    wire(root) {
      for (const el of root.querySelectorAll("[data-pen]")) el.onclick = () => { draft.pen = el.dataset.pen; rerender(); };
    },
    collect() {
      if (!PENS.some((p) => p.id === draft.pen)) return t("warn.pen");
    }
  },
  {
    title: () => t("step.review.title"),
    sub: () => t("step.review.sub"),
    render() {
      const c = cls(), s = sub(), a = anc(), k = com();
      const p = wpn(draft.primaryId), sc = wpn(draft.secondaryId), ar = arm();
      return `<div class="card review">
        <h3>${esc(draft.name)}</h3>
        <p>${esc(draft.pronouns || "")}${draft.player ? ` · ${t("review.playedby", { player: esc(draft.player) })}` : ""}</p>
        <p>${t("review.of", { ancestry: esc(a.name), class: esc(c.name), subclass: esc(s.name), community: esc(k.name) })}</p>
        <h3>${t("review.traits")}</h3>
        <p>${REF.traits.map((tr) => `${tr} ${draft.traits[tr] >= 0 ? "+" : ""}${draft.traits[tr]}`).join(" · ")}</p>
        <h3>${t("review.arms")}</h3>
        <p>${esc(p.name)}${sc ? ` & ${esc(sc.name)}` : ""}, ${esc(ar.name)}</p>
        <h3>${t("review.exp")}</h3>
        <p>${draft.experiences.map((e) => `${esc(e)} +2`).join(" · ")}</p>
        <h3>${t("review.cards")}</h3>
        <p>${draft.domainCardIds.map((id) => esc(REF.domainCards.find((d) => d.id === id).name)).join(" · ")}</p>
        ${draft.classItem ? `<h3>${t("review.carried")}</h3><p>${esc(draft.classItem)}</p>` : ""}
        <h3>${t("review.pen")}</h3>
        <p>${esc(t((PENS.find((p) => p.id === draft.pen) || PENS[0]).name))}</p>
      </div>`;
    },
    collect() {}
  },
  {
    title: () => t("step.contract.title"),
    sub: () => t("step.contract.sub"),
    render() {
      const pen = PENS.find((candidate) => candidate.id === draft.pen) || PENS[0];
      return `<div class="covenant-step">
        <article class="paper-sheet paper-covenant">
          <div class="paper-kicker">${esc(t("contract.kicker"))}</div>
          <h2>${esc(t("contract.title"))}</h2>
          <p class="paper-decree">${esc(t("contract.decree"))}</p>
          <details class="contract-terms" id="contract-terms" ${draft.covenant.read ? "open" : ""}>
            <summary>${esc(t("contract.read"))}</summary>
            <div class="contract-copy">${covenantArticlesHtml()}</div>
          </details>
          <div class="contract-warning" id="contract-warning" role="status" ${draft.covenant.warned && !draft.covenant.signed ? "" : "hidden"}>
            <strong>${esc(t("contract.warning.title"))}</strong>
            <span>${esc(t("contract.warning.body"))}</span>
          </div>
          <button class="signature-field ${draft.covenant.signed ? "is-signing" : ""}" id="contract-signature" type="button">
            <span class="signature-name">${esc(draft.name)}</span>
            <span class="signature-prompt">${esc(t("contract.signline", { name: draft.name }))}</span>
            <span class="signing-pen" aria-hidden="true">${pen.thumb}</span>
          </button>
          <p class="paper-foot">${esc(t("contract.foot"))}</p>
        </article>
      </div>`;
    },
    wire(root) {
      const terms = root.querySelector("#contract-terms");
      terms.ontoggle = () => { if (terms.open) draft.covenant.read = true; };
      root.querySelector("#contract-signature").onclick = signCovenant;
    },
    collect() {}
  }
];

function title(s) {
  return String(s).toLowerCase().replace(/(^|\s)(\w)/g, (m, a, b) => a + b.toUpperCase());
}

// ---------- assembly ----------
function buildCharacter() {
  const c = cls(), s = sub(), a = anc(), k = com();
  const ar = arm();
  const level = 1;
  return {
    name: draft.name,
    pronouns: draft.pronouns,
    player: draft.player,
    shell: draft.shell,
    pen: draft.pen,
    level,
    class: { id: c.id, name: c.name, domains: c.domains },
    subclass: { id: s.id, name: s.name, spellcastTrait: s.spellcastTrait },
    ancestry: { id: a.id, name: a.name },
    community: { id: k.id, name: k.name },
    traits: { ...draft.traits },
    evasion: c.startingEvasion,
    hpMax: c.startingHitPoints,
    hp: 0,
    stressMax: REF.startingStress,
    stress: 0,
    hopeMax: 6,
    hope: REF.startingHope,
    armor: ar ? { name: ar.name, score: ar.baseScore, feature: ar.feature } : null,
    armorMarked: 0,
    thresholds: ar
      ? { major: ar.baseMajorThreshold + level, severe: ar.baseSevereThreshold + level }
      : { major: level, severe: 2 * level },
    weapons: {
      primary: wpn(draft.primaryId),
      secondary: wpn(draft.secondaryId)
    },
    inventory: [
      ...REF.startingInventory,
      draft.potion,
      ...(draft.classItem ? [draft.classItem] : []),
      {
        id: `paper_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        kind: "paper",
        paperType: "covenant",
        name: t("contract.inventory.name"),
        body: "",
        author: t("contract.inventory.author"),
        createdAt: draft.covenant.signedAt,
        signedName: draft.name,
        signedAt: draft.covenant.signedAt,
        covenantVersion: 1,
        quantity: 1
      }
    ],
    experiences: draft.experiences.map((name) => ({ name, bonus: 2 })),
    background: Object.entries(draft.background)
      .filter(([, v]) => v)
      .map(([q, aText]) => ({ q, a: aText })),
    connections: Object.entries(draft.connections)
      .filter(([, v]) => v)
      .map(([q, note]) => ({ q, note })),
    domainCards: draft.domainCardIds.map((id) => ({
      ...REF.domainCards.find((d) => d.id === id),
      location: "loadout"
    })),
    features: {
      hopeFeature: c.hopeFeature,
      classFeatures: c.classFeatures,
      foundation: s.foundation,
      ancestry: a.features,
      community: k.features
    },
    portrait: null,
    notes: ""
  };
}

// ---------- render loop ----------
function partTotal(st = steps[step]) {
  const total = typeof st.parts === "function" ? st.parts() : (st.parts || 1);
  return Math.max(1, total);
}

function renderSubprogress(st) {
  const total = partTotal(st);
  const el = $("#subprogress");
  el.hidden = total <= 1;
  el.setAttribute("aria-label", t("create.part", { n: part + 1, total }));
  el.innerHTML = `<span class="subprogress-track" aria-hidden="true">${Array.from({ length: total }, (_, i) =>
    `<span class="subprogress-mark ${i < part ? "done" : i === part ? "now" : ""}"></span>`
  ).join("")}</span><span class="subprogress-count">${part + 1} / ${total}</span>`;
}

function rerender(direction = null) {
  const st = steps[step];
  setTelemetryMode(`step-${step + 1}:part-${part + 1}`);
  part = Math.min(part, partTotal(st) - 1);
  $("#progress").innerHTML = steps
    .map((_, i) => `<div class="dot ${i < step ? "done" : i === step ? "now" : ""}"></div>`)
    .join("");
  const sub = typeof st.sub === "function" ? st.sub() : st.sub;
  const heading = typeof st.title === "function" ? st.title() : st.title;
  const enter = direction === "next" ? " enter-right" : direction === "back" ? " enter-left" : "";
  $("#step").innerHTML = `<div class="step-panel${enter}"><h2 class="step-title">${heading}</h2><div class="step-sub">${sub}</div>${st.render(part)}</div>`;
  $("#warn").textContent = "";
  $("#btn-back").style.visibility = step === 0 && part === 0 ? "hidden" : "visible";
  $("#btn-back").textContent = t("btn.back");
  $("#btn-next").hidden = step === steps.length - 1;
  $("#btn-next").textContent = t("btn.next");
  renderSubprogress(st);
  const root = $("#step");
  if (st.onPick) {
    for (const el of root.querySelectorAll("[data-pick]")) {
      el.onclick = () => { st.onPick(el.dataset.pick); rerender(); };
    }
  }
  for (const el of root.querySelectorAll("[data-item]")) {
    el.onclick = () => { draft.classItem = el.dataset.item; rerender(); };
  }
  if (st.wire) st.wire(root);
  root.addEventListener("input", scheduleDraftSave);
  root.addEventListener("change", scheduleDraftSave);
  scheduleDraftSave();
  window.scrollTo(0, 0);
}

function animateMove(direction, update) {
  if (moving) return;
  moving = true;
  const panel = $(".step-panel");
  const finish = () => {
    update();
    rerender(direction);
    moving = false;
  };
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches || !panel) {
    finish();
    return;
  }
  panel.classList.add(direction === "next" ? "leave-left" : "leave-right");
  let finished = false;
  const once = () => {
    if (finished) return;
    finished = true;
    finish();
  };
  panel.addEventListener("animationend", once, { once: true });
  setTimeout(once, 260);
}

$("#btn-back").onclick = () => {
  if (moving || (step === 0 && part === 0)) return;
  steps[step].collect?.(part);
  animateMove("back", () => {
    if (part > 0) part -= 1;
    else {
      step -= 1;
      part = partTotal(steps[step]) - 1;
    }
  });
};
$("#btn-next").onclick = async () => {
  if (moving) return;
  const err = steps[step].collect?.(part);
  if (err) { $("#warn").textContent = err; return; }
  if (part < partTotal() - 1 || step < steps.length - 1) {
    animateMove("next", () => {
      if (part < partTotal() - 1) part += 1;
      else { step += 1; part = 0; }
    });
    return;
  }
};

async function finishCharacter() {
  try {
    const res = await fetch("/api/party", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(buildCharacter())
    });
    const pc = await res.json();
    if (!res.ok) throw new Error(pc.error || t("error.generic"));
    draftComplete = true;
    clearTimeout(draftSaveTimer);
    localStorage.removeItem(DRAFT_KEY); // signed — the stash has served
    localStorage.removeItem(DRAFT_ID_KEY);
    // Character persistence already succeeded; stale-draft cleanup must not
    // turn that success into a retry that creates a duplicate PC.
    await fetch(`/api/character-drafts/${encodeURIComponent(draftId)}`, { method: "DELETE" }).catch(() => {});
    // This device now knows who its player is (shared with the shell & journal).
    localStorage.setItem("settlement-pc", pc.id);
    window.top.location.href = "/player";
  } catch (e) {
    $("#warn").textContent = e.message;
    moving = false;
    draft.covenant.signed = false;
    draft.covenant.signedAt = null;
    $("#btn-back").disabled = false;
    rerender();
  }
}

function signCovenant(event) {
  if (moving || draft.covenant.signed) return;
  const signature = event.currentTarget;
  if (!draft.covenant.read && !draft.covenant.warned) {
    draft.covenant.warned = true;
    signature.classList.add("is-hesitating");
    const warning = $("#contract-warning");
    warning.hidden = false;
    setTimeout(() => signature.classList.remove("is-hesitating"), 760);
    warning.scrollIntoView({ block: "nearest", behavior: "smooth" });
    return;
  }
  moving = true;
  draft.covenant.signed = true;
  draft.covenant.signedAt = new Date().toISOString();
  signature.classList.add("is-signing");
  signature.disabled = true;
  $("#btn-back").disabled = true;
  const delay = window.matchMedia("(prefers-reduced-motion: reduce)").matches ? 80 : 1400;
  setTimeout(finishCharacter, delay);
}

// ---------- draft stash ----------
// Character drafts survive reloads and closed tabs on this device. Signing is
// the only automatic deletion point; Start over is the explicit escape hatch.
function stashDraft() {
  if (!REF || draftComplete) return;
  try { steps[step].collect?.(part); } catch { /* half-filled steps still stash */ }
  const saved = { id: draftId, version: 2, savedAt: new Date().toISOString(), step, part, draft };
  localStorage.setItem(DRAFT_KEY, JSON.stringify(saved));
  fetch(`/api/character-drafts/${encodeURIComponent(draftId)}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(saved)
  }).catch(() => {});
  $("#draft-status").textContent = t("create.draftSaved");
}

function scheduleDraftSave() {
  clearTimeout(draftSaveTimer);
  draftSaveTimer = setTimeout(stashDraft, 220);
}

window.addEventListener("beforeunload", stashDraft);

function restoreDraft(serverSaved = null) {
  try {
    const localSaved = JSON.parse(localStorage.getItem(DRAFT_KEY));
    const saved = serverSaved || (localSaved?.id === draftId ? localSaved : null);
    if (!saved || saved.version !== 2 || typeof saved.step !== "number") return;
    Object.assign(draft, saved.draft);
    step = Math.max(0, Math.min(steps.length - 1, saved.step));
    part = Math.max(0, Math.min(partTotal(steps[step]) - 1, Number(saved.part) || 0));
  } catch { /* a bad stash never blocks creation */ }
}

// ---------- boot ----------
initI18n();
$("#draft-reset").onclick = () => {
  if (!confirm(t("create.startOverConfirm"))) return;
  localStorage.removeItem(DRAFT_KEY);
  localStorage.removeItem(DRAFT_ID_KEY);
  fetch(`/api/character-drafts/${encodeURIComponent(draftId)}`, { method: "DELETE" })
    .finally(() => { location.href = "/create/?new=1"; });
};
Promise.all([
  fetch("/api/reference").then((r) => r.json()),
  fetch("/api/party").then((r) => r.json()),
  fetch(`/api/character-drafts/${encodeURIComponent(draftId)}`).then((r) => r.ok ? r.json() : null)
]).then(([ref, party, saved]) => {
  if (ref.error) { $("#step").innerHTML = `<p class="warn">${esc(ref.error)}</p>`; return; }
  REF = ref;
  PARTY = party;
  restoreDraft(saved);
  rerender();
});
