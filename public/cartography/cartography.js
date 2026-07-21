import { initI18n, lang } from "/shared/i18n.js";
import { setTelemetryMode } from "/shared/telemetry.js";

const params = new URLSearchParams(location.search);
const GM = params.get("gm") === "1";
const PCID = params.get("pc") || localStorage.getItem("settlement-pc") || localStorage.getItem("settlement-journal-pc") || "";
const $ = (selector) => document.querySelector(selector);
const esc = (value) => String(value ?? "").replace(/[&<>"']/g, (char) =>
  ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]));
const phrase = (en, sv) => lang === "sv" && !GM ? sv : en;

const INKS = [
  ["#4f3928", "Umber"],
  ["#263d4a", "Blue"],
  ["#4d654f", "Green"],
  ["#8c4639", "Red"]
];

let DATA = null;
let activeSheetId = null;
let selectedNoteId = null;
let tool = null;
let inkColor = INKS[0][0];
let inkWidth = 0.0045;
let activeStroke = null;
let canvasObserver = null;
let zoom = 1;
let toastTimer = null;
let gmLedgerView = "blueprint";
let drawLayer = "structure";
let selectedZoneId = null;

if (!GM) {
  await import("/shared/feedback.js");
  await import("/shared/player-tools.js");
}

function playerCopy() {
  if (GM || lang !== "sv") return;
  document.title = "Kartografens atlas";
  $("#atlas-kicker").textContent = "Privat fältkontor";
  $("#atlas-title").textContent = "Kartografens atlas";
  $("#case-label").textContent = "Kartfodral";
  $("#new-sheet").title = "Nytt tomt blad";
  $("#new-sheet").setAttribute("aria-label", "Nytt tomt blad");
  $("[data-tool='pen'] b").textContent = "Rita";
  $("[data-tool='eraser'] b").textContent = "Sudda";
  $("[data-tool='note'] b").textContent = "Nål";
  $("#export-map b").textContent = "Exportera";
  $("#clear-ink").textContent = "Rensa mitt bläck";
  $("#access-message h2").textContent = "Kartfodralet förblir stängt.";
  $("#access-message p").textContent = "Det här skrivbordet tillhör den utsedda kartografen.";
  $("#access-message a").textContent = "Återvänd till dina verktyg";
  $("#blank-dialog h2").textContent = "Påbörja en tom karta";
  $("#blank-dialog .ledger-field");
  $("#blank-form > label").childNodes[0].textContent = "Kartans titel";
  $("#blank-submit").textContent = "Påbörja bladet";
  $("#blank-form .dialog-actions .quiet").textContent = "Avbryt";
  $("#submit-kicker").textContent = "Den sista stilla granskningen";
  $("#submit-heading").textContent = "Skicka detta till Drömmaren?";
  $("#submit-warning").textContent = "Detta skapar en permanent version. Drömmaren kan använda den för att förändra det som blir sant; en senare version raderar inte det som redan har setts.";
  $("#submit-attestation-label").textContent = "Jag har granskat vägarna, markeringarna och spekulationerna som jag väljer att skicka.";
  $("#submit-cancel").textContent = "Återgå till utkastet";
  $("#submit-confirm").textContent = "Skicka detta till Drömmaren";
}

function toast(message, error = false) {
  const element = $("#atlas-toast");
  element.textContent = message;
  element.classList.toggle("error", error);
  element.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => element.classList.remove("show"), 2500);
}

