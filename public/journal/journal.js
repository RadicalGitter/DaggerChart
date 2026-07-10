// The players' journal: shared and personal notes on people, places, and days.
// Reads /api/lore (whitelisted server-side); writes /api/notes as the chosen PC.
import { t, lang, initI18n, seasonLabel } from "/shared/i18n.js";

const $ = (sel) => document.querySelector(sel);
const esc = (s) =>
  String(s ?? "").replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

let LORE = null;
let PCID = null;
let TAB = "journal";
let QUERY = "";
let editingId = null;

// name → entry links, longest names first so "Old Mill Road" wins over "Old Mill"
let LINK_RE = null;
let LINK_MAP = new Map();

function rebuildLinker() {
  const entries = [
    ...LORE.people.map((p) => ({ kind: "person", id: p.id, name: p.name })),
    ...LORE.places.map((p) => ({ kind: "place", id: p.id, name: p.name }))
  ].filter((e) => e.name && e.name.trim().length > 1);
  entries.sort((a, b) => b.name.length - a.name.length);
  LINK_MAP = new Map(entries.map((e) => [esc(e.name), e]));
  LINK_RE = entries.length
    ? new RegExp(
        `(?<![\\p{L}\\p{N}])(${entries.map((e) => esc(e.name).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})(?![\\p{L}\\p{N}])`,
        "gu"
      )
    : null;
}

function linkify(escaped) {
  if (!LINK_RE) return escaped;
  return escaped.replace(LINK_RE, (m) => {
    const e = LINK_MAP.get(m);
    return e ? `<a class="lore-link" data-goto="${e.kind}:${e.id}">${m}</a>` : m;
  });
}

