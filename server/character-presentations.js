import crypto from "node:crypto";

export const PRESENTATION_ROLES = Object.freeze({
  disguisePcId: "pc_1784314621189_vf1p",
  beastformPcId: "pc_1784314405624_lbzq"
});

export const DEFAULT_CHARACTER_PRESENTATIONS = Object.freeze({
  version: 1,
  roles: { ...PRESENTATION_ROLES },
  active: {},
  personas: {},
  beastforms: {}
});

const cleanText = (value, limit = 6000) => String(value || "").trim().slice(0, limit);
const cleanPortrait = (value) => {
  const portrait = String(value || "").trim();
  return portrait.startsWith("/generated/art/portrait/") || portrait.startsWith("/generated/art/presentation/") ? portrait : null;
};

export function normalizeCharacterPresentations(raw) {
  const source = raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {};
  return {
    version: 1,
    roles: { ...PRESENTATION_ROLES, ...(source.roles || {}) },
    active: source.active && typeof source.active === "object" ? source.active : {},
    personas: source.personas && typeof source.personas === "object" ? source.personas : {},
    beastforms: source.beastforms && typeof source.beastforms === "object" ? source.beastforms : {}
  };
}

export function presentationRole(document, pcId) {
  if (pcId === document.roles.disguisePcId) return "disguise";
  if (pcId === document.roles.beastformPcId) return "beastform";
  return null;
}

export function beastformTierForLevel(level) {
  const value = Math.max(1, Number(level) || 1);
  if (value >= 8) return 4;
  if (value >= 5) return 3;
  if (value >= 2) return 2;
  return 1;
}

function personaList(document, pcId) {
  if (!Array.isArray(document.personas[pcId])) document.personas[pcId] = [];
  return document.personas[pcId];
}

function beastformState(document, pcId) {
  if (!document.beastforms[pcId] || typeof document.beastforms[pcId] !== "object") {
    document.beastforms[pcId] = { customizations: {} };
  }
  if (!document.beastforms[pcId].customizations || typeof document.beastforms[pcId].customizations !== "object") {
    document.beastforms[pcId].customizations = {};
  }
  return document.beastforms[pcId];
}

export function presentationIdentity(pc, document, forms) {
  const active = document.active[pc.id];
  if (active?.kind === "persona" && presentationRole(document, pc.id) === "disguise") {
    const persona = personaList(document, pc.id).find((item) => item.id === active.refId);
    if (persona) return { name: persona.name, portrait: persona.portrait || pc.portrait || null, presentation: { kind: "persona" } };
  }
  if (active?.kind === "beastform" && presentationRole(document, pc.id) === "beastform") {
    const form = forms.find((item) => item.id === active.refId);
    const custom = beastformState(document, pc.id).customizations[active.refId] || {};
    if (form) return {
      name: custom.name || form.name,
      portrait: custom.portrait || pc.portrait || null,
      presentation: { kind: "beastform" }
    };
  }
  return { name: pc.name, portrait: pc.portrait || null, presentation: { kind: "canonical" } };
}

export function playerPresentationView(pc, document, forms) {
  const role = presentationRole(document, pc.id);
  if (!role) return null;
  const active = document.active[pc.id] || { kind: "canonical", refId: null };
  if (role === "disguise") {
    return { role, active, personas: personaList(document, pc.id).map((item) => ({ ...item })) };
  }
  const tier = beastformTierForLevel(pc.level);
  const customizations = beastformState(document, pc.id).customizations;
  return {
    role,
    active,
    tier,
    forms: forms.filter((form) => form.tier <= tier).map((form) => ({ ...form, customization: { ...(customizations[form.id] || {}) } }))
  };
}

export function upsertPersona(document, pcId, input) {
  if (presentationRole(document, pcId) !== "disguise") throw new Error("This character cannot keep disguises.");
  const list = personaList(document, pcId);
  const requestedId = cleanText(input?.id, 100);
  const existing = requestedId ? list.find((item) => item.id === requestedId) : null;
  const name = cleanText(input?.name, 80);
  if (!name) throw new Error("Give the persona a name.");
  const now = new Date().toISOString();
  const next = {
    id: existing?.id || `persona_${crypto.randomUUID()}`,
    name,
    description: cleanText(input?.description),
    prompt: cleanText(input?.prompt),
    portrait: cleanPortrait(input?.portrait) || existing?.portrait || null,
    createdAt: existing?.createdAt || now,
    updatedAt: now
  };
  if (existing) Object.assign(existing, next);
  else list.push(next);
  return next;
}