async function api(url, options = {}) {
  const response = await fetch(url, {
    method: options.method || "GET",
    headers: options.body ? { "Content-Type": "application/json" } : undefined,
    body: options.body ? JSON.stringify(options.body) : undefined
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.error || phrase("The atlas could not be updated.", "Atlasen kunde inte uppdateras."));
  return result;
}

const activeSheet = () => DATA?.sheets?.find((sheet) => sheet.id === activeSheetId) || null;
const selectedNote = () => activeSheet()?.notes?.find((note) => note.id === selectedNoteId) || null;
const selectedZone = () => activeSheet()?.truth?.zones?.find((zone) => zone.id === selectedZoneId) || null;
const drawingStrokes = () => GM ? (activeSheet()?.blueprint?.strokes || []) : (activeSheet()?.strokes || []);

async function load({ quiet = false } = {}) {
  if (!GM && !PCID) return denyAccess();
  try {
    const endpoint = GM ? "/api/cartography/gm" : `/api/cartography?pc=${encodeURIComponent(PCID)}`;
    const next = await api(endpoint);
    DATA = next;
    if (!DATA.sheets.some((sheet) => sheet.id === activeSheetId)) activeSheetId = DATA.sheets[0]?.id || null;
    if (!activeSheet()?.notes?.some((note) => note.id === selectedNoteId)) selectedNoteId = null;
    if (!activeSheet()?.truth?.zones?.some((zone) => zone.id === selectedZoneId)) selectedZoneId = null;
    render();
  } catch (error) {
    if (GM) {
      toast(error.message, true);
      if (!quiet) $("#access-message").hidden = false;
    } else denyAccess();
  }
}

function denyAccess() {
  $("#atlas-workspace").hidden = true;
  $("#access-message").hidden = false;
  setTelemetryMode("cartography-denied");
}

function sheetKind(sheet) {
  if (GM && sheet.submission?.revision) return `Oore dispatch · revision ${sheet.submission.revision}`;
  if (sheet.createdBy === "cartographer") return phrase("field draft", "fältutkast");
  if (sheet.visibility === "cartographer") return phrase("issued map", "utdelad karta");
  return "GM source";
}

function renderCase() {
  $("#sheet-count").textContent = phrase(
    `${DATA.sheets.length} ${DATA.sheets.length === 1 ? "sheet" : "sheets"}`,
    `${DATA.sheets.length} ${DATA.sheets.length === 1 ? "blad" : "blad"}`
  );
  $("#sheet-list").innerHTML = DATA.sheets.length ? DATA.sheets.map((sheet) => `
    <button type="button" class="sheet-tab ${sheet.id === activeSheetId ? "selected" : ""}" data-sheet="${esc(sheet.id)}">
      <strong>${esc(sheet.title)}</strong>
      <small>${esc(sheetKind(sheet))} · ${sheet.notes.length} ${phrase("notes", "noteringar")}</small>
      ${sheet.visibility === "cartographer" ? `<span class="visibility-mark" title="${phrase("Issued to Oore", "Utdelad till Oore")}">◆</span>` : ""}
      ${!GM && sheet.submission?.hasDraftChanges ? `<span class="draft-mark">${phrase("unsent", "oskickat")}</span>` : ""}
    </button>`).join("") : `<p class="note-empty" style="padding:.8rem;">${phrase("No sheets in the case.", "Inga blad i fodralet.")}</p>`;
  for (const button of document.querySelectorAll("[data-sheet]")) button.onclick = () => {
    activeSheetId = button.dataset.sheet;
    selectedNoteId = null;
    zoom = 1;
    setTool(null);
    render();
  };
}

function renderToolbar() {
  const sheet = activeSheet();
  const canAnnotate = Boolean(sheet) && (!GM || gmLedgerView === "blueprint");
  $("#new-sheet").hidden = false;
  $("#upload-map").hidden = !GM;
  for (const button of document.querySelectorAll("[data-tool]")) {
    const validForView = button.dataset.tool === "zone" ? GM && gmLedgerView === "truth" : canAnnotate;
    button.disabled = !validForView;
    button.classList.toggle("active", button.dataset.tool === tool);
  }
  for (const button of document.querySelectorAll("[data-width]")) {
    button.disabled = !canAnnotate;
    button.classList.toggle("active", Number(button.dataset.width) === inkWidth);
  }
  for (const button of document.querySelectorAll("[data-draw-layer]")) {
    button.disabled = !GM || gmLedgerView !== "blueprint";
    button.classList.toggle("active", button.dataset.drawLayer === drawLayer);
  }
  $("#ink-colors").innerHTML = INKS.map(([color, name]) => `<button type="button" class="ink-swatch ${color === inkColor ? "active" : ""}" data-ink="${color}" style="--ink-color:${color}" title="${name}" aria-label="${name} ink"></button>`).join("");
  for (const button of document.querySelectorAll("[data-ink]")) button.onclick = () => {
    inkColor = button.dataset.ink;
    renderToolbar();
  };
  $("#export-map").disabled = !sheet;
  $("#clear-ink").hidden = !canAnnotate || !drawingStrokes().length;
  $("#send-dreamer")?.toggleAttribute("disabled", !sheet?.submission?.hasDraftChanges);
  $("#zoom-value").textContent = `${Math.round(zoom * 100)}%`;
}

function drawStroke(context, stroke, width, height) {
  if (!stroke.points?.length) return;
  const scale = Math.min(width, height);
  context.save();
  context.globalCompositeOperation = stroke.tool === "eraser" ? "destination-out" : "source-over";
  context.strokeStyle = stroke.color || "#4f3928";
  context.fillStyle = context.strokeStyle;
  context.lineCap = "round";
  context.lineJoin = "round";
  context.lineWidth = Math.max(1.4, stroke.width * scale);
  const points = stroke.points;
  context.beginPath();
  context.moveTo(points[0][0] * width, points[0][1] * height);
  if (points.length === 1) {
    context.arc(points[0][0] * width, points[0][1] * height, context.lineWidth / 2, 0, Math.PI * 2);
    context.fill();
  } else {
    for (let index = 1; index < points.length; index += 1) context.lineTo(points[index][0] * width, points[index][1] * height);
    context.stroke();
  }
  context.restore();
}

function redrawInk() {
  const canvas = $("#ink-layer");
  const sheet = activeSheet();
  if (!sheet || $("#map-plane").hidden) return;
  const rect = canvas.getBoundingClientRect();
  if (!rect.width || !rect.height) return;
  const ratio = Math.min(window.devicePixelRatio || 1, 2);
  const pixelWidth = Math.max(1, Math.round(rect.width * ratio));
  const pixelHeight = Math.max(1, Math.round(rect.height * ratio));
  if (canvas.width !== pixelWidth || canvas.height !== pixelHeight) {
    canvas.width = pixelWidth;
    canvas.height = pixelHeight;
  }
  const context = canvas.getContext("2d");
  context.setTransform(ratio, 0, 0, ratio, 0, 0);
  context.clearRect(0, 0, rect.width, rect.height);
  if (GM) {
    context.save();
    context.globalAlpha = .48;
    for (const stroke of sheet.strokes || []) drawStroke(context, stroke, rect.width, rect.height);
    context.restore();
  }
  for (const stroke of drawingStrokes()) drawStroke(context, stroke, rect.width, rect.height);
}

function renderZones() {
  const sheet = activeSheet();
  const visible = GM && ["truth", "renders"].includes(gmLedgerView);
  $("#truth-zones").hidden = !visible;
  $("#truth-zones").innerHTML = visible ? (sheet?.truth?.zones || []).map((zone) => `
    <button type="button" class="truth-zone ${zone.id === selectedZoneId ? "selected" : ""}" data-zone-map="${esc(zone.id)}"
      style="left:${zone.x * 100}%;top:${zone.y * 100}%;width:${zone.width * 100}%;height:${zone.height * 100}%">${esc(zone.name)}</button>`).join("") : "";
  for (const button of document.querySelectorAll("[data-zone-map]")) button.onclick = (event) => {
    event.stopPropagation();
    selectedZoneId = button.dataset.zoneMap;
    document.body.classList.add("ledger-open");
    renderZones();
    renderLedger();
  };
}

function renderPins() {
  const sheet = activeSheet();
  $("#map-pins").innerHTML = (sheet?.notes || []).map((note, index) => `
    <button type="button" class="map-pin ${note.id === selectedNoteId ? "selected" : ""}" data-map-pin="${esc(note.id)}" style="left:${note.x * 100}%;top:${note.y * 100}%" title="${esc(note.title || note.text)}"><span>${index + 1}</span></button>`).join("");
  for (const pin of document.querySelectorAll("[data-map-pin]")) pin.onclick = (event) => {
    event.stopPropagation();
    selectedNoteId = pin.dataset.mapPin;
    document.body.classList.add("ledger-open");
    renderPins();
    renderLedger();
  };
}

function renderMap() {
  const sheet = activeSheet();
  $("#map-empty").hidden = Boolean(sheet);
  $("#map-plane").hidden = !sheet;
  if (!sheet) {
    $("#map-status").textContent = phrase("Choose a sheet from the case.", "Välj ett blad ur fodralet.");
    return;
  }
  const plane = $("#map-plane");
  plane.style.setProperty("--map-ratio", String(sheet.width / sheet.height));
  plane.style.setProperty("--map-zoom", `${zoom * 100}%`);
  const image = $("#map-image");
  image.hidden = !sheet.imageUrl;
  $("#blank-grid").hidden = Boolean(sheet.imageUrl);
  if (sheet.imageUrl && image.src !== new URL(sheet.imageUrl, location.href).href) image.src = sheet.imageUrl;
  image.alt = sheet.imageUrl ? sheet.title : "";
  $("#map-paper").classList.toggle("drawing", ["pen", "eraser"].includes(tool));
  $("#map-note-target").hidden = (!GM && tool !== "note") || (GM && tool !== "zone");
  $("#map-status").textContent = GM
    ? `${sheetKind(sheet)} · ${sheet.width} × ${sheet.height} · ${sheet.strokes.length} ink marks`
    : tool === "note"
      ? phrase("Touch the map where the speculation belongs.", "Tryck på kartan där spekulationen hör hemma.")
      : tool
        ? phrase("Your private draft is saved when you lift the pen.", "Ditt privata utkast sparas när du lyfter pennan.")
        : phrase("Choose Draw, Erase, or Pin to work on this sheet.", "Välj Rita, Sudda eller Nål för att arbeta på bladet.");
  renderPins();
  renderZones();
  canvasObserver?.disconnect();
  canvasObserver = new ResizeObserver(() => requestAnimationFrame(redrawInk));
  canvasObserver.observe($("#map-paper"));
  requestAnimationFrame(redrawInk);
}

function noteListHtml(sheet) {
  if (!sheet.notes.length) return `<p class="note-empty">${phrase("No speculations pinned to this sheet.", "Inga spekulationer är nålade på bladet.")}</p>`;
  return `<div class="note-list">${sheet.notes.map((note, index) => `
    <button type="button" class="note-row ${note.id === selectedNoteId ? "selected" : ""}" data-note-row="${esc(note.id)}">
      <strong>${index + 1}. ${esc(note.title || phrase("Untitled speculation", "Namnlös spekulation"))}</strong>
      <small>${esc((note.text || "").slice(0, 76))}</small>
    </button>`).join("")}</div>`;
}

function renderLedger() {
  const sheet = activeSheet();
  if (!sheet) {
    $("#sheet-details").innerHTML = `<p class="note-empty">${phrase("Open a sheet to inspect it.", "Öppna ett blad för att granska det.")}</p>`;
    $("#note-details").innerHTML = "";
    return;
  }
  if (GM) return renderGmLedger(sheet);
  const canRename = GM || sheet.createdBy === "cartographer";
  $("#sheet-details").innerHTML = `
    <span class="smallcaps">${phrase("Open sheet", "Öppet blad")}</span>
    <h2>${esc(sheet.title)}</h2>
    <div class="ledger-meta"><span>${esc(sheetKind(sheet))}</span><span>${sheet.width} × ${sheet.height}</span><span>${sheet.strokes.length} ${phrase("ink marks", "bläckmärken")} · ${sheet.notes.length} ${phrase("pins", "nålar")}</span></div>
    <div class="dispatch-state ${sheet.submission?.hasDraftChanges ? "pending" : "sent"}">
      <strong>${sheet.submission?.hasDraftChanges ? phrase("This draft has not reached the Dreamer", "Detta utkast har inte nått Drömmaren") : sheet.submission?.revision ? phrase(`Revision ${sheet.submission.revision} has been sent`, `Version ${sheet.submission.revision} har skickats`) : phrase("Nothing has been sent", "Ingenting har skickats")}</strong>
      <p>${phrase("Your working draft is kept safe here. Only an explicit dispatch crosses into the Dreamer's sight.", "Ditt arbetsutkast förvaras tryggt här. Endast en uttrycklig försändelse når Drömmarens blick.")}</p>
    </div>
    ${canRename ? `<label class="ledger-field">${phrase("Sheet title", "Bladets titel")}<input id="sheet-title-input" maxlength="120" value="${esc(sheet.title)}"></label>` : ""}
    ${GM ? `<label class="visibility-toggle"><input type="checkbox" id="sheet-issued" ${sheet.visibility === "cartographer" ? "checked" : ""}><span>Issue this sheet to Oore. Hidden source sheets never enter his payload.</span></label>` : ""}
    <div class="ledger-actions">
      ${canRename ? `<button type="button" class="quiet" id="save-sheet">${phrase("Save details", "Spara uppgifter")}</button>` : ""}
      ${sheet.canDelete ? `<button type="button" class="quiet" id="delete-sheet">${phrase("Remove sheet", "Ta bort blad")}</button>` : ""}
      <button type="button" class="dreamer-button" id="send-dreamer" ${sheet.submission?.hasDraftChanges ? "" : "disabled"}>${phrase("Review before sending", "Granska före sändning")}</button>
    </div>`;
  $("#save-sheet")?.addEventListener("click", saveSheetDetails);
  $("#delete-sheet")?.addEventListener("click", removeSheet);
  $("#send-dreamer")?.addEventListener("click", reviewSubmission);

  const note = selectedNote();
  $("#note-details").innerHTML = `
    <span class="smallcaps">${phrase("Speculations", "Spekulationer")}</span>
    <h3>${note ? esc(note.title || phrase("Untitled speculation", "Namnlös spekulation")) : phrase("Pinned field notes", "Nålade fältanteckningar")}</h3>
    ${note ? noteEditorHtml(note) : noteListHtml(sheet)}`;
  for (const row of document.querySelectorAll("[data-note-row]")) row.onclick = () => {
    selectedNoteId = row.dataset.noteRow;
    renderPins();
    renderLedger();
  };
  $("#note-save")?.addEventListener("click", saveSelectedNote);
  $("#note-delete")?.addEventListener("click", removeSelectedNote);
  $("#note-back")?.addEventListener("click", () => { selectedNoteId = null; renderPins(); renderLedger(); });
}

function gmTabsHtml() {
  return `<nav class="ledger-tabs" aria-label="Map layer">
    <button type="button" data-gm-ledger="blueprint" class="${gmLedgerView === "blueprint" ? "active" : ""}">Blueprint</button>
    <button type="button" data-gm-ledger="truth" class="${gmLedgerView === "truth" ? "active" : ""}">True layer</button>
    <button type="button" data-gm-ledger="renders" class="${gmLedgerView === "renders" ? "active" : ""}">Renders</button>
  </nav>`;
}

function renderGmLedger(sheet) {
  const diff = sheet.blueprint?.pendingDiff;
  $("#sheet-details").innerHTML = `${gmTabsHtml()}
    <span class="smallcaps">Open sheet</span>
    <h2>${esc(sheet.title)}</h2>
    <div class="ledger-meta"><span>${esc(sheetKind(sheet))}</span><span>Blueprint revision ${sheet.blueprint?.revision || 0}</span>${sheet.submission?.submittedAt ? `<span>Received ${new Date(sheet.submission.submittedAt).toLocaleString()}</span>` : `<span>No field map has been sent to the Dreamer.</span>`}</div>`;
  for (const button of document.querySelectorAll("[data-gm-ledger]")) button.onclick = () => {
    gmLedgerView = button.dataset.gmLedger;
    selectedZoneId = null;
    selectedNoteId = null;
    setTool(null);
    render();
  };

  if (gmLedgerView === "blueprint") {
    $("#note-details").innerHTML = `
      <h3>Hard structure</h3>
      <p class="note-empty">Draw walls, passages, room boundaries, and other hard delineators here. Mark ornament and uncertain lines as Detail.</p>
      ${diff ? `<div class="diff-block"><strong>Structural revision awaiting review</strong><p>${diff.addedCells.length} cells added, ${diff.removedCells.length} removed · ${diff.changedPercent}% of the blueprint grid changed.</p></div>` : `<div class="diff-block" style="border-color:var(--atlas-green)"><strong>${sheet.blueprint?.confirmedHash ? "Structure matches the confirmed revision" : "No structure confirmed yet"}</strong><p>Graphic rendering remains gated until the first blueprint is confirmed.</p></div>`}
      <div class="ledger-actions">${diff || !sheet.blueprint?.confirmedHash ? `<button type="button" id="confirm-blueprint">Confirm revised structure</button>` : ""}</div>
      <hr class="rule">
      <h3>Oore's submitted field notes</h3>${sheet.submission?.revision ? noteListHtml(sheet) : `<p class="note-empty">Oore's private draft remains sealed until he sends it.</p>`}`;
    $("#confirm-blueprint")?.addEventListener("click", confirmBlueprint);
    for (const row of document.querySelectorAll("[data-note-row]")) row.onclick = () => {
      selectedNoteId = row.dataset.noteRow;
      renderPins();
      renderLedger();
    };
    if (selectedNote()) {
      $("#note-details").insertAdjacentHTML("beforeend", `<hr class="rule"><h3>${esc(selectedNote().title || "Untitled speculation")}</h3>${noteEditorHtml(selectedNote())}`);
      $("#note-back")?.addEventListener("click", () => { selectedNoteId = null; renderPins(); renderLedger(); });
    }
    return;
  }

  if (gmLedgerView === "truth") {
    const zone = selectedZone();
    $("#note-details").innerHTML = `
      <h3>${zone ? esc(zone.name) : "What is actually here"}</h3>
      ${zone ? truthZoneEditorHtml(zone) : `
        <label class="ledger-field">General truth<textarea id="truth-overview" maxlength="8000">${esc(sheet.truth?.overview || "")}</textarea></label>
        <div class="ledger-actions"><button type="button" id="save-truth">Save true layer</button><button type="button" class="quiet" id="begin-zone">Place a region</button></div>
        <div class="note-list" style="margin-top:.8rem;">${(sheet.truth?.zones || []).map((entry) => `<button type="button" class="note-row" data-zone-row="${esc(entry.id)}"><strong>${esc(entry.name)}</strong><small>${esc((entry.truth || entry.furnishing || "No truth written yet").slice(0,76))}</small></button>`).join("") || `<p class="note-empty">No true regions marked yet.</p>`}</div>`}`;
    $("#save-truth")?.addEventListener("click", saveTruthOverview);
    $("#begin-zone")?.addEventListener("click", () => setTool("zone"));
    for (const row of document.querySelectorAll("[data-zone-row]")) row.onclick = () => { selectedZoneId = row.dataset.zoneRow; renderZones(); renderLedger(); };
    $("#zone-save")?.addEventListener("click", saveTruthZone);
    $("#zone-delete")?.addEventListener("click", removeTruthZone);
    $("#zone-back")?.addEventListener("click", () => { selectedZoneId = null; renderZones(); renderLedger(); });
    return;
  }

  const plan = sheet.renderPlan || {};
  $("#note-details").innerHTML = `
    <h3>Revision ${plan.revision || 0} render plan</h3>
    <div class="diff-block" style="border-color:${plan.status === "awaiting-confirmation" ? "var(--atlas-red)" : "var(--atlas-green)"}"><strong>${renderPlanStatus(plan.status)}</strong><p>${plan.status === "awaiting-confirmation" ? "No ComfyUI work will begin until the revised structure is confirmed." : "Only outputs whose dependency hash changed are marked for re-rendering."}</p></div>
    ${renderResultHtml("Parchment map", plan.map)}
    ${(plan.scenes || []).map((scene) => renderResultHtml(sheet.truth.zones.find((zone) => zone.id === scene.zoneId)?.name || "Unknown region", scene)).join("") || `<p class="note-empty">Add true regions to prepare room and feature views.</p>`}`;
}

function truthZoneEditorHtml(zone) {
  return `
    <label class="ledger-field">Region name<input id="zone-name" maxlength="120" value="${esc(zone.name)}"></label>
    <label class="ledger-field">General truth<textarea id="zone-truth" maxlength="4000">${esc(zone.truth)}</textarea></label>
    <label class="ledger-field">Furnishing and layout<textarea id="zone-furnishing" maxlength="4000">${esc(zone.furnishing)}</textarea></label>
    <label class="ledger-field">Granular detail<textarea id="zone-detail" maxlength="6000">${esc(zone.detail)}</textarea></label>
    <div class="ledger-actions"><button type="button" id="zone-save">Save region</button><button type="button" class="quiet" id="zone-delete">Remove</button><button type="button" class="quiet" id="zone-back">All regions</button></div>`;
}

function renderPlanStatus(status) {
  if (status === "awaiting-confirmation") return "Fundamental change awaiting confirmation";
  if (status === "compiling") return "Rebuilding dependency plan in the background";
  if (status === "ready") return "Revision checked and ready for rendering";
  return "No confirmed render plan yet";
}

function renderResultHtml(label, result = {}) {
  return `<article class="render-row"><header><strong>${esc(label)}</strong><span class="render-status ${esc(result.status || "needs-render")}">${esc((result.status || "needs-render").replaceAll("-", " "))}</span></header>${result.brief ? `<details><summary>Compiled brief</summary><p>${esc(result.brief)}</p></details>` : ""}</article>`;
}

function noteEditorHtml(note) {
  if (GM) return `
    <p style="white-space:pre-wrap;line-height:1.45;">${esc(note.text || phrase("No detail written.", "Ingen detalj skriven."))}</p>
    <div class="ledger-meta"><span>${Math.round(note.x * 100)}%, ${Math.round(note.y * 100)}%</span></div>
    <div class="ledger-actions"><button type="button" class="quiet" id="note-back">Back to notes</button></div>`;
  return `
    <label class="ledger-field">${phrase("Heading", "Rubrik")}<input id="note-title" maxlength="120" value="${esc(note.title)}"></label>
    <label class="ledger-field">${phrase("Comment or speculation", "Kommentar eller spekulation")}<textarea id="note-text" maxlength="2400">${esc(note.text)}</textarea></label>
    <div class="ledger-actions"><button type="button" id="note-save">${phrase("Pin the note", "Nåla anteckningen")}</button><button type="button" class="quiet" id="note-delete">${phrase("Remove", "Ta bort")}</button><button type="button" class="quiet" id="note-back">${phrase("All notes", "Alla anteckningar")}</button></div>`;
}

function render() {
  if (!DATA) return;
  $("#access-message").hidden = true;
  $("#atlas-workspace").hidden = false;
  document.body.classList.toggle("gm-mode", GM);
  document.body.classList.toggle("player-mode", !GM);
  $("#atlas-kicker").textContent = GM ? "GM review · unrevealed sources stay private" : phrase("Private field office", "Privat fältkontor");
  $("#atlas-owner").textContent = DATA.owner ? `${DATA.owner.name} · ${GM ? "appointed cartographer" : phrase("cartographer", "kartograf")}` : "No cartographer appointed";
  setTelemetryMode(GM ? "cartography-review" : "cartography-work");
  renderCase();
  renderToolbar();
  renderMap();
  renderLedger();
}

function reviewSubmission() {
  const sheet = activeSheet();
  if (GM || !sheet?.submission?.hasDraftChanges) return;
  const visibleTitle = $("#sheet-title-input")?.value.trim();
  if (visibleTitle && visibleTitle !== sheet.title) {
    toast(phrase("Save the map title before reviewing the dispatch.", "Spara kartans titel innan du granskar försändelsen."), true);
    return;
  }
  const note = selectedNote();
  if (note && ($("#note-title")?.value !== note.title || $("#note-text")?.value !== note.text)) {
    toast(phrase("Pin or discard the open note before reviewing the dispatch.", "Nåla eller kasta den öppna anteckningen innan du granskar försändelsen."), true);
    return;
  }
  const nextRevision = (sheet.submission.revision || 0) + 1;
  $("#submission-summary").innerHTML = `
    <div><dt>${phrase("Map", "Karta")}</dt><dd>${esc(sheet.title)}</dd></div>
    <div><dt>${phrase("Permanent revision", "Permanent version")}</dt><dd>${nextRevision}</dd></div>
    <div><dt>${phrase("Marks", "Markeringar")}</dt><dd>${sheet.strokes.length}</dd></div>
    <div><dt>${phrase("Speculations", "Spekulationer")}</dt><dd>${sheet.notes.length}</dd></div>`;
  $("#submission-notes").innerHTML = sheet.notes.length
    ? `<strong>${phrase("What the Dreamer will read", "Det Drömmaren kommer att läsa")}</strong>${sheet.notes.map((entry, index) => `<article><b>${index + 1}. ${esc(entry.title || phrase("Untitled speculation", "Namnlös spekulation"))}</b><p>${esc(entry.text || phrase("No detail written.", "Ingen detalj skriven."))}</p></article>`).join("")}`
    : `<p>${phrase("No written speculations accompany this revision.", "Inga skrivna spekulationer följer med denna version.")}</p>`;
  $("#submit-attestation").checked = false;
  $("#submit-dialog").showModal();
}

async function submitToDreamer(event) {
  event.preventDefault();
  const sheet = activeSheet();
  if (!sheet || !$("#submit-attestation").checked) return;
  const button = $("#submit-confirm");
  button.disabled = true;
  try {
    const result = await api(`/api/cartography/sheets/${encodeURIComponent(sheet.id)}/submit`, {
      method: "POST",
      body: { pcId: PCID }
    });
    DATA = result.view;
    $("#submit-dialog").close();
    toast(phrase(`Revision ${result.revision} has reached the Dreamer.`, `Version ${result.revision} har nått Drömmaren.`));
    render();
  } catch (error) {
    toast(error.message, true);
  } finally {
    button.disabled = false;
  }
}

function setTool(next) {
  tool = next === tool ? null : next;
  activeStroke = null;
  renderToolbar();
  renderMap();
}

function pointOnMap(event, element) {
  const rect = element.getBoundingClientRect();
  return [
    Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width)),
    Math.max(0, Math.min(1, (event.clientY - rect.top) / rect.height))
  ];
}

