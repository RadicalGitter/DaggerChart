import crypto from "node:crypto";

export const SCENE_DIMENSIONS = Object.freeze({ width: 1536, height: 864, aspect: "16:9" });
export const SCENE_PROMPT_ENVELOPE = "tag-board-v1";

const ROOTS = [
  {
    id: "ancient-ruin",
    label: "Ancient ruin",
    payload: "an ancient ruin carrying visible layers of history",
    groups: [
      {
        label: "Form",
        tags: [
          ["crumbling-stone", "Crumbling stone", "weathered masonry, fractured arches, and fallen stone"],
          ["broken-halls", "Broken halls", "roofless halls and broken ceremonial spaces"],
          ["buried-chambers", "Buried chambers", "partly buried chambers emerging from earth and debris"]
        ]
      },
      {
        label: "Trace",
        tags: [
          ["overgrown", "Overgrown", "roots, moss, and patient vegetation reclaiming the site"],
          ["forgotten", "Forgotten", "a place left undisturbed for generations"],
          ["haunted", "Haunted", "an uneasy supernatural presence without visible monsters"]
        ]
      }
    ]
  },
  {
    id: "wild-sanctuary",
    label: "Wild sanctuary",
    payload: "an untamed natural refuge with a strong sense of place",
    groups: [
      {
        label: "Ground",
        tags: [
          ["old-forest", "Old forest", "an old-growth forest with layered trunks and a high canopy"],
          ["river-hollow", "River hollow", "a sheltered river hollow shaped by water and stone"],
          ["mossy-clearing", "Mossy clearing", "a soft moss-covered clearing enclosed by wilderness"]
        ]
      },
      {
        label: "Temper",
        tags: [
          ["hidden", "Hidden", "concealed from ordinary paths and distant sightlines"],
          ["serene", "Serene", "quiet, sheltered, and restorative"],
          ["sacred-wild", "Sacred", "naturally sacred without formal architecture"]
        ]
      }
    ]
  },
  {
    id: "fortified-hold",
    label: "Fortified hold",
    payload: "a practical medieval stronghold built to endure attack",
    groups: [
      {
        label: "Defences",
        tags: [
          ["curtain-walls", "Curtain walls", "high curtain walls with visible repairs and defensive walkways"],
          ["gatehouse", "Gatehouse", "a formidable working gatehouse controlling the approach"],
          ["watchtowers", "Watchtowers", "watchtowers commanding the surrounding ground"]
        ]
      },
      {
        label: "Character",
        tags: [
          ["garrisoned", "Garrisoned", "actively occupied and maintained by a modest garrison"],
          ["austere", "Austere", "severe, economical construction with little ornament"],
          ["defensible", "Defensible", "clear sightlines, choke points, and layered practical defence"]
        ]
      }
    ]
  },
  {
    id: "lived-in-settlement",
    label: "Lived-in settlement",
    payload: "a grounded fantasy settlement shaped by ordinary daily life",
    groups: [
      {
        label: "Places",
        tags: [
          ["market", "Market", "a practical open market with handmade stalls and local goods"],
          ["homes", "Homes", "closely gathered homes showing individual repairs and use"],
          ["workshops", "Workshops", "working craft spaces with tools, materials, and visible labour"]
        ]
      },
      {
        label: "Character",
        tags: [
          ["bustling", "Bustling", "busy with grounded everyday activity"],
          ["weathered", "Weathered", "worn by seasons, use, and repeated mending"],
          ["communal", "Communal", "shared spaces arranged around a close community"]
        ]
      }
    ]
  },
  {
    id: "sacred-site",
    label: "Sacred site",
    payload: "a restrained sacred place with ceremonial weight",
    groups: [
      {
        label: "Form",
        tags: [
          ["shrine", "Shrine", "an intimate handmade shrine shaped by repeated offerings"],
          ["temple", "Temple", "a formal temple with a legible processional layout"],
          ["ritual-circle", "Ritual circle", "a weathered ritual circle integrated into the ground"]
        ]
      },
      {
        label: "Presence",
        tags: [
          ["reverent", "Reverent", "quietly reverent rather than spectacular"],
          ["luminous", "Luminous", "soft natural or magical light gathering at the sacred centre"],
          ["silent", "Silent", "profound stillness and an absence of ordinary disturbance"]
        ]
      }
    ]
  },
  {
    id: "underworld",
    label: "Underworld",
    payload: "a subterranean place shaped by darkness, pressure, and stone",
    groups: [
      {
        label: "Form",
        tags: [
          ["cavern", "Cavern", "a broad natural cavern with believable geological structure"],
          ["undercrypt", "Undercrypt", "an old constructed crypt deep below inhabited ground"],
          ["deep-tunnels", "Deep tunnels", "branching deep tunnels with uncertain distance and direction"]
        ]
      },
      {
        label: "Presence",
        tags: [
          ["enclosed", "Enclosed", "close, enclosed, and physically oppressive"],
          ["damp", "Damp", "wet stone, mineral runoff, and cold humid air"],
          ["ominous", "Ominous", "a credible sense of danger without depicting an active attack"]
        ]
      }
    ]
  },
  {
    id: "otherworld",
    label: "Otherworld",
    payload: "an unmistakably otherworldly landscape that remains visually coherent",
    groups: [
      {
        label: "Form",
        tags: [
          ["impossible-geometry", "Impossible geometry", "architecture with subtle impossible geometry and recursive space"],
          ["floating-ground", "Floating ground", "separated masses of floating ground with believable weight"],
          ["endless-threshold", "Endless threshold", "repeating thresholds suggesting a space larger than its boundaries"]
        ]
      },
      {
        label: "Presence",
        tags: [
          ["otherworld-luminous", "Luminous", "strange clear light with no ordinary source"],
          ["warped", "Warped", "familiar materials subtly warped by unfamiliar physical laws"],
          ["uncanny", "Uncanny", "recognisable forms arranged with deliberate, unsettling wrongness"]
        ]
      }
    ]
  }
];

