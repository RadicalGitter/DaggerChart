import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const source = fs.readFileSync(new URL("../public/shared/feedback.js", import.meta.url), "utf8");

test("feedback capture tolerates modern CSS and remains usable after a capture error", () => {
  assert.match(source, /onclone: sanitizeFeedbackClone/);
  assert.match(source, /html2canvas\(document\.body/);
  assert.match(source, /captured = createFallbackCapture\(\)/);
  assert.match(source, /overlay\.hidden = false/);
  assert.doesNotMatch(source, /\balert\s*\(/);
});

test("feedback tickets retain their annotated screenshot payload", () => {
  assert.match(source, /screenshot: canvas\.toDataURL\("image\/jpeg", 0\.78\)/);
  assert.match(source, /fetch\("\/api\/feedback"/);
});
