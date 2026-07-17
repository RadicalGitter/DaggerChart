export const DEFAULT_FAVORITE_COLOR = "#c96f72";

export const CLASS_COLORS = Object.freeze({
  core_class_bard: "#a94468",
  core_class_druid: "#4f774f",
  core_class_guardian: "#a65c35",
  core_class_ranger: "#617044",
  core_class_rogue: "#59435f",
  core_class_seraph: "#b18432",
  core_class_sorcerer: "#923f51",
  core_class_warrior: "#a44336",
  core_class_wizard: "#465a78"
});

export function classColor(classId) {
  return CLASS_COLORS[classId] || "#8b7653";
}

export function validDetailColor(value, fallback = DEFAULT_FAVORITE_COLOR) {
  return /^#[0-9a-f]{6}$/i.test(String(value || "")) ? String(value).toLowerCase() : fallback;
}
