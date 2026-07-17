// Audience views. The player/table view is built from an explicit whitelist —
// hidden fields never leave the server for that route (spec §8D).
// This is the seam that later grows into per-character clients and the
// board screen: each audience gets its own projection of the same state.
import { state, seasonLabel } from "./state.js";
import { inventoryView } from "./inventory.js";

const PLAYER_CONDITIONS = new Set(["hidden", "restrained", "vulnerable"]);
const conditionView = (p) => [...new Set(p.conditions || [])].filter((id) => PLAYER_CONDITIONS.has(id));

// Personalization stored on the character (chosen in the creator). Kept behind
// a validated default so unknown or legacy-missing values never reach a client
// as-is: a PC from before this field simply reads as the canonical shell/pen.
const SHELL_IDS = new Set(["tome", "book", "table"]);
const PEN_IDS = new Set(["quill", "reed", "brush"]);
const shellOf = (p) => (SHELL_IDS.has(p.shell) ? p.shell : "table");
const penOf = (p) => (PEN_IDS.has(p.pen) ? p.pen : "quill");

const featureView = (feature) => feature ? {
  name: feature.name || "",
  text: feature.text || ""
} : null;

const weaponView = (weapon) => weapon ? {
  id: weapon.id || "",
  name: weapon.name || "",
  type: weapon.type || "",
  trait: weapon.trait || "",
  range: weapon.range || "",
  damage: weapon.damage || "",
  burden: weapon.burden || "",
  feature: weapon.feature || ""
} : null;

const identityView = (p) => ({
  id: p.id,
  name: p.name,
  player: p.player || "",
  portrait: p.portrait || null,
  shell: shellOf(p)
});

// A character sheet is player-facing too. Keep it explicit rather than
// returning the stored PC object: future private character fields must not
// silently cross this boundary.
export function playerCharacterView(id) {
  const p = state.pcs.find((pc) => pc.id === id);
  if (!p) return null;
  return {
    ...identityView(p),
    pen: penOf(p),
    pronouns: p.pronouns || "",
    conditions: conditionView(p),
    level: p.level,
    class: { id: p.class?.id || "", name: p.class?.name || "", domains: [...(p.class?.domains || [])] },
    subclass: {
      id: p.subclass?.id || "",
      name: p.subclass?.name || "",
      spellcastTrait: p.subclass?.spellcastTrait || null
    },
    ancestry: { id: p.ancestry?.id || "", name: p.ancestry?.name || "" },
    community: { id: p.community?.id || "", name: p.community?.name || "" },
    traits: Object.fromEntries(Object.entries(p.traits || {}).map(([name, value]) => [name, value])),
    evasion: p.evasion,
    hpMax: p.hpMax,
    hp: p.hp,
    stressMax: p.stressMax,
    stress: p.stress,
    hopeMax: p.hopeMax,
    hope: p.hope,
    armor: p.armor ? { name: p.armor.name || "", score: p.armor.score || 0, feature: p.armor.feature || "" } : null,
    armorMarked: p.armorMarked || 0,
    thresholds: { major: p.thresholds?.major || 0, severe: p.thresholds?.severe || 0 },
    weapons: {
      primary: weaponView(p.weapons?.primary),
      secondary: weaponView(p.weapons?.secondary)
    },
    inventory: inventoryView(p, state.reference),
    experiences: (p.experiences || []).map((e) => ({ name: e.name || "", bonus: e.bonus || 0 })),
    background: (p.background || []).map((entry) => ({ q: entry.q || "", a: entry.a || "" })),
    connections: (p.connections || []).map((entry) => ({ q: entry.q || "", note: entry.note || "" })),
    domainCards: (p.domainCards || []).map((card) => ({
      id: card.id,
      name: card.name || "",
      domain: card.domain || "",
      type: card.type || "",
      level: card.level,
      recallCost: card.recallCost,
      text: card.text || "",
      location: card.location || "loadout"
    })),
    features: {
      hopeFeature: featureView(p.features?.hopeFeature),
      classFeatures: (p.features?.classFeatures || []).map(featureView).filter(Boolean),
      foundation: (p.features?.foundation || []).map(featureView).filter(Boolean),
      ancestry: (p.features?.ancestry || []).map(featureView).filter(Boolean),
      community: (p.features?.community || []).map(featureView).filter(Boolean)
    }
  };
}

export function partyListView() {
  return state.pcs.map(identityView);
}

export function gmView() {
  const buildings = Object.values(state.settlement.buildings).map((b) => ({
    ...b,
    // Spoiler safety (§8A): the GM sees a count of discovered events,
    // never a browsable list of table contents.
    spent: undefined,
    spentCount: b.spent.length,
    totalEntries: 31
  }));
  return {
    settlement: {
      name: state.settlement.name,
      population: state.settlement.population,
      season: state.settlement.season,
      seasonLabel: seasonLabel(),
      chronicleNotes: state.settlement.chronicleNotes
    },
    resources: state.settlement.resources,
    buildings,
    characters: state.characters,
    party: state.pcs.map((p) => ({
      id: p.id,
      name: p.name,
      player: p.player,
      level: p.level,
      class: p.class?.name,
      subclass: p.subclass?.name,
      ancestry: p.ancestry?.name,
      community: p.community?.name,
      conditions: conditionView(p)
    })),
    people: state.people,
    places: state.places,
    screen: state.screen.current,
    log: state.log
  };
}

