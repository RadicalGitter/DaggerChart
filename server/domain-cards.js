import { domainCardEntitlement, isEligibleDomainCard } from "../public/shared/domain-card-rules.js";

const LOADOUT_MAX = 5;
const locationOf = (card) => card?.location === "vault" ? "vault" : "loadout";

export function claimOwedDomainCard(character, reference, cardId) {
  const entitlement = domainCardEntitlement(character, reference);
  if (entitlement.missing < 1) throw new Error("This character has no unclaimed domain cards.");

  const card = (reference?.domainCards || []).find((entry) => entry.id === cardId);
  if (!card) throw new Error("Choose a domain card from the reference.");
  if ((character.domainCards || []).some((entry) => entry?.id === card.id)) throw new Error("That domain card is already owned.");
  if (!isEligibleDomainCard(character, card)) {
    throw new Error("Choose a card at or below your level from one of your class domains.");
  }

  const cards = Array.isArray(character.domainCards) ? character.domainCards : [];
  const loadoutFull = cards.filter((entry) => locationOf(entry) === "loadout").length >= LOADOUT_MAX;
  const claimed = { ...card, location: loadoutFull ? "vault" : "loadout" };
  cards.push(claimed);
  character.domainCards = cards;
  return claimed;
}

export function updateOwnedDomainCards(character, incoming) {
  if (!Array.isArray(incoming)) throw new Error("Domain cards must be a list.");
  const existing = new Map((character.domainCards || []).filter((card) => card?.id).map((card) => [card.id, card]));
  const seen = new Set();
  return incoming.map((entry) => {
    const id = String(entry?.id || "");
    if (!id || seen.has(id)) throw new Error("Domain cards must be unique.");
    seen.add(id);
    const stored = existing.get(id);
    if (!stored) throw new Error("Use the domain-card choice to acquire a new card.");
    return { ...stored, location: locationOf(entry) };
  });
}