async function api(path, opts = {}) {
  const res = await fetch(path, {
    headers: { "Content-Type": "application/json" },
    ...opts,
    body: opts.body ? JSON.stringify(opts.body) : undefined
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Something went wrong.");
  return data;
}

const fetchLore = async () => {
  LORE = await api(`/api/lore${PCID ? `?pc=${encodeURIComponent(PCID)}` : ""}`);
  rebuildLinker();
};

const me = () => LORE.party.find((p) => p.id === PCID) || null;
const matches = (q, ...fields) => fields.some((f) => (f || "").toLowerCase().includes(q));

// --- notes ---

function noteMeta(n) {
  const when = new Date(n.ts).toLocaleDateString(lang === "sv" ? "sv-SE" : "en-GB", { day: "numeric", month: "short" });
  return `<div class="note-meta">
    <span class="season">${esc(seasonLabel(n.season))}</span>
    <span class="who">${when}${n.scope === "group" ? ` · ${esc(n.author)}` : ""}</span>
    ${n.scope === "personal" ? `<span class="mine">${t("journal.yours")}</span>` : ""}
    ${n.pcId === PCID ? `<span class="note-tools">
      <button data-note-edit="${n.id}">${t("journal.edit")}</button>
      <button data-note-strike="${n.id}">${t("journal.strike")}</button>
    </span>` : ""}
  </div>`;
}

function noteHtml(n) {
  if (editingId === n.id) {
    return `<div class="note-row composer" id="note-${n.id}">
      ${noteMeta(n)}
      <textarea rows="3" id="edit-${n.id}">${esc(n.text)}</textarea>
      <div class="row">
        <button class="quiet" data-edit-save="${n.id}">${t("journal.save")}</button>
        <button class="quiet" data-edit-cancel="${n.id}">${t("journal.cancel")}</button>
      </div>
    </div>`;
  }
  return `<div class="note-row" id="note-${n.id}">
    ${noteMeta(n)}
    <div class="note-text">${linkify(esc(n.text))}</div>
  </div>`;
}

function composerHtml(kind, refId, placeholder) {
  const id = refId ? `comp-${kind}-${refId}` : `comp-${kind}`;
  const scope = localStorage.getItem(`settlement-scope-${kind}`) || (kind === "journal" ? "personal" : "group");
  return `<div class="composer" data-kind="${kind}" data-ref="${refId || ""}" data-scope="${scope}">
    <textarea rows="${kind === "journal" ? 4 : 2}" id="${id}" placeholder="${esc(placeholder)}"></textarea>
    <div class="row">
      <span class="scope-seg">
        <button data-scope-pick="personal" class="${scope === "personal" ? "on" : ""}">${t("journal.scope.me")}</button>
        <button data-scope-pick="group" class="${scope === "group" ? "on" : ""}">${t("journal.scope.group")}</button>
      </span>
      <button class="write" data-write>${t("journal.write")}</button>
    </div>
  </div>`;
}

function notesFor(kind, refId) {
  return LORE.notes
    .filter((n) => n.kind === kind && n.refId === refId)
    .sort((a, b) => a.ts.localeCompare(b.ts));
}

// --- tabs ---

function renderJournalTab() {
  const q = QUERY.toLowerCase();
  const entries = LORE.notes
    .filter((n) => n.kind === "journal")
    .filter((n) => !q || matches(q, n.text, n.author, n.season))
    .sort((a, b) => b.ts.localeCompare(a.ts));
  return `<div class="card composer-card">${composerHtml("journal", null, t("journal.placeholder"))}</div>
    ${entries.length
      ? entries.map((n) => `<div class="card entry-card">${noteHtml(n)}</div>`).join("")
      : `<p class="empty">${t("journal.empty")}</p>`}`;
}

function personCard(p) {
  const place = p.placeId ? LORE.places.find((x) => x.id === p.placeId) : null;
  const gone = p.status !== "alive";
  const items = (p.items || [])
    .map((it) => `<li><strong>${esc(it.name)}</strong>${it.note ? ` — <span class="muted">${esc(it.note)}</span>` : ""}</li>`)
    .join("");
  const notes = notesFor("person", p.id);
  return `<div class="card lore-card" id="entry-person-${p.id}">
    <div class="lore-head">
      <div class="portrait">${p.portrait ? `<img src="${esc(p.portrait)}" alt="">` : esc(p.name[0] || "?")}</div>
      <div>
        <strong>${esc(p.name)}</strong>${gone ? ` <span class="pill">${esc(p.status)}</span>` : ""}
        <div class="muted" style="font-size:0.85rem;">${esc(p.role || "")}</div>
        <div style="font-size:0.85rem;">${place
          ? `<a class="lore-link" data-goto="place:${place.id}">${esc(place.name)}</a>`
          : `<span class="muted">${t("journal.unknownplace")}</span>`}</div>
      </div>
    </div>
    ${p.description ? `<p style="font-size:0.92rem;">${esc(p.description)}</p>` : ""}
    ${items ? `<div class="smallcaps" style="font-size:0.8rem;">${t("journal.carries")}</div><ul class="items">${items}</ul>` : ""}
    <div class="lore-notes">
      ${notes.map(noteHtml).join("") || ""}
      ${composerHtml("person", p.id, t("journal.note.person"))}
    </div>
  </div>`;
}

function placeCard(pl) {
  const here = LORE.people.filter((p) => p.placeId === pl.id);
  const notes = notesFor("place", pl.id);
  return `<div class="card lore-card" id="entry-place-${pl.id}">
    <div class="lore-head">
      ${pl.portrait ? `<div class="portrait" style="border-radius:8px;"><img src="${esc(pl.portrait)}" alt=""></div>` : ""}
      <div>
        <strong>${esc(pl.name)}</strong>
        ${pl.home ? `<span class="pill">${t("journal.home")}</span>` : pl.kind ? `<span class="pill">${esc(pl.kind)}</span>` : ""}
      </div>
    </div>
    ${pl.description ? `<p style="font-size:0.92rem;">${esc(pl.description)}</p>` : ""}
    ${here.length
      ? `<div class="smallcaps" style="font-size:0.8rem;">${t("journal.herenow")}</div>
         <div style="font-size:0.9rem;">${here
           .map((p) => `<a class="lore-link" data-goto="person:${p.id}">${esc(p.name)}</a>`)
           .join(", ")}</div>`
      : ""}
    <div class="lore-notes">
      ${notes.map(noteHtml).join("") || ""}
      ${composerHtml("place", pl.id, t("journal.note.place"))}
    </div>
  </div>`;
}

function renderPeopleTab() {
  const q = QUERY.toLowerCase();
  const people = LORE.people.filter(
    (p) =>
      !q ||
      matches(q, p.name, p.role, p.description, ...(p.items || []).map((i) => `${i.name} ${i.note}`)) ||
      notesFor("person", p.id).some((n) => matches(q, n.text))
  );
  return people.length
    ? people.map(personCard).join("")
    : `<p class="empty">${t("journal.people.empty")}</p>`;
}

function renderPlacesTab() {
  const q = QUERY.toLowerCase();
  const places = LORE.places.filter(
    (pl) =>
      !q ||
      matches(q, pl.name, pl.kind, pl.description) ||
      notesFor("place", pl.id).some((n) => matches(q, n.text))
  );
  return places.length
    ? places.map(placeCard).join("")
    : `<p class="empty">${t("journal.places.empty")}</p>`;
}

// --- rendering with draft preservation (SSE refreshes mustn't eat typing) ---

function snapshotDrafts() {
  const drafts = {};
  for (const ta of document.querySelectorAll("#tab-body textarea")) {
    if (ta.value) drafts[ta.id] = ta.value;
  }
  const active = document.activeElement;
  return { drafts, focusId: active && active.tagName === "TEXTAREA" ? active.id : null };
}

function restoreDrafts({ drafts, focusId }) {
  for (const [id, val] of Object.entries(drafts)) {
    const ta = document.getElementById(id);
    if (ta && !ta.value) ta.value = val;
  }
  if (focusId) {
    const ta = document.getElementById(focusId);
    if (ta) {
      ta.focus();
      ta.selectionStart = ta.selectionEnd = ta.value.length;
    }
  }
}

function renderTab() {
  const saved = snapshotDrafts();
  for (const b of document.querySelectorAll(".tabbar [data-tab]")) {
    b.classList.toggle("on", b.dataset.tab === TAB);
  }
  const body = $("#tab-body");
  body.innerHTML = TAB === "journal" ? renderJournalTab() : TAB === "people" ? renderPeopleTab() : renderPlacesTab();
  wireTabBody();
  restoreDrafts(saved);
}

function renderAll() {
  const my = me();
  $("#j-pc").textContent = my ? my.name : "";
  $("#j-season").textContent = seasonLabel(LORE.seasonLabel);
  renderTab();
}

// --- wiring ---

function wireTabBody() {
  const body = $("#tab-body");

  for (const comp of body.querySelectorAll(".composer[data-kind]")) {
    const kind = comp.dataset.kind;
    for (const b of comp.querySelectorAll("[data-scope-pick]")) {
      b.onclick = () => {
        comp.dataset.scope = b.dataset.scopePick;
        localStorage.setItem(`settlement-scope-${kind}`, b.dataset.scopePick);
        for (const x of comp.querySelectorAll("[data-scope-pick]")) x.classList.toggle("on", x === b);
      };
    }
    const write = async () => {
      const ta = comp.querySelector("textarea");
      if (!ta.value.trim()) return;
      try {
        await api("/api/notes", {
          method: "POST",
          body: { kind, refId: comp.dataset.ref || null, scope: comp.dataset.scope, pcId: PCID, text: ta.value }
        });
        ta.value = "";
        await fetchLore();
        renderTab();
      } catch (e) {
        alert(e.message);
      }
    };
    comp.querySelector("[data-write]").onclick = write;
    comp.querySelector("textarea").addEventListener("keydown", (e) => {
      if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) write();
    });
  }

  for (const b of body.querySelectorAll("[data-note-edit]")) {
    b.onclick = () => { editingId = b.dataset.noteEdit; renderTab(); };
  }
  for (const b of body.querySelectorAll("[data-edit-cancel]")) {
    b.onclick = () => { editingId = null; renderTab(); };
  }
  for (const b of body.querySelectorAll("[data-edit-save]")) {
    b.onclick = async () => {
      const ta = document.getElementById(`edit-${b.dataset.editSave}`);
      try {
        await api(`/api/notes/${b.dataset.editSave}`, { method: "PUT", body: { pcId: PCID, text: ta.value } });
        editingId = null;
        await fetchLore();
        renderTab();
      } catch (e) {
        alert(e.message);
      }
    };
    const ta = document.getElementById(`edit-${b.dataset.editSave}`);
    if (ta) ta.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) b.onclick();
    });
  }
  for (const b of body.querySelectorAll("[data-note-strike]")) {
    b.onclick = async () => {
      if (!confirm(t("journal.confirmstrike"))) return;
      try {
        await api(`/api/notes/${b.dataset.noteStrike}?pc=${encodeURIComponent(PCID)}`, { method: "DELETE" });
        await fetchLore();
        renderTab();
      } catch (e) {
        alert(e.message);
      }
    };
  }
}

