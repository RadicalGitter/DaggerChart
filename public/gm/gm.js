// GM Console. Renders from /api/state; every mutation round-trips the server.

let S = null; // last fetched gm state
let selectedBuilding = null;

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
  S = await api("/api/state");
  renderNav();
  renderDowntimePicker();
  renderStores();
  renderBuildings();
  renderFolk();
  renderPeople();
  renderPlaces();
  renderParty();
  renderLedger();
  renderTown();
  renderScreen();
}

// --- the table screen ---
async function project(body) {
  try {
    await api("/api/screen", { method: "PUT", body });
    toast(body.type === null ? "The screen goes dark." : "On the screen.");
    await refresh();
  } catch (e) {
    toast(e.message, true);
  }
}

function describeScreen(cur) {
  if (!cur) return "nothing — the settlement name idles there";
  switch (cur.type) {
    case "image": return `an image${cur.caption ? ` — “${cur.caption}”` : ""}`;
    case "text": return `words${cur.title ? ` — “${cur.title}”` : ""}`;
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
}
window.addEventListener("hashchange", () => showSection(location.hash.slice(1) || "season"));

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
    toast("Entered into the ledger.");
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
    <h3>${isNew ? "A stranger arrives" : `Edit ${esc(c.name)}`}</h3>
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
      <button id="ed-save">${isNew ? "Welcome them in" : "Save"}</button>
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
  const opts = [`<option value="" ${!selectedId ? "selected" : ""}>whereabouts unknown</option>`];
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
          toast(dest ? `They make for ${dest}.` : "Their whereabouts are now unknown.");
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
          <input type="text" data-item-note="${i}" value="${esc(it.note)}" placeholder="what it is, what it does" style="flex:1;">
          <button class="quiet" data-item-drop="${i}" title="remove">✕</button>
        </div>`
      )
      .join("");
    $("#people-editor").innerHTML = `<div class="card" style="max-width:620px; margin-top:1rem;">
      <h3>${isNew ? "Word of someone new" : `Edit ${esc(p.name)}`}</h3>
      <div class="formrow"><label>Name</label><input type="text" id="pe-name" value="${esc(p.name)}" style="flex:1"></div>
      <div class="formrow"><label>Role</label><input type="text" id="pe-role" value="${esc(p.role || "")}" style="flex:1" placeholder="what they are to the world"></div>
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
      ${itemRows || `<p class="muted" style="font-size:0.85rem;">Nothing of note.</p>`}
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
        <button id="pe-save">${isNew ? "Note them down" : "Save"}</button>
        <button class="quiet" id="pe-cancel">Cancel</button>
        ${isNew ? "" : `<button class="quiet grave" id="pe-delete" style="margin-left:auto;">Strike from the record</button>`}
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
        if (!confirm(`Strike ${p.name} from the record? The players' notes about them go too.`)) return;
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
    <h3>${isNew ? "Mark a place on the map" : `Edit ${esc(pl.name)}`}</h3>
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
      <button id="ple-save">${isNew ? "Mark it down" : "Save"}</button>
      <button class="quiet" id="ple-cancel">Cancel</button>
      ${isNew || pl.fixed ? "" : `<button class="quiet grave" id="ple-delete" style="margin-left:auto;">Strike from the map</button>`}
    </div>
  </div>`;
  $("#ple-cancel").onclick = () => ($("#places-editor").innerHTML = "");
  const deleteBtn = $("#ple-delete");
  if (deleteBtn) {
    deleteBtn.onclick = async () => {
      if (!confirm(`Strike ${pl.name} from the map? The players' notes about it go too; anyone there loses their pin.`)) return;
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
function renderParty() {
  const rows = (S.party || [])
    .map(
      (p) => `<tr>
        <td><strong>${esc(p.name)}</strong>${p.player ? `<br><span class="muted" style="font-size:0.85rem;">${esc(p.player)}</span>` : ""}</td>
        <td>${esc(p.ancestry || "")} ${esc(p.class || "")}<br><span class="muted" style="font-size:0.85rem;">${esc(p.subclass || "")}</span></td>
        <td><input type="number" class="num" min="1" max="10" value="${p.level}" data-pclevel="${p.id}"></td>
        <td><a href="/character/${p.id}" target="_blank">Open the sheet ↗</a></td>
        <td><button class="quiet" data-pcdel="${p.id}">Strike out</button></td>
      </tr>`
    )
    .join("");
  $("#party-table").innerHTML = `
    <tr><th>Character</th><th>Calling</th><th>Level</th><th>Sheet</th><th></th></tr>
    ${rows || '<tr><td colspan="5" class="muted">No adventurers yet. Send your players to /create.</td></tr>'}`;
  for (const el of document.querySelectorAll("[data-pclevel]")) {
    el.onchange = () =>
      api(`/api/party/${el.dataset.pclevel}`, { method: "PUT", body: { level: clampNum(el, 1, 10) } })
        .then(refresh).catch((e) => toast(e.message, true));
  }
  for (const el of document.querySelectorAll("[data-pcdel]")) {
    el.onclick = async () => {
      const p = S.party.find((x) => x.id === el.dataset.pcdel);
      if (!confirm(`Strike ${p.name} from the ledger? This removes the character sheet.`)) return;
      try {
        await api(`/api/party/${el.dataset.pcdel}`, { method: "DELETE" });
        toast(`${p.name} struck from the ledger.`);
        await refresh();
      } catch (e) {
        toast(e.message, true);
      }
    };
  }
}

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
  toast("The season turns.");
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