async function saveInk() {
  const sheet = activeSheet();
  if (!sheet) return;
  const endpoint = GM
    ? `/api/cartography/gm/sheets/${encodeURIComponent(sheet.id)}/blueprint`
    : `/api/cartography/sheets/${encodeURIComponent(sheet.id)}/ink`;
  await api(endpoint, {
    method: "PUT",
    body: GM ? { strokes: sheet.blueprint.strokes } : { pcId: PCID, strokes: sheet.strokes }
  });
  if (GM) await load({ quiet: true });
  else if (sheet.submission) sheet.submission.hasDraftChanges = true;
}

function wireCanvas() {
  const canvas = $("#ink-layer");
  canvas.addEventListener("pointerdown", (event) => {
    if (GM || !["pen", "eraser"].includes(tool) || !activeSheet()) return;
    event.preventDefault();
    canvas.setPointerCapture(event.pointerId);
    activeStroke = {
      tool,
      layer: GM ? drawLayer : "detail",
      color: inkColor,
      width: tool === "eraser" ? Math.max(.02, inkWidth * 5) : inkWidth,
      points: [pointOnMap(event, canvas)]
    };
    drawingStrokes().push(activeStroke);
    redrawInk();
  });
  canvas.addEventListener("pointermove", (event) => {
    if (!activeStroke || !canvas.hasPointerCapture(event.pointerId)) return;
    const point = pointOnMap(event, canvas);
    const previous = activeStroke.points.at(-1);
    if ((point[0] - previous[0]) ** 2 + (point[1] - previous[1]) ** 2 < .000003) return;
    activeStroke.points.push(point);
    redrawInk();
  });
  const finish = (event) => {
    if (!activeStroke) return;
    if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
    activeStroke = null;
    saveInk().catch((error) => toast(error.message, true));
    renderToolbar();
    renderLedger();
  };
  canvas.addEventListener("pointerup", finish);
  canvas.addEventListener("pointercancel", finish);
}