function flattenTaxonomy() {
  const tags = [];
  for (const root of ROOTS) {
    const groups = root.groups.map((group) => ({
      label: group.label,
      ids: group.tags.map(([id]) => id)
    }));
    tags.push({ id: root.id, label: root.label, payload: root.payload, parentId: null, groups });
    for (const group of root.groups) {
      for (const [id, label, payload] of group.tags) {
        tags.push({ id, label, payload, parentId: root.id, groups: [] });
      }
    }
  }
  return tags;
}

export const SCENE_ROOT_IDS = Object.freeze(ROOTS.map((root) => root.id));
export const SCENE_TAGS = Object.freeze(flattenTaxonomy().map((tag) => Object.freeze(tag)));

const TAGS_BY_ID = new Map(SCENE_TAGS.map((tag) => [tag.id, tag]));

function text(value, label, limit, required = false) {
  const clean = String(value ?? "").trim();
  if (required && !clean) throw new Error(`${label} is required.`);
  if (clean.length > limit) throw new Error(`${label} is too long.`);
  return clean;
}

function stringList(value, label, limit) {
  if (!Array.isArray(value)) throw new Error(`${label} must be a list.`);
  const clean = [...new Set(value.map((item) => String(item || "").trim()).filter(Boolean))];
  if (clean.length > limit) throw new Error(`${label} contains too many entries.`);
  return clean;
}

function scenePins(value) {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > 20) throw new Error("Scene pins must be a list of at most twenty entries.");
  const seen = new Set();
  return value.map((pin) => {
    const id = text(pin?.id, "A pin identifier", 80, true);
    if (!/^scene-pin-[a-z0-9-]+$/.test(id) || seen.has(id) || TAGS_BY_ID.has(id)) {
      throw new Error("Scene pins need unique local identifiers.");
    }
    seen.add(id);
    const label = text(pin?.label, "A pin label", 80, true);
    return { id, label, payload: text(pin?.payload || label, "A pin direction", 400, true) };
  });
}

function descendants(id) {
  const tag = TAGS_BY_ID.get(id);
  return (tag?.groups || []).flatMap((group) => group.ids.flatMap((childId) => [childId, ...descendants(childId)]));
}

export function effectiveSceneTagIds(selectedTagIds, excludedTagIds = []) {
  const excluded = new Set(excludedTagIds);
  const effective = new Set();
  const visit = (id, blocked = false) => {
    const nextBlocked = blocked || excluded.has(id);
    if (!nextBlocked) effective.add(id);
    for (const childId of descendants(id).filter((childId) => TAGS_BY_ID.get(childId)?.parentId === id)) {
      visit(childId, nextBlocked);
    }
  };
  for (const id of selectedTagIds) visit(id);
  return SCENE_TAGS.map((tag) => tag.id).filter((id) => effective.has(id));
}

export function compileSceneDirection(selectedTagIds, excludedTagIds = [], pins = []) {
  const authored = effectiveSceneTagIds(selectedTagIds.filter((id) => TAGS_BY_ID.has(id)), excludedTagIds)
    .map((id) => TAGS_BY_ID.get(id).payload);
  const pinsById = new Map(pins.map((pin) => [pin.id, pin]));
  const custom = selectedTagIds.map((id) => pinsById.get(id)?.payload).filter(Boolean);
  return [...authored, ...custom].join("; ");
}

export function assertUniquePlaceName(name, places, excludeId = null) {
  const clean = text(name, "A location name", 120, true);
  const key = clean.toLocaleLowerCase("en");
  if (places.some((place) => place.id !== excludeId && String(place.name || "").trim().toLocaleLowerCase("en") === key)) {
    throw new Error("A location with that name already exists.");
  }
  return clean;
}

