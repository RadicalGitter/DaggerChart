// The Drafting Board — an infinite pan/zoom whiteboard for the GM.
// Plates (notes, counters, live stat blocks) live in world coordinates;
// pins are saved camera positions. Everything persists to data/board.json.

const $ = (sel) => document.querySelector(sel);
const esc = (s) =>
  String(s ?? "").replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

const viewport = $("#viewport");
const world = $("#world");

let items = [];
let pins = [];
let PARTY = [];   // full PCs (live)
let FOLK = [];    // NPCs incl. GM-only fields (this surface is GM-private)
let RESOURCES = {};

const cam = { x: 0, y: 0, z: 1 };
const uid = () => `it_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;

// ---------- camera ----------
function applyCam(animate = false) {
  world.style.transition = animate ? "transform 0.4s ease" : "none";
  world.style.transform = `translate(${cam.x}px, ${cam.y}px) scale(${cam.z})`;
  viewport.style.backgroundSize = `${24 * cam.z}px ${24 * cam.z}px`;
  viewport.style.backgroundPosition = `${cam.x}px ${cam.y}px`;
  if (animate) setTimeout(() => (world.style.transition = "none"), 450);
}

function screenToWorld(sx, sy) {
  return { x: (sx - cam.x) / cam.z, y: (sy - cam.y) / cam.z };
}

viewport.addEventListener("wheel", (e) => {
  e.preventDefault();
  const factor = e.deltaY < 0 ? 1.12 : 1 / 1.12;
  const nz = Math.min(3, Math.max(0.08, cam.z * factor));
  cam.x = e.clientX - ((e.clientX - cam.x) / cam.z) * nz;
  cam.y = e.clientY - ((e.clientY - cam.y) / cam.z) * nz;
  cam.z = nz;
  applyCam();
}, { passive: false });

let panning = null;
viewport.addEventListener("pointerdown", (e) => {
  if (e.target !== viewport && e.target !== world) return;
  panning = { sx: e.clientX, sy: e.clientY, cx: cam.x, cy: cam.y };
  viewport.classList.add("panning");
  viewport.setPointerCapture(e.pointerId);
});
viewport.addEventListener("pointermove", (e) => {
  if (!panning) return;
  cam.x = panning.cx + (e.clientX - panning.sx);
  cam.y = panning.cy + (e.clientY - panning.sy);
  applyCam();
});
viewport.addEventListener("pointerup", () => {
  panning = null;
  viewport.classList.remove("panning");
});

viewport.addEventListener("dblclick", (e) => {
  if (e.target !== viewport && e.target !== world) return;
  const p = screenToWorld(e.clientX, e.clientY);
  addItem("note", p.x, p.y);
});

// ---------- persistence ----------
let saveTimer = null;
function queueSave() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(async () => {
    await fetch("/api/board", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ items, pins })
    });
  }, 600);
}

// ---------- plates ----------
const DEFAULTS = {
  note: { w: 280, props: { title: "", text: "" } },
  counter: { w: 210, props: { label: "Counter", value: 0 } },
  character: { w: 320, props: { pcId: null } },
  folk: { w: 300, props: { charId: null } },
  stores: { w: 260, props: {} }
};
const HEAD = { note: "note", counter: "counter", character: "character", folk: "folk", stores: "stores" };

function addItem(type, x, y) {
  if (x === undefined) {
    const c = screenToWorld(window.innerWidth / 2, window.innerHeight / 2);
    x = c.x - DEFAULTS[type].w / 2 + (Math.random() * 60 - 30);
    y = c.y - 60 + (Math.random() * 60 - 30);
  }
  const item = { id: uid(), type, x, y, w: DEFAULTS[type].w, props: structuredClone(DEFAULTS[type].props) };
  items.push(item);
  renderItem(item);
  updateHint();
  queueSave();
}

function removeItem(id) {
  items = items.filter((i) => i.id !== id);
  document.querySelector(`[data-plate="${id}"]`)?.remove();
  updateHint();
  queueSave();
}

function renderItem(item) {
  let el = document.querySelector(`[data-plate="${item.id}"]`);
  if (!el) {
    el = document.createElement("div");
    el.className = "plate";
    el.dataset.plate = item.id;
    world.appendChild(el);
    el.innerHTML = `
      <div class="plate-head"><span class="head-label"></span><span class="x" title="Remove">×</span></div>
      <div class="plate-body"></div>`;
    wirePlate(el, item);
  }
  el.style.left = item.x + "px";
  el.style.top = item.y + "px";
  el.style.width = item.w + "px";
  el.querySelector(".head-label").textContent = headLabel(item);
  renderBody(el.querySelector(".plate-body"), item);
}

function headLabel(item) {
  if (item.type === "character") {
    const pc = PARTY.find((p) => p.id === item.props.pcId);
    return pc ? pc.name : "character";
  }
  if (item.type === "folk") {
    const c = FOLK.find((f) => f.id === item.props.charId);
    return c ? c.name : "folk";
  }
  return HEAD[item.type];
}

function wirePlate(el, item) {
  const head = el.querySelector(".plate-head");
  head.addEventListener("pointerdown", (e) => {
    if (e.target.classList.contains("x")) return;
    e.stopPropagation();
    const start = { sx: e.clientX, sy: e.clientY, ix: item.x, iy: item.y };
    const move = (ev) => {
      item.x = start.ix + (ev.clientX - start.sx) / cam.z;
      item.y = start.iy + (ev.clientY - start.sy) / cam.z;
      el.style.left = item.x + "px";
      el.style.top = item.y + "px";
    };
    const up = () => {
      document.removeEventListener("pointermove", move);
      document.removeEventListener("pointerup", up);
      queueSave();
    };
    document.addEventListener("pointermove", move);
    document.addEventListener("pointerup", up);
  });
  head.querySelector(".x").addEventListener("click", () => {
    if (confirm("Remove this from the board?")) removeItem(item.id);
  });
}

// ---------- plate bodies ----------
function renderBody(body, item) {
  if (item.type === "note") return renderNote(body, item);
  if (item.type === "counter") return renderCounter(body, item);
  if (item.type === "character") return renderCharacter(body, item);
  if (item.type === "folk") return renderFolk(body, item);
  if (item.type === "stores") return renderStores(body, item);
}

function renderNote(body, item) {
  if (body.dataset.wired) return; // notes aren't live data; don't clobber typing
  body.dataset.wired = "1";
  body.innerHTML = `
    <input type="text" class="note-title" placeholder="Title" value="${esc(item.props.title)}">
    <textarea placeholder="Rules, reminders, anything…">${esc(item.props.text)}</textarea>`;
  body.querySelector(".note-title").addEventListener("input", (e) => {
    item.props.title = e.target.value;
    queueSave();
  });
  body.querySelector("textarea").addEventListener("input", (e) => {
    item.props.text = e.target.value;
    queueSave();
  });
}

function renderCounter(body, item) {
  if (body.dataset.wired) {
    body.querySelector(".counter-val").textContent = item.props.value;
    return;
  }
  body.dataset.wired = "1";
  body.innerHTML = `
    <input type="text" style="text-align:center;" placeholder="What is counted?" value="${esc(item.props.label)}">
    <div class="counter-row">
      <button class="quiet" data-d="-1">−</button>
      <span class="counter-val">${item.props.value}</span>
      <button class="quiet" data-d="1">+</button>
    </div>`;
  body.querySelector("input").addEventListener("input", (e) => {
    item.props.label = e.target.value;
    queueSave();
  });
  for (const b of body.querySelectorAll("[data-d]")) {
    b.addEventListener("click", (e) => {
      const step = e.shiftKey ? 5 : 1;
      item.props.value += parseInt(b.dataset.d, 10) * step;
      body.querySelector(".counter-val").textContent = item.props.value;
      queueSave();
    });
  }
}

const dots = (n, max, harm, round) =>
  Array.from({ length: max }, (_, i) =>
    `<span class="dot ${round ? "round" : ""} ${i < n ? `on ${harm ? "harm" : ""}` : ""}"></span>`
  ).join("");

function pickerBody(body, item, list, key, label) {
  body.innerHTML = `<select>
    <option value="">— choose a ${label} —</option>
    ${list.map((p) => `<option value="${p.id}">${esc(p.name)}</option>`).join("")}
  </select>`;
  body.querySelector("select").addEventListener("change", (e) => {
    item.props[key] = e.target.value || null;
    delete body.dataset.wired;
    renderItem(item);
    queueSave();
  });
}

function renderCharacter(body, item) {
  const pc = PARTY.find((p) => p.id === item.props.pcId);
  if (!pc) return pickerBody(body, item, PARTY, "pcId", "character");
  const TR = ["Agility", "Strength", "Finesse", "Instinct", "Presence", "Knowledge"];
  body.innerHTML = `
    <div class="muted" style="font-size:0.8rem;">${esc(pc.ancestry?.name || "")} ${esc(pc.class?.name || "")} — ${esc(pc.subclass?.name || "")} · Lv ${pc.level}</div>
    <div class="statline">
      <div class="s"><b>${pc.evasion}</b><span>Evasion</span></div>
      <div class="s"><b>${pc.thresholds?.major}/${pc.thresholds?.severe}</b><span>Thresholds</span></div>
      <div class="s"><b>${pc.armor?.score ?? 0}</b><span>Armor</span></div>
    </div>
    <div class="viterow"><span class="lbl">HP</span>${dots(pc.hp, pc.hpMax, true)}</div>
    <div class="viterow"><span class="lbl">Stress</span>${dots(pc.stress, pc.stressMax, true)}</div>
    <div class="viterow"><span class="lbl">Hope</span>${dots(pc.hope, pc.hopeMax, false, true)}</div>
    ${pc.armor ? `<div class="viterow"><span class="lbl">Armor</span>${dots(pc.armorMarked, pc.armor.score, true)}</div>` : ""}
    <div class="chips">${TR.map((t) => `<span class="pill">${t.slice(0, 3)} ${pc.traits?.[t] >= 0 ? "+" : ""}${pc.traits?.[t] ?? 0}</span>`).join("")}</div>
    <div class="chips">${(pc.experiences || []).map((e) => `<span class="pill">${esc(e.name)} +${e.bonus}</span>`).join("")}</div>`;
}

function renderFolk(body, item) {
  const c = FOLK.find((f) => f.id === item.props.charId);
  if (!c) return pickerBody(body, item, FOLK, "charId", "settler");
  const TR = ["Agility", "Strength", "Finesse", "Instinct", "Presence", "Knowledge"];
  const apts = Object.entries(c.aptitudes || {}).map(([b, v]) => `${b.replace(/_/g, " ")} ${v >= 0 ? "+" : ""}${v}`).join(", ");
  const insp = c.hidden?.inspiration ?? 0;
  const pen = c.hidden?.penalty ?? 0;
  const quiet = insp !== 0 || pen !== 0
    ? `<div class="quiet-line">${insp !== 0 ? `insp ${insp > 0 ? "+" : ""}${insp}` : ""}${insp !== 0 && pen !== 0 ? " · " : ""}${pen !== 0 ? `pen ${pen}` : ""}</div>`
    : "";
  return void (body.innerHTML = `
    <div class="muted" style="font-size:0.8rem;">${esc(c.role || "")}${c.status !== "alive" ? ` · ${esc(c.status)}` : ""}</div>
    <div class="chips">${TR.map((t) => `<span class="pill">${t.slice(0, 3)} ${c.traits?.[t] >= 0 ? "+" : ""}${c.traits?.[t] ?? 0}</span>`).join("")}</div>
    <div class="muted" style="font-size:0.78rem; margin-top:0.3rem;">${esc(apts)}</div>
    ${quiet}`);
}

function renderStores(body, _item) {
  body.innerHTML = Object.entries(RESOURCES)
    .map(([name, v]) => `<div class="stores-row"><span>${esc(name)}</span><b>${v}</b></div>`)
    .join("") || `<span class="muted">No stores yet.</span>`;
}

// ---------- pins ----------
function renderPins() {
  $("#pins").innerHTML = pins
    .map(
      (p) => `<span class="pin-chip" data-pin="${p.id}">${esc(p.name)}<span class="x" data-pindel="${p.id}">×</span></span>`
    )
    .join("");
  for (const chip of document.querySelectorAll("[data-pin]")) {
    chip.addEventListener("click", (e) => {
      if (e.target.dataset.pindel) return;
      const p = pins.find((x) => x.id === chip.dataset.pin);
      cam.x = p.x; cam.y = p.y; cam.z = p.z;
      applyCam(true);
    });
  }
  for (const x of document.querySelectorAll("[data-pindel]")) {
    x.addEventListener("click", () => {
      pins = pins.filter((p) => p.id !== x.dataset.pindel);
      renderPins();
      queueSave();
    });
  }
}

$("#pin-add").addEventListener("click", () => {
  const name = prompt("Name this view:", "");
  if (!name || !name.trim()) return;
  pins.push({ id: uid(), name: name.trim(), x: cam.x, y: cam.y, z: cam.z });
  renderPins();
  queueSave();
});

// ---------- toolbar ----------
for (const b of document.querySelectorAll("[data-add]")) {
  b.addEventListener("click", () => addItem(b.dataset.add));
}

function updateHint() {
  $("#empty-hint").hidden = items.length > 0;
}

// ---------- live data ----------
async function refreshData() {
  const [party, state] = await Promise.all([
    fetch("/api/party").then((r) => r.json()),
    fetch("/api/state").then((r) => r.json())
  ]);
  PARTY = party;
  FOLK = state.characters;
  RESOURCES = state.resources;
  for (const item of items) {
    if (["character", "folk", "stores"].includes(item.type)) renderItem(item);
  }
}

let refreshTimer = null;
const stream = new EventSource("/api/stream");
stream.onmessage = () => {
  clearTimeout(refreshTimer);
  refreshTimer = setTimeout(refreshData, 400);
};

// ---------- boot ----------
(async () => {
  const doc = await (await fetch("/api/board")).json();
  items = doc.items || [];
  pins = doc.pins || [];
  await refreshData();
  for (const item of items) renderItem(item);
  renderPins();
  updateHint();
  applyCam();
})();