async function placeNote(event) {
  if (GM || tool !== "note" || !activeSheet()) return;
  const [x, y] = pointOnMap(event, $("#map-paper"));
  try {
    const note = await api(`/api/cartography/sheets/${encodeURIComponent(activeSheet().id)}/notes`, {
      method: "POST",
      body: { pcId: PCID, x, y, title: phrase("New speculation", "Ny spekulation"), text: phrase("What might be here?", "Vad kan finnas här?") }
    });
    activeSheet().notes.push(note);
    activeSheet().submission.hasDraftChanges = true;
    selectedNoteId = note.id;
    setTool(null);
    document.body.classList.add("ledger-open");
    render();
  } catch (error) { toast(error.message, true); }
}

async function placeTruthZone(event) {
  if (!GM || tool !== "zone" || !activeSheet()) return;
  const [rawX, rawY] = pointOnMap(event, $("#map-paper"));
  const width = .18;
  const height = .14;
  try {
    const zone = await api(`/api/cartography/gm/sheets/${encodeURIComponent(activeSheet().id)}/zones`, {
      method: "POST",
      body: {
        name: "New true region",
        x: Math.max(0, Math.min(1 - width, rawX - width / 2)),
        y: Math.max(0, Math.min(1 - height, rawY - height / 2)),
        width,
        height
      }
    });
    activeSheet().truth.zones.push(zone);
    selectedZoneId = zone.id;
    setTool(null);
    document.body.classList.add("ledger-open");
    await load({ quiet: true });
  } catch (error) { toast(error.message, true); }
}

