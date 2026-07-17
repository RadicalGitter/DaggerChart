// Audience views. The player/table view is built from an explicit whitelist —
// hidden fields never leave the server for that route (spec §8D).
// This is the seam that later grows into per-character clients and the
// board screen: each audience gets its own projection of the same state.
import { activeCampaigns, isActiveCampaign, state, seasonLabel } from "./state.js";
import { inventoryView } from "./inventory.js";
import { normalizePlayerFeatures, PLAYER_FEATURE_DEFINITIONS } from "./player-features.js";

const PLAYER_CONDITIONS = new Set(["hidden", "restrained", "vulnerable"]);
const conditionView = (p) => [...new Set(p.conditions || [])].filter((id) => PLAYER_CONDITIONS.has(id));
const isActivePc = (p) => p?.active !== false;
const activePcs = () => state.pcs.filter((pc) => isActivePc(pc) && isActiveCampaign(pc.campaignId));
const currentPcs = () => activePcs().filter((pc) => pc.campaignId === state.campaigns.currentId);
const publicCampaigns = () => activeCampaigns().map((campaign) => ({
  id: campaign.id,
  name: campaign.name,
  playerFeatures: normalizePlayerFeatures(campaign.playerFeatures)
}));
const numericView = (value, fallback = 0) => Number.isFinite(value) ? value : fallback;

// Personalization stored on the character (chosen in the creator). Kept behind
// a validated default so unknown or legacy-missing values never reach a client
// as-is: a PC from before this field simply reads as the canonical shell/pen.
const SHELL_IDS = new Set(["tome", "book", "table"]);
const PEN_IDS = new Set(["quill", "reed", "brush"]);
const shellOf = (p) => (SHELL_IDS.has(p.shell) ? p.shell : "table");
const penOf = (p) => (PEN_IDS.has(p.pen) ? p.pen : "quill");
const detailColor = (value, fallback) => /^#[0-9a-f]{6}$/i.test(String(value || "")) ? String(value).toLowerCase() : fallback;
const appearanceView = (p) => ({
  primaryColor: detailColor(p.appearance?.primaryColor, "#8b7653"),
  secondaryColor: detailColor(p.appearance?.secondaryColor, "#9fcdb7")
});

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
  campaignId: p.campaignId,
  name: p.name,
  player: p.player || "",
  portrait: p.portrait || null,
  shell: shellOf(p),
  appearance: appearanceView(p)
});

const messageView = (message) => ({
  id: message.id,
  from: message.from === "gm" ? "gm" : "player",
  text: String(message.text || ""),
  ts: message.ts,
  read: {
    gm: message.read?.gm === true,
    player: message.read?.player === true
  }
});

const messagesFor = (pcId) => state.messages
  .filter((message) => message.pcId === pcId)
  .sort((a, b) => String(a.ts || "").localeCompare(String(b.ts || "")) || String(a.id || "").localeCompare(String(b.id || "")))
  .map(messageView);

const unreadFor = (pcId, side) => state.messages.filter(
  (message) => message.pcId === pcId && message.read?.[side] !== true
).length;

export function playerMessagesView(pcId) {
  const pc = activePcs().find((candidate) => candidate.id === pcId);
  if (!pc) return null;
  return { pc: identityView(pc), messages: messagesFor(pcId) };
}

export function gmMessagesView() {
  const threads = state.pcs.map((pc) => ({
    pc: { ...identityView(pc), active: isActivePc(pc) },
    unread: unreadFor(pc.id, "gm"),
    messages: messagesFor(pc.id)
  }));
  return {
    totalUnread: threads.reduce((sum, thread) => sum + thread.unread, 0),
    threads
  };
}

const tableIdentityView = (p) => ({
  ...identityView(p),
  hope: Number.isInteger(p.hope) ? Math.max(0, p.hope) : 0,
  hopeMax: Number.isInteger(p.hopeMax) ? Math.max(0, p.hopeMax) : 6
});

