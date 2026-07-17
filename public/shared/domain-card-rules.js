const ADDITIONAL_CARD_RULE = /\btake an additional domain card\b/i;
const SUBCLASS_TIERS = ["foundation", "specialization", "mastery"];

const boundedLevel = (value) => Number.isInteger(value)
  ? Math.max(1, Math.min(10, value))
  : 1;

const featuresAt = (subclass, tier) => Array.isArray(subclass?.[tier]) ? subclass[tier] : [];

function referenceSubclass(character, reference) {
  const subclasses = (reference?.classes || []).flatMap((entry) => entry.subclasses || []);
  const id = String(character?.subclass?.id || "");
  if (id) {
    const byId = subclasses.find((entry) => entry.id === id);
    if (byId) return byId;
  }
  const name = String(character?.subclass?.name || "").trim().toLowerCase();
  return name ? subclasses.find((entry) => String(entry.name || "").trim().toLowerCase() === name) || null : null;
}

function activeSubclassTiers(character) {
  const rank = { foundation: 1, specialization: 2, mastery: 3 };
  const declaredRank = rank[character?.subclass?.tier] || 1;
  return SUBCLASS_TIERS.filter((tier) => {
    if (tier === "foundation") return true;
    return declaredRank >= rank[tier] || (Array.isArray(character?.features?.[tier]) && character.features[tier].length > 0);
  });
}

function uniqueOwnedCardCount(character) {
  return new Set((character?.domainCards || []).map((card) => card?.id).filter(Boolean)).size;
}

export function accessibleDomainNames(character) {
  return [...new Set((character?.class?.domains || []).map((domain) => String(domain || "").toUpperCase()).filter(Boolean))];
}

export function domainCardEntitlement(character, reference) {
  const level = boundedLevel(character?.level);
  const base = level + 1;
  const subclass = referenceSubclass(character, reference);
  const subclassGrants = [];

  for (const tier of activeSubclassTiers(character)) {
    for (const feature of featuresAt(subclass, tier)) {
      if (!ADDITIONAL_CARD_RULE.test(String(feature?.text || ""))) continue;
      subclassGrants.push({ tier, name: String(feature.name || "Subclass feature") });
    }
  }

  const advancementGrants = Number.isInteger(character?.advancements?.additionalDomainCards)
    ? Math.max(0, Math.min(20, character.advancements.additionalDomainCards))
    : 0;
  const expected = base + subclassGrants.length + advancementGrants;
  const owned = uniqueOwnedCardCount(character);

  return {
    level,
    base,
    expected,
    owned,
    missing: Math.max(0, expected - owned),
    domains: accessibleDomainNames(character),
    subclassGrants,
    advancementGrants
  };
}

export function isEligibleDomainCard(character, card) {
  if (!card?.id || !Number.isInteger(card.level)) return false;
  const domains = new Set(accessibleDomainNames(character));
  return domains.has(String(card.domain || "").toUpperCase())
    && card.level <= boundedLevel(character?.level)
    && !(character?.domainCards || []).some((owned) => owned?.id === card.id);
}