async function confirmBlueprint() {
  const sheet = activeSheet();
  if (!sheet || !confirm("Confirm this hard structure and rebuild the render dependency plan? No graphic images will be generated yet.")) return;
  try {
    const result = await api(`/api/cartography/gm/sheets/${encodeURIComponent(sheet.id)}/confirm-blueprint`, { method: "POST" });
    toast(`Blueprint revision ${result.revision} is compiling.`);
    await load({ quiet: true });
  } catch (error) { toast(error.message, true); }
}

async function saveTruthOverview() {
  const sheet = activeSheet();
  if (!sheet) return;
  try {
    await api(`/api/cartography/gm/sheets/${encodeURIComponent(sheet.id)}/truth`, {
      method: "PUT",
      body: { overview: $("#truth-overview").value }
    });
    await load({ quiet: true });
    toast("The true layer is saved.");
  } catch (error) { toast(error.message, true); }
}

async function saveTruthZone() {
  const sheet = activeSheet();
  const zone = selectedZone();
  if (!sheet || !zone) return;
  try {
    await api(`/api/cartography/gm/sheets/${encodeURIComponent(sheet.id)}/zones/${encodeURIComponent(zone.id)}`, {
      method: "PUT",
      body: {
        name: $("#zone-name").value,
        truth: $("#zone-truth").value,
        furnishing: $("#zone-furnishing").value,
        detail: $("#zone-detail").value,
        x: zone.x,
        y: zone.y,
        width: zone.width,
        height: zone.height
      }
    });
    await load({ quiet: true });
    toast("The true region is saved.");
  } catch (error) { toast(error.message, true); }
}

