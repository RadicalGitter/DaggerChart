// Audience views. The player/table view is built from an explicit whitelist —
// hidden fields never leave the server for that route (spec §8D).
// This is the seam that later grows into per-character clients and the
// board screen: each audience gets its own projection of the same state.
import { state, seasonLabel } from "./state.js";

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
      community: p.community?.name
    })),
    log: state.log
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
    backstory: c.backstory,
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
    chronicle
  };
}
