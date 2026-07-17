// GM Console. Renders from /api/state; every mutation round-trips the server.
import { CONDITIONS, conditionIcon } from "/shared/conditions.js";

let S = null; // last fetched gm state
let selectedBuilding = null;
let CONSUMABLES = [];
let FEEDBACK = [];
let TELEMETRY = { pages: {} };
let selectedUxRoute = null;

const $ = (sel) => document.querySelector(sel);
const esc = (s) =>
  String(s ?? "").replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

function toast(msg, grave = false) {
  const t = $("#toast");
  t.textContent = msg;
  t.style.background = grave ? "var(--grave)" : "var(--ink)";
  t.classList.add("show");
  clearTimeout(t._h);
  t._h = setTimeout(() => t.classList.remove("show"), 3500);
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

async function refresh() {
  const [nextState, items, feedback, telemetry] = await Promise.all([
    api("/api/state"),
    api("/api/items/consumables"),
    api("/api/feedback"),
    api("/api/telemetry").catch(() => ({ pages: {} }))
  ]);
  S = nextState;
  CONSUMABLES = items;
  FEEDBACK = feedback;
  TELEMETRY = telemetry;
  renderNav();
  renderDowntimePicker();
  renderStores();
  renderBuildings();
  renderFolk();
  renderPeople();
  renderPlaces();
  renderParty();
  renderSessions();
  renderLedger();
  renderCampaigns();
  renderTown();
  renderScreen();
  renderFeedback();
  renderUx();
}

function renderFeedback() {
  const grid = $("#feedback-grid");
  if (!grid) return;
  grid.innerHTML = FEEDBACK.length ? FEEDBACK.map((ticket) => `<article class="card feedback-ticket">
    <img src="${ticket.screenshot}" alt="Annotated screenshot for ${esc(ticket.id)}">
    <div class="feedback-meta">${esc(ticket.reporter?.name || "Unseated player")} · ${esc(ticket.sourceUrl)} · ${ticket.viewport?.width || 0}×${ticket.viewport?.height || 0} · ${esc(new Date(ticket.createdAt).toLocaleString())}</div>
    <p>${esc(ticket.text)}</p>
    <div class="formrow"><label>Status</label><select data-feedback-status="${esc(ticket.id)}"><option value="open" ${ticket.status === "open" ? "selected" : ""}>Open</option><option value="triaged" ${ticket.status === "triaged" ? "selected" : ""}>Triaged</option><option value="resolved" ${ticket.status === "resolved" ? "selected" : ""}>Resolved</option><option value="wont-fix" ${ticket.status === "wont-fix" ? "selected" : ""}>Won't fix</option></select></div>
    <div class="formrow"><label>Cluster</label><input data-feedback-cluster="${esc(ticket.id)}" value="${esc(ticket.cluster || "")}" placeholder="shared issue or theme"></div>
    <label class="muted">Agent notes<textarea data-feedback-notes="${esc(ticket.id)}" rows="4">${esc(ticket.agentNotes || "")}</textarea></label>
    <button class="quiet" type="button" data-feedback-save="${esc(ticket.id)}">Save triage</button>
  </article>`).join("") : `<p class="muted">No playtest tickets yet.</p>`;
  for (const button of document.querySelectorAll("[data-feedback-save]")) button.onclick = async () => {
    const id = button.dataset.feedbackSave;
    try {
      await api(`/api/feedback/${encodeURIComponent(id)}`, { method: "PUT", body: {
        status: document.querySelector(`[data-feedback-status="${CSS.escape(id)}"]`).value,
        cluster: document.querySelector(`[data-feedback-cluster="${CSS.escape(id)}"]`).value,
        agentNotes: document.querySelector(`[data-feedback-notes="${CSS.escape(id)}"]`).value
      } });
      toast("Ticket triage saved.");
      await refresh();
    } catch (error) { toast(error.message, true); }
  };
}

// --- local playtest UX evidence ---
const UX_SURFACE_NAMES = {
  "/login": "Character selection",
  "/player": "Player root",
  "/table": "Card table",
  "/table-book": "Folio",
  "/tome": "Leatherbound tome",
  "/create": "Character creation",
  "/character/:id": "Character sheet",
  "/journal": "Journal",
  "/music": "Music desk"
};

function uxSurfaceName(path) {
  const embedded = path.endsWith("@embed");
  const base = path.replace(/@embed$/, "");
  return `${UX_SURFACE_NAMES[base] || base}${embedded ? " (embedded)" : ""}`;
}

function durationLabel(ms = 0) {
  if (ms < 60_000) return `${Math.round(ms / 1_000)}s`;
  if (ms < 3_600_000) return `${Math.round(ms / 60_000)}m`;
  return `${(ms / 3_600_000).toFixed(ms < 36_000_000 ? 1 : 0)}h`;
}

function percent(part = 0, total = 0) {
  return total > 0 ? Math.round(part / total * 100) : 0;
}

function uxMetric(entry, viewport) {
  if (!entry) return {};
  return viewport === "all" ? entry : (entry.viewports?.[viewport] || {});
}

function uxRow(label, width, value, { dead = false, code = false } = {}) {
  const safeLabel = esc(label);
  return `<div class="ux-metric-row${dead ? " dead-row" : ""}">
    ${code ? `<code title="${safeLabel}">${safeLabel}</code>` : `<span>${safeLabel}</span>`}
    <span class="ux-bar" aria-hidden="true"><i style="--value:${Math.max(0, Math.min(100, width))}%"></i></span>
    <span class="ux-metric-value">${esc(value)}</span>
  </div>`;
}

function drawUxMap(page, viewport, deadOnly) {
  const canvas = $("#ux-canvas");
  if (!canvas || $("#sec-ux").hidden) return;
  const rect = canvas.getBoundingClientRect();
  if (rect.width < 10 || rect.height < 10) return;
  const ratio = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = Math.round(rect.width * ratio);
  canvas.height = Math.round(rect.height * ratio);
  const context = canvas.getContext("2d");
  context.setTransform(ratio, 0, 0, ratio, 0, 0);

  const width = rect.width;
  const height = rect.height;
  const inset = Math.max(16, width * .035);
  const top = inset + 22;
  const innerWidth = width - inset * 2;
  const innerHeight = height - top - inset;
  context.fillStyle = "#faf5ea";
  context.fillRect(0, 0, width, height);
  context.strokeStyle = "#b8ab8f";
  context.lineWidth = 1;
  context.strokeRect(inset, inset, innerWidth, height - inset * 2);
  context.beginPath();
  context.moveTo(inset, top);
  context.lineTo(width - inset, top);
  context.stroke();
  for (let i = 0; i < 3; i += 1) {
    context.beginPath();
    context.fillStyle = i === 0 ? "#9a5a49" : i === 1 ? "#b89b58" : "#68784d";
    context.arc(inset + 11 + i * 14, inset + 11, 3, 0, Math.PI * 2);
    context.fill();
  }

  const points = (page?.points || []).filter((point) =>
    (viewport === "all" || point.viewport === viewport) && (!deadOnly || point.dead));
  for (const point of points) {
    const x = inset + Math.max(0, Math.min(1, point.x)) * innerWidth;
    const y = top + Math.max(0, Math.min(1, point.y)) * innerHeight;
    const radius = point.dead ? Math.max(22, width * .036) : Math.max(17, width * .028);
    const color = point.dead ? [145, 52, 38] : [72, 106, 73];
    const gradient = context.createRadialGradient(x, y, 1, x, y, radius);
    gradient.addColorStop(0, `rgba(${color.join(",")},.34)`);
    gradient.addColorStop(.35, `rgba(${color.join(",")},.18)`);
    gradient.addColorStop(1, `rgba(${color.join(",")},0)`);
    context.fillStyle = gradient;
    context.fillRect(x - radius, y - radius, radius * 2, radius * 2);
  }

  if (!points.length) {
    context.fillStyle = "#8a7f6b";
    context.font = "italic 15px Georgia, serif";
    context.textAlign = "center";
    context.fillText(page ? "No clicks match this filter yet." : "Player activity will gather here.", width / 2, height / 2);
  }
}

function renderUx() {
  const routeSelect = $("#ux-route");
  if (!routeSelect) return;
  const pages = Object.values(TELEMETRY?.pages || {}).sort((a, b) =>
    (b.sessions || 0) - (a.sessions || 0) || a.path.localeCompare(b.path));
  if (!selectedUxRoute || !TELEMETRY.pages?.[selectedUxRoute]) selectedUxRoute = pages[0]?.path || null;
  routeSelect.disabled = pages.length === 0;
  routeSelect.innerHTML = pages.length
    ? pages.map((page) => `<option value="${esc(page.path)}" ${page.path === selectedUxRoute ? "selected" : ""}>${esc(uxSurfaceName(page.path))}</option>`).join("")
    : `<option>No player activity yet</option>`;

  const viewport = $("#ux-viewport").value;
  const deadOnly = $("#ux-dead-only").checked;
  const page = selectedUxRoute ? TELEMETRY.pages?.[selectedUxRoute] : null;
  const stats = uxMetric(page, viewport);
  const deadRate = percent(stats.deadClicks, stats.clicks);
  $("#ux-summary").innerHTML = `
    <div class="ux-stat"><strong>${stats.sessions || 0}</strong><span>sessions</span></div>
    <div class="ux-stat"><strong>${durationLabel(stats.activeMs || 0)}</strong><span>active time</span></div>
    <div class="ux-stat"><strong>${stats.clicks || 0}</strong><span>clicks</span></div>
    <div class="ux-stat"><strong>${deadRate}%</strong><span>dead candidates</span></div>`;

  const viewportEntries = ["mobile", "tablet", "desktop"].map((key) => [key, page?.viewports?.[key] || {}]);
  const maxViewportTime = Math.max(1, ...viewportEntries.map(([, entry]) => entry.activeMs || 0));
  $("#ux-viewports").innerHTML = page
    ? viewportEntries.map(([key, entry]) => uxRow(key[0].toUpperCase() + key.slice(1), (entry.activeMs || 0) / maxViewportTime * 100, `${durationLabel(entry.activeMs || 0)} / ${entry.sessions || 0}`)).join("")
    : `<div class="ux-empty">No visits recorded.</div>`;

  const modes = Object.entries(page?.modes || {})
    .map(([name, entry]) => [name, uxMetric(entry, viewport)])
    .filter(([, entry]) => (entry.entries || 0) + (entry.activeMs || 0) + (entry.clicks || 0) > 0)
    .sort((a, b) => (b[1].activeMs || 0) - (a[1].activeMs || 0) || (b[1].clicks || 0) - (a[1].clicks || 0))
    .slice(0, 10);
  const maxModeTime = Math.max(1, ...modes.map(([, entry]) => entry.activeMs || entry.clicks || 0));
  $("#ux-modes").innerHTML = modes.length
    ? modes.map(([name, entry]) => uxRow(name, (entry.activeMs || entry.clicks || 0) / maxModeTime * 100, `${durationLabel(entry.activeMs || 0)} / ${entry.clicks || 0}`, { code: true })).join("")
    : `<div class="ux-empty">No mode time recorded.</div>`;

  const targets = Object.entries(page?.targets || {})
    .map(([name, entry]) => [name, uxMetric(entry, viewport)])
    .filter(([, entry]) => (entry.deadClicks || 0) > 0)
    .sort((a, b) => (b[1].deadClicks || 0) - (a[1].deadClicks || 0) || (b[1].clicks || 0) - (a[1].clicks || 0))
    .slice(0, 10);
  const maxDead = Math.max(1, ...targets.map(([, entry]) => entry.deadClicks || 0));
  $("#ux-targets").innerHTML = targets.length
    ? targets.map(([name, entry]) => uxRow(name, (entry.deadClicks || 0) / maxDead * 100, `${entry.deadClicks || 0} / ${entry.clicks || 0}`, { dead: true, code: true })).join("")
    : `<div class="ux-empty">No dead-click candidates.</div>`;

  requestAnimationFrame(() => drawUxMap(page, viewport, deadOnly));
}

// --- the table screen ---
async function project(body) {
  try {
    await api("/api/screen", { method: "PUT", body });
    toast(body.type === null ? "Screen darkened." : "Shown on screen.");
    await refresh();
  } catch (e) {
    toast(e.message, true);
  }
}

function describeScreen(cur) {
  if (!cur) return "settlement title";
  switch (cur.type) {
    case "image": return `an image${cur.caption ? ` — “${cur.caption}”` : ""}`;
    case "text": return `words${cur.title ? ` — “${cur.title}”` : ""}`;
    case "paper": return "a carried paper";
    case "stores": return "the stores";
    case "buildings": return "the buildings";
    case "folk": return `${S.characters.find((c) => c.id === cur.refId)?.name ?? "someone"} (folk)`;
    case "person": return `${(S.people || []).find((p) => p.id === cur.refId)?.name ?? "someone"} (person)`;
    case "place": return `${(S.places || []).find((p) => p.id === cur.refId)?.name ?? "somewhere"} (place)`;
    default: return cur.type;
  }
}

function renderScreen() {
  $("#screen-now").textContent = describeScreen(S.screen);
}

$("#screen-clear").addEventListener("click", () => project({ type: null }));
$("#screen-img-show").addEventListener("click", () =>
  project({ type: "image", url: $("#screen-img-url").value, caption: $("#screen-img-cap").value }));
$("#screen-txt-show").addEventListener("click", () =>
  project({ type: "text", title: $("#screen-txt-title").value, body: $("#screen-txt-body").value }));
$("#screen-stores").addEventListener("click", () => project({ type: "stores" }));
$("#screen-buildings").addEventListener("click", () => project({ type: "buildings" }));

// --- nav ---
function renderNav() {
  $("#nav-name").textContent = S.settlement.name;
  $("#nav-season").textContent = S.settlement.seasonLabel;
  $("#ledger-season").textContent = S.settlement.seasonLabel;
}

function showSection(key) {
  for (const a of document.querySelectorAll("nav a[data-nav]")) {
    a.classList.toggle("active", a.dataset.nav === key);
  }
  for (const sec of document.querySelectorAll("main > section")) {
    sec.hidden = sec.id !== `sec-${key === "town" ? "town" : key}`;
  }
  if (key === "ux") requestAnimationFrame(renderUx);
}
window.addEventListener("hashchange", () => showSection(location.hash.slice(1) || "season"));

$("#ux-route").addEventListener("change", () => {
  selectedUxRoute = $("#ux-route").value;
  renderUx();
});
$("#ux-viewport").addEventListener("change", renderUx);
$("#ux-dead-only").addEventListener("change", renderUx);
$("#ux-clear").addEventListener("click", async () => {
  if (!confirm("Clear all locally collected UX history?")) return;
  try {
    TELEMETRY = await api("/api/telemetry", { method: "DELETE" });
    selectedUxRoute = null;
    renderUx();
    toast("UX history cleared.");
  } catch (error) {
    toast(error.message, true);
  }
});
let uxResizeFrame = null;
window.addEventListener("resize", () => {
  if ($("#sec-ux").hidden) return;
  cancelAnimationFrame(uxResizeFrame);
  uxResizeFrame = requestAnimationFrame(renderUx);
});

// --- downtime runner ---
function renderDowntimePicker() {
  const grid = $("#dt-buildings");
  const list = S.buildings;
  if (!list.length) {
    grid.innerHTML = `<p class="muted">No buildings yet. The wilderness is waiting.</p>`;
    return;
  }
  grid.innerHTML = list
    .map((b) => {
      const foreman = S.characters.find((c) => c.id === b.foremanId);
      return `<div class="card building-pick ${selectedBuilding === b.id ? "selected" : ""}" data-b="${b.id}">
        <strong>${esc(b.name)}</strong>
        <div class="muted" style="font-size:0.88rem;">${esc(b.resource)} · level ${b.level}</div>
        <div style="font-size:0.9rem;">${foreman ? esc(foreman.name) : '<span class="grave">no foreman</span>'}</div>
        <div class="muted" style="font-size:0.8rem;">${b.spentCount} of ${b.totalEntries} events discovered</div>
      </div>`;
    })
    .join("");
  for (const el of grid.querySelectorAll("[data-b]")) {
    el.onclick = () => selectBuilding(el.dataset.b);
  }
}

async function selectBuilding(id) {
  selectedBuilding = id;
  renderDowntimePicker();
  $("#dt-panel").hidden = false;
  $("#resolve-result").innerHTML = "";
  await renderPreview();
}

async function renderPreview() {
  if (!selectedBuilding) return;
  const effort = $("#dt-effort").checked ? "1" : "0";
  const p = await api(`/api/downtime/preview?building=${selectedBuilding}&effort=${effort}`);
  const b = S.buildings.find((x) => x.id === selectedBuilding);
  $("#dt-title").textContent = b.name + (p.foreman ? ` — ${p.foreman.name}` : "");
  // Visible modifiers itemized; hidden folded into the total (spec §8B).
  $("#dt-mods").innerHTML =
    p.visible
      .map((m) => `<div class="modline"><span>${esc(m.label)}</span><span>${m.value >= 0 ? "+" : ""}${m.value}</span></div>`)
      .join("") +
    `<div class="modline total"><span>Modifier to the roll</span><span>${p.total >= 0 ? "+" : ""}${p.total}</span></div>`;
  $("#dt-hidden").innerHTML = p.hidden.length
    ? p.hidden
        .map((m) => `<div class="modline"><span>${esc(m.label)}</span><span>${m.value >= 0 ? "+" : ""}${m.value}</span></div>`)
        .join("")
    : `<div class="muted" style="font-size:0.85rem;">Nothing folded in.</div>`;
  $("#dt-hidden-details").open = false;
}

$("#dt-effort").addEventListener("change", renderPreview);

// --- preferences (this device only; campaign state never lives here) ---
const PREFS_KEY = "settlement-gm-prefs";
const prefs = (() => {
  try { return { diceRoller: false, ...JSON.parse(localStorage.getItem(PREFS_KEY) || "{}") }; }
  catch { return { diceRoller: false }; }
})();
function savePrefs() {
  localStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
  applyPrefs();
}
function applyPrefs() {
  $("#dt-cast").hidden = !prefs.diceRoller;
  if (!prefs.diceRoller) $("#dice-tray").hidden = true;
  $("#pref-dice").checked = prefs.diceRoller;
}
$("#pref-dice").addEventListener("change", () => {
  prefs.diceRoller = $("#pref-dice").checked;
  savePrefs();
});
applyPrefs();

// --- the dice (optional; spec §5: real 4d6 − 1d6, never a flat 0–30) ---
const DIE_FACES = ["⚀", "⚁", "⚂", "⚃", "⚄", "⚅"];
function d6() {
  // Rejection sampling keeps every face exactly as likely as a real die.
  const b = new Uint8Array(1);
  do { crypto.getRandomValues(b); } while (b[0] >= 252);
  return (b[0] % 6) + 1;
}

let casting = false;
$("#dt-cast").addEventListener("click", () => {
  if (casting) return;
  casting = true;
  const dice = [d6(), d6(), d6(), d6(), d6()];
  const raw = dice[0] + dice[1] + dice[2] + dice[3] - dice[4];
  $("#dt-raw").value = "";
  $("#dice-tray").hidden = false;
  const row = $("#dice-row");
  row.innerHTML =
    dice
      .map(
        (_, i) =>
          `${i === 4 ? '<span class="dice-op">−</span>' : ""}<span class="die${i === 4 ? " neg" : ""}">${DIE_FACES[d6() - 1]}</span>`
      )
      .join("") + `<span class="dice-op">=</span><span class="dice-sum" id="dice-sum"></span>`;
  const els = [...row.querySelectorAll(".die")];
  const finish = () => {
    $("#dice-sum").textContent = raw;
    $("#dt-raw").value = raw;
    casting = false;
  };
  if (matchMedia("(prefers-reduced-motion: reduce)").matches) {
    els.forEach((el, i) => (el.textContent = DIE_FACES[dice[i] - 1]));
    finish();
    return;
  }
  els.forEach((el) => el.classList.add("tumbling"));
  const spin = setInterval(() => {
    for (const el of els) if (el.classList.contains("tumbling")) el.textContent = DIE_FACES[d6() - 1];
  }, 90);
  dice.forEach((v, i) => {
    // Bone dice land in turn; the dark one waits an extra beat.
    setTimeout(() => {
      els[i].classList.remove("tumbling");
      els[i].textContent = DIE_FACES[v - 1];
      els[i].classList.add("settled");
      if (i === 4) {
        clearInterval(spin);
        finish();
      }
    }, 700 + i * 330 + (i === 4 ? 480 : 0));
  });
});

$("#dt-resolve").addEventListener("click", async () => {
  const raw = parseInt($("#dt-raw").value, 10);
  if (Number.isNaN(raw)) return toast("Enter the raw dice first.");
  try {
    const r = await api("/api/downtime/resolve", {
      method: "POST",
      body: { buildingId: selectedBuilding, raw, playerEffort: $("#dt-effort").checked }
    });
    renderResult(r);
    $("#dt-raw").value = "";
    await refresh();
  } catch (e) {
    toast(e.message, true);
  }
});

function renderResult(r) {
  const grave = r.final === 0 || r.stockpileWiped;
  const lines = [];
  lines.push(`<div class="result-number ${grave ? "grave" : ""}">${r.final}</div>`);
  lines.push(`<div class="result-tier ${grave ? "grave" : r.final >= 16 ? "good" : ""}">${esc(r.tier)}</div>`);
  lines.push(
    `<div class="muted" style="font-size:0.85rem;">rolled ${r.raw}, modifier ${r.breakdown.total >= 0 ? "+" : ""}${r.breakdown.total}</div>`
  );
  if (r.event) {
    lines.push(`<div class="event-text">${esc(r.event)}</div>`);
  } else if (r.alreadySpent) {
    lines.push(`<div class="muted" style="margin:0.8rem 0;">(event already spent — resource only)</div>`);
  }
  if (r.stockpileWiped) {
    lines.push(`<div class="grave" style="font-weight:600;">All ${esc(r.resource)} is lost.</div>`);
  } else {
    lines.push(`<div>${r.amount > 0 ? `<span class="good">+${r.amount} ${esc(r.resource)}</span>` : `No ${esc(r.resource)} gained.`} <span class="muted">(${esc(r.resource)} now ${r.pools[r.resource]})</span></div>`);
  }
  if (r.effectGained) {
    lines.push(`<div style="margin-top:0.5rem;"><span class="pill">standing effect</span> ${esc(r.effectGained)}</div>`);
  }
  if (r.inspirationDrop) {
    lines.push(`<div class="muted" style="margin-top:0.7rem;font-size:0.85rem;">The foreman's standing takes a hit — consider adjusting their bookkeeping in Folk.</div>`);
  }
  $("#resolve-result").innerHTML = `<div class="card flash" style="max-width:480px;">${lines.join("")}</div>`;
}

// --- stores ---
function renderStores() {
  $("#stores-strip").innerHTML = Object.entries(S.resources)
    .map(
      ([name, v]) => `<div class="stat card"><div class="value">${v}</div><div class="smallcaps">${esc(name)}</div></div>`
    )
    .join("");
  $("#adj-resource").innerHTML = Object.keys(S.resources)
    .map((r) => `<option>${esc(r)}</option>`)
    .join("");
}

$("#adj-apply").addEventListener("click", async () => {
  try {
    await api("/api/resources/adjust", {
      method: "POST",
      body: {
        resource: $("#adj-resource").value,
        delta: parseInt($("#adj-delta").value, 10),
        reason: $("#adj-reason").value
      }
    });
    $("#adj-delta").value = "";
    $("#adj-reason").value = "";
    toast("Adjustment recorded.");
    await refresh();
  } catch (e) {
    toast(e.message, true);
  }
});

// --- buildings ---
function renderBuildings() {
  const rows = S.buildings
    .map((b) => {
      const options = ['<option value="">— none —</option>']
        .concat(
          S.characters
            .filter((c) => c.status === "alive")
            .map((c) => `<option value="${c.id}" ${b.foremanId === c.id ? "selected" : ""}>${esc(c.name)}</option>`)
        )
        .join("");
      const effects = b.effects?.length
        ? b.effects.map((e) => `<div class="pill" title="from a roll of ${e.source}">${esc(e.label)}</div>`).join(" ")
        : '<span class="muted">—</span>';
      return `<tr>
        <td><strong>${esc(b.name)}</strong><br><span class="muted" style="font-size:0.85rem;">${esc(b.resource)}</span></td>
        <td><input type="number" class="num" min="1" value="${b.level}" data-level="${b.id}"></td>
        <td><select data-foreman="${b.id}">${options}</select></td>
        <td>${b.producedTotal}</td>
        <td>${b.spentCount} of ${b.totalEntries}</td>
        <td>${effects}</td>
      </tr>`;
    })
    .join("");
  $("#buildings-table").innerHTML = `
    <tr><th>Building</th><th>Level</th><th>Foreman</th><th>Produced</th><th>Events discovered</th><th>Standing effects</th></tr>
    ${rows || '<tr><td colspan="6" class="muted">No buildings yet. The wilderness is waiting.</td></tr>'}`;
  for (const el of document.querySelectorAll("[data-level]")) {
    el.onchange = () =>
      api(`/api/buildings/${el.dataset.level}`, { method: "PUT", body: { level: parseInt(el.value, 10) } })
        .then(refresh)
        .catch((e) => toast(e.message, true));
  }
  for (const el of document.querySelectorAll("[data-foreman]")) {
    el.onchange = () =>
      api(`/api/buildings/${el.dataset.foreman}`, { method: "PUT", body: { foremanId: el.value || null } })
        .then(refresh)
        .catch((e) => toast(e.message, true));
  }
}

// --- folk ---
const TRAITS = ["Agility", "Strength", "Finesse", "Instinct", "Presence", "Knowledge"];

function renderFolk() {
  $("#folk-grid").innerHTML = S.characters
    .map((c) => {
      const traits = TRAITS.map(
        (t) => `<span class="pill">${t.slice(0, 3)} ${c.traits?.[t] >= 0 ? "+" : ""}${c.traits?.[t] ?? 0}</span>`
      ).join("");
      const apts = Object.entries(c.aptitudes || {})
        .map(([bid, v]) => {
          const b = S.buildings.find((x) => x.id === bid);
          return `${esc(b ? b.name : bid)} ${v >= 0 ? "+" : ""}${v}`;
        })
        .join(", ");
      const dead = c.status !== "alive";
      return `<div class="card" style="${dead ? "opacity:0.6;" : ""}">
        <div class="folk-head">
          <div class="portrait">${c.portrait ? `<img src="${esc(c.portrait)}" alt="">` : esc(c.name[0] || "?")}</div>
          <div>
            <strong>${esc(c.name)}</strong> ${dead ? `<span class="pill grave">${esc(c.status)}</span>` : ""}
            <div class="muted" style="font-size:0.85rem;">${esc(c.role || "")}</div>
          </div>
        </div>
        <p style="font-size:0.9rem;">${esc(c.description || "")}</p>
        <div class="traits">${traits}</div>
        <div class="muted" style="font-size:0.82rem; margin-top:0.4rem;">Aptitude: ${apts || "—"}</div>
        <details class="gm-only">
          <summary>gm only</summary>
          <div class="inner">
            <div class="formrow"><label>Inspiration</label>
              <input type="number" class="num" min="-1" max="2" value="${c.hidden?.inspiration ?? 0}" data-insp="${c.id}">
            </div>
            <div class="formrow"><label>Hidden penalty</label>
              <input type="number" class="num" value="${c.hidden?.penalty ?? 0}" data-pen="${c.id}">
            </div>
            ${c.hidden?.notes ? `<div class="muted" style="font-size:0.82rem; white-space:pre-wrap;">${esc(c.hidden.notes)}</div>` : ""}
          </div>
        </details>
        <div style="margin-top:0.6rem;"><button class="quiet" data-edit="${c.id}">Edit</button> <button class="quiet" data-show-folk="${c.id}">Show at the table</button></div>
      </div>`;
    })
    .join("");
  for (const el of document.querySelectorAll("[data-show-folk]")) {
    el.onclick = () => project({ type: "folk", refId: el.dataset.showFolk });
  }
  for (const el of document.querySelectorAll("[data-insp]")) {
    el.onchange = () =>
      api(`/api/characters/${el.dataset.insp}`, { method: "PUT", body: { hidden: { inspiration: clampNum(el, -1, 2) } } })
        .then(refresh).catch((e) => toast(e.message, true));
  }
  for (const el of document.querySelectorAll("[data-pen]")) {
    el.onchange = () =>
      api(`/api/characters/${el.dataset.pen}`, { method: "PUT", body: { hidden: { penalty: parseInt(el.value, 10) || 0 } } })
        .then(refresh).catch((e) => toast(e.message, true));
  }
  for (const el of document.querySelectorAll("[data-edit]")) {
    el.onclick = () => renderFolkEditor(S.characters.find((c) => c.id === el.dataset.edit));
  }
}

function clampNum(el, min, max) {
  let v = parseInt(el.value, 10) || 0;
  v = Math.max(min, Math.min(max, v));
  el.value = v;
  return v;
}

$("#folk-new").addEventListener("click", () => renderFolkEditor(null));

function renderFolkEditor(c) {
  const isNew = !c;
  c = c || { name: "", role: "", status: "alive", description: "", traits: {}, aptitudes: {}, publicTraits: true, hidden: {} };
  const traitRows = TRAITS.map(
    (t) => `<div class="formrow"><label>${t}</label><input type="number" class="num" id="ed-tr-${t}" value="${c.traits?.[t] ?? 0}"></div>`
  ).join("");
  const aptRows = S.buildings
    .map(
      (b) =>
        `<div class="formrow"><label>${esc(b.name)}</label><input type="number" class="num" id="ed-apt-${b.id}" value="${c.aptitudes?.[b.id] ?? 0}"></div>`
    )
    .join("");
  $("#folk-editor").innerHTML = `<div class="card" style="max-width:560px; margin-top:1rem;">
    <h3>${isNew ? "Add folk" : `Edit ${esc(c.name)}`}</h3>
    <div class="formrow"><label>Name</label><input type="text" id="ed-name" value="${esc(c.name)}" style="flex:1"></div>
    <div class="formrow"><label>Role</label><input type="text" id="ed-role" value="${esc(c.role || "")}" style="flex:1"></div>
    <div class="formrow"><label>Status</label>
      <select id="ed-status">
        ${["alive", "dead", "missing"].map((s) => `<option ${c.status === s ? "selected" : ""}>${s}</option>`).join("")}
      </select>
    </div>
    <div class="formrow" style="align-items:flex-start;"><label>Description</label>
      <div style="flex:1">
        <textarea id="ed-description" rows="3" style="width:100%">${esc(c.description || "")}</textarea>
        <div class="muted" style="font-size:0.8rem;">Public — shown on the table view, word for word. Keep what players shouldn't know out of it.</div>
      </div>
    </div>
    <div class="formrow" style="align-items:flex-start;"><label>GM notes</label>
      <div style="flex:1">
        <textarea id="ed-gmnotes" rows="3" style="width:100%">${esc(c.hidden?.notes || "")}</textarea>
        <div class="muted" style="font-size:0.8rem;">Private — never leaves this console.</div>
      </div>
    </div>
    <div class="formrow"><label>Portrait URL</label><input type="text" id="ed-portrait" value="${esc(c.portrait || "")}" style="flex:1" placeholder="/portraits/… (optional)"></div>
    <div class="formrow"><label>Public traits</label><input type="checkbox" id="ed-public" ${c.publicTraits ? "checked" : ""}> <span class="muted" style="font-size:0.85rem;">show trait numbers on the table view</span></div>
    <hr class="rule"><div class="smallcaps">Traits</div>${traitRows}
    <hr class="rule"><div class="smallcaps">Aptitude by building</div>${aptRows}
    <hr class="rule">
    <div class="formrow">
      <button id="ed-save">${isNew ? "Add folk" : "Save"}</button>
      <button class="quiet" id="ed-cancel">Cancel</button>
    </div>
  </div>`;
  $("#ed-cancel").onclick = () => ($("#folk-editor").innerHTML = "");
  $("#ed-save").onclick = async () => {
    const body = {
      name: $("#ed-name").value,
      role: $("#ed-role").value,
      status: $("#ed-status").value,
      description: $("#ed-description").value,
      hidden: { notes: $("#ed-gmnotes").value },
      portrait: $("#ed-portrait").value || null,
      publicTraits: $("#ed-public").checked,
      traits: Object.fromEntries(TRAITS.map((t) => [t, parseInt($(`#ed-tr-${t}`).value, 10) || 0])),
      aptitudes: Object.fromEntries(
        S.buildings
          .map((b) => [b.id, parseInt($(`#ed-apt-${b.id}`).value, 10) || 0])
          .filter(([, v]) => v !== 0)
      )
    };
    try {
      if (isNew) await api("/api/characters", { method: "POST", body });
      else await api(`/api/characters/${c.id}`, { method: "PUT", body });
      $("#folk-editor").innerHTML = "";
      await refresh();
    } catch (e) {
      toast(e.message, true);
    }
  };
}

// --- people (the wider world's characters) & places ---

function placeName(placeId) {
  const p = (S.places || []).find((x) => x.id === placeId);
  return p ? p.name : null;
}

function placeOptions(selectedId) {
  const opts = [`<option value="" ${!selectedId ? "selected" : ""}>no location</option>`];
  for (const p of S.places || []) {
    opts.push(`<option value="${p.id}" ${selectedId === p.id ? "selected" : ""}>${esc(p.name)}</option>`);
  }
  return opts.join("");
}

function renderPeople() {
  const grid = $("#people-grid");
  const people = S.people || [];
  grid.innerHTML = people.length
    ? people
        .map((p) => {
          const dead = p.status !== "alive";
          const items = (p.items || [])
            .map((it) => `<li><strong>${esc(it.name)}</strong>${it.note ? ` — <span class="muted">${esc(it.note)}</span>` : ""}</li>`)
            .join("");
          return `<div class="card" style="${dead ? "opacity:0.6;" : ""}">
            <div class="folk-head">
              <div class="portrait">${p.portrait ? `<img src="${esc(p.portrait)}" alt="">` : esc(p.name[0] || "?")}</div>
              <div>
                <strong>${esc(p.name)}</strong>
                ${dead ? `<span class="pill grave">${esc(p.status)}</span>` : ""}
                ${p.revealed ? "" : `<span class="pill">hidden from players</span>`}
                <div class="muted" style="font-size:0.85rem;">${esc(p.role || "")}</div>
              </div>
            </div>
            <p style="font-size:0.9rem;">${esc(p.description || "")}</p>
            ${items ? `<div class="muted" style="font-size:0.82rem;">Carries:</div><ul style="margin:0.2rem 0 0.4rem 1.1rem; font-size:0.86rem;">${items}</ul>` : ""}
            <div class="formrow" style="margin-top:0.5rem;">
              <label style="min-width:auto;">Now at</label>
              <select data-move="${p.id}">${placeOptions(p.placeId)}</select>
            </div>
            ${p.hidden?.notes ? `<details class="gm-only"><summary>gm only</summary><div class="inner" style="white-space:pre-wrap;">${esc(p.hidden.notes)}</div></details>` : ""}
            <div style="margin-top:0.6rem;"><button class="quiet" data-edit-person="${p.id}">Edit</button> <button class="quiet" data-show-person="${p.id}">Show at the table</button></div>
          </div>`;
        })
        .join("")
    : `<p class="muted">No one beyond the palisade yet.</p>`;
  for (const el of grid.querySelectorAll("[data-show-person]")) {
    el.onclick = () => project({ type: "person", refId: el.dataset.showPerson });
  }
  for (const el of grid.querySelectorAll("[data-move]")) {
    el.onchange = () =>
      api(`/api/people/${el.dataset.move}`, { method: "PUT", body: { placeId: el.value || null } })
        .then(() => {
          const dest = el.value ? placeName(el.value) : null;
      toast(dest ? `Moved to ${dest}.` : "Location cleared.");
          return refresh();
        })
        .catch((e) => toast(e.message, true));
  }
  for (const el of grid.querySelectorAll("[data-edit-person]")) {
    el.onclick = () => renderPersonEditor(people.find((p) => p.id === el.dataset.editPerson));
  }
}

$("#people-new").addEventListener("click", () => renderPersonEditor(null));

function renderPersonEditor(p) {
  const isNew = !p;
  p = p || { name: "", role: "", status: "alive", description: "", portrait: null, portraitPrompt: "", placeId: null, items: [], revealed: true, hidden: {} };
  const items = (p.items || []).map((it) => ({ name: it.name || "", note: it.note || "" }));

  function draw() {
    const itemRows = items
      .map(
        (it, i) => `<div class="formrow">
          <input type="text" data-item-name="${i}" value="${esc(it.name)}" placeholder="item" style="width:160px;">
          <input type="text" data-item-note="${i}" value="${esc(it.note)}" placeholder="description or rules" style="flex:1;">
          <button class="quiet" data-item-drop="${i}" title="remove">✕</button>
        </div>`
      )
      .join("");
    $("#people-editor").innerHTML = `<div class="card" style="max-width:620px; margin-top:1rem;">
      <h3>${isNew ? "Add a person" : `Edit ${esc(p.name)}`}</h3>
      <div class="formrow"><label>Name</label><input type="text" id="pe-name" value="${esc(p.name)}" style="flex:1"></div>
      <div class="formrow"><label>Role</label><input type="text" id="pe-role" value="${esc(p.role || "")}" style="flex:1" placeholder="occupation or role"></div>
      <div class="formrow"><label>Status</label>
        <select id="pe-status">
          ${["alive", "dead", "missing"].map((s) => `<option ${p.status === s ? "selected" : ""}>${s}</option>`).join("")}
        </select>
      </div>
      <div class="formrow"><label>Place</label><select id="pe-place">${placeOptions(p.placeId)}</select></div>
      <div class="formrow"><label>Shown to players</label><input type="checkbox" id="pe-revealed" ${p.revealed ? "checked" : ""}> <span class="muted" style="font-size:0.85rem;">appears in the players' journal</span></div>
      <div class="formrow" style="align-items:flex-start;"><label>Description</label>
        <div style="flex:1">
          <textarea id="pe-description" rows="3" style="width:100%">${esc(p.description || "")}</textarea>
          <div class="muted" style="font-size:0.8rem;">Public — players read this word for word. Keep what they shouldn't know out of it.</div>
        </div>
      </div>
      <div class="formrow" style="align-items:flex-start;"><label>GM notes</label>
        <div style="flex:1">
          <textarea id="pe-gmnotes" rows="3" style="width:100%">${esc(p.hidden?.notes || "")}</textarea>
          <div class="muted" style="font-size:0.8rem;">Private — never leaves this console.</div>
        </div>
      </div>
      <hr class="rule"><div class="smallcaps">Carries</div>
      ${itemRows || `<p class="muted" style="font-size:0.85rem;">No items.</p>`}
      <div class="formrow"><button class="quiet" id="pe-item-add">Add an item</button></div>
      <hr class="rule"><div class="smallcaps">Portrait</div>
      <div class="formrow"><label>Portrait URL</label><input type="text" id="pe-portrait" value="${esc(p.portrait || "")}" style="flex:1" placeholder="/portraits/… (optional)"></div>
      ${isNew
        ? `<p class="muted" style="font-size:0.85rem;">Save them first — then a portrait can be requested.</p>`
        : `<div class="formrow" style="align-items:flex-start;"><label>ComfyUI prompt</label>
            <div style="flex:1">
              <textarea id="pe-prompt" rows="2" style="width:100%" placeholder="what the artist should paint">${esc(p.portraitPrompt || p.description || "")}</textarea>
              <div class="formrow" style="margin:0.4rem 0 0;">
                <button class="quiet" id="pe-portrait-request">Request a portrait</button>
                <span class="muted" style="font-size:0.8rem;">Waidrin Portraits workflow — wiring to come.</span>
              </div>
            </div>
          </div>`}
      <hr class="rule">
      <div class="formrow">
        <button id="pe-save">${isNew ? "Add person" : "Save"}</button>
        <button class="quiet" id="pe-cancel">Cancel</button>
        ${isNew ? "" : `<button class="quiet grave" id="pe-delete" style="margin-left:auto;">Delete person</button>`}
      </div>
    </div>`;
    wire();
  }

  function collectItems() {
    for (let i = 0; i < items.length; i++) {
      items[i].name = $(`[data-item-name="${i}"]`)?.value ?? items[i].name;
      items[i].note = $(`[data-item-note="${i}"]`)?.value ?? items[i].note;
    }
  }

  function wire() {
    $("#pe-item-add").onclick = () => { collectItems(); items.push({ name: "", note: "" }); draw(); };
    for (const el of document.querySelectorAll("[data-item-drop]")) {
      el.onclick = () => { collectItems(); items.splice(parseInt(el.dataset.itemDrop, 10), 1); draw(); };
    }
    $("#pe-cancel").onclick = () => ($("#people-editor").innerHTML = "");
    const requestBtn = $("#pe-portrait-request");
    if (requestBtn) {
      requestBtn.onclick = async () => {
        try {
          const r = await api(`/api/people/${p.id}/portrait`, { method: "POST", body: { prompt: $("#pe-prompt").value } });
          toast(r.message);
        } catch (e) {
          toast(e.message, true);
        }
      };
    }
    const deleteBtn = $("#pe-delete");
    if (deleteBtn) {
      deleteBtn.onclick = async () => {
        if (!confirm(`Delete ${p.name}? This also deletes players' notes about them.`)) return;
        try {
          await api(`/api/people/${p.id}`, { method: "DELETE" });
          $("#people-editor").innerHTML = "";
          await refresh();
        } catch (e) {
          toast(e.message, true);
        }
      };
    }
    $("#pe-save").onclick = async () => {
      collectItems();
      const body = {
        name: $("#pe-name").value,
        role: $("#pe-role").value,
        status: $("#pe-status").value,
        description: $("#pe-description").value,
        hidden: { notes: $("#pe-gmnotes").value },
        portrait: $("#pe-portrait").value || null,
        placeId: $("#pe-place").value || null,
        revealed: $("#pe-revealed").checked,
        items: items.filter((it) => it.name.trim())
      };
      if (!isNew) body.portraitPrompt = $("#pe-prompt") ? $("#pe-prompt").value : p.portraitPrompt;
      try {
        if (isNew) await api("/api/people", { method: "POST", body });
        else await api(`/api/people/${p.id}`, { method: "PUT", body });
        $("#people-editor").innerHTML = "";
        await refresh();
      } catch (e) {
        toast(e.message, true);
      }
    };
  }

  draw();
}

function renderPlaces() {
  const grid = $("#places-grid");
  const places = S.places || [];
  grid.innerHTML = places.length
    ? places
        .map((pl) => {
          const here = (S.people || []).filter((p) => p.placeId === pl.id).map((p) => esc(p.name));
          return `<div class="card">
            <strong>${esc(pl.name)}</strong>
            ${pl.kind ? `<span class="pill">${esc(pl.kind)}</span>` : ""}
            ${pl.revealed ? "" : `<span class="pill">hidden from players</span>`}
            <p style="font-size:0.9rem;">${esc(pl.description || "")}</p>
            ${here.length ? `<div class="muted" style="font-size:0.82rem;">Here: ${here.join(", ")}</div>` : ""}
            ${pl.hidden?.notes ? `<details class="gm-only"><summary>gm only</summary><div class="inner" style="white-space:pre-wrap;">${esc(pl.hidden.notes)}</div></details>` : ""}
            <div style="margin-top:0.6rem;"><button class="quiet" data-edit-place="${pl.id}">Edit</button> <button class="quiet" data-show-place="${pl.id}">Show at the table</button></div>
          </div>`;
        })
        .join("")
    : `<p class="muted">Only blank map so far.</p>`;
  for (const el of grid.querySelectorAll("[data-show-place]")) {
    el.onclick = () => project({ type: "place", refId: el.dataset.showPlace });
  }
  for (const el of grid.querySelectorAll("[data-edit-place]")) {
    el.onclick = () => renderPlaceEditor(places.find((p) => p.id === el.dataset.editPlace));
  }
}

$("#places-new").addEventListener("click", () => renderPlaceEditor(null));

function renderPlaceEditor(pl) {
  const isNew = !pl;
  pl = pl || { name: "", kind: "", description: "", portrait: null, revealed: true, fixed: false, hidden: {} };
  $("#places-editor").innerHTML = `<div class="card" style="max-width:620px; margin-top:1rem;">
    <h3>${isNew ? "Add a place" : `Edit ${esc(pl.name)}`}</h3>
    <div class="formrow"><label>Name</label><input type="text" id="ple-name" value="${esc(pl.name)}" style="flex:1"></div>
    <div class="formrow"><label>Kind</label><input type="text" id="ple-kind" value="${esc(pl.kind || "")}" style="flex:1" placeholder="ruin, forest, crossing…"></div>
    <div class="formrow"><label>Shown to players</label><input type="checkbox" id="ple-revealed" ${pl.revealed ? "checked" : ""}> <span class="muted" style="font-size:0.85rem;">appears in the players' journal</span></div>
    <div class="formrow" style="align-items:flex-start;"><label>Description</label>
      <div style="flex:1">
        <textarea id="ple-description" rows="3" style="width:100%">${esc(pl.description || "")}</textarea>
        <div class="muted" style="font-size:0.8rem;">Public — players read this word for word.</div>
      </div>
    </div>
    <div class="formrow" style="align-items:flex-start;"><label>GM notes</label>
      <div style="flex:1">
        <textarea id="ple-gmnotes" rows="3" style="width:100%">${esc(pl.hidden?.notes || "")}</textarea>
        <div class="muted" style="font-size:0.8rem;">Private — never leaves this console.</div>
      </div>
    </div>
    <hr class="rule"><div class="smallcaps">Image</div>
    <div class="formrow"><label>Image URL</label><input type="text" id="ple-portrait" value="${esc(pl.portrait || "")}" style="flex:1" placeholder="/places/… (optional)"></div>
    <div class="formrow">
      <button class="quiet" disabled title="A ComfyUI workflow for places is still to be made.">Request an image</button>
      <span class="muted" style="font-size:0.8rem;">awaiting a places workflow</span>
    </div>
    <hr class="rule">
    <div class="formrow">
      <button id="ple-save">${isNew ? "Add place" : "Save"}</button>
      <button class="quiet" id="ple-cancel">Cancel</button>
      ${isNew || pl.fixed ? "" : `<button class="quiet grave" id="ple-delete" style="margin-left:auto;">Delete place</button>`}
    </div>
  </div>`;
  $("#ple-cancel").onclick = () => ($("#places-editor").innerHTML = "");
  const deleteBtn = $("#ple-delete");
  if (deleteBtn) {
    deleteBtn.onclick = async () => {
      if (!confirm(`Delete ${pl.name}? This also deletes players' notes about it and clears the location from anyone there.`)) return;
      try {
        await api(`/api/places/${pl.id}`, { method: "DELETE" });
        $("#places-editor").innerHTML = "";
        await refresh();
      } catch (e) {
        toast(e.message, true);
      }
    };
  }
  $("#ple-save").onclick = async () => {
    const body = {
      name: $("#ple-name").value,
      kind: $("#ple-kind").value,
      description: $("#ple-description").value,
      hidden: { notes: $("#ple-gmnotes").value },
      portrait: $("#ple-portrait").value || null,
      revealed: $("#ple-revealed").checked
    };
    try {
      if (isNew) await api("/api/places", { method: "POST", body });
      else await api(`/api/places/${pl.id}`, { method: "PUT", body });
      $("#places-editor").innerHTML = "";
      await refresh();
    } catch (e) {
      toast(e.message, true);
    }
  };
}

// --- party ---
const activePartyMembers = () => (S.party || []).filter((pc) => pc.active !== false);

function partyIdentity(p) {
  const portrait = p.portrait
    ? `<img src="${esc(p.portrait)}" alt="">`
    : esc((p.name || "?").slice(0, 1).toUpperCase());
  return `<div class="party-identity"><span class="party-portrait" aria-hidden="true">${portrait}</span><span><strong>${esc(p.name)}</strong>${p.player ? `<br><span class="muted" style="font-size:0.85rem;">${esc(p.player)}</span>` : ""}</span></div>`;
}

function renderParty() {
  const active = activePartyMembers();
  const retired = (S.party || []).filter((pc) => pc.active === false);
  const rows = active
    .map(
      (p) => `<tr>
        <td>${partyIdentity(p)}</td>
        <td>${esc(p.ancestry || "")} ${esc(p.class || "")}<br><span class="muted" style="font-size:0.85rem;">${esc(p.subclass || "")}</span></td>
        <td><input type="number" class="num" min="1" max="10" value="${p.level}" data-pclevel="${esc(p.id)}" aria-label="Level for ${esc(p.name)}"></td>
        <td><div class="condition-toggles" aria-label="Conditions for ${esc(p.name)}">${CONDITIONS.map((condition) => {
          const applied = (p.conditions || []).includes(condition.id);
          const action = applied ? "Clear" : "Apply";
          return `<button class="condition-toggle${applied ? " active" : ""}" type="button" data-pccondition="${esc(p.id)}" data-condition="${condition.id}" aria-pressed="${applied}" title="${action} ${condition.name}">${conditionIcon(condition.id)}<span>${condition.name}</span></button>`;
        }).join("")}</div></td>
        <td><a href="/character/${encodeURIComponent(p.id)}" target="_blank">Open the sheet ↗</a></td>
        <td><button class="quiet" data-pcretire="${esc(p.id)}">Retire</button></td>
      </tr>`
    )
    .join("");
  $("#party-table").innerHTML = `
    <tr><th>Character</th><th>Class</th><th>Level</th><th>Conditions</th><th>Sheet</th><th></th></tr>
    ${rows || '<tr><td colspan="6" class="muted">No active player characters. Send your players to /create or restore someone below.</td></tr>'}`;
  $("#stepped-back").hidden = retired.length === 0;
  $("#stepped-back-count").textContent = String(retired.length);
  $("#stepped-back-list").innerHTML = retired.map((p) => `<div class="stepped-back-row">
    <span class="party-portrait" aria-hidden="true">${p.portrait ? `<img src="${esc(p.portrait)}" alt="">` : esc((p.name || "?").slice(0, 1).toUpperCase())}</span>
    <span><strong>${esc(p.name)}</strong><span class="muted">${[p.ancestry, p.class, p.player].filter(Boolean).map(esc).join(" · ") || "Character record preserved"}</span></span>
    <button class="quiet" type="button" data-pcrestore="${esc(p.id)}">Return</button>
  </div>`).join("");
  for (const el of document.querySelectorAll("[data-pclevel]")) {
    el.onchange = () =>
      api(`/api/party/${el.dataset.pclevel}`, { method: "PUT", body: { level: clampNum(el, 1, 10) } })
        .then(refresh).catch((e) => toast(e.message, true));
  }
  for (const el of document.querySelectorAll("[data-pccondition]")) {
    el.onclick = async () => {
      const p = S.party.find((x) => x.id === el.dataset.pccondition);
      const current = new Set(p.conditions || []);
      if (current.has(el.dataset.condition)) current.delete(el.dataset.condition);
      else current.add(el.dataset.condition);
      try {
        await api(`/api/party/${p.id}/conditions`, { method: "PUT", body: { conditions: [...current] } });
        await refresh();
      } catch (e) {
        toast(e.message, true);
      }
    };
  }
  for (const el of document.querySelectorAll("[data-pcretire]")) {
    el.onclick = async () => {
      const p = S.party.find((x) => x.id === el.dataset.pcretire);
      if (!confirm(`Retire ${p.name}? Their sheet, inventory, notes, and drawings will be kept, but they will disappear from player choosers.`)) return;
      try {
        await api(`/api/party/${encodeURIComponent(p.id)}`, { method: "DELETE" });
        toast(`${p.name} stepped back from the tale.`);
        await refresh();
      } catch (e) {
        toast(e.message, true);
      }
    };
  }
  for (const el of document.querySelectorAll("[data-pcrestore]")) {
    el.onclick = async () => {
      const p = S.party.find((x) => x.id === el.dataset.pcrestore);
      try {
        await api(`/api/party/${encodeURIComponent(p.id)}/restore`, { method: "POST" });
        toast(`${p.name} returned to the party.`);
        await refresh();
      } catch (e) {
        toast(e.message, true);
      }
    };
  }
  renderConsumableGrant();
  renderPaperDelivery();
}

function renderPaperDelivery() {
  const target = $("#paper-target");
  const selected = target.value;
  const active = activePartyMembers();
  target.innerHTML = active.length
    ? `<option value="group">Whole party — shared copies</option>${active.map((pc) => `<option value="${esc(pc.id)}">${esc(pc.name)} — private</option>`).join("")}`
    : `<option value="">No active characters</option>`;
  target.disabled = active.length === 0;
  $("#paper-deliver").disabled = active.length === 0;
  if ([...target.options].some((option) => option.value === selected)) target.value = selected;
  const papers = (S.party || []).flatMap((pc) => (pc.papers || []).map((paper) => ({ pc, paper })));
  $("#paper-ledger").innerHTML = papers.length ? papers.map(({ pc, paper }) => `<div class="paper-ledger-row">
    <div><strong>${esc(paper.name)}</strong><div class="muted">${esc(pc.name)}${paper.author ? ` · ${esc(paper.author)}` : ""}</div></div>
    <button class="quiet" type="button" data-project-paper="${esc(paper.id)}">Show on projector</button>
  </div>`).join("") : `<div class="muted">No physical papers are carried yet.</div>`;
  for (const button of document.querySelectorAll("[data-project-paper]")) button.onclick = () => project({ type: "paper", refId: button.dataset.projectPaper });
}

function selectedConsumable() {
  const value = $("#grant-consumable").value.trim().toLowerCase();
  return CONSUMABLES.find((item) => item.name.toLowerCase() === value) || null;
}

function renderConsumableGrant() {
  const pcSelect = $("#grant-pc");
  const selectedPc = pcSelect.value;
  const active = activePartyMembers();
  pcSelect.innerHTML = active.length
    ? active.map((pc) => `<option value="${esc(pc.id)}">${esc(pc.name)}</option>`).join("")
    : `<option value="">No active characters</option>`;
  pcSelect.disabled = active.length === 0;
  $("#grant-give").disabled = active.length === 0;
  if ([...pcSelect.options].some((option) => option.value === selectedPc)) pcSelect.value = selectedPc;
  $("#consumable-options").innerHTML = CONSUMABLES.map((item) => `<option value="${esc(item.name)}"></option>`).join("");
  const item = selectedConsumable();
  $("#grant-rules").textContent = item?.description || "Start typing a name to search all 60 standard consumables.";
  $("#grant-roll").textContent = item ? `Loot roll ${String(item.roll).padStart(2, "0")}` : "";
}

$("#grant-consumable").addEventListener("input", renderConsumableGrant);
$("#grant-give").addEventListener("click", async () => {
  const item = selectedConsumable();
  const pcId = $("#grant-pc").value;
  if (!pcId) return toast("Choose a character.", true);
  if (!item) return toast("Choose a consumable from the list.", true);
  try {
    await api(`/api/party/${pcId}/inventory/grant`, {
      method: "POST",
      body: { catalogId: item.id, quantity: clampNum($("#grant-quantity"), 1, 5) }
    });
    const pc = S.party.find((entry) => entry.id === pcId);
    toast(`${item.name} given to ${pc.name}.`);
    $("#grant-consumable").value = "";
    await refresh();
  } catch (e) {
    toast(e.message, true);
  }
});

$("#paper-deliver").addEventListener("click", async () => {
  const target = $("#paper-target").value;
  const name = $("#paper-title").value.trim();
  const body = $("#paper-body").value.trim();
  if (!name || !body) return toast("Give the paper a title and text.", true);
  try {
    const result = await api("/api/party/inventory/paper", { method: "POST", body: { target, name, body } });
    $("#paper-title").value = "";
    $("#paper-body").value = "";
    if ($("#paper-project").checked) await project({ type: "paper", refId: result.delivered[0].itemId });
    else {
      toast(target === "group" ? "Paper delivered to the party." : "Paper delivered privately.");
      await refresh();
    }
  } catch (error) { toast(error.message, true); }
});

// --- session chronicle ---

const SESSION_STATUS_LABELS = {
  gathering: "gathering accounts",
  retelling: "with the chronicler",
  review: "awaiting review",
  failed: "needs attention",
  published: "entered in the chronicle"
};

function sessionParticipantName(session, pcId) {
  return S.party.find((pc) => pc.id === pcId)?.name
    || session.perspectives?.find((perspective) => perspective.pcId === pcId)?.author
    || "A companion";
}

function sessionRosterHtml(session, editable) {
  return `<fieldset class="session-roster" data-session-roster>
    <legend>Characters present</legend>
    ${(session.participants || []).map((pcId) => `<label>
      <input type="checkbox" value="${esc(pcId)}" checked ${editable ? "" : "disabled"}>
      <span>${esc(sessionParticipantName(session, pcId))}</span>
    </label>`).join("")}
    ${editable ? S.party.filter((pc) => pc.active && !(session.participants || []).includes(pc.id)).map((pc) => `<label>
      <input type="checkbox" value="${esc(pc.id)}">
      <span>${esc(pc.name)}</span>
    </label>`).join("") : ""}
  </fieldset>`;
}

function perspectiveSealsHtml(session) {
  const perspectives = new Set((session.perspectives || []).filter((entry) => entry.text).map((entry) => entry.pcId));
  return `<div class="perspective-seals">${(session.participants || []).map((pcId) =>
    `<span class="perspective-seal ${perspectives.has(pcId) ? "complete" : ""}">${esc(sessionParticipantName(session, pcId))}</span>`
  ).join("")}</div>`;
}

function openSessionHtml(session) {
  const editable = session.status === "gathering" || session.status === "failed";
  const reviewing = session.status === "review";
  const stampClass = reviewing ? "review" : session.status === "retelling" ? "retelling" : "";
  const complete = (session.participants || []).filter((pcId) =>
    (session.perspectives || []).some((perspective) => perspective.pcId === pcId && perspective.text)
  ).length;
  const error = session.status === "failed" && session.error
    ? `<div class="session-error">${esc(session.error)}</div>`
    : "";
  const review = reviewing ? `
    <label class="smallcaps" for="retelling-${esc(session.id)}">Review the account</label>
    <textarea class="retelling-review" id="retelling-${esc(session.id)}" data-session-retelling maxlength="30000">${esc(session.retelling?.text || "")}</textarea>
    <div class="session-actions">
      <button type="button" class="quiet" data-session-save-review>Save the reviewed page</button>
      <button type="button" data-session-publish>Enter it into the chronicle</button>
      <span class="status-note">${esc(session.retelling?.model || "")}</span>
    </div>` : `
    <div class="session-fields">
      <label>Factual summary
        <textarea rows="7" maxlength="12000" data-session-summary ${editable ? "" : "readonly"}>${esc(session.gmSummary || "")}</textarea>
      </label>
      <label>What held your attention
        <textarea rows="7" maxlength="4000" data-session-highlight ${editable ? "" : "readonly"}>${esc(session.gmHighlight || "")}</textarea>
      </label>
    </div>
    ${sessionRosterHtml(session, editable)}
    ${perspectiveSealsHtml(session)}
    ${error}
    <div class="session-actions">
      ${editable ? `<button type="button" class="quiet" data-session-save>Save the gathering</button>
        <button type="button" data-session-retell>Send to the chronicler</button>` : ""}
      <span class="status-note">${session.status === "retelling"
        ? "The page will change when the account returns."
        : `${complete} of ${(session.participants || []).length} perspectives received`}</span>
    </div>`;
  return `<article class="session-sheet" data-session="${esc(session.id)}" data-status="${esc(session.status)}">
    <div class="session-head">
      <span class="session-number">${esc(session.number)}</span>
      <div class="session-title">
        <strong>Session ${esc(session.number)}</strong>
        <span>${esc(session.date || "undated")} · ${esc(session.seasonLabel || "")}</span>
      </div>
      <span class="session-stamp ${stampClass}">${esc(SESSION_STATUS_LABELS[session.status] || session.status)}</span>
    </div>
    ${review}
  </article>`;
}

function publishedSessionHtml(session) {
  return `<article class="session-sheet" data-status="published">
    <div class="session-head">
      <span class="session-number">${esc(session.number)}</span>
      <div class="session-title"><strong>Session ${esc(session.number)}</strong><span>${esc(session.date || "undated")} · ${esc(session.seasonLabel || "")}</span></div>
      <span class="session-stamp review">published</span>
    </div>
    <div class="published-excerpt">${esc(session.retelling?.text || "")}</div>
  </article>`;
}

async function saveGathering(article) {
  const id = article.dataset.session;
  return api(`/api/sessions/${encodeURIComponent(id)}`, {
    method: "PUT",
    body: {
      gmSummary: article.querySelector("[data-session-summary]").value,
      gmHighlight: article.querySelector("[data-session-highlight]").value,
      participants: [...article.querySelectorAll("[data-session-roster] input:checked")].map((input) => input.value)
    }
  });
}

async function refreshSessionSection(message) {
  document.activeElement?.blur();
  await refresh();
  renderSessions(true);
  if (message) toast(message);
}

function wireSessions() {
  for (const button of document.querySelectorAll("[data-session-save]")) button.onclick = async () => {
    try {
      await saveGathering(button.closest("[data-session]"));
      await refreshSessionSection("The gathering is saved.");
    } catch (error) { toast(error.message, true); }
  };
  for (const button of document.querySelectorAll("[data-session-retell]")) button.onclick = async () => {
    const article = button.closest("[data-session]");
    try {
      await saveGathering(article);
      await api(`/api/sessions/${encodeURIComponent(article.dataset.session)}/retell`, { method: "POST" });
      await refreshSessionSection("The account has gone to the chronicler.");
    } catch (error) { toast(error.message, true); }
  };
  for (const button of document.querySelectorAll("[data-session-save-review]")) button.onclick = async () => {
    const article = button.closest("[data-session]");
    try {
      await api(`/api/sessions/${encodeURIComponent(article.dataset.session)}`, {
        method: "PUT",
        body: { retellingText: article.querySelector("[data-session-retelling]").value }
      });
      await refreshSessionSection("The reviewed page is saved.");
    } catch (error) { toast(error.message, true); }
  };
  for (const button of document.querySelectorAll("[data-session-publish]")) button.onclick = async () => {
    const article = button.closest("[data-session]");
    if (!confirm("Enter this reviewed account into the players' chronicle?")) return;
    try {
      await api(`/api/sessions/${encodeURIComponent(article.dataset.session)}`, {
        method: "PUT",
        body: { retellingText: article.querySelector("[data-session-retelling]").value }
      });
      await api(`/api/sessions/${encodeURIComponent(article.dataset.session)}/publish`, { method: "POST" });
      await refreshSessionSection("The session has entered the chronicle.");
    } catch (error) { toast(error.message, true); }
  };
}

function renderSessions(force = false) {
  const root = $("#sessions-list");
  if (!root || (!force && document.activeElement?.closest("#sec-sessions"))) return;
  const sessions = [...(S.sessions || [])].sort((a, b) => Number(b.number || 0) - Number(a.number || 0));
  const open = sessions.filter((session) => session.status !== "published");
  const published = sessions.filter((session) => session.status === "published");
  const campaign = S.campaigns?.campaigns?.find((entry) => entry.id === S.campaigns.currentId);
  $("#session-campaign-name").textContent = campaign?.name || "Current campaign";
  $("#session-opening-note").textContent = open.length
    ? "Finish the open account before beginning the next session."
    : "Mark who was at the table, then open their writing prompt.";
  $("#session-open").disabled = open.length > 0 || !S.party.some((pc) => pc.active);
  $("#session-open").textContent = open.length ? "Session account open" : "The session ends";
  $("#session-new-roster").hidden = open.length > 0;
  $("#session-new-roster").innerHTML = `<legend>Who was at the table</legend>${S.party.filter((pc) => pc.active).map((pc) => `<label>
    <input type="checkbox" data-new-session-pc value="${esc(pc.id)}" checked>
    <span>${esc(pc.name)}</span>
  </label>`).join("") || '<span class="muted">No active characters are seated in this campaign.</span>'}`;
  root.innerHTML = `${open.map(openSessionHtml).join("")}
    ${published.length ? `<details class="published-sessions"><summary>Published sessions · ${published.length}</summary>${published.map(publishedSessionHtml).join("")}</details>` : ""}`;
  wireSessions();
}

$("#session-open").addEventListener("click", async () => {
  const participants = [...document.querySelectorAll("[data-new-session-pc]:checked")].map((input) => input.value);
  try {
    await api("/api/sessions", { method: "POST", body: { participants } });
    await refreshSessionSection("The perspective pages are open.");
  } catch (error) { toast(error.message, true); }
});

$("#sec-sessions").addEventListener("focusout", () => {
  setTimeout(() => {
    if (!document.activeElement?.closest("#sec-sessions") && S) renderSessions(true);
  }, 0);
});

// --- ledger ---
function renderLedger() {
  const rows = S.log
    .map((l) => {
      const text = l.summary || "";
      const eventLine = l.event ? `<div style="font-size:0.9rem; margin-top:0.2rem;">${esc(l.event)}</div>` : "";
      return `<tr>
        <td style="white-space:nowrap;" class="muted">${esc(l.season)}</td>
        <td>${esc(text)}${eventLine}${l.note ? `<div class="muted" style="font-size:0.85rem;">${esc(l.note)}</div>` : ""}</td>
        <td style="white-space:nowrap;">
          <label style="font-size:0.82rem;" class="muted">
            <input type="checkbox" data-pub="${l.id}" ${l.published ? "checked" : ""}> chronicle
          </label>
        </td>
      </tr>`;
    })
    .join("");
  $("#log-table").innerHTML = `
    <tr><th>Season</th><th>Entry</th><th>Published</th></tr>
    ${rows || '<tr><td colspan="3" class="muted">The ledger is blank. The first season awaits.</td></tr>'}`;
  for (const el of document.querySelectorAll("[data-pub]")) {
    el.onchange = () =>
      api(`/api/log/${el.dataset.pub}/publish`, { method: "POST", body: { published: el.checked } })
        .then(refresh).catch((e) => toast(e.message, true));
  }
}

$("#season-advance").addEventListener("click", async () => {
  await api("/api/season/advance", { method: "POST" });
  toast("Season advanced.");
  await refresh();
});

$("#note-add").addEventListener("click", async () => {
  try {
    await api("/api/log", {
      method: "POST",
      body: { text: $("#note-text").value, publish: $("#note-publish").checked }
    });
    $("#note-text").value = "";
    await refresh();
  } catch (e) {
    toast(e.message, true);
  }
});

// --- settlement ---
function renderCampaigns() {
  if (document.activeElement?.matches("#campaign-new-name, [data-campaign-name]")) return;
  const ledger = S.campaigns || { currentId: null, campaigns: [] };
  const current = ledger.campaigns.find((campaign) => campaign.id === ledger.currentId);
  $("#campaign-current-name").textContent = current ? `Current table: ${current.name}` : "No current campaign";
  $("#campaign-list").innerHTML = ledger.campaigns.map((campaign) => {
    const isCurrent = campaign.id === ledger.currentId;
    const archived = campaign.status === "archived";
    const created = campaign.createdAt ? new Date(campaign.createdAt).toLocaleDateString() : "undated";
    return `<div class="campaign-row ${isCurrent ? "is-current" : ""} ${archived ? "is-archived" : ""}">
      <span class="campaign-mark" aria-label="${isCurrent ? "Current campaign" : "Campaign"}"><span>◆</span></span>
      <label class="campaign-copy">
        <input type="text" maxlength="80" value="${esc(campaign.name)}" data-campaign-name="${esc(campaign.id)}" aria-label="Campaign name">
        <span class="campaign-meta">${isCurrent ? "current table" : archived ? "archived" : "active"} · entered ${esc(created)}</span>
      </label>
      <div class="campaign-actions">
        <button type="button" class="quiet" data-campaign-save="${esc(campaign.id)}">Rename</button>
        ${!archived && !isCurrent ? `<button type="button" class="quiet" data-campaign-current="${esc(campaign.id)}">Set current</button>` : ""}
        ${archived
          ? `<button type="button" class="quiet" data-campaign-status="${esc(campaign.id)}" data-status="active">Restore</button>`
          : `<button type="button" class="quiet" data-campaign-status="${esc(campaign.id)}" data-status="archived" ${isCurrent ? "disabled title=\"Choose another current campaign first\"" : ""}>Archive</button>`}
      </div>
    </div>`;
  }).join("");

  for (const button of document.querySelectorAll("[data-campaign-save]")) button.onclick = async () => {
    const id = button.dataset.campaignSave;
    const name = document.querySelector(`[data-campaign-name="${CSS.escape(id)}"]`).value;
    try {
      await api(`/api/campaigns/${encodeURIComponent(id)}`, { method: "PUT", body: { name } });
      toast("Campaign renamed.");
      await refresh();
    } catch (error) { toast(error.message, true); }
  };
  for (const button of document.querySelectorAll("[data-campaign-current]")) button.onclick = async () => {
    try {
      await api("/api/campaigns/current", { method: "PUT", body: { id: button.dataset.campaignCurrent } });
      toast("The table has changed campaigns.");
      await refresh();
    } catch (error) { toast(error.message, true); }
  };
  for (const button of document.querySelectorAll("[data-campaign-status]")) button.onclick = async () => {
    const status = button.dataset.status;
    const campaign = ledger.campaigns.find((entry) => entry.id === button.dataset.campaignStatus);
    if (status === "archived" && !confirm(`Archive ${campaign?.name || "this campaign"}? Its characters and drafts will be hidden until restored.`)) return;
    try {
      await api(`/api/campaigns/${encodeURIComponent(button.dataset.campaignStatus)}`, { method: "PUT", body: { status } });
      toast(status === "archived" ? "Campaign archived." : "Campaign restored.");
      await refresh();
    } catch (error) { toast(error.message, true); }
  };
}

$("#campaign-create").addEventListener("submit", async (event) => {
  event.preventDefault();
  try {
    await api("/api/campaigns", { method: "POST", body: { name: $("#campaign-new-name").value } });
    $("#campaign-new-name").value = "";
    toast("Campaign added to the ledger.");
    await refresh();
  } catch (error) { toast(error.message, true); }
});

function renderTown() {
  if (document.activeElement && document.activeElement.closest("#sec-town")) return;
  $("#town-name").value = S.settlement.name;
  $("#town-pop").value = S.settlement.population;
  $("#town-notes").value = S.settlement.chronicleNotes || "";
}

$("#town-save").addEventListener("click", async () => {
  try {
    await api("/api/settlement", {
      method: "PUT",
      body: {
        name: $("#town-name").value,
        population: parseInt($("#town-pop").value, 10),
        chronicleNotes: $("#town-notes").value
      }
    });
    toast("Saved.");
    await refresh();
  } catch (e) {
    toast(e.message, true);
  }
});

// --- boot ---
showSection(location.hash.slice(1) || "season");
refresh().catch((e) => toast(e.message, true));
