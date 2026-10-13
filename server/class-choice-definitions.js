import { INVENTOR, INVENTOR_ID, INVENTOR_TRAITS, INVENTOR_VERSION } from "./inventor-definition.js";
const sheetFeature = (feature) => ({
  id: feature.id, name: feature.name, text: feature.sheetText?.en || feature.text,
  sv: { name: feature.sv.name, text: feature.sheetText?.sv || feature.sv.text }
});

// Definitions own validation/migration. The reusable offer engine never guesses
// how domains, gear, advancements or resources should migrate.
const inventorAdapter = {
  definition: INVENTOR,
  normalize(input, subclass) {
    if (!INVENTOR_TRAITS.includes(input.trait)) throw new Error("Choose your main trait.");
    const materials = input.familiarMaterials;
    if (!Array.isArray(materials) || materials.length !== 2
      || materials.some((value) => typeof value !== "string" || !value.trim() || value.trim().length > 80)) {
      throw new Error("Name two specific familiar materials, up to 80 characters each.");
    }
    const familiarMaterials = materials.map((value) => value.trim());
    if (familiarMaterials[0].toLocaleLowerCase("sv") === familiarMaterials[1].toLocaleLowerCase("sv")) throw new Error("Choose two different familiar materials.");
    return { choiceId: subclass.id, definitionId: INVENTOR_ID, definitionVersion: INVENTOR_VERSION, trait: input.trait, familiarMaterials };
  },
  apply(next, selection, subclass) {
    next.class = { id: INVENTOR_ID, name: INVENTOR.name, svName: INVENTOR.svName, domains: [...INVENTOR.domains] };
    next.subclass = { id: subclass.id, name: subclass.name, svName: subclass.svName, spellcastTrait: selection.trait, tier: "foundation" };
    next.features = {
      ...next.features,
      hopeFeature: sheetFeature(INVENTOR.hopeFeature), classFeatures: INVENTOR.classFeatures.map(sheetFeature),
      foundation: structuredClone(subclass.foundation), specialization: [], mastery: []
    };
    next.inventor = { version: INVENTOR_VERSION, familiarMaterials: [...selection.familiarMaterials] };
    // Same 9/7 chassis and domains as Seraph: retain actual Evasion, HP,
    // thresholds, gear modifiers, marked resources, cards and inventory.
    // Later tiers require real advancement choices.
  }
};

// Register future definitions here, never in the public reference catalog.
export const CLASS_CHOICE_DEFINITIONS = new Map([[`${INVENTOR_ID}@${INVENTOR_VERSION}`, inventorAdapter]]);

export function privateClassIdentity(classId, subclassId, registry = CLASS_CHOICE_DEFINITIONS) {
  return String(classId || "").startsWith("homebrew_") || String(subclassId || "").startsWith("homebrew_")
    || [...registry.values()].some(({ definition }) => definition.id === classId || definition.subclasses.some((entry) => entry.id === subclassId));
}

export function inventorSheetView(pc) {
  if (pc.class?.id !== INVENTOR_ID) return null;
  return {
    version: INVENTOR_VERSION, trait: pc.subclass?.spellcastTrait || null,
    familiarMaterials: (pc.inventor?.familiarMaterials || []).filter((value) => typeof value === "string"),
    guideAvailable: true
  };
}