// A character sheet is player-facing too. Keep it explicit rather than
// returning the stored PC object: future private character fields must not
// silently cross this boundary.
export function playerCharacterView(id) {
  const p = activePcs().find((pc) => pc.id === id);
  if (!p) return null;
  return {
    ...identityView(p),
    playerFeatures: normalizePlayerFeatures(state.campaigns.campaigns.find((campaign) => campaign.id === p.campaignId)?.playerFeatures),
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
  return activePcs().map(identityView);
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
    session: {
      fear: state.session.fear,
      showFearToPlayers: state.session.showFearToPlayers
    },
    campaigns: {
      currentId: state.campaigns.currentId,
      campaigns: state.campaigns.campaigns.map((campaign) => ({ ...campaign }))
    },
    playerFeatureDefinitions: PLAYER_FEATURE_DEFINITIONS
      .filter((feature) => feature.gmVisible !== false)
      .map(({ gmVisible: _gmVisible, ...feature }) => ({ ...feature })),
    unreadMessages: Object.fromEntries(state.pcs.map((pc) => [pc.id, unreadFor(pc.id, "gm")])),
    sessions: state.sessions
      .filter((session) => session.campaignId === state.campaigns.currentId)
      .map((session) => ({
        ...session,
        participants: [...(session.participants || [])],
        perspectives: (session.perspectives || []).map((perspective) => ({ ...perspective })),
        retelling: session.retelling ? { ...session.retelling } : null
      })),
    buildings,
    characters: state.characters,
    party: state.pcs.filter((pc) => pc.campaignId === state.campaigns.currentId).map((p) => ({
      id: p.id,
      campaignId: p.campaignId,
      name: p.name,
      player: p.player,
      portrait: p.portrait || null,
      portraitPrompt: p.portraitPrompt || "",
      appearance: appearanceView(p),
      active: isActivePc(p),
      level: p.level,
      class: p.class?.name,
      subclass: p.subclass?.name,
      ancestry: p.ancestry?.name,
      community: p.community?.name,
      conditions: conditionView(p),
      hp: numericView(p.hp),
      hpMax: numericView(p.hpMax),
      stress: numericView(p.stress),
      stressMax: numericView(p.stressMax),
      hope: numericView(p.hope),
      hopeMax: numericView(p.hopeMax, 6),
      evasion: numericView(p.evasion),
      armor: {
        name: p.armor?.name || "",
        score: numericView(p.armor?.score),
        marked: numericView(p.armorMarked)
      },
      thresholds: {
        major: numericView(p.thresholds?.major),
        severe: numericView(p.thresholds?.severe)
      },
      traits: Object.fromEntries(Object.entries(p.traits || {}).map(([name, value]) => [name, numericView(value)])),
      experiences: (p.experiences || []).map((experience) => ({
        name: experience.name || "",
        bonus: numericView(experience.bonus)
      })),
      papers: inventoryView(p, state.reference).filter((item) => item.kind === "paper")
    })),
    people: state.people,
    places: state.places,
    screen: state.screen.current,
    log: state.log.filter((entry) => entry.campaignId === state.campaigns.currentId)
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
    case "paper": {
      const item = state.pcs
        .flatMap((pc) => inventoryView(pc, state.reference))
        .find((candidate) => candidate.kind === "paper" && candidate.id === cur.refId);
      return item ? { type: "paper", ...item } : idle();
    }
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
  const activePcIds = new Set(activePcs().map((p) => p.id));
  const requestingPcId = activePcIds.has(pcId) ? pcId : null;
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
    (n) => n.scope === "group" || (requestingPcId && n.pcId === requestingPcId)
  );
  const requestingPc = requestingPcId ? activePcs().find((pc) => pc.id === requestingPcId) : null;
  const featureCampaignId = requestingPc?.campaignId || state.campaigns.currentId;
  const campaignSessions = requestingPc
    ? state.sessions.filter((session) => session.campaignId === requestingPc.campaignId)
    : [];
  const participantName = (session, participantId) =>
    state.pcs.find((pc) => pc.id === participantId)?.name
    || (session.perspectives || []).find((perspective) => perspective.pcId === participantId)?.author
    || "A companion";
  const sessionView = {
    open: campaignSessions
      .filter((session) => session.status !== "published" && (session.participants || []).includes(requestingPcId))
      .sort((a, b) => Number(b.number || 0) - Number(a.number || 0))
      .map((session) => ({
        id: session.id,
        number: session.number,
        date: session.date,
        seasonLabel: session.seasonLabel,
        status: session.status,
        canEdit: session.status === "gathering" || session.status === "failed",
        perspective: (session.perspectives || []).find((perspective) => perspective.pcId === requestingPcId)?.text || "",
        participants: (session.participants || []).map((participantId) => ({
          name: participantName(session, participantId),
          complete: (session.perspectives || []).some((perspective) => perspective.pcId === participantId && perspective.text)
        }))
      })),
    published: campaignSessions
      .filter((session) => session.status === "published" && session.retelling?.text)
      .sort((a, b) => Number(b.number || 0) - Number(a.number || 0))
      .map((session) => ({
        id: session.id,
        number: session.number,
        date: session.date,
        seasonLabel: session.seasonLabel,
        text: session.retelling.text,
        publishedAt: session.publishedAt || session.retelling.createdAt || null
      }))
  };
  return {
    seasonLabel: seasonLabel(),
    playerFeatures: normalizePlayerFeatures(state.campaigns.campaigns.find((campaign) => campaign.id === featureCampaignId)?.playerFeatures),
    unreadMessages: requestingPcId ? unreadFor(requestingPcId, "player") : 0,
    campaigns: publicCampaigns(),
    currentCampaignId: state.campaigns.currentId,
    identities: activePcs().map(identityView),
    party: currentPcs().map(identityView),
    people,
    places,
    notes,
    sessions: sessionView
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
    portrait: c.portrait || null
  }));
  const chronicle = state.log
    .filter((l) => l.published && l.campaignId === state.campaigns.currentId)
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
    playerFeatures: normalizePlayerFeatures(state.campaigns.campaigns.find((campaign) => campaign.id === state.campaigns.currentId)?.playerFeatures),
    fear: state.session.showFearToPlayers ? state.session.fear : null,
    campaigns: publicCampaigns(),
    currentCampaignId: state.campaigns.currentId,
    buildings,
    characters,
    chronicle,
    // Player-shell/login identity cards: public identity fields only. Shared
    // party resources stay current-campaign scoped; identity pickers can still
    // recognize a character from another active campaign.
    identities: activePcs().map(identityView),
    party: currentPcs().map(tableIdentityView)
  };
}
