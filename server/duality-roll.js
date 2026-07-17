const DIE_MIN = 1;
const DIE_MAX = 12;
const MODIFIER_MIN = -20;
const MODIFIER_MAX = 20;

function boundedInteger(value, min, max, label) {
  if (!Number.isInteger(value) || value < min || value > max) {
    throw new Error(`${label} must be a whole number from ${min} to ${max}.`);
  }
  return value;
}

export function resolveDualityRoll({ hope, fear, modifier = 0 } = {}) {
  const hopeValue = boundedInteger(hope, DIE_MIN, DIE_MAX, "Hope");
  const fearValue = boundedInteger(fear, DIE_MIN, DIE_MAX, "Fear");
  const modifierValue = boundedInteger(modifier, MODIFIER_MIN, MODIFIER_MAX, "The modifier");
  const outcome = hopeValue === fearValue ? "critical" : hopeValue > fearValue ? "hope" : "fear";

  return {
    hope: hopeValue,
    fear: fearValue,
    modifier: modifierValue,
    total: hopeValue + fearValue + modifierValue,
    outcome
  };
}