async function removeTruthZone() {
  const sheet = activeSheet();
  const zone = selectedZone();
  if (!sheet || !zone || !confirm(`Remove the true region “${zone.name}”?`)) return;
  try {
    await api(`/api/cartography/gm/sheets/${encodeURIComponent(sheet.id)}/zones/${encodeURIComponent(zone.id)}`, { method: "DELETE" });
    selectedZoneId = null;
    await load({ quiet: true });
  } catch (error) { toast(error.message, true); }
}

async function saveSelectedNote() {
  const sheet = activeSheet();
  const note = selectedNote();
  if (!sheet || !note) return;
  try {
    const updated = await api(`/api/cartography/sheets/${encodeURIComponent(sheet.id)}/notes/${encodeURIComponent(note.id)}`, {
      method: "PUT",
      body: { pcId: PCID, title: $("#note-title").value, text: $("#note-text").value, x: note.x, y: note.y }
    });
    Object.assign(note, updated);
    sheet.submission.hasDraftChanges = true;
    toast(phrase("The speculation is pinned.", "Spekulationen är nålad."));
    renderPins();
    renderLedger();
  } catch (error) { toast(error.message, true); }
}

async function removeSelectedNote() {
  const sheet = activeSheet();
  const note = selectedNote();
  if (!sheet || !note || !confirm(phrase("Remove this pinned note?", "Ta bort den här nålade anteckningen?"))) return;
  try {
    await api(`/api/cartography/sheets/${encodeURIComponent(sheet.id)}/notes/${encodeURIComponent(note.id)}?pc=${encodeURIComponent(PCID)}`, { method: "DELETE" });
    sheet.notes = sheet.notes.filter((candidate) => candidate.id !== note.id);
    sheet.submission.hasDraftChanges = true;
    selectedNoteId = null;
    renderPins();
    renderLedger();
  } catch (error) { toast(error.message, true); }
}

