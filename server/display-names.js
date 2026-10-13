// The SRD import title-cased every word ("Warden Of Renewal", "Book Of Ava");
// the printed cards keep short connecting words lower-case ("Warden of
// Renewal", "Lean on Me"). Display-only: stored data is never rewritten.
const MINOR = new Set(["a", "an", "and", "as", "at", "but", "by", "for", "in", "of", "on", "or", "the", "to", "with"]);

export function cardTitle(name) {
  const words = String(name ?? "").split(" ");
  return words.map((word, index) => {
    if (index === 0 || index === words.length - 1) return word;
    return MINOR.has(word.toLowerCase()) ? word.toLowerCase() : word;
  }).join(" ");
}

// Tidy the names players see in the in-memory reference (never saved back).
export function tidyReferenceNames(reference) {
  if (!reference) return reference;
  for (const klass of reference.classes || []) {
    for (const subclass of klass.subclasses || []) subclass.name = cardTitle(subclass.name);
  }
  for (const card of reference.domainCards || []) card.name = cardTitle(card.name);
  return reference;
}
