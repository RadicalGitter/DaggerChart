// Typed PC inventory. Stored strings remain readable and are migrated only
// when that inventory is changed, so opening an old sheet never rewrites data.

const uid = () => `item_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;

export const consumables = (reference) => reference?.consumables || [];
export const consumableById = (reference, id) => consumables(reference).find((item) => item.id === id) || null;

const splitLegacy = (value) => {
  const match = String(value).match(/^(.+?)\s*\((.+)\)$/);
  return { name: (match ? match[1] : value).trim(), description: match ? match[2].trim() : "" };
};

function normalizedItem(item, index, reference) {
  if (typeof item === "string") {
    const legacy = splitLegacy(item);
    const catalog = consumables(reference).find((entry) => entry.name.toLowerCase() === legacy.name.toLowerCase());
    return catalog
      ? { id: uid(), kind: "consumable", catalogId: catalog.id, quantity: 1, notes: legacy.description }
      : { id: uid(), kind: "mundane", name: legacy.name, description: legacy.description, quantity: 1 };
  }
  if (item?.kind === "paper") {
    const paperType = item.paperType === "covenant" ? "covenant" : "note";
    return {
      id: item.id || uid(),
      kind: "paper",
      paperType,
      name: String(item.name || (paperType === "covenant" ? "Signed covenant" : "Untitled note")),
      body: String(item.body || ""),
      author: String(item.author || ""),
      createdAt: String(item.createdAt || ""),
      ...(paperType === "covenant" ? {
        signedName: String(item.signedName || ""),
        signedAt: String(item.signedAt || ""),
        covenantVersion: Math.max(1, Number.parseInt(item.covenantVersion, 10) || 1)
      } : {}),
      quantity: 1
    };
  }
  return {
    id: item?.id || uid(),
    kind: item?.kind === "consumable" ? "consumable" : "mundane",
    ...(item?.catalogId ? { catalogId: item.catalogId } : {}),
    ...(item?.name ? { name: String(item.name) } : {}),
    ...(item?.description ? { description: String(item.description) } : {}),
    ...(item?.notes ? { notes: String(item.notes) } : {}),
    quantity: Math.max(1, Number.parseInt(item?.quantity, 10) || 1)
  };
}

export function normalizeInventory(pc, reference) {
  pc.inventory = (pc.inventory || []).map((item, index) => normalizedItem(item, index, reference));
  return pc.inventory;
}

export function inventoryItemView(item, index, reference) {
  if (typeof item === "string") {
    const legacy = splitLegacy(item);
    const catalog = consumables(reference).find((entry) => entry.name.toLowerCase() === legacy.name.toLowerCase());
    return catalog
      ? { id: `legacy_${index}`, kind: "consumable", catalogId: catalog.id, name: catalog.name, description: catalog.description, descriptionSv: catalog.descriptionSv || "", icon: catalog.icon, reaction: catalog.reaction, notes: legacy.description, quantity: 1 }
      : { id: `legacy_${index}`, kind: "mundane", name: legacy.name, description: legacy.description, notes: "", quantity: 1 };
  }
  if (item.kind === "paper") {
    const paperType = item.paperType === "covenant" ? "covenant" : "note";
    return {
      id: item.id || `legacy_${index}`,
      kind: "paper",
      paperType,
      name: item.name || (paperType === "covenant" ? "Signed covenant" : "Untitled note"),
      body: item.body || "",
      author: item.author || "",
      createdAt: item.createdAt || "",
      signedName: paperType === "covenant" ? (item.signedName || "") : "",
      signedAt: paperType === "covenant" ? (item.signedAt || "") : "",
      covenantVersion: paperType === "covenant" ? Math.max(1, Number.parseInt(item.covenantVersion, 10) || 1) : null,
      quantity: 1
    };
  }
  const catalog = item.catalogId ? consumableById(reference, item.catalogId) : null;
  return {
    id: item.id || `legacy_${index}`,
    kind: catalog ? "consumable" : (item.kind === "consumable" ? "consumable" : "mundane"),
    catalogId: catalog?.id || null,
    name: catalog?.name || item.name || "Unnamed item",
    description: catalog?.description || item.description || "",
    descriptionSv: catalog?.descriptionSv || "",
    icon: catalog?.icon || (item.kind === "consumable" ? "satchel" : null),
    reaction: catalog?.reaction || null,
    notes: item.notes || "",
    quantity: Math.max(1, Number.parseInt(item.quantity, 10) || 1)
  };
}

export const inventoryView = (pc, reference) => (pc.inventory || []).map((item, index) => inventoryItemView(item, index, reference));

export function inventoryEntry(pc, requestedId, reference) {
  let index = -1;
  const legacy = /^legacy_(\d+)$/.exec(requestedId);
  if (legacy) index = Number(legacy[1]);
  else index = (pc.inventory || []).findIndex((item) => typeof item === "object" && item.id === requestedId);
  if (index < 0 || index >= (pc.inventory || []).length) throw new Error("No such inventory item.");
  normalizeInventory(pc, reference);
  return { index, item: pc.inventory[index] };
}

export function addInventoryItem(pc, body, reference) {
  normalizeInventory(pc, reference);
  const kind = body.kind === "paper" ? "paper" : (body.kind === "consumable" ? "consumable" : "mundane");
  const name = String(body.name || "").trim();
  if (!name) throw new Error("An item name is required.");
  if (kind === "paper") {
    const paperType = body.paperType === "covenant" ? "covenant" : "note";
    const text = String(body.body || "").trim();
    if (paperType === "note" && !text) throw new Error("Write something on the paper first.");
    const item = {
      id: uid(),
      kind: "paper",
      paperType,
      name,
      body: text,
      author: String(body.author || pc.name || "").trim(),
      createdAt: String(body.createdAt || new Date().toISOString()),
      ...(paperType === "covenant" ? {
        signedName: String(body.signedName || pc.name || "").trim(),
        signedAt: String(body.signedAt || new Date().toISOString()),
        covenantVersion: Math.max(1, Number.parseInt(body.covenantVersion, 10) || 1)
      } : {}),
      quantity: 1
    };
    pc.inventory.push(item);
    return item;
  }
  const max = kind === "consumable" ? 5 : 99;
  const quantity = Number.parseInt(body.quantity, 10) || 1;
  if (quantity < 1 || quantity > max) throw new Error(`Quantity must be between 1 and ${max}.`);
  const item = { id: uid(), kind, name, description: String(body.description || "").trim(), quantity };
  pc.inventory.push(item);
  return item;
}

export function updateInventoryItem(pc, requestedId, body, reference) {
  const { item } = inventoryEntry(pc, requestedId, reference);
  if (item.kind === "paper") {
    if (item.paperType === "covenant") throw new Error("The signed covenant cannot be altered.");
    const name = String(body.name || "").trim();
    const text = String(body.body || "").trim();
    if (!name) throw new Error("A title is required.");
    if (!text) throw new Error("Write something on the paper first.");
    item.name = name;
    item.body = text;
    item.quantity = 1;
    return item;
  }
  const catalog = item.catalogId ? consumableById(reference, item.catalogId) : null;
  const max = (catalog || item.kind === "consumable") ? 5 : 99;
  const quantity = Number.parseInt(body.quantity, 10) || 1;
  if (quantity < 1 || quantity > max) throw new Error(`Quantity must be between 1 and ${max}.`);
  item.quantity = quantity;
  if (catalog) {
    item.notes = String(body.notes || "").trim();
  } else {
    const name = String(body.name || "").trim();
    if (!name) throw new Error("An item name is required.");
    item.kind = body.kind === "consumable" ? "consumable" : "mundane";
    item.name = name;
    item.description = String(body.description || "").trim();
  }
  return item;
}

export function grantConsumable(pc, catalogId, quantity, reference) {
  const catalog = consumableById(reference, catalogId);
  if (!catalog) throw new Error("No such consumable.");
  normalizeInventory(pc, reference);
  const amount = Number.parseInt(quantity, 10) || 1;
  if (amount < 1 || amount > 5) throw new Error("Quantity must be between 1 and 5.");
  const existing = pc.inventory.find((item) => item.catalogId === catalogId);
  if (existing) {
    if (existing.quantity + amount > 5) throw new Error("A character can hold at most five of one consumable.");
    existing.quantity += amount;
    return existing;
  }
  const item = { id: uid(), kind: "consumable", catalogId, quantity: amount, notes: "" };
  pc.inventory.push(item);
  return item;
}

const maxFor = (pc, target) => ({ hp: pc.hpMax, stress: pc.stressMax, hope: pc.hopeMax, armorMarked: pc.armor?.score || 0 })[target] || 0;

function change(pc, target, mode, amount, changes) {
  const before = Number(pc[target]) || 0;
  const max = maxFor(pc, target);
  const after = mode === "clear" || mode === "spend"
    ? Math.max(0, before - amount)
    : Math.min(max, before + amount);
  pc[target] = after;
  changes.push({ target, mode, before, after, amount: Math.abs(after - before) });
}

function die(body, sides) {
  const result = Number.parseInt(body.roll, 10);
  if (!Number.isInteger(result) || result < 1 || result > sides) throw new Error(`Enter a d${sides} result between 1 and ${sides}.`);
  return result;
}

function applyReaction(pc, reaction, body) {
  const changes = [];
  let roll = null;
  let note = null;
  if (!reaction) return { changes, roll, note };
  if (reaction.kind === "clear") {
    roll = die(body, reaction.die);
    change(pc, reaction.target, "clear", roll + (reaction.bonus || 0), changes);
  } else if (reaction.kind === "choose-clear") {
    if (!reaction.targets.includes(body.choice)) throw new Error("Choose what to clear.");
    roll = die(body, reaction.die);
    change(pc, body.choice, "clear", roll, changes);
  } else if (reaction.kind === "gain") {
    change(pc, reaction.target, "gain", reaction.amount, changes);
  } else if (reaction.kind === "adjust") {
    for (const entry of reaction.changes) change(pc, entry.target, entry.mode, entry.amount, changes);
  } else if (reaction.kind === "spend-clear") {
    const spend = Number.parseInt(body.spend, 10);
    const available = Math.min(Number(pc[reaction.spend]) || 0, Number(pc[reaction.target]) || 0);
    if (!Number.isInteger(spend) || spend < 1 || spend > available) throw new Error(`Choose between 1 and ${available}.`);
    change(pc, reaction.spend, "spend", spend, changes);
    change(pc, reaction.target, "clear", spend, changes);
  } else if (reaction.kind === "sun-tree") {
    roll = die(body, reaction.die);
    if (roll >= 5) change(pc, "hp", "clear", 2, changes);
    else if (roll >= 2) change(pc, "stress", "clear", 3, changes);
    else note = "scar";
  } else if (reaction.kind === "feast") {
    roll = die(body, reaction.die);
    change(pc, "hp", "clear", pc.hp || 0, changes);
    change(pc, "stress", "clear", pc.stress || 0, changes);
    change(pc, "hope", "gain", roll, changes);
  }
  return { changes, roll, note };
}

export function useInventoryItem(pc, requestedId, body, reference) {
  const { index, item } = inventoryEntry(pc, requestedId, reference);
  const catalog = item.catalogId ? consumableById(reference, item.catalogId) : null;
  if (!catalog && item.kind !== "consumable") throw new Error("This item is not consumable.");
  const effect = applyReaction(pc, catalog?.reaction || null, body || {});
  item.quantity -= 1;
  effect.remaining = Math.max(0, item.quantity);
  effect.catalogId = catalog?.id || null;
  if (item.quantity <= 0) pc.inventory.splice(index, 1);
  return effect;
}