async function saveSheetDetails() {
  const sheet = activeSheet();
  if (!sheet) return;
  try {
    const body = { title: $("#sheet-title-input")?.value || sheet.title };
    if (GM) body.visibility = $("#sheet-issued").checked ? "cartographer" : "gm";
    const endpoint = GM
      ? `/api/cartography/gm/sheets/${encodeURIComponent(sheet.id)}`
      : `/api/cartography/sheets/${encodeURIComponent(sheet.id)}`;
    await api(endpoint, { method: "PUT", body: GM ? body : { ...body, pcId: PCID } });
    await load({ quiet: true });
    toast(phrase("Map details saved.", "Kartuppgifterna sparades."));
  } catch (error) { toast(error.message, true); }
}

async function removeSheet() {
  const sheet = activeSheet();
  if (!sheet || !confirm(phrase(`Remove “${sheet.title}” from the map case?`, `Ta bort ”${sheet.title}” ur kartfodralet?`))) return;
  try {
    const endpoint = GM
      ? `/api/cartography/gm/sheets/${encodeURIComponent(sheet.id)}`
      : `/api/cartography/sheets/${encodeURIComponent(sheet.id)}?pc=${encodeURIComponent(PCID)}`;
    await api(endpoint, { method: "DELETE" });
    activeSheetId = null;
    selectedNoteId = null;
    await load({ quiet: true });
  } catch (error) { toast(error.message, true); }
}

