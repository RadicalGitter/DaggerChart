# Tag board skeleton

Distilled from `public/music/*`. Everything here is copy-adaptable vanilla ES
module code — no build step. Replace `SURFACE` / accent variables per surface.

## Contents

1. [taxonomy.js — authoring + flattening](#taxonomyjs)
2. [Markup](#markup)
3. [board.js — state, selection model, renderer](#boardjs)
4. [CSS — bubbles, states, dive animation](#css)

## taxonomy.js

The authoring shape is compact nested arrays; the flattener turns them into a
flat `TAGS` map with stable slugged-path ids. Only `ROOTS` content changes per
surface — the flattener and helpers are generic.

```js
// Curated vocabulary for <surface>. Every authored branch has two directions
// with three choices each; roots are the deliberate exception.
const ROOTS = [
  {
    id: "root-id",
    label: "Root Label",
    payload: "prompt fragment this whole branch contributes",
    groups: [
      ["Direction A", [
        // [label, payload, [upperGroupLabel, [leafLabels]], [lowerGroupLabel, [leafLabels]]]
        ["Child", "child prompt fragment", ["Facet", ["Leaf One", "Leaf Two", "Leaf Three"]], ["Other Facet", ["Leaf", "Leaf", "Leaf"]]],
      ]],
      ["Direction B", [ /* three more children */ ]],
    ]
  },
];

const slug = (value) => value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
export const TAGS = {};
export const ROOT_IDS = [];

function addTag(tag) {
  TAGS[tag.id] = { groups: [], ...tag };
  return TAGS[tag.id];
}

for (const root of ROOTS) {
  ROOT_IDS.push(root.id);
  const rootNode = addTag({ id: root.id, label: root.label, payload: root.payload, parentId: null });
  for (const [groupLabel, children] of root.groups) {
    const group = { label: groupLabel, ids: [] };
    for (const [childLabel, childPayload, upper, lower] of children) {
      const childId = `${root.id}-${slug(childLabel)}`;
      group.ids.push(childId);
      const child = addTag({ id: childId, label: childLabel, payload: childPayload, parentId: root.id });
      for (const [deepLabel, leaves] of [upper, lower]) {
        const deepGroup = { label: deepLabel, ids: [] };
        for (const leafLabel of leaves) {
          const leafId = `${childId}-${slug(leafLabel)}`;
          deepGroup.ids.push(leafId);
          addTag({ id: leafId, label: leafLabel, payload: leafLabel.toLowerCase(), parentId: childId });
        }
        child.groups.push(deepGroup);
      }
    }
    rootNode.groups.push(group);
  }
}

export function findTag(value) {
  const needle = String(value || "").trim().toLowerCase();
  return Object.values(TAGS).find((tag) => tag.id === needle || tag.label.toLowerCase() === needle) || null;
}

export function childIds(id) {
  return (TAGS[id]?.groups || []).flatMap((group) => group.ids);
}

export function descendantIds(id) {
  const found = [];
  const visit = (tagId) => {
    for (const childId of childIds(tagId)) {
      found.push(childId);
      visit(childId);
    }
  };
  visit(id);
  return found;
}
```

## Markup

```html
<header class="board-head">
  <h2>Tag board</h2>
  <div class="route-actions">
    <button class="quiet" id="tag-back" aria-label="Go back">Back</button>
    <button class="quiet" id="tag-start">Start</button>
    <button class="quiet" id="clear-tags" type="button">Clear tags</button>
  </div>
</header>

<form id="pin-form" class="pin-form">
  <input id="pin-input" type="text" autocomplete="off" maxlength="60" placeholder="Pin a word">
  <button type="submit">Pin</button>
</form>
<div class="pinned-row" id="pinned-row"></div>

<div class="tag-board" id="tag-board"></div>

<!-- compiled output stays user-editable -->
<label><span>Compiled direction</span><textarea id="compiled-output" rows="5"></textarea></label>
```

## board.js

```js
import { TAGS, ROOT_IDS, findTag, descendantIds } from "./taxonomy.js";

const $ = (selector) => document.querySelector(selector);
const esc = (value) => String(value ?? "").replace(/[&<>"']/g, (char) =>
  ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]));

const PINS_KEY = "settlement-SURFACE-pins"; // namespace per surface

const state = {
  route: [],                // navigation stack of tag ids
  explicit: new Set(),      // tags the user chose directly
  excluded: new Set(),      // branches carved out of an inherited selection
  pins: loadPins(),
  clickTimer: null,
  tagTransitioning: false,
};

function loadPins() {
  try { return JSON.parse(localStorage.getItem(PINS_KEY)) || []; } catch { return []; }
}
function savePins() { localStorage.setItem(PINS_KEY, JSON.stringify(state.pins)); }

// ---- selection model -------------------------------------------------------

function pinById(id) { return state.pins.find((pin) => pin.id === id); }
function tagById(id) { return TAGS[id] || pinById(id) || null; }

function ancestors(id) {
  const found = [];
  let current = TAGS[id];
  while (current?.parentId) {
    found.push(current.parentId);
    current = TAGS[current.parentId];
  }
  return found;
}

function excludedByBranch(id) {
  return state.excluded.has(id) || ancestors(id).some((parentId) => state.excluded.has(parentId));
}

function inherited(id) {
  return !excludedByBranch(id) && ancestors(id).some((parentId) => state.explicit.has(parentId));
}

function tagState(id) {
  if (excludedByBranch(id)) return "excluded";
  if (state.explicit.has(id)) return "explicit";
  if (inherited(id)) return "inherited";
  return "";
}

function toggleTag(id) {
  if (state.explicit.has(id)) {
    state.explicit.delete(id);
  } else if (inherited(id) || excludedByBranch(id)) {
    if (excludedByBranch(id)) state.excluded.delete(id);
    else state.excluded.add(id);
  } else {
    state.explicit.add(id);
    state.excluded.delete(id);
  }
  renderTags();
  compile();
}

// Explicit choices only — use for FILTERING and for persisting the selection.
// A broad tag must not become a strict filter.
function selectedTagIds() {
  return [...state.explicit].filter((id) => !excludedByBranch(id));
}

// Explicit + all non-excluded descendants — use ONLY for compiling the payload.
function effectiveTagIds() {
  const active = new Set();
  for (const id of state.explicit) {
    if (excludedByBranch(id)) continue;
    active.add(id);
    if (TAGS[id]) {
      for (const childId of descendantIds(id)) {
        if (!excludedByBranch(childId)) active.add(childId);
      }
    }
  }
  return [...active];
}

function compile() {
  const items = [];
  const seen = new Set();
  for (const id of effectiveTagIds()) {
    const tag = tagById(id);
    const payload = tag?.payload || tag?.label;
    if (payload && !seen.has(payload.toLowerCase())) {
      seen.add(payload.toLowerCase());
      items.push(payload);
    }
  }
  $("#compiled-output").value = items.join(", ");
}

// ---- navigation + dive transition ------------------------------------------

function dive(id, source) {
  if (!tagById(id) || state.tagTransitioning) return;
  transitionTags(() => state.route.push(id), source, "forward");
}

function goBack() {
  if (!state.route.length || state.tagTransitioning) return;
  transitionTags(() => state.route.pop(), $("#current-tag") || $("#tag-back"), "back");
}

function transitionTags(updateRoute, source, direction) {
  if (state.tagTransitioning) return;
  const board = $("#tag-board");
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (reduced || !source) {
    updateRoute();
    renderTags();
    return;
  }
  const boardRect = board.getBoundingClientRect();
  const sourceRect = source.getBoundingClientRect();
  board.style.setProperty("--dive-x", `${sourceRect.left + sourceRect.width / 2 - boardRect.left}px`);
  board.style.setProperty("--dive-y", `${sourceRect.top + sourceRect.height / 2 - boardRect.top}px`);
  state.tagTransitioning = true;
  const outClass = direction === "back" ? "dive-back-out" : "dive-out";
  const inClass = direction === "back" ? "dive-back-in" : "dive-in";
  board.classList.remove("dive-in", "dive-back-in");
  board.classList.add(outClass);
  setTimeout(() => {
    updateRoute();
    renderTags();
    board.classList.remove(outClass);
    board.classList.add(inClass);
    setTimeout(() => {
      board.classList.remove(inClass);
      state.tagTransitioning = false;
    }, 280);
  }, 145);
}

// ---- rendering -------------------------------------------------------------

function tagButton(id, extra = "") {
  const tag = tagById(id);
  return `<button class="tag-button ${tagState(id)} ${extra}" data-tag="${esc(id)}">${esc(tag?.label || id)}</button>`;
}

// Single click toggles (after a delay), double-click dives. The timer keeps
// the toggle from firing on the first click of a double-click.
function wireTagButtons(container = document) {
  for (const button of container.querySelectorAll("[data-tag]")) {
    button.onclick = () => {
      clearTimeout(state.clickTimer);
      state.clickTimer = setTimeout(() => toggleTag(button.dataset.tag), 230);
    };
    button.ondblclick = (event) => {
      event.preventDefault();
      clearTimeout(state.clickTimer);
      dive(button.dataset.tag, button);
    };
  }
}

function renderTags() {
  const currentId = state.route.at(-1);
  const current = tagById(currentId);
  if (!currentId) {
    $("#tag-board").innerHTML = `<div class="tag-row tag-roots">${ROOT_IDS.map((id) => tagButton(id)).join("")}</div>`;
  } else if (!current?.groups?.length) {
    $("#tag-board").innerHTML = `
      <div class="current-wrap"><button class="current-tag" id="current-tag">${esc(current?.label || currentId)}</button></div>
      <div class="leaf-note">This word has no finer branches yet. Select it, pin another word, or go back.</div>`;
  } else {
    const [upper, lower] = current.groups;
    $("#tag-board").innerHTML = `
      <div class="tag-group-label">${esc(upper.label)}</div>
      <div class="tag-row">${upper.ids.map((id) => tagButton(id)).join("")}</div>
      <div class="current-wrap"><button class="current-tag" id="current-tag">${esc(current.label)}</button></div>
      <div class="tag-row">${lower.ids.map((id) => tagButton(id)).join("")}</div>
      <div class="tag-group-label">${esc(lower.label)}</div>`;
  }
  wireTagButtons($("#tag-board"));
  const center = $("#current-tag");
  if (center) center.onclick = goBack;
  $("#clear-tags").disabled = state.explicit.size === 0 && state.excluded.size === 0;
  renderPins();
}

function renderPins() {
  $("#pinned-row").innerHTML = state.pins.map((pin) =>
    `<button class="pin-tag ${tagState(pin.id) === "explicit" ? "on" : ""}" data-pin="${esc(pin.id)}" title="Double-click to open">${esc(pin.label)}</button>`
  ).join("");
  for (const button of document.querySelectorAll("[data-pin]")) {
    button.onclick = () => {
      clearTimeout(state.clickTimer);
      state.clickTimer = setTimeout(() => toggleTag(button.dataset.pin), 230);
    };
    button.ondblclick = (event) => {
      event.preventDefault();
      clearTimeout(state.clickTimer);
      dive(button.dataset.pin, button);
    };
  }
}

// ---- wiring ----------------------------------------------------------------

$("#tag-back").onclick = goBack;
$("#tag-start").onclick = () => { state.route = []; renderTags(); };
$("#clear-tags").onclick = () => {
  state.explicit.clear();
  state.excluded.clear();
  renderTags();
  compile();
};
$("#pin-form").onsubmit = (event) => {
  event.preventDefault();
  const label = $("#pin-input").value.trim();
  if (!label) return;
  const authored = findTag(label);
  const id = authored?.id || `pin-${label.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || Date.now()}`;
  if (!state.pins.some((pin) => pin.id === id)) {
    state.pins.push({ id, label: authored?.label || label, payload: authored?.payload || label });
    savePins();
  }
  $("#pin-input").value = "";
  renderPins();
};

renderTags();
compile();
```

## CSS

Accent variables: on the music desk these are `--music-deep` (filled state)
and `--music-mint` (tint). Define surface-local equivalents (`--board-deep`,
`--board-tint`) from the surface stylesheet's palette — ledger (light, GM) or
lamplight (dark, player) — and keep the state classes identical.

```css
.pin-form { display: grid; grid-template-columns: 1fr auto; gap: 0.45rem; margin: 1rem 0 0.5rem; }
.pinned-row { display: flex; gap: 0.35rem; flex-wrap: wrap; min-height: 1.8rem; }
.pin-tag { border-radius: 999px; padding: 0.2rem 0.65rem; font-size: 0.75rem; }
.pin-tag.on { background: var(--board-deep); border-color: var(--board-deep); color: var(--paper-raised); }

.tag-board {
  --dive-x: 50%; --dive-y: 50%;
  position: relative; isolation: isolate; overflow: hidden;
  margin: 0.9rem 0; min-height: 330px; padding: 0.75rem 0.25rem;
  display: flex; flex-direction: column; justify-content: center;
}
/* The swoosh ring that seeds the dive from the clicked bubble. */
.tag-board::after {
  content: ""; position: absolute; z-index: 8; left: var(--dive-x); top: var(--dive-y);
  width: 74px; height: 74px; border-radius: 50%; pointer-events: none; opacity: 0;
  background: conic-gradient(from 35deg, transparent 0 28%, color-mix(in srgb, var(--board-tint) 72%, transparent) 36%, color-mix(in srgb, var(--board-deep) 58%, transparent) 44%, transparent 52% 100%);
  -webkit-mask: radial-gradient(circle, transparent 55%, #000 58% 65%, transparent 68%);
  mask: radial-gradient(circle, transparent 55%, #000 58% 65%, transparent 68%);
  transform: translate(-50%, -50%) scale(0.28) rotate(-28deg);
}
.tag-board.dive-out::after { animation: tag-swoosh-forward 0.4s ease-out; }
.tag-board.dive-out > * { animation: tag-dive-away 0.145s ease-in both; }
.tag-board.dive-in > * { animation: tag-dive-arrive 0.26s cubic-bezier(0.2, 0.78, 0.25, 1) both; }
.tag-board.dive-back-out::after { animation: tag-swoosh-back 0.4s ease-out; }
.tag-board.dive-back-out > * { animation: tag-back-away 0.145s ease-in both; }
.tag-board.dive-back-in > * { animation: tag-back-arrive 0.26s cubic-bezier(0.2, 0.78, 0.25, 1) both; }

.tag-group-label {
  display: grid; grid-template-columns: minmax(24px, 1fr) auto minmax(24px, 1fr); gap: 0.65rem; align-items: center;
  text-align: center; color: var(--ink-faint); font-variant: small-caps; font-size: 0.72rem; letter-spacing: 0.08em;
}
.tag-group-label::before, .tag-group-label::after { content: ""; height: 1px; background: linear-gradient(90deg, transparent, var(--rule-strong)); }
.tag-group-label::after { background: linear-gradient(90deg, var(--rule-strong), transparent); }

.tag-row { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 0.55rem; margin: 0.35rem 0; }
.tag-roots { grid-template-columns: repeat(4, minmax(0, 1fr)); align-items: center; }
/* Centers a trailing odd row: written for 7 roots (rows of 4 then 3).
   Recompute the offset for your root count. */
.tag-roots .tag-button:nth-child(n+5) { translate: 50% 0; }

.tag-button, .current-tag {
  aspect-ratio: 1; width: 100%; min-width: 0; padding: 0.55rem; border-radius: 50%;
  background:
    radial-gradient(circle at 31% 24%, rgba(255,255,255,0.72), transparent 18%),
    rgba(255,255,255,0.16);
  color: var(--ink-soft); border: 1px solid color-mix(in srgb, var(--rule-strong) 82%, var(--board-tint));
  box-shadow: inset 0 0 0 1px rgba(255,255,255,0.45), 0 3px 9px rgba(46,40,32,0.07);
  font-size: clamp(0.68rem, 1.3cqw, 0.82rem); line-height: 1.1; overflow-wrap: anywhere;
  transition: translate 0.18s ease, scale 0.18s ease, background 0.18s ease, border-color 0.18s ease, box-shadow 0.18s ease, opacity 0.18s ease;
}
.tag-button:hover {
  translate: 0 -3px; scale: 1.025;
  border-color: var(--board-tint);
  box-shadow: inset 0 0 0 1px rgba(255,255,255,0.6), 0 8px 15px rgba(46,40,32,0.11);
}
.tag-button.explicit {
  color: var(--paper-raised);
  background: radial-gradient(circle at 31% 24%, rgba(255,255,255,0.24), transparent 18%), var(--board-deep);
  border-color: var(--board-tint);
}
.tag-button.inherited {
  background: radial-gradient(circle at 31% 24%, rgba(255,255,255,0.78), transparent 18%), color-mix(in srgb, var(--board-tint) 20%, transparent);
  border-color: var(--board-tint);
}
.tag-button.excluded { opacity: 0.4; text-decoration: line-through; }

.current-wrap { display: flex; justify-content: center; padding: 0.35rem 0; }
.current-tag {
  width: 84px; color: var(--ink-faint); border-style: dashed;
  animation: current-tag-breathe 4.8s ease-in-out infinite;
}
.leaf-note { text-align: center; color: var(--ink-faint); font-style: italic; padding: 2rem 1rem; }

@keyframes tag-swoosh-forward {
  0% { opacity: 0.38; transform: translate(-50%, -50%) scale(0.38) rotate(-18deg); }
  18% { opacity: 0.9; }
  100% { opacity: 0; transform: translate(-50%, -50%) scale(2.15) rotate(128deg); }
}
@keyframes tag-swoosh-back {
  0% { opacity: 0.38; transform: translate(-50%, -50%) scale(2.15) rotate(128deg); }
  18% { opacity: 0.9; }
  100% { opacity: 0; transform: translate(-50%, -50%) scale(0.38) rotate(-18deg); }
}
@keyframes tag-dive-away { to { opacity: 0; scale: 1.08; filter: blur(1.5px); } }
@keyframes tag-dive-arrive { from { opacity: 0; scale: 0.9; filter: blur(1.5px); } to { opacity: 1; scale: 1; filter: blur(0); } }
@keyframes tag-back-away { to { opacity: 0; scale: 0.92; filter: blur(1.5px); } }
@keyframes tag-back-arrive { from { opacity: 0; scale: 1.08; filter: blur(1.5px); } to { opacity: 1; scale: 1; filter: blur(0); } }
@keyframes current-tag-breathe { 0%, 100% { scale: 1; } 50% { scale: 1.035; } }

@media (prefers-reduced-motion: reduce) {
  .tag-board.dive-out::after, .tag-board.dive-out > *, .tag-board.dive-in > *,
  .tag-board.dive-back-out::after, .tag-board.dive-back-out > *, .tag-board.dive-back-in > *,
  .current-tag { animation: none; }
}
```
