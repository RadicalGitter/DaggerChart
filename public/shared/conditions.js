// Standard Daggerheart Conditions and original, code-native symbols.
// Names remain the English game terms in every locale; explanatory copy lives
// in i18n.js so the player-facing rules text can be translated.
export const CONDITIONS = [
  { id: "hidden", name: "Hidden" },
  { id: "restrained", name: "Restrained" },
  { id: "vulnerable", name: "Vulnerable" }
];

export const CONDITION_IDS = CONDITIONS.map(({ id }) => id);

export function conditionIcon(id) {
  const paths = {
    hidden: `
      <path d="M3.2 12s3.2-5.2 8.8-5.2c2 0 3.8.7 5.3 1.7"/>
      <path d="M20.8 12s-3.2 5.2-8.8 5.2c-2 0-3.8-.7-5.3-1.7"/>
      <path d="M4 4l16 16"/><path d="M9.8 9.8a3.1 3.1 0 004.4 4.4"/>`,
    restrained: `
      <path d="M9.6 8.2L8.2 6.8a3.4 3.4 0 00-4.8 4.8l3 3a3.4 3.4 0 004.8 0l1-1"/>
      <path d="M14.4 15.8l1.4 1.4a3.4 3.4 0 004.8-4.8l-3-3a3.4 3.4 0 00-4.8 0l-1 1"/>
      <path d="M8.8 15.2l6.4-6.4"/>`,
    vulnerable: `
      <path d="M12 2.8l7 2.7v5.3c0 4.5-2.8 8.2-7 10.4-4.2-2.2-7-5.9-7-10.4V5.5z"/>
      <path d="M12.8 3.4l-2.1 6.2 3 2.1-3.1 3.3 1.4 6.2"/>`
  };
  return `<svg class="condition-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">${paths[id] || ""}</svg>`;
}