async function clearInk() {
  const sheet = activeSheet();
  const strokes = drawingStrokes();
  if (!sheet || !strokes.length || !confirm(phrase("Clear every ink mark from this sheet?", "Rensa alla bläckmärken från bladet?"))) return;
  const previous = [...strokes];
  if (GM) sheet.blueprint.strokes = [];
  else sheet.strokes = [];
  redrawInk();
  try {
    await saveInk();
    renderToolbar();
    renderLedger();
  } catch {
    if (GM) sheet.blueprint.strokes = previous;
    else sheet.strokes = previous;
    redrawInk();
  }
}

function fileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error("The map image could not be read."));
    reader.readAsDataURL(file);
  });
}

function imageDimensions(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => { URL.revokeObjectURL(url); resolve({ width: image.naturalWidth, height: image.naturalHeight }); };
    image.onerror = () => { URL.revokeObjectURL(url); reject(new Error("The map image is invalid.")); };
    image.src = url;
  });
}

async function createBlank(event) {
  event.preventDefault();
  const title = $("#blank-title").value.trim();
  if (!title) return;
  try {
    const endpoint = GM ? "/api/cartography/gm/sheets" : "/api/cartography/sheets";
    const body = GM
      ? { title, visibility: $("#blank-issued").checked ? "cartographer" : "gm" }
      : { title, pcId: PCID };
    const result = await api(endpoint, { method: "POST", body });
    $("#blank-dialog").close();
    $("#blank-form").reset();
    activeSheetId = result.sheetId || result.sheets?.at(-1)?.id || null;
    await load({ quiet: true });
  } catch (error) { toast(error.message, true); }
}

async function uploadMap(event) {
  event.preventDefault();
  const file = $("#upload-file").files[0];
  if (!file) return;
  $("#upload-submit").disabled = true;
  try {
    const [{ width, height }, dataUrl] = await Promise.all([imageDimensions(file), fileAsDataUrl(file)]);
    const result = await api("/api/cartography/gm/images", {
      method: "POST",
      body: {
        title: $("#upload-title").value,
        visibility: $("#upload-issued").checked ? "cartographer" : "gm",
        width,
        height,
        dataUrl
      }
    });
    $("#upload-dialog").close();
    $("#upload-form").reset();
    activeSheetId = result.sheetId;
    await load({ quiet: true });
  } catch (error) { toast(error.message, true); }
  finally { $("#upload-submit").disabled = false; }
}

async function exportMap() {
  const sheet = activeSheet();
  if (!sheet) return;
  const scale = Math.min(1, 4096 / Math.max(sheet.width, sheet.height));
  const width = Math.max(1, Math.round(sheet.width * scale));
  const height = Math.max(1, Math.round(sheet.height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  context.fillStyle = "#e6d7b4";
  context.fillRect(0, 0, width, height);
  if (sheet.imageUrl) {
    const image = new Image();
    image.src = sheet.imageUrl;
    await image.decode();
    context.drawImage(image, 0, 0, width, height);
  }
  for (const stroke of drawingStrokes()) drawStroke(context, stroke, width, height);
  sheet.notes.forEach((note, index) => {
    const x = note.x * width;
    const y = note.y * height;
    const radius = Math.max(11, Math.min(width, height) * .012);
    context.fillStyle = "#8c4639";
    context.beginPath();
    context.arc(x, y, radius, 0, Math.PI * 2);
    context.fill();
    context.fillStyle = "#fff4d9";
    context.font = `bold ${Math.round(radius * 1.15)}px Georgia`;
    context.textAlign = "center";
    context.textBaseline = "middle";
    context.fillText(String(index + 1), x, y + 1);
  });
  const link = document.createElement("a");
  link.download = `${sheet.title.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "").toLowerCase() || "map"}.png`;
  link.href = canvas.toDataURL("image/png");
  link.click();
}

for (const button of document.querySelectorAll("[data-tool]")) button.onclick = () => setTool(button.dataset.tool);
for (const button of document.querySelectorAll("[data-width]")) button.onclick = () => { inkWidth = Number(button.dataset.width); renderToolbar(); };
for (const button of document.querySelectorAll("[data-draw-layer]")) button.onclick = () => { drawLayer = button.dataset.drawLayer; renderToolbar(); };
$("#zoom-out").onclick = () => { zoom = Math.max(.65, Math.round((zoom - .15) * 100) / 100); renderToolbar(); renderMap(); };
$("#zoom-in").onclick = () => { zoom = Math.min(2.5, Math.round((zoom + .15) * 100) / 100); renderToolbar(); renderMap(); };
$("#new-sheet").onclick = () => { $("#blank-title").value = phrase("Uncharted ground", "Okänd mark"); $("#blank-dialog").showModal(); };
$("#upload-map").onclick = () => $("#upload-dialog").showModal();
$("#blank-form").onsubmit = createBlank;
$("#upload-form").onsubmit = uploadMap;
$("#submit-form").onsubmit = submitToDreamer;
$("#map-note-target").onclick = (event) => GM ? placeTruthZone(event) : placeNote(event);
$("#clear-ink").onclick = clearInk;
$("#export-map").onclick = () => exportMap().catch((error) => toast(error.message, true));
for (const button of document.querySelectorAll("[data-close-dialog]")) button.onclick = () => $("#" + button.dataset.closeDialog).close();
$("#map-scroll").addEventListener("pointerdown", (event) => {
  if (event.target.closest(".map-pin") || event.target === $("#map-note-target")) return;
  if (window.innerWidth <= 1050) document.body.classList.remove("ledger-open");
});
wireCanvas();
initI18n();
playerCopy();
await load();

const stream = new EventSource("/api/stream");
let refreshTimer = null;
stream.onmessage = () => {
  if (activeStroke) return;
  clearTimeout(refreshTimer);
  refreshTimer = setTimeout(() => load({ quiet: true }), 220);
};
