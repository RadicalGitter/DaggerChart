const FEATURE_KEYS = [
  "settlement", "folk", "chronicle", "journal", "character", "inventory", "rules",
  "notes", "dice", "messages", "feedback", "characterCreation", "music", "sessionPools"
];

const DEFAULTS = Object.freeze(Object.fromEntries(FEATURE_KEYS.map((key) => [key, true])));
let activeFeatures = { ...DEFAULTS };

export function normalizePlayerFeatures(value) {
  const source = value && typeof value === "object" && !Array.isArray(value) ? value : {};
  return Object.fromEntries(FEATURE_KEYS.map((key) => [key, source[key] !== false]));
}

function selectedPcId() {
  const route = location.pathname.match(/^\/character\/([^/]+)/);
  if (route) {
    try { return decodeURIComponent(route[1]); } catch { return route[1]; }
  }
  return localStorage.getItem("settlement-pc") || localStorage.getItem("settlement-journal-pc") || null;
}

export function playerFeaturesFor(data, pcId = selectedPcId()) {
  const identities = data?.identities || data?.party || [];
  const identity = pcId ? identities.find((pc) => pc.id === pcId) : null;
  const campaigns = Array.isArray(data?.campaigns) ? data.campaigns : (data?.campaigns?.campaigns || []);
  const campaignId = identity?.campaignId || data?.currentCampaignId || data?.campaigns?.currentId || null;
  const campaign = campaigns.find((entry) => entry.id === campaignId);
  return normalizePlayerFeatures(campaign?.playerFeatures || data?.playerFeatures);
}

export function setPlayerFeatureContext(data, pcId = selectedPcId()) {
  activeFeatures = playerFeaturesFor(data, pcId);
  window.dispatchEvent(new CustomEvent("settlement:player-features", { detail: { ...activeFeatures } }));
  return activeFeatures;
}

export function playerFeatureEnabled(key) {
  return activeFeatures[key] !== false;
}
