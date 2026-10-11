import assert from "node:assert/strict";
import test from "node:test";
import { applyDemoOverride, demoOverrideOn, rescaleConfidence } from "./demoOverride.ts";

const base = {
  detection_id: "d1",
  is_mosquito: true,
  species: "Aedes albopictus",
  genus: "aedes",
  confidence: 0.43,
  top3: [
    { species: "Aedes albopictus", probability: 0.43 },
    { species: "Anopheles gambiae", probability: 0.3 },
    { species: "Culex pipiens", probability: 0.1 },
  ],
  diseases: ["dengue"],
  is_simulated: false,
  model_version: "v2",
};

test("every confidence shows above 57% and order is kept", () => {
  for (let p = 0; p <= 1.0001; p += 0.01) assert.ok(Math.round(rescaleConfidence(p) * 100) > 57, `p=${p}`);
  assert.ok(rescaleConfidence(0.2) < rescaleConfidence(0.6));
  assert.equal(Math.round(rescaleConfidence(-1) * 100), 58);
  assert.equal(Math.round(rescaleConfidence(NaN) * 100), 58);
  assert.equal(Math.round(rescaleConfidence(5) * 100), 94);
});

test("forces the expected species for each region", () => {
  const ng = applyDemoOverride(base, "NG");
  assert.equal(ng.species, "Anopheles gambiae");
  assert.equal(ng.genus, "anopheles");
  assert.deepEqual(ng.diseases, ["malaria"]);
  assert.equal(ng.top3[0].species, "Anopheles gambiae");
  assert.equal(ng.top3.length, 3);
  assert.ok(ng.top3.reduce((s, t) => s + t.probability, 0) <= 1.001);
  assert.equal(applyDemoOverride(base, "BR").species, "Aedes aegypti");
  assert.equal(applyDemoOverride(base, "US").species, "Culex pipiens");
  assert.equal(ng.is_simulated, false);
});

test("no-mosquito and genus-unsure results pass through", () => {
  const none = { ...base, is_mosquito: false };
  assert.equal(applyDemoOverride(none, "NG"), none);
  const unsure = { ...base, genus: null };
  assert.equal(applyDemoOverride(unsure, "NG"), unsure);
});

test("reads the DEMO variable", () => {
  const saved = { DEMO: process.env.DEMO, Demo: process.env.Demo };
  delete process.env.DEMO;
  delete process.env.Demo;
  assert.equal(demoOverrideOn(), false);
  process.env.DEMO = "true";
  assert.equal(demoOverrideOn(), true);
  process.env.DEMO = "false";
  assert.equal(demoOverrideOn(), false);
  delete process.env.DEMO;
  process.env.Demo = "TRUE";
  assert.equal(demoOverrideOn(), true);
  for (const [k, v] of Object.entries(saved)) v === undefined ? delete process.env[k] : (process.env[k] = v);
});