// The table screen: whatever the GM chose to project, resolved at read time
// through the same public whitelists as everything else. Even when the GM
// deliberately shows an unrevealed person, only public fields cross the wire.
export function screenView() {
  const cur = state.screen.current;
  const idle = () => ({
    type: "idle",
    name: state.settlement.name,
    seasonLabel: seasonLabel()
  });
  if (!cur) return idle();
  switch (cur.type) {
    case "image":
      return { type: "image", url: cur.url, caption: cur.caption || "" };
    case "text":
      return { type: "text", title: cur.title || "", body: cur.body || "" };
    case "stores":
      return {
        type: "stores",
        name: state.settlement.name,
        seasonLabel: seasonLabel(),
        population: state.settlement.population,
        resources: state.settlement.resources
      };
    case "buildings":
      return {
        type: "buildings",
        buildings: Object.values(state.settlement.buildings).map((b) => ({
          name: b.name,
          resource: b.resource,
          level: b.level,
          foreman: b.foremanId
            ? (state.characters.find((c) => c.id === b.foremanId)?.name ?? null)
            : null
        }))
      };
    case "folk": {
      const c = state.characters.find((x) => x.id === cur.refId);
      if (!c) return idle();
      return {
        type: "card",
        name: c.name,
        subtitle: c.role || "",
        description: c.description || "",
        portrait: c.portrait || null,
        pill: c.status !== "alive" ? c.status : ""
      };
    }
    case "person": {
      const p = state.people.find((x) => x.id === cur.refId);
      if (!p) return idle();
      const place = p.placeId ? state.places.find((x) => x.id === p.placeId) : null;
      return {
        type: "card",
        name: p.name,
        subtitle: [p.role, place && place.revealed ? place.name : null].filter(Boolean).join(" · "),
        description: p.description || "",
        portrait: p.portrait || null,
        pill: p.status !== "alive" ? p.status : ""
      };
    }
    case "place": {
      const p = state.places.find((x) => x.id === cur.refId);
      if (!p) return idle();
      return {
        type: "card",
        name: p.name,
        subtitle: p.kind || "",
        description: p.description || "",
        portrait: p.portrait || null,
        pill: "",
        wide: true
      };
    }
    default:
      return idle();
  }
}

// The journal's view of the world: only what the GM has revealed, and only
// the public face of it. Hidden notes and unrevealed entries stay server-side.
export function loreView(pcId) {
  const revealedPlaces = new Set(state.places.filter((p) => p.revealed).map((p) => p.id));
  const people = state.people
    .filter((p) => p.revealed)
    .map((p) => ({
      id: p.id,
      name: p.name,
      role: p.role || "",
      status: p.status,
      description: p.description || "",
      portrait: p.portrait || null,
      // A person standing in an unrevealed place must not point at it.
      placeId: p.placeId && revealedPlaces.has(p.placeId) ? p.placeId : null,
      items: (p.items || []).map((it) => ({ name: it.name, note: it.note || "" }))
    }));
  const places = state.places
    .filter((p) => p.revealed)
    .map((p) => ({
      id: p.id,
      name: p.name,
      kind: p.kind || "",
      description: p.description || "",
      portrait: p.portrait || null,
      home: !!p.fixed
    }));
  const notes = state.notes.filter(
    (n) => n.scope === "group" || (pcId && n.pcId === pcId)
  );
  return {
    seasonLabel: seasonLabel(),
    party: state.pcs.map(identityView),
    people,
    places,
    notes
  };
}

export function tableView() {
  const buildings = Object.values(state.settlement.buildings).map((b) => ({
    id: b.id,
    name: b.name,
    resource: b.resource,
    level: b.level,
    foreman: b.foremanId
      ? (state.characters.find((c) => c.id === b.foremanId)?.name ?? null)
      : null
  }));
  const characters = state.characters.map((c) => ({
    id: c.id,
    name: c.name,
    role: c.role,
    status: c.status,
    // Only the player-safe description crosses this boundary. GM-only truth
    // about a person lives in `hidden.notes` and must never be sent here.
    description: c.description || "",
    portrait: c.portrait || null,
    traits: c.publicTraits ? c.traits : null
  }));
  const chronicle = state.log
    .filter((l) => l.published)
    .map((l) => ({
      id: l.id,
      season: l.season,
      text: l.publishedText || l.summary || l.text || ""
    }));
  return {
    settlement: {
      name: state.settlement.name,
      population: state.settlement.population,
      seasonLabel: seasonLabel()
    },
    resources: state.settlement.resources,
    buildings,
    characters,
    chronicle,
    // Player-shell/login identity card: public identity fields only.
    party: state.pcs.map(identityView)
  };
}
