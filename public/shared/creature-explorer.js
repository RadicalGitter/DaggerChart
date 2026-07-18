const FRONT_RANKS = new Set(["Minion", "Horde", "Standard", "Bruiser", "Solo"]);
const TACTICAL_RANKS = new Set(["Ranged", "Skulk", "Support", "Leader", "Social"]);

const esc = (value) => String(value ?? "").replace(/[&<>"']/g, (char) =>
  ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]));

export function creatureRoleBand(type) {
  if (FRONT_RANKS.has(type)) return "Ranks and force";
  if (TACTICAL_RANKS.has(type)) return "Tactics and command";
  return "Other roles";
}

export function filterCreatures(creatures, tier = "all", sourceId = "all") {
  const list = Array.isArray(creatures) ? creatures : [];
  return list.filter((creature) =>
    (tier === "all" || String(creature.tier) === String(tier)) &&
    (sourceId === "all" || String(creature.sourceId || "unknown") === String(sourceId)));
}

export function buildCreatureTaxonomy(creatures, tier = "all", sourceId = "all") {
  const fronts = new Map();
  for (const creature of filterCreatures(creatures, tier, sourceId)) {
    const frontName = String(creature.front || "Elsewhere");
    const roleName = String(creature.type || "Unclassified");
    if (!fronts.has(frontName)) fronts.set(frontName, { label: frontName, roles: new Map(), creatures: [] });
    const front = fronts.get(frontName);
    front.creatures.push(creature);
    if (!front.roles.has(roleName)) {
      front.roles.set(roleName, { label: roleName, band: creatureRoleBand(roleName), creatures: [] });
    }
    front.roles.get(roleName).creatures.push(creature);
  }

  return {
    tiers: [...new Set((Array.isArray(creatures) ? creatures : []).map((creature) => Number(creature.tier)).filter(Number.isFinite))].sort((a, b) => a - b),
    fronts: [...fronts.values()].map((front) => ({
      label: front.label,
      count: front.creatures.length,
      creatures: front.creatures,
      roles: [...front.roles.values()],
      groups: ["Ranks and force", "Tactics and command", "Other roles"]
        .map((label) => ({ label, roles: [...front.roles.values()].filter((role) => role.band === label) }))
        .filter((group) => group.roles.length)
    }))
  };
}

function matchesCreature(creature, query) {
  if (!query) return true;
  const featureText = (creature.features || []).map((feature) => `${feature.name || ""} ${feature.text || ""}`).join(" ");
  return [creature.name, creature.front, creature.type, creature.sourceId, creature.sourceName, creature.description, creature.motives, featureText]
    .join(" ").toLocaleLowerCase().includes(query);
}

