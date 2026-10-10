import assert from "node:assert/strict";
import test from "node:test";
import * as prevention from "./prevention.ts";

const { householdCandidates } = prevention;

test("a recording and a different district genus each get a behavior-specific action", () => {
  const actions = householdCandidates({
    country: "BR",
    district: "Itaquera",
    recordingGenus: "aedes",
    regionalGenus: "culex",
    rainMm: 0,
  });

  assert.equal(actions.length, 4);
  assert.match(actions[0].reason, /eggs.*container walls/i);
  assert.match(actions[1].reason, /egg rafts.*standing water/i);
  assert.equal(actions[2].id, "screens");
});

test("a recording alone still yields genus-specific actions", () => {
  const actions = householdCandidates({
    country: "BR",
    district: "Itaquera",
    recordingGenus: "aedes",
    regionalGenus: null,
    rainMm: null,
  });

  assert.match(actions[0].reason, /eggs.*container walls/i);
  assert.match(actions[1].reason, /daylight/i);
});

test("a Culex-only regional signal explains standing-water breeding and dusk biting", () => {
  const actions = householdCandidates({
    country: "NG",
    district: "Ikeja",
    recordingGenus: null,
    regionalGenus: "culex",
    rainMm: 0,
  });

  assert.match(actions[0].reason, /egg rafts.*standing water/i);
  assert.match(actions[1].reason, /dusk.*dawn/i);
});

test("an Anopheles recording in Nigeria prioritizes nighttime protection", () => {
  const actions = householdCandidates({
    country: "NG",
    district: "Ikeja",
    recordingGenus: "anopheles",
    regionalGenus: null,
    rainMm: null,
  });

  assert.equal(actions[0].id, "treated-net");
  assert.match(actions[0].reason, /late evening.*night/i);
  assert.match(actions[1].reason, /shallow.*water/i);
});

test("mixed advice keeps the recording first regardless of which genus it is", () => {
  const actions = householdCandidates({
    country: "BR",
    district: "Itaquera",
    recordingGenus: "culex",
    regionalGenus: "aedes",
    rainMm: 0,
  });

  assert.match(actions[0].reason, /egg rafts.*standing water/i);
  assert.match(actions[1].reason, /eggs.*container walls/i);
});

test("the context distinguishes a recording from a different regional pattern", () => {
  const line = prevention.preventionContextLine?.({ recordingGenus: "aedes", regionalGenus: "culex" });
  assert.match(line, /Recording: Aedes.*Recent district detections: Culex/i);
});

test("sparse prevalence is marked unavailable without turning a recording into a district claim", () => {
  const line = prevention.preventionContextLine({ recordingGenus: "anopheles", regionalGenus: null });
  assert.match(line, /Recording: Anopheles/);
  assert.match(line, /Regional prevalence unavailable/);
  assert.doesNotMatch(line, /Recent district detections:/);
});

test("a confident recording still incorporates a real regional lookup", async () => {
  const context = await prevention.gatherPreventionContext?.(
    { country: "BR", district: "Itaquera", recordingGenus: "aedes" },
    { rain: async () => 6, regionalGenus: async () => "culex" },
  );

  assert.equal(context?.recordingGenus, "aedes");
  assert.equal(context?.regionalGenus, "culex");
  assert.equal(context?.rainMm, 6);
});