export function removePersona(document, pcId, personaId) {
  const list = personaList(document, pcId);
  const index = list.findIndex((item) => item.id === personaId);
  if (index === -1) throw new Error("No such persona.");
  list.splice(index, 1);
  if (document.active[pcId]?.refId === personaId) delete document.active[pcId];
}

export function customizeBeastform(document, pcId, form, input) {
  if (presentationRole(document, pcId) !== "beastform") throw new Error("This character cannot use Beastform.");
  const state = beastformState(document, pcId);
  const current = state.customizations[form.id] || {};
  const next = {
    name: cleanText(input?.name, 80) || current.name || "",
    prompt: cleanText(input?.prompt) || current.prompt || "",
    portrait: cleanPortrait(input?.portrait) || current.portrait || null,
    updatedAt: new Date().toISOString()
  };
  if (!next.name && !next.prompt && !next.portrait && !state.customizations[form.id]) return {};
  state.customizations[form.id] = next;
  return next;
}

export function activatePresentation(pc, document, forms, input) {
  const role = presentationRole(document, pc.id);
  const kind = String(input?.kind || "canonical");
  if (kind === "canonical") {
    delete document.active[pc.id];
    return { kind: "canonical", refId: null };
  }
  if (role === "disguise" && kind === "persona") {
    const persona = personaList(document, pc.id).find((item) => item.id === input.refId);
    if (!persona) throw new Error("No such persona.");
    return document.active[pc.id] = { kind, refId: persona.id, changedAt: new Date().toISOString() };
  }
  if (role === "beastform" && kind === "beastform") {
    const form = forms.find((item) => item.id === input.refId);
    if (!form || form.tier > beastformTierForLevel(pc.level)) throw new Error("That Beastform is not available at this tier.");
    if (form.requiresChoice) throw new Error("This advanced form needs a configuration before it can be assumed.");
    const method = input.method === "evolution" ? "evolution" : "stress";
    if (method === "evolution") {
      if ((pc.hope || 0) < 3) throw new Error("Evolution requires 3 Hope.");
      pc.hope -= 3;
    } else {
      if ((pc.stress || 0) >= (pc.stressMax || 0)) throw new Error("There is no open Stress slot for this transformation.");
      pc.stress += 1;
    }
    return document.active[pc.id] = {
      kind,
      refId: form.id,
      method,
      evolutionTrait: method === "evolution" ? cleanText(input.evolutionTrait, 20) : null,
      changedAt: new Date().toISOString()
    };
  }
  throw new Error("That presentation is not available to this character.");
}

export function applyBeastformSheet(view, document, forms, canonicalPc = view) {
  const active = document.active[view.id];
  if (active?.kind !== "beastform") return view;
  const form = forms.find((item) => item.id === active.refId);
  if (!form) return view;
  const custom = beastformState(document, view.id).customizations[form.id] || {};
  const traits = { ...view.traits };
  if (form.trait) traits[form.trait] = (Number(traits[form.trait]) || 0) + form.traitBonus;
  if (active.method === "evolution" && traits[active.evolutionTrait] !== undefined) traits[active.evolutionTrait] += 1;
  return {
    ...view,
    name: custom.name || form.name,
    portrait: custom.portrait || view.portrait,
    traits,
    evasion: (Number(view.evasion) || 0) + form.evasionBonus,
    weapons: { primary: { id: `beastform_${form.id}`, name: form.name, type: "Beastform", trait: form.attack.trait, range: form.attack.range, damage: form.attack.damage, burden: "", feature: "Use your Proficiency." }, secondary: null },
    activePresentation: {
      kind: "beastform",
      form: { ...form, customization: { ...custom } },
      method: active.method,
      evolutionTrait: active.evolutionTrait,
      canonical: {
        name: canonicalPc.name || view.canonicalName || view.name,
        portrait: canonicalPc.portrait || null,
        evasion: canonicalPc.evasion,
        traits: { ...(canonicalPc.traits || {}) }
      }
    }
  };
}

export function setGeneratedPresentationPortrait(document, pcId, refId, url) {
  if (presentationRole(document, pcId) === "disguise") {
    const persona = personaList(document, pcId).find((item) => item.id === refId);
    if (!persona) throw new Error("No such persona.");
    persona.portrait = cleanPortrait(url);
    persona.updatedAt = new Date().toISOString();
    return persona;
  }
  const state = beastformState(document, pcId);
  const current = state.customizations[refId] || {};
  state.customizations[refId] = { ...current, portrait: cleanPortrait(url), updatedAt: new Date().toISOString() };
  return state.customizations[refId];
}