export function sceneInput(body, places) {
  const placeId = text(body?.placeId, "A location", 120, true);
  const place = places.find((candidate) => candidate.id === placeId);
  if (!place) throw new Error("Choose an existing location.");
  const pins = scenePins(body?.pins);
  const pinIds = new Set(pins.map((pin) => pin.id));
  const selectedTagIds = stringList(body?.selectedTagIds ?? body?.tags ?? [], "Selected scene tags", 20);
  const excludedTagIds = stringList(body?.excludedTagIds ?? [], "Excluded scene tags", 40);
  if (selectedTagIds.some((id) => !TAGS_BY_ID.has(id) && !pinIds.has(id))) throw new Error("Choose known scene tags or pins.");
  if (excludedTagIds.some((id) => !TAGS_BY_ID.has(id))) throw new Error("Only authored scene tags can be excluded.");
  const compiledDirection = compileSceneDirection(selectedTagIds, excludedTagIds, pins);
  return {
    placeId,
    name: text(body.name, "An image name", 120, true),
    sublocation: text(body.sublocation, "The sub-location", 120),
    description: text(body.description, "The scene description", 6_000),
    negativePrompt: text(body.negativePrompt, "The negative prompt", 4_000),
    selectedTagIds,
    excludedTagIds,
    pins,
    tagDirection: text(body.tagDirection, "The compiled scene direction", 6_000) || compiledDirection,
    castWhenReady: body.castWhenReady === true,
    embellishPrompt: body.embellishPrompt !== false,
    place
  };
}

export function scenePrompt(input) {
  return [
    "Wide 16:9 environmental concept art for a tabletop fantasy campaign, composed for full-screen projection.",
    `Canonical location: ${input.place.name}.`,
    input.sublocation ? `Sub-location: ${input.sublocation}.` : "",
    `Scene title: ${input.name}.`,
    input.description,
    input.tagDirection ? `Visual direction: ${input.tagDirection}.` : "",
    "No typography, caption, border, interface, map labels, or visible text."
  ].filter(Boolean).join(" ");
}

export function sceneRecords(input, result, createdAt = new Date().toISOString()) {
  const urls = (Array.isArray(result?.urls) && result.urls.length ? result.urls : [result?.url])
    .map((url) => String(url || ""))
    .filter((url) => url.startsWith("/generated/art/scenic/"));
  if (!urls.length) throw new Error("The scenery workflow returned no usable image.");
  const batchId = `scene_batch_${crypto.randomUUID().slice(0, 12)}`;
  return urls.map((url, index) => ({
    id: `scene_${crypto.randomUUID().slice(0, 12)}`,
    batchId,
    placeId: input.placeId,
    sublocation: input.sublocation,
    name: input.name,
    description: input.description,
    promptEnvelope: SCENE_PROMPT_ENVELOPE,
    selectedTagIds: [...input.selectedTagIds],
    excludedTagIds: [...input.excludedTagIds],
    pins: input.pins.map((pin) => ({ ...pin })),
    tagDirection: input.tagDirection,
    prompt: scenePrompt(input),
    negativePrompt: input.negativePrompt,
    embellishPrompt: input.embellishPrompt,
    url,
    seed: Number.isSafeInteger(Number(result.seed)) ? Number(result.seed) : null,
    width: SCENE_DIMENSIONS.width,
    height: SCENE_DIMENSIONS.height,
    variant: index + 1,
    variantCount: urls.length,
    createdAt
  }));
}

export function sceneLibraryView(scene, removable = true) {
  return {
    id: scene.id,
    placeId: scene.placeId,
    sublocation: scene.sublocation || "",
    name: scene.name || "Untitled scene",
    description: scene.description || "",
    promptEnvelope: scene.promptEnvelope || null,
    selectedTagIds: Array.isArray(scene.selectedTagIds)
      ? [...scene.selectedTagIds]
      : Array.isArray(scene.tags) ? [...scene.tags] : [],
    excludedTagIds: Array.isArray(scene.excludedTagIds) ? [...scene.excludedTagIds] : [],
    pins: Array.isArray(scene.pins) ? scene.pins.map((pin) => ({ ...pin })) : [],
    tagDirection: scene.tagDirection || "",
    embellishPrompt: scene.embellishPrompt !== false,
    url: scene.url,
    width: Number(scene.width) || SCENE_DIMENSIONS.width,
    height: Number(scene.height) || SCENE_DIMENSIONS.height,
    variant: Number(scene.variant) || 1,
    variantCount: Number(scene.variantCount) || 1,
    createdAt: scene.createdAt || null,
    removable
  };
}