export function createCreatureExplorer({ host, creatures = [], activeId = null, pointCost, onPreview, onAdd } = {}) {
  if (!host) throw new Error("A creature explorer requires a host element.");

  let source = Array.isArray(creatures) ? creatures : [];
  let selectedId = activeId;
  let tier = "all";
  let sourceId = "all";
  let query = "";
  let route = [];
  let transitioning = false;

  host.classList.add("creature-explorer");
  host.innerHTML = `
    <header class="ce-head">
      <div><span>Bestiary</span><strong>Creature ledger</strong></div>
      <div class="ce-head-actions">
        <button type="button" class="quiet" data-ce-back>Back</button>
        <button type="button" class="quiet" data-ce-start>Fronts</button>
      </div>
    </header>
    <div class="ce-filters">
      <input type="search" data-ce-search maxlength="80" autocomplete="off" placeholder="Find a creature" aria-label="Find a creature">
      <select data-ce-tier aria-label="Threat tier"></select>
      <select data-ce-source aria-label="Card source"></select>
    </div>
    <div class="ce-route" data-ce-route></div>
    <div class="ce-stage" data-ce-stage aria-live="polite"></div>`;

  const stage = host.querySelector("[data-ce-stage]");
  const search = host.querySelector("[data-ce-search]");
  const tierSelect = host.querySelector("[data-ce-tier]");
  const sourceSelect = host.querySelector("[data-ce-source]");

  function taxonomy() {
    return buildCreatureTaxonomy(source, tier, sourceId);
  }

  function currentFront(tree = taxonomy()) {
    return tree.fronts.find((front) => front.label === route[0]) || null;
  }

  function currentRole(tree = taxonomy()) {
    return currentFront(tree)?.roles.find((role) => role.label === route[1]) || null;
  }

  function validateRoute(tree) {
    if (route[0] && !currentFront(tree)) route = [];
    if (route[1] && !currentRole(tree)) route = route.slice(0, 1);
  }

  function transition(updateRoute, sourceElement, direction) {
    if (transitioning) return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduced || !sourceElement) {
      updateRoute();
      render();
      return;
    }
    const stageRect = stage.getBoundingClientRect();
    const sourceRect = sourceElement.getBoundingClientRect();
    stage.style.setProperty("--ce-dive-x", `${sourceRect.left + sourceRect.width / 2 - stageRect.left}px`);
    stage.style.setProperty("--ce-dive-y", `${sourceRect.top + sourceRect.height / 2 - stageRect.top}px`);
    transitioning = true;
    const outClass = direction === "back" ? "ce-back-out" : "ce-dive-out";
    const inClass = direction === "back" ? "ce-back-in" : "ce-dive-in";
    stage.classList.remove("ce-dive-in", "ce-back-in");
    stage.classList.add(outClass);
    setTimeout(() => {
      updateRoute();
      render();
      stage.classList.remove(outClass);
      stage.classList.add(inClass);
      setTimeout(() => {
        stage.classList.remove(inClass);
        transitioning = false;
        host.querySelector("[data-ce-back]").disabled = route.length === 0;
        host.querySelector("[data-ce-start]").disabled = route.length === 0;
      }, 240);
    }, 120);
  }

  function pointLabel(creature) {
    const value = typeof pointCost === "function" ? pointCost(creature) : null;
    return value ? ` · ${value}` : "";
  }

  function frontBubble(front) {
    return `<button type="button" class="ce-bubble ce-front" data-ce-front="${esc(front.label)}">
      <strong>${esc(front.label)}</strong><small>${front.count} ${front.count === 1 ? "entry" : "entries"}</small>
    </button>`;
  }

  function roleBubble(role) {
    return `<button type="button" class="ce-bubble ce-role" data-ce-role="${esc(role.label)}">
      <strong>${esc(role.label)}</strong><small>${role.creatures.length} ${role.creatures.length === 1 ? "entry" : "entries"}</small>
    </button>`;
  }

  function creatureBubble(creature) {
    return `<div class="ce-creature-wrap ${creature.id === selectedId ? "selected" : ""}">
      <button type="button" class="ce-bubble ce-creature" data-ce-creature="${esc(creature.id)}">
        <strong>${esc(creature.name)}</strong><small>Tier ${esc(creature.tier)} ${esc(creature.type)}${esc(pointLabel(creature))}</small>
      </button>
      <button type="button" class="ce-add" data-ce-add="${esc(creature.id)}" aria-label="Add ${esc(creature.name)} to the encounter" title="Add to the encounter">+</button>
    </div>`;
  }

  function searchResults() {
    const found = filterCreatures(source, tier, sourceId).filter((creature) => matchesCreature(creature, query));
    return found.length ? `<div class="ce-results">${found.map((creature) => `
      <div class="ce-result ${creature.id === selectedId ? "selected" : ""}">
        <button type="button" data-ce-creature="${esc(creature.id)}"><strong>${esc(creature.name)}</strong><small>${esc(creature.front)} · Tier ${esc(creature.tier)} ${esc(creature.type)}</small></button>
        <button type="button" class="ce-add" data-ce-add="${esc(creature.id)}" aria-label="Add ${esc(creature.name)} to the encounter" title="Add to the encounter">+</button>
      </div>`).join("")}</div>` : `<p class="ce-empty">No creature matches this entry.</p>`;
  }

  function wireStage() {
    for (const button of stage.querySelectorAll("[data-ce-front]")) {
      button.addEventListener("click", () => transition(() => { route = [button.dataset.ceFront]; }, button, "forward"));
    }
    for (const button of stage.querySelectorAll("[data-ce-role]")) {
      button.addEventListener("click", () => transition(() => { route = [route[0], button.dataset.ceRole]; }, button, "forward"));
    }
    for (const button of stage.querySelectorAll("[data-ce-creature]")) {
      button.addEventListener("click", () => {
        selectedId = button.dataset.ceCreature;
        onPreview?.(selectedId);
        render();
      });
    }
    for (const button of stage.querySelectorAll("[data-ce-add]")) {
      button.addEventListener("click", () => onAdd?.(button.dataset.ceAdd));
    }
    stage.querySelector("[data-ce-current]")?.addEventListener("click", goBack);
  }

  function render() {
    const tree = taxonomy();
    validateRoute(tree);
    tierSelect.innerHTML = `<option value="all">All tiers</option>${tree.tiers.map((value) => `<option value="${value}" ${String(tier) === String(value) ? "selected" : ""}>Tier ${value}</option>`).join("")}`;
    const sources = [...new Map(source.map((creature) => [creature.sourceId || "unknown", creature.sourceName || creature.sourceId || "Unattributed"])).entries()];
    sourceSelect.innerHTML = `<option value="all">All sources</option>${sources.map(([id, label]) => `<option value="${esc(id)}" ${sourceId === id ? "selected" : ""}>${esc(label)}</option>`).join("")}`;
    host.querySelector("[data-ce-back]").disabled = route.length === 0 || transitioning;
    host.querySelector("[data-ce-start]").disabled = route.length === 0 || transitioning;

    if (query) {
      host.querySelector("[data-ce-route]").textContent = `Search · ${filterCreatures(source, tier, sourceId).filter((creature) => matchesCreature(creature, query)).length} found`;
      stage.innerHTML = searchResults();
      wireStage();
      return;
    }

    const front = currentFront(tree);
    const role = currentRole(tree);
    host.querySelector("[data-ce-route]").textContent = route.length ? ["Fronts", ...route].join(" / ") : `Fronts · ${tree.fronts.length}`;

    if (!front) {
      stage.innerHTML = tree.fronts.length
        ? `<div class="ce-root-grid">${tree.fronts.map(frontBubble).join("")}</div>`
        : `<p class="ce-empty">No creatures are recorded at this tier.</p>`;
    } else if (!role) {
      stage.innerHTML = `${front.groups.map((group) => `
        <section class="ce-group"><h3>${esc(group.label)}</h3><div class="ce-role-row">${group.roles.map(roleBubble).join("")}</div></section>`).join("")}
        <div class="ce-current-wrap"><button type="button" class="ce-bubble ce-current" data-ce-current><strong>${esc(front.label)}</strong><small>${front.count} entries</small></button></div>`;
    } else {
      stage.innerHTML = `<section class="ce-group"><h3>${esc(role.label)}</h3><div class="ce-creature-grid">${role.creatures.map(creatureBubble).join("")}</div></section>
        <div class="ce-current-wrap"><button type="button" class="ce-bubble ce-current" data-ce-current><strong>${esc(role.label)}</strong><small>${esc(front.label)}</small></button></div>`;
    }
    wireStage();
  }

  function goBack() {
    if (!route.length || transitioning) return;
    transition(() => { route = route.slice(0, -1); }, stage.querySelector("[data-ce-current]") || host.querySelector("[data-ce-back]"), "back");
  }

  host.querySelector("[data-ce-back]").addEventListener("click", goBack);
  host.querySelector("[data-ce-start]").addEventListener("click", () => transition(() => { route = []; }, host.querySelector("[data-ce-start]"), "back"));
  search.addEventListener("input", () => { query = search.value.trim().toLocaleLowerCase(); render(); });
  tierSelect.addEventListener("change", () => { tier = tierSelect.value; render(); });
  sourceSelect.addEventListener("change", () => { sourceId = sourceSelect.value; render(); });

  render();

  return {
    update(nextCreatures, nextActiveId = null) {
      source = Array.isArray(nextCreatures) ? nextCreatures : [];
      selectedId = nextActiveId;
      render();
    },
    reset() {
      route = [];
      query = "";
      search.value = "";
      render();
    }
  };
}
