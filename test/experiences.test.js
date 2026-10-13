import test from "node:test";
import assert from "node:assert/strict";
import { requiresGm } from "../server/access.js";
import {
  EXPERIENCE_NAME_LIMIT,
  MAX_EXPERIENCES,
  describeExperiences,
  normalizeExperienceName,
  setExperiences
} from "../server/experiences.js";

test("experience names are trimmed, tidied and bounded", () => {
  assert.equal(normalizeExperienceName("  Raised   by wolves "), "Raised by wolves");
  assert.throws(() => normalizeExperienceName(""), /needs a name/);
  assert.throws(() => normalizeExperienceName("   "), /needs a name/);
  assert.throws(() => normalizeExperienceName(42), /needs a name/);
  assert.throws(() => normalizeExperienceName("x".repeat(EXPERIENCE_NAME_LIMIT + 1)), /at most/);
  assert.equal(normalizeExperienceName("line\nbreak"), "line break");
  assert.throws(() => normalizeExperienceName("bell\u0007ring"), /control characters/);
});

test("a character with none records exactly two at +2 without approval", () => {
  const pc = { name: "Test", experiences: [] };
  const result = setExperiences(pc, { experiences: [{ name: "Ship's quartermaster", bonus: 9 }, { name: " Raised by wolves " }] });
  assert.equal(result.kind, "start");
  assert.equal(result.changed, true);
  assert.deepEqual(pc.experiences, [
    { name: "Ship's quartermaster", bonus: 2 },
    { name: "Raised by wolves", bonus: 2 }
  ]);
  assert.equal(describeExperiences(pc.experiences), "Ship's quartermaster +2, Raised by wolves +2");
});

test("a character with the field missing counts as having none", () => {
  const pc = { name: "Test" };
  setExperiences(pc, { experiences: [{ name: "One" }, { name: "Two" }] });
  assert.equal(pc.experiences.length, 2);
});

test("the starting pair must be two distinct, named Experiences", () => {
  const pc = { name: "Test", experiences: [] };
  assert.throws(() => setExperiences(pc, { experiences: [{ name: "Only one" }] }), /both/);
  assert.throws(() => setExperiences(pc, { experiences: [{ name: "A" }, { name: "B" }, { name: "C" }] }), /both/);
  assert.throws(() => setExperiences(pc, { experiences: [{ name: "A" }, { name: "" }] }), /needs a name/);
  assert.throws(() => setExperiences(pc, { experiences: [{ name: "Same" }, { name: "same" }] }), /own name/);
  assert.throws(() => setExperiences(pc, {}), /required/);
  assert.deepEqual(pc.experiences, []);
});

test("changing recorded Experiences requires explicit GM approval", () => {
  const pc = { name: "Test", experiences: [{ name: "Old", bonus: 2 }, { name: "Older", bonus: 2 }] };
  assert.throws(() => setExperiences(pc, { experiences: [{ name: "New", bonus: 2 }] }), /Oscar approved/);
  assert.throws(() => setExperiences(pc, { experiences: [{ name: "New", bonus: 2 }], gmApproved: "yes" }), /Oscar approved/);
  assert.deepEqual(pc.experiences, [{ name: "Old", bonus: 2 }, { name: "Older", bonus: 2 }]);
});

test("an approved edit replaces the list, validates it and reports no change when identical", () => {
  const pc = { name: "Test", experiences: [{ name: "Old", bonus: 2 }, { name: "Older", bonus: 2 }] };
  const same = setExperiences(pc, { gmApproved: true, experiences: [{ name: "Old", bonus: 2 }, { name: "Older", bonus: "2" }] });
  assert.equal(same.changed, false);

  const edited = setExperiences(pc, { gmApproved: true, experiences: [{ name: "Old", bonus: 3 }, { name: "Third", bonus: 2 }, { name: "Fourth", bonus: 2 }] });
  assert.equal(edited.kind, "edit");
  assert.equal(edited.changed, true);
  assert.deepEqual(pc.experiences, [{ name: "Old", bonus: 3 }, { name: "Third", bonus: 2 }, { name: "Fourth", bonus: 2 }]);

  assert.throws(() => setExperiences(pc, { gmApproved: true, experiences: [] }), /between 1 and/);
  const tooMany = Array.from({ length: MAX_EXPERIENCES + 1 }, (_, i) => ({ name: `E${i}`, bonus: 2 }));
  assert.throws(() => setExperiences(pc, { gmApproved: true, experiences: tooMany }), /between 1 and/);
  assert.throws(() => setExperiences(pc, { gmApproved: true, experiences: [{ name: "A", bonus: -1 }] }), /whole number/);
  assert.throws(() => setExperiences(pc, { gmApproved: true, experiences: [{ name: "A", bonus: 2.5 }] }), /whole number/);
  assert.throws(() => setExperiences(pc, { gmApproved: true, experiences: [{ name: "A", bonus: 99 }] }), /whole number/);
  assert.throws(() => setExperiences(pc, { gmApproved: true, experiences: [{ name: "A", bonus: 2 }, { name: "a", bonus: 2 }] }), /own name/);
  assert.equal(pc.experiences.length, 3);
});

test("players can reach the Experiences route without Keeper access", () => {
  assert.equal(requiresGm("PUT", "/api/party/pc_test/experiences"), false);
  assert.equal(requiresGm("POST", "/api/party/pc_test/experiences"), true);
  assert.equal(requiresGm("DELETE", "/api/party/pc_test/experiences"), true);
});
