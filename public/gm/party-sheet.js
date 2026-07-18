const esc = (value) => String(value ?? "")
  .replaceAll("&", "&amp;")
  .replaceAll("<", "&lt;")
  .replaceAll(">", "&gt;")
  .replaceAll('"', "&quot;");

const bonus = (value) => `${Number(value) >= 0 ? "+" : ""}${Number(value) || 0}`;

function vital(label, value, max = null) {
  const display = max == null ? value : `${value} / ${max}`;
  return `<div class="gm-sheet-vital"><span>${esc(label)}</span><strong>${esc(display)}</strong></div>`;
}

function empty(message) {
  return `<p class="gm-sheet-empty">${esc(message)}</p>`;
}

function featureRows(features) {
  const groups = [
    ["Hope", features?.hopeFeature ? [features.hopeFeature] : []],
    ["Class", features?.classFeatures || []],
    ["Foundation", features?.foundation || []],
    ["Ancestry", features?.ancestry || []],
    ["Community", features?.community || []]
  ].filter(([, rows]) => rows.length);
  if (!groups.length) return empty("No feature text recorded.");
  return groups.map(([label, rows]) => `<section class="gm-sheet-feature-group">
    <h4>${esc(label)}</h4>
    ${rows.map((row) => `<article><strong>${esc(row.name)}</strong><p>${esc(row.text)}</p></article>`).join("")}
  </section>`).join("");
}

function weaponRow(weapon, label) {
  if (!weapon) return `<div class="gm-sheet-weapon empty"><span>${esc(label)}</span><strong>Empty hand</strong></div>`;
  const facts = [weapon.trait, weapon.range, weapon.damage, weapon.burden].filter(Boolean);
  return `<article class="gm-sheet-weapon">
    <span>${esc(label)}</span><strong>${esc(weapon.name)}</strong>
    <div>${facts.map((fact) => `<em>${esc(fact)}</em>`).join("")}</div>
    ${weapon.feature ? `<p>${esc(weapon.feature)}</p>` : ""}
  </article>`;
}

function overview(pc) {
  const traits = Object.entries(pc.traits || {});
  const experiences = pc.experiences || [];
  return `<div class="gm-sheet-columns overview">
    <section class="gm-sheet-section gm-sheet-traits">
      <header><span>At a glance</span><h3>Traits</h3></header>
      <div class="gm-trait-array">${traits.map(([name, value]) => `<div><span>${esc(name)}</span><strong>${bonus(value)}</strong></div>`).join("")}</div>
    </section>
    <section class="gm-sheet-section">
      <header><span>What they know</span><h3>Experiences</h3></header>
      <div class="gm-experience-list">${experiences.length
        ? experiences.map((experience) => `<div><strong>${esc(experience.name)}</strong><span>${bonus(experience.bonus)}</span></div>`).join("")
        : empty("No experiences recorded.")}</div>
    </section>
    <section class="gm-sheet-section gm-sheet-wide">
      <header><span>Identity</span><h3>Place in the party</h3></header>
      <dl class="gm-sheet-facts">
        <div><dt>Player</dt><dd>${esc(pc.player || "Unassigned")}</dd></div>
        <div><dt>Pronouns</dt><dd>${esc(pc.pronouns || "Not recorded")}</dd></div>
        <div><dt>Subclass</dt><dd>${esc(pc.subclass || "Not recorded")}</dd></div>
        <div><dt>Community</dt><dd>${esc(pc.community || "Not recorded")}</dd></div>
        <div><dt>Spellcast</dt><dd>${esc(pc.spellcastTrait || "None")}</dd></div>
        <div><dt>Domains</dt><dd>${esc((pc.classDomains || []).join(" · ") || "None")}</dd></div>
      </dl>
    </section>
  </div>`;
}

function combat(pc) {
  return `<div class="gm-sheet-columns combat">
    <section class="gm-sheet-section gm-sheet-wide">
      <header><span>Readied</span><h3>Arms and armor</h3></header>
      <div class="gm-weapon-grid">
        ${weaponRow(pc.weapons?.primary, "Main hand")}
        ${weaponRow(pc.weapons?.secondary, "Off hand")}
        <article class="gm-sheet-armor"><span>Armor</span><strong>${esc(pc.armor?.name || "Unarmored")}</strong>
          <div>${vital("Slots", pc.armor?.marked || 0, pc.armor?.score || 0)}${vital("Major", pc.thresholds?.major || 0)}${vital("Severe", pc.thresholds?.severe || 0)}</div>
          ${pc.armor?.feature ? `<p>${esc(pc.armor.feature)}</p>` : ""}
        </article>
      </div>
    </section>
    <section class="gm-sheet-section gm-sheet-wide">
      <header><span>Rules carried by the character</span><h3>Features</h3></header>
      <div class="gm-sheet-features">${featureRows(pc.features)}</div>
    </section>
  </div>`;
}

