const esc = (value) => String(value ?? "").replace(/[&<>"']/g, (char) => (
  { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]
));

export function folkPortraitCardHtml(person, { mode = "reveal", selected = false } = {}) {
  const name = String(person?.name || "Unnamed folk");
  const gone = person?.status && person.status !== "alive";
  const portrait = person?.portrait
    ? `<img src="${esc(person.portrait)}" alt="" loading="lazy" draggable="false">`
    : `<span aria-hidden="true">${esc(name.slice(0, 1).toUpperCase() || "?")}</span>`;
  const description = String(person?.description || "").trim();
  return `<article class="folk-card-shell${selected ? " is-selected" : ""}${gone ? " is-gone" : ""}" data-folk-shell="${esc(person.id)}">
    <button type="button" class="folk-portrait-card" data-folk-card="${esc(person.id)}" data-folk-mode="${mode}" aria-label="${esc(name)}" aria-expanded="false">
      <span class="folk-card-art">${portrait}</span>
      ${gone ? `<span class="folk-card-status">${esc(person.status)}</span>` : ""}
      <span class="folk-card-banner">${esc(name)}</span>
      ${person?.role ? `<span class="folk-card-role">${esc(person.role)}</span>` : ""}
    </button>
    ${mode === "reveal" && description ? `<div class="folk-card-reveal" hidden><p>${esc(description)}</p></div>` : ""}
  </article>`;
}

export function folkPortraitGridHtml(people, options = {}) {
  return `<div class="folk-portrait-grid">${(people || []).map((person) => folkPortraitCardHtml(person, {
    ...options,
    selected: options.selectedId === person.id
  })).join("")}</div>`;
}

export function wireFolkPortraitCards(root = document, { onSelect } = {}) {
  for (const card of root.querySelectorAll("[data-folk-card]")) {
    const shell = card.closest("[data-folk-shell]");
    card.onclick = () => {
      if (card.dataset.folkMode === "select") {
        onSelect?.(card.dataset.folkCard, card, shell);
        return;
      }
      const reveal = shell?.querySelector(".folk-card-reveal");
      if (!reveal) return;
      const opening = reveal.hidden;
      reveal.hidden = !opening;
      card.setAttribute("aria-expanded", String(opening));
    };
    card.onpointermove = (event) => {
      if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
      const rect = card.getBoundingClientRect();
      const x = Math.max(0, Math.min(1, (event.clientX - rect.left) / Math.max(1, rect.width)));
      const y = Math.max(0, Math.min(1, (event.clientY - rect.top) / Math.max(1, rect.height)));
      shell.style.setProperty("--folk-tilt-x", `${((.5 - y) * 7).toFixed(2)}deg`);
      shell.style.setProperty("--folk-tilt-y", `${((x - .5) * 9).toFixed(2)}deg`);
      shell.style.setProperty("--folk-light-x", `${Math.round(x * 100)}%`);
      shell.style.setProperty("--folk-light-y", `${Math.round(y * 100)}%`);
    };
    card.onpointerleave = () => {
      shell.style.setProperty("--folk-tilt-x", "0deg");
      shell.style.setProperty("--folk-tilt-y", "0deg");
      shell.style.setProperty("--folk-light-x", "50%");
      shell.style.setProperty("--folk-light-y", "30%");
    };
  }
}
