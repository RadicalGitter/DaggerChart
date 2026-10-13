// An edit remains a proposal until Keep. This state is serializable in drafts.
export function stagePortrait(model, result, referenceImageUrl = "", originalUrl = "") {
  if (referenceImageUrl) {
    model.portraitEditPending = {
      url: result.url, seed: result.seed,
      originalUrl: originalUrl || model.portraitOriginal || referenceImageUrl
    };
  } else {
    model.portrait = result.url;
    model.portraitSeed = result.seed;
    model.portraitOriginal = result.url;
    model.portraitReferenceUrl = result.url;
    model.portraitEditPending = null;
  }
}

export function keepPortraitEdit(model) {
  const pending = model.portraitEditPending;
  if (!pending) return;
  model.portrait = pending.url;
  model.portraitSeed = pending.seed;
  model.portraitOriginal = pending.originalUrl;
  model.portraitReferenceUrl = pending.url;
  model.portraitEditPending = null;
}

export function discardPortraitEdit(model) {
  model.portraitEditPending = null;
}

export function restoreOriginalPortrait(model) {
  if (!model.portraitOriginal || model.portraitEditPending) return;
  model.portrait = model.portraitOriginal;
  model.portraitReferenceUrl = model.portraitOriginal;
  model.portraitSeed = model.portraitAttempts?.find((attempt) => attempt.url === model.portraitOriginal)?.seed ?? null;
}
