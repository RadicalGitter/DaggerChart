const esc = (value) => String(value ?? "").replace(/[&<>"']/g, (c) =>
  ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const paragraphs = (value) => String(value || "").split(/\n\n+/).filter(Boolean)
  .map((text) => `<p>${esc(text)}</p>`).join("");
const meta = (adventure) => [
  adventure.partySize ? `${adventure.partySize} players` : "",
  adventure.level ? `Level ${adventure.level}` : "",
  adventure.status || "Prepared"
].filter(Boolean).map((text) => `<span>${esc(text)}</span>`).join("");
const entries = (rows, render) => (rows || []).map(render).join("") || `<p class="muted">None prepared yet.</p>`;
const section = (id, title, body, wide = false) => `<section class="adventure-field${wide ? " adventure-wide" : ""}" id="adv-${id}">
  <h3>${esc(title)}</h3>${body}</section>`;
const brief = (entry) => `<article class="adventure-entry"><h4>${esc(entry.title)}</h4>${paragraphs(entry.body)}</article>`;

export function createAdventureDesk(root, { api, project }) {
  let revision = 0;
  let catalogue = null;

  async function open(id) {
    const request = ++revision;
    root.innerHTML = `<p class="muted">Opening adventures…</p>`;
    try {
      const list = await api("/api/adventures");
      if (request !== revision) return;
      catalogue = list.adventures || [];
      if (!id) return renderList();
      const adventure = await api(`/api/adventures/${encodeURIComponent(id)}`);
      if (request !== revision) return;
      renderAdventure(adventure);
    } catch (error) {
      if (request !== revision) return;
      root.innerHTML = `<h2>Adventures</h2><p role="alert">${esc(error.message)}</p><a href="#adventures">Return to the adventure list</a>`;
    }
  }

  function renderList() {
    root.innerHTML = `<header class="adventure-heading"><span class="smallcaps">The expedition shelf</span>
      <h2>Adventures</h2><p class="muted">Prepared journeys, people and places to keep at hand during play.</p></header>
      <div class="adventure-catalogue">${entries(catalogue, (adventure) => `<a class="adventure-list-card" href="#adventures/${encodeURIComponent(adventure.id)}">
        <div class="adventure-meta">${meta(adventure)}</div><h3>${esc(adventure.name)}</h3><p>${esc(adventure.summary)}</p>
        <span class="adventure-open">Open adventure <span aria-hidden="true">↗</span></span></a>`)}</div>`;
  }

  function renderAdventure(adventure) {
    const jumps = [
      ["overview", "Overview"], ["hook", "Opening hook"], ["characters", "Characters"],
      ["rumours", "Rumours"], ["encounters", "Encounters"], ["places", "Places"],
      ["map", "Map"], ["scenes", "Scene sequence"], ["outcomes", "Outcomes"], ["notes", "Running notes"]
    ];
    root.innerHTML = `<header class="adventure-heading">
      <a class="adventure-back" href="#adventures">← All adventures</a><div class="adventure-meta">${meta(adventure)}</div>
      <h2>${esc(adventure.name)}</h2><p>${esc(adventure.summary)}</p><p class="muted">${esc(adventure.duration)}</p></header>
      <div class="adventure-workspace"><aside class="adventure-index" aria-label="Adventure sections">
        <span class="smallcaps">At hand</span>${jumps.map(([id, label]) => `<button type="button" data-adventure-jump="${id}">${label}</button>`).join("")}
      </aside><div class="adventure-fields">
      ${section("overview", "Overview", paragraphs(adventure.overview), true)}
      ${section("hook", "Opening hook", `<h4>${esc(adventure.hook?.title || "A reason to leave")}</h4>
        <blockquote class="adventure-handout">${esc(adventure.hook?.text || "")}</blockquote>
        <button type="button" class="quiet" data-copy-hook>Copy the note</button><span class="adventure-copy-status muted" role="status"></span>
        <details><summary>Running the hook</summary>${paragraphs(adventure.hook?.notes)}</details>
        <div class="adventure-opening">${entries(adventure.openingScenes, brief)}</div>`, true)}
      ${section("characters", "New notable characters", entries(adventure.characters, (person) => `<article class="adventure-entry adventure-person">
        ${person.portrait ? `<img loading="lazy" src="${esc(person.portrait)}" alt="${esc(person.name)}">` : ""}
        <h4>${esc(person.name)}</h4><span class="muted">${esc(person.role)}</span>${paragraphs(person.body)}
        <p><b>Wants:</b> ${esc(person.motivation)}</p><p><b>At the table:</b> ${esc(person.cue)}</p>
        ${person.folkId ? `<a href="#folk/${encodeURIComponent(person.folkId)}">Open in Folk ↗</a>` : ""}</article>`))}
      ${section("rumours", "Rumours", entries(adventure.rumours, (rumour) => `<article class="adventure-entry">
        <blockquote>${esc(rumour.text)}</blockquote><p class="muted">${esc(rumour.source)} · ${esc(rumour.reliability)}</p>
        <details><summary>What is behind it</summary>${paragraphs(rumour.notes)}</details></article>`))}
      ${section("encounters", "Potential encounters", entries(adventure.encounters, (encounter) => `<article class="adventure-entry">
        <h4>${esc(encounter.name)}</h4>${paragraphs(encounter.setup)}<p><b>Objective:</b> ${esc(encounter.objective)}</p>
        <p><b>Approaches:</b> ${esc(encounter.approaches)}</p>${paragraphs(encounter.notes)}
        ${encounter.presetId ? `<a class="adventure-action-link" href="/board/?tool=encounter&amp;preset=${encodeURIComponent(encounter.presetId)}" target="_blank" rel="noopener">Open encounter preview ↗</a>` : `<span class="muted">Social or discovery scene</span>`}</article>`))}
      ${section("places", "Significant places", entries(adventure.places, (place) => `<article class="adventure-entry">
        <h4>${esc(place.name)}</h4>${paragraphs(place.description)}<p><b>To discover:</b> ${esc(place.discoveries)}</p>
        <details><summary>Private notes</summary>${paragraphs(place.notes)}</details></article>`))}
      ${section("map", "Map", adventure.mapAvailable ? `<figure class="adventure-map">
        <a href="/api/adventures/${encodeURIComponent(adventure.id)}/map" target="_blank" rel="noopener" aria-label="Open full map">
          <img src="/api/adventures/${encodeURIComponent(adventure.id)}/map" alt="${esc(adventure.map.alt || "Adventure map")}" loading="lazy"></a>
        <figcaption>${esc(adventure.map.caption)}</figcaption></figure><div class="adventure-map-actions">
        <button type="button" data-project-map>Show at the table</button><a href="/api/adventures/${encodeURIComponent(adventure.id)}/map" target="_blank" rel="noopener">Open full map ↗</a></div>
        <p class="muted">${esc(adventure.map.notes)}</p>` : `<p class="muted">No map prepared yet.</p>`, true)}
      ${section("scenes", "Scene sequence", entries(adventure.scenes, brief), true)}
      ${section("outcomes", "Possible outcomes", entries(adventure.outcomes, brief))}
      ${section("notes", "Running notes", entries(adventure.runningNotes, brief))}
      ${section("follow-ups", "Threads for later", `<ul>${(adventure.followUps || []).map((text) => `<li>${esc(text)}</li>`).join("")}</ul>`, true)}
      </div></div>`;

    for (const button of root.querySelectorAll("[data-adventure-jump]")) {
      button.addEventListener("click", () => root.querySelector(`#adv-${button.dataset.adventureJump}`).scrollIntoView({
        behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "start"
      }));
    }
    root.querySelector("[data-copy-hook]")?.addEventListener("click", async () => {
      const status = root.querySelector(".adventure-copy-status");
      try { await navigator.clipboard.writeText(adventure.hook?.text || ""); status.textContent = "Note copied."; }
      catch { status.textContent = "Select the note above to copy it."; }
    });
    root.querySelector("[data-project-map]")?.addEventListener("click", async (event) => {
      const button = event.currentTarget;
      button.disabled = true;
      try { await project({ type: "adventure-map", refId: adventure.id }); }
      finally { button.disabled = false; }
    });
  }

  return { open };
}