// person↔place cross-links, wherever they appear
document.addEventListener("click", (e) => {
  const link = e.target.closest("[data-goto]");
  if (!link) return;
  e.preventDefault();
  const [kind, id] = link.dataset.goto.split(":");
  TAB = kind === "person" ? "people" : "places";
  QUERY = "";
  $("#j-search").value = "";
  renderTab();
  const target = document.getElementById(`entry-${kind}-${id}`);
  if (target) {
    target.scrollIntoView({ behavior: "smooth", block: "start" });
    target.classList.remove("flash");
    void target.offsetWidth;
    target.classList.add("flash");
  }
});

for (const b of document.querySelectorAll(".tabbar [data-tab]")) {
  b.onclick = () => { TAB = b.dataset.tab; renderTab(); };
}

$("#j-search").addEventListener("input", () => {
  QUERY = $("#j-search").value.trim();
  renderTab();
});

// --- choosing whose journal this is ---

function showPicker() {
  $("#app").hidden = true;
  $("#picker").hidden = false;
  $("#pick-list").innerHTML = LORE.party.length
    ? LORE.party
        .map(
          (p) => `<button data-pick="${p.id}">${esc(p.name)}${p.player ? ` <span style="opacity:0.7; font-size:0.85rem;">· ${esc(p.player)}</span>` : ""}</button>`
        )
        .join("")
    : `<p class="empty">${t("journal.people.empty")}</p>`;
  for (const b of document.querySelectorAll("[data-pick]")) {
    b.onclick = async () => {
      PCID = b.dataset.pick;
      localStorage.setItem("settlement-journal-pc", PCID);
      history.replaceState(null, "", `/journal/?pc=${encodeURIComponent(PCID)}`);
      await fetchLore();
      $("#picker").hidden = true;
      $("#app").hidden = false;
      renderAll();
    };
  }
}

$("#j-switch").addEventListener("click", (e) => {
  e.preventDefault();
  showPicker();
});

// --- boot ---

initI18n();
$("#j-search").placeholder = t("journal.search");

(async () => {
  PCID = new URLSearchParams(location.search).get("pc") || localStorage.getItem("settlement-journal-pc");
  await fetchLore();
  if (!PCID || !me()) {
    PCID = null;
    showPicker();
  } else {
    $("#app").hidden = false;
    renderAll();
  }

  const stream = new EventSource("/api/stream");
  let pending = null;
  stream.onmessage = () => {
    clearTimeout(pending);
    pending = setTimeout(async () => {
      if (!PCID) return;
      await fetchLore();
      renderAll();
    }, 250);
  };
})();
