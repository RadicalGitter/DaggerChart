// The players' journal: chronicle, shared and personal notes, people, and places.
// Reads /api/lore (whitelisted server-side); writes /api/notes as the chosen PC.
import { t, lang, initI18n, seasonLabel } from "/shared/i18n.js";
import { setTelemetryMode } from "/shared/telemetry.js";
import { playerFeatureEnabled, setPlayerFeatureContext } from "/shared/player-features.js";
import "/shared/feedback.js";

const $ = (sel) => document.querySelector(sel);
const esc = (s) =>
  String(s ?? "").replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

let LORE = null;
let PCID = null;
let TAB = "journal";
let QUERY = "";
let editingId = null;
let DOODLES = { journal: [], people: [], places: [] };
let doodleTool = null;
let activeStroke = null;
let doodleObserver = null;

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
  if (!res.ok) throw new Error(data.error || t("error.generic"));
  return data;
}

const fetchLore = async () => {
  LORE = await api(`/api/lore${PCID ? `?pc=${encodeURIComponent(PCID)}` : ""}`);
  LORE.playerFeatures = setPlayerFeatureContext(LORE, PCID);
  if (TAB === "chronicle" && !playerFeatureEnabled("chronicle")) TAB = "journal";
  rebuildLinker();
};

const fetchDoodles = async () => {
  if (!PCID) {
    DOODLES = { journal: [], people: [], places: [] };
    return;
  }
  const saved = await api(`/api/journal-doodles/${encodeURIComponent(PCID)}`);
  DOODLES = {
    journal: Array.isArray(saved.journal) ? saved.journal : [],
    people: Array.isArray(saved.people) ? saved.people : [],
    places: Array.isArray(saved.places) ? saved.places : []
  };
};

const me = () => (LORE.identities || LORE.party).find((p) => p.id === PCID) || null;
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

function chronicleDate(value) {
  if (!value) return "";
  const parsed = new Date(`${value}T12:00:00`);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleDateString(lang === "sv" ? "sv-SE" : "en-GB", { day: "numeric", month: "long", year: "numeric" });
}

function chronicleHead(session, status = null) {
  return `<div class="chronicle-head">
    <span class="chronicle-number">${esc(session.number)}</span>
    <div class="chronicle-heading">
      <strong>${t("journal.chronicle.session")} ${esc(session.number)}</strong>
      <span>${esc(chronicleDate(session.date))}${session.seasonLabel ? ` · ${esc(seasonLabel(session.seasonLabel))}` : ""}</span>
    </div>
    ${status ? `<span class="chronicle-state">${esc(status)}</span>` : ""}
  </div>`;
}

function openChronicleHtml(session) {
  const marks = (session.participants || []).map((participant) =>
    `<span class="completion-mark ${participant.complete ? "complete" : ""}">${esc(participant.name)}</span>`
  ).join("");
  const status = t(`journal.chronicle.status.${session.status}`);
  const composer = session.canEdit ? `<div class="perspective-composer composer">
    <textarea id="perspective-${esc(session.id)}" rows="7" maxlength="12000" placeholder="${esc(t("journal.chronicle.placeholder"))}">${esc(session.perspective || "")}</textarea>
    <div class="row">
      <span class="muted">${t("journal.chronicle.privateuntil")}</span>
      <button class="write" data-perspective-save="${esc(session.id)}">${t("journal.chronicle.save")}</button>
    </div>
  </div>` : `<p class="chronicle-waiting">${session.status === "retelling"
    ? t("journal.chronicle.working")
    : t("journal.chronicle.reviewing")}</p>`;
  return `<article class="card chronicle-prompt">
    ${chronicleHead(session, status)}
    <p class="chronicle-question">${t("journal.chronicle.question")}</p>
    <div class="completion-chain">${marks}</div>
    ${composer}
  </article>`;
}

function publishedChronicleHtml(session) {
  return `<article class="card retelling-card">
    ${chronicleHead(session)}
    <div class="retelling-text">${linkify(esc(session.text))}</div>
  </article>`;
}

function renderChronicleTab() {
  const q = QUERY.toLowerCase();
  const open = (LORE.sessions?.open || []).filter((session) =>
    !q || matches(q, String(session.number), session.date, session.seasonLabel, session.perspective, ...(session.participants || []).map((entry) => entry.name))
  );
  const published = (LORE.sessions?.published || []).filter((session) =>
    !q || matches(q, String(session.number), session.date, session.seasonLabel, session.text)
  );
  return `${open.map(openChronicleHtml).join("")}
    ${published.length ? `<div class="chronicle-divider">${t("journal.chronicle.published")}</div>${published.map(publishedChronicleHtml).join("")}` : ""}
    ${!open.length && !published.length ? `<p class="empty">${t("journal.chronicle.empty")}</p>` : ""}`;
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
  setTelemetryMode(TAB);
  const saved = snapshotDrafts();
  for (const b of document.querySelectorAll(".tabbar [data-tab]")) {
    b.classList.toggle("on", b.dataset.tab === TAB);
  }
  document.querySelector('[data-tab="chronicle"]').classList.toggle("awaiting", (LORE.sessions?.open || []).some((session) => session.canEdit && !session.perspective));
  $(".doodle-tools").hidden = TAB === "chronicle";
  $("#j-search").placeholder = TAB === "chronicle" ? t("journal.chronicle.search") : t("journal.search");
  const body = $("#tab-body");
  const page = TAB === "chronicle"
    ? renderChronicleTab()
    : TAB === "journal"
      ? renderJournalTab()
      : TAB === "people"
        ? renderPeopleTab()
        : renderPlacesTab();
  const doodleLayer = TAB === "chronicle" ? "" : '<canvas class="doodle-layer" aria-hidden="true"></canvas>';
  body.innerHTML = `<div class="page-content">${page}</div>${doodleLayer}`;
  wireTabBody();
  restoreDrafts(saved);
  wireDoodleLayer();
}

