import { CLASS_CHOICE_DEFINITIONS } from "./class-choice-definitions.js";

const CURRENT = "keep-current";
const copy = (value) => structuredClone(value);
// Last explicit offer wins. A new offer need not delete earlier evidence.
const offerFor = (pc, document) => (document?.offers || []).filter((offer) => offer.pcId === pc?.id && offer.active !== false).at(-1);
const isResolved = (pc, offer) => pc.classChoice?.offerId === offer.id;
const baselineMatches = (pc, offer) => pc.class?.id === offer.expectedClassId
  && pc.subclass?.id === offer.expectedSubclassId && pc.level === offer.expectedLevel;
const adapterFor = (registry, id, version) => {
  const adapter = registry.get(`${id}@${version}`) || registry.get(id);
  return adapter?.definition.version === version ? adapter : null;
};
const adaptersFor = (offer, registry) => (offer.definitions || []).map((entry) => {
  const adapter = adapterFor(registry, entry.id, entry.version);
  if (!adapter) throw new Error("This class offer needs a GM review before it can be used.");
  return adapter;
});

export function characterClassChoiceView(pc, document, registry = CLASS_CHOICE_DEFINITIONS) {
  const adoption = [...(pc.classChoiceHistory || []), ...(pc.classChoice ? [pc.classChoice] : [])]
    .findLast((entry) => entry.selection?.definitionId === pc.class?.id);
  const adoptedAdapter = adoption ? adapterFor(registry, adoption.selection.definitionId, adoption.selection.definitionVersion) : null;
  const adoptedGuide = adoptedAdapter ? { status: "confirmed", definitions: [copy(adoptedAdapter.definition)] } : null;
  const offer = offerFor(pc, document);
  if (!offer || isResolved(pc, offer)) return adoptedGuide;
  const adapters = adaptersFor(offer, registry);
  if (!baselineMatches(pc, offer)) return adoptedGuide;
  return {
    status: "pending", offerId: offer.id, version: offer.version,
    current: { className: pc.class.name, subclassName: pc.subclass.name },
    definitions: adapters.map((entry) => copy(entry.definition)),
    recommendedTrait: offer.recommendedTrait || pc.subclass?.spellcastTrait || null
  };
}

// Pure candidate construction. The caller saves before replacing live state.
// Duplicated delivery cannot respec or reset another device's resources.
export function confirmCharacterClassChoice(pc, document, input, now = new Date().toISOString(), registry = CLASS_CHOICE_DEFINITIONS) {
  const offer = offerFor(pc, document);
  if (!offer) throw new Error("No class choice is available for this character.");
  if (input?.offerId !== offer.id || input?.version !== offer.version) throw new Error("This class offer has changed. Reload it before confirming.");
  if (input.confirmed !== true) throw new Error("Confirm your class choice before applying it.");
  const adapters = adaptersFor(offer, registry);
  const choiceId = String(input.choiceId || "");
  let adapter;
  let subclass;
  let selection;
  if (choiceId === CURRENT) selection = { choiceId };
  else {
    adapter = adapters.find((entry) => entry.definition.subclasses.some((candidate) => candidate.id === choiceId));
    subclass = adapter?.definition.subclasses.find((entry) => entry.id === choiceId);
    if (!adapter || !subclass) throw new Error("Choose an offered class and subclass.");
    selection = adapter.normalize(input, subclass);
  }
  if (isResolved(pc, offer)) {
    if (JSON.stringify(pc.classChoice.selection) !== JSON.stringify(selection)) throw new Error("This character's class choice has already been confirmed.");
    return pc;
  }
  if (!baselineMatches(pc, offer)) throw new Error("The character has changed. Ask Oscar to review the class offer.");
  const next = copy(pc);
  next.classChoice = {
    offerId: offer.id, version: offer.version, selection, confirmedAt: now,
    previous: { class: copy(pc.class), subclass: copy(pc.subclass), features: copy(pc.features || {}) }
  };
  next.classChoiceHistory = [...(pc.classChoiceHistory || []), copy(next.classChoice)];
  if (adapter) adapter.apply(next, selection, subclass);
  return next;
}