function inventory(pc) {
  const items = (pc.inventory || []).filter((item) => item.kind !== "paper");
  const papers = (pc.inventory || []).filter((item) => item.kind === "paper");
  const list = (rows) => rows.length ? rows.map((item) => `<article class="gm-inventory-row">
    <div><strong>${esc(item.name || item.title || "Untitled")}</strong><span>${esc(item.kind || "item")}</span></div>
    ${Number(item.quantity) > 1 ? `<b>×${esc(item.quantity)}</b>` : ""}
    ${item.description || item.text ? `<p>${esc(item.description || item.text)}</p>` : ""}
  </article>`).join("") : empty("Nothing recorded here.");
  return `<div class="gm-sheet-columns inventory">
    <section class="gm-sheet-section"><header><span>Carried</span><h3>Inventory</h3></header>${list(items)}</section>
    <section class="gm-sheet-section"><header><span>Letters and contracts</span><h3>Papers</h3></header>${list(papers)}</section>
  </div>`;
}

function domains(pc) {
  const cards = pc.domainCards || [];
  const loadout = cards.filter((card) => card.location !== "vault");
  const vault = cards.filter((card) => card.location === "vault");
  const cardRows = (rows) => rows.length ? rows.map((card) => `<article class="gm-domain-card">
    <header><span>${esc(card.domain)} · Level ${esc(card.level)}</span><strong>${esc(card.name)}</strong></header>
    <p>${esc(card.text)}</p><footer>${esc(card.type)}${Number.isFinite(card.recallCost) ? ` · Recall ${esc(card.recallCost)}` : ""}</footer>
  </article>`).join("") : empty("No cards in this section.");
  const entitlement = pc.domainCardEntitlement || {};
  return `<div class="gm-sheet-columns domains">
    <section class="gm-sheet-section"><header><span>Ready now</span><h3>Loadout · ${loadout.length}</h3></header>${cardRows(loadout)}</section>
    <section class="gm-sheet-section"><header><span>Held in reserve</span><h3>Vault · ${vault.length}</h3></header>${cardRows(vault)}</section>
    <p class="gm-domain-entitlement">Expected cards: <strong>${esc(entitlement.expected ?? entitlement.total ?? cards.length)}</strong>. Recorded: <strong>${cards.length}</strong>.</p>
  </div>`;
}

function story(pc) {
  const background = (pc.background || []).filter((entry) => entry.q || entry.a);
  const connections = (pc.connections || []).filter((entry) => entry.q || entry.note);
  return `<div class="gm-sheet-columns story">
    <section class="gm-sheet-section"><header><span>Remembered history</span><h3>Background</h3></header>${background.length
      ? background.map((entry) => `<article class="gm-story-entry"><strong>${esc(entry.q)}</strong><p>${esc(entry.a)}</p></article>`).join("")
      : empty("No background written yet.")}</section>
    <section class="gm-sheet-section"><header><span>Bonds</span><h3>Connections</h3></header>${connections.length
      ? connections.map((entry) => `<article class="gm-story-entry"><strong>${esc(entry.q)}</strong><p>${esc(entry.note)}</p></article>`).join("")
      : empty("No connections recorded yet.")}</section>
  </div>`;
}

const TAB_RENDERERS = { overview, combat, inventory, domains, story };

export function createGmPartySheet(root) {
  let current = null;
  let activeTab = "overview";

  function render() {
    if (!current) {
      root.innerHTML = `<div class="gm-party-sheet-placeholder">Choose a character card to open their sheet here.</div>`;
      return;
    }
    const primary = current.appearance?.primaryColor || "#765947";
    const secondary = current.appearance?.secondaryColor || "#9fcdb7";
    const portrait = current.portrait
      ? `<img src="${esc(current.portrait)}" alt="">`
      : `<span>${esc((current.name || "?").slice(0, 1))}</span>`;
    root.innerHTML = `<article class="gm-party-sheet" style="--sheet-primary:${esc(primary)};--sheet-secondary:${esc(secondary)}">
      <header class="gm-party-sheet-hero">
        <div class="gm-sheet-portrait">${portrait}</div>
        <div class="gm-sheet-title"><span>Level ${esc(current.level)} ${esc(current.ancestry || "")}</span><h2>${esc(current.name)}</h2><p>${esc([current.class, current.subclass].filter(Boolean).join(" · "))}</p></div>
        <div class="gm-sheet-vital-band">
          ${vital("HP", current.hp, current.hpMax)}${vital("Stress", current.stress, current.stressMax)}${vital("Hope", current.hope, current.hopeMax)}${vital("Evasion", current.evasion)}
        </div>
      </header>
      <nav class="gm-party-sheet-tabs" aria-label="Character sheet sections">${Object.keys(TAB_RENDERERS).map((tab) => `<button type="button" data-sheet-tab="${tab}" aria-selected="${tab === activeTab}">${tab[0].toUpperCase()}${tab.slice(1)}</button>`).join("")}</nav>
      <div class="gm-party-sheet-body">${TAB_RENDERERS[activeTab](current)}</div>
    </article>`;
  }

  root.addEventListener("click", (event) => {
    const button = event.target.closest("[data-sheet-tab]");
    if (!button || !root.contains(button)) return;
    activeTab = button.dataset.sheetTab;
    render();
  });

  return {
    setCharacter(character) {
      current = character || null;
      render();
    }
  };
}