function renderAll() {
  const my = me();
  document.querySelector('[data-tab="chronicle"]').hidden = !playerFeatureEnabled("chronicle");
  $("#j-pc").textContent = my ? my.name : "";
  $("#j-season").textContent = seasonLabel(LORE.seasonLabel);
  renderTab();
}

// --- the transparent doodle layer: one normalized vector page per chapter ---

function drawStroke(ctx, stroke, width, height) {
  if (!stroke.points?.length) return;
  const scale = Math.min(width, height);
  ctx.save();
  ctx.globalCompositeOperation = stroke.tool === "eraser" ? "destination-out" : "source-over";
  ctx.strokeStyle = stroke.tool === "eraser" ? "rgba(0,0,0,1)" : "#c6a86a";
  ctx.fillStyle = ctx.strokeStyle;
  ctx.lineWidth = Math.max(1.5, stroke.width * scale);
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  const points = stroke.points;
  if (points.length === 1) {
    ctx.beginPath();
    ctx.arc(points[0][0] * width, points[0][1] * height, ctx.lineWidth / 2, 0, Math.PI * 2);
    ctx.fill();
  } else {
    ctx.beginPath();
    ctx.moveTo(points[0][0] * width, points[0][1] * height);
    for (let i = 1; i < points.length; i += 1) ctx.lineTo(points[i][0] * width, points[i][1] * height);
    ctx.stroke();
  }
  ctx.restore();
}

function redrawDoodles() {
  const canvas = $(".doodle-layer");
  if (!canvas) return;
  const rect = canvas.getBoundingClientRect();
  if (!rect.width || !rect.height) return;
  const ratio = Math.min(window.devicePixelRatio || 1, 2);
  const pixelWidth = Math.max(1, Math.round(rect.width * ratio));
  const pixelHeight = Math.max(1, Math.round(rect.height * ratio));
  if (canvas.width !== pixelWidth || canvas.height !== pixelHeight) {
    canvas.width = pixelWidth;
    canvas.height = pixelHeight;
  }
  const ctx = canvas.getContext("2d");
  ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
  ctx.clearRect(0, 0, rect.width, rect.height);
  for (const stroke of DOODLES[TAB] || []) drawStroke(ctx, stroke, rect.width, rect.height);
}

function updateDoodleControls() {
  const body = $("#tab-body");
  body.classList.toggle("doodling", !!doodleTool);
  body.classList.toggle("erasing", doodleTool === "eraser");
  for (const button of document.querySelectorAll("[data-doodle]")) {
    button.classList.toggle("on", button.dataset.doodle === doodleTool);
    if (button.dataset.doodle === "off") button.hidden = !doodleTool;
  }
}

function setDoodleTool(next) {
  doodleTool = next === "off" || next === doodleTool ? null : next;
  activeStroke = null;
  updateDoodleControls();
}

async function saveDoodlePage() {
  if (!PCID || !Array.isArray(DOODLES[TAB])) return;
  try {
    await api(`/api/journal-doodles/${encodeURIComponent(PCID)}/${TAB}`, {
      method: "PUT",
      body: { strokes: DOODLES[TAB] || [] }
    });
  } catch (error) {
    alert(error.message);
  }
}

function pointOnCanvas(event, canvas) {
  const rect = canvas.getBoundingClientRect();
  return [
    Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width)),
    Math.max(0, Math.min(1, (event.clientY - rect.top) / rect.height))
  ];
}

function wireDoodleLayer() {
  const canvas = $(".doodle-layer");
  doodleObserver?.disconnect();
  if (!canvas) return;
  doodleObserver = new ResizeObserver(() => requestAnimationFrame(redrawDoodles));
  doodleObserver.observe($("#tab-body"));

  canvas.addEventListener("pointerdown", (event) => {
    if (!doodleTool) return;
    event.preventDefault();
    canvas.setPointerCapture(event.pointerId);
    activeStroke = {
      tool: doodleTool,
      width: doodleTool === "eraser" ? 0.028 : 0.004,
      points: [pointOnCanvas(event, canvas)]
    };
    DOODLES[TAB].push(activeStroke);
    redrawDoodles();
  });
  canvas.addEventListener("pointermove", (event) => {
    if (!activeStroke || !canvas.hasPointerCapture(event.pointerId)) return;
    const point = pointOnCanvas(event, canvas);
    const previous = activeStroke.points[activeStroke.points.length - 1];
    const distance = (point[0] - previous[0]) ** 2 + (point[1] - previous[1]) ** 2;
    if (distance < 0.000004) return;
    activeStroke.points.push(point);
    redrawDoodles();
  });
  const finishStroke = (event) => {
    if (!activeStroke) return;
    if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
    activeStroke = null;
    saveDoodlePage();
  };
  canvas.addEventListener("pointerup", finishStroke);
  canvas.addEventListener("pointercancel", finishStroke);
  updateDoodleControls();
  requestAnimationFrame(redrawDoodles);
}

let turnTimer = null;
function turnTo(nextTab, afterTurn) {
  if (nextTab === TAB) {
    renderTab();
    if (afterTurn) afterTurn();
    return;
  }
  const body = $("#tab-body");
  setDoodleTool(null);
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  clearTimeout(turnTimer);
  body.classList.remove("page-turn-in");
  if (reduced) {
    TAB = nextTab;
    renderTab();
    if (afterTurn) afterTurn();
    return;
  }
  body.classList.add("page-turn-out");
  turnTimer = setTimeout(() => {
    TAB = nextTab;
    renderTab();
    body.classList.remove("page-turn-out");
    void body.offsetWidth;
    body.classList.add("page-turn-in");
    if (afterTurn) afterTurn();
  }, 150);
}

// --- wiring ---

function wireTabBody() {
  const body = $("#tab-body");

  for (const button of body.querySelectorAll("[data-perspective-save]")) {
    const savePerspective = async () => {
      const textarea = document.getElementById(`perspective-${button.dataset.perspectiveSave}`);
      if (!textarea?.value.trim()) return;
      try {
        await api(`/api/sessions/${encodeURIComponent(button.dataset.perspectiveSave)}/perspectives`, {
          method: "POST",
          body: { pcId: PCID, text: textarea.value }
        });
        textarea.value = "";
        await fetchLore();
        renderTab();
      } catch (error) {
        alert(error.message);
      }
    };
    button.onclick = savePerspective;
    document.getElementById(`perspective-${button.dataset.perspectiveSave}`)?.addEventListener("keydown", (event) => {
      if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) savePerspective();
    });
  }

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
  const nextTab = kind === "person" ? "people" : "places";
  QUERY = "";
  $("#j-search").value = "";
  turnTo(nextTab, () => {
    const target = document.getElementById(`entry-${kind}-${id}`);
    if (target) {
      target.scrollIntoView({ behavior: "smooth", block: "start" });
      target.classList.remove("flash");
      void target.offsetWidth;
      target.classList.add("flash");
    }
  });
});

for (const b of document.querySelectorAll(".tabbar [data-tab]")) {
  b.onclick = () => turnTo(b.dataset.tab);
}
for (const b of document.querySelectorAll("[data-doodle]")) {
  b.onclick = () => setDoodleTool(b.dataset.doodle);
}

// Masthead-as-home: the title returns to the Journal tab from anywhere.
$("#app header h1").addEventListener("click", () => {
  if (TAB === "journal") { window.scrollTo({ top: 0, behavior: "smooth" }); return; }
  turnTo("journal");
});

$("#j-search").addEventListener("input", () => {
  QUERY = $("#j-search").value.trim();
  renderTab();
});

// --- choosing whose journal this is ---

function showPicker() {
  $("#app").hidden = true;
  $("#picker").hidden = false;
  const identities = LORE.identities || LORE.party;
  $("#pick-list").innerHTML = identities.length
    ? identities
        .map(
          (p) => `<button data-pick="${p.id}">${esc(p.name)}${p.player ? ` <span style="opacity:0.7; font-size:0.85rem;">· ${esc(p.player)}</span>` : ""}</button>`
        )
        .join("")
    : `<p class="empty">${t("journal.people.empty")}</p>`;
  for (const b of document.querySelectorAll("[data-pick]")) {
    b.onclick = async () => {
      PCID = b.dataset.pick;
      localStorage.setItem("settlement-pc", PCID);
      history.replaceState(null, "", `/journal/?pc=${encodeURIComponent(PCID)}`);
      await fetchLore();
      await fetchDoodles();
      if ((LORE.sessions?.open || []).some((session) => session.canEdit)) TAB = "chronicle";
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

const params = new URLSearchParams(location.search);
// Inside the shell the masthead belongs to the shell — hide our own chrome.
if (params.has("embed")) document.body.classList.add("embed");

(async () => {
  // One identity per device, shared with the shell (migrates the old key).
  PCID = params.get("pc")
    || localStorage.getItem("settlement-pc")
    || localStorage.getItem("settlement-journal-pc");
  await fetchLore();
  if (!PCID || !me()) {
    PCID = null;
    showPicker();
  } else {
    const requestedTab = params.get("tab");
    if (["chronicle", "journal", "people", "places"].includes(requestedTab)) TAB = requestedTab;
    else if ((LORE.sessions?.open || []).some((session) => session.canEdit)) TAB = "chronicle";
    await fetchDoodles();
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
