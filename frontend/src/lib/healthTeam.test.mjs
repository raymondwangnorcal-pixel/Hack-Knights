import assert from "node:assert/strict";
import test from "node:test";
import { forecastTrend, healthTeamCandidates, healthTeamContextLine } from "./healthTeam.ts";

const base = {
  country: "NG",
  district: "Ikeja",
  disease: "malaria",
  riskScore: 50,
  rank: 3,
  districtCount: 8,
  detections7d: 20,
  cases14d: 40,
  forecast: { unit: "cases", week1: 20, week4: 20, low4: 15, high4: 26 },
  regionalGenus: null,
  rainMm: 0,
  simulated: false,
};

test("malaria plans lead with larval sources and keep the district's numbers in the reason", () => {
  const actions = healthTeamCandidates(base);
  assert.equal(actions.length, 5);
  assert.equal(actions[0].id, "larval-sources");
  assert.equal(actions[1].id, "net-campaign");
  assert.match(actions[0].reason, /Ikeja ranks 3 of 8 \(risk 50\/100\), with 20 detections/);
});

test("a rising forecast moves clinic readiness up to second, after the vector action", () => {
  const actions = healthTeamCandidates({ ...base, forecast: { ...base.forecast, week4: 30, high4: 38 } });
  assert.equal(actions[0].id, "larval-sources");
  assert.equal(actions[1].id, "clinic-readiness");
  assert.match(actions[1].reason, /Cases are forecast to rise from about 20 to 30 a week over the next 4 weeks/);
});

test("dengue plans start house to house and mention rain when it fell", () => {
  const actions = healthTeamCandidates({ ...base, country: "BR", district: "Itaquera", disease: "dengue", rainMm: 14 });
  assert.equal(actions[0].id, "container-sweep");
  assert.match(actions[0].title, /rain-filled/i);
  assert.match(actions[0].reason, /14 mm of rain/);
  assert.ok(actions.find((a) => a.id === "fixed-water-larvicide")?.registryUrl);
});

test("West Nile plans target drains and use positive-pool units", () => {
  const actions = healthTeamCandidates({
    ...base, country: "US", district: "Queens", disease: "west_nile",
    forecast: { unit: "positive mosquito pools", week1: 4, week4: 4, low4: 2, high4: 6 },
  });
  assert.equal(actions[0].id, "catch-basins");
  assert.ok(actions.some((a) => a.id === "pool-testing"));
});

test("the context line names the grounding numbers briefly, without a simulated-data flag", () => {
  const line = healthTeamContextLine({ ...base, regionalGenus: "anopheles", simulated: true });
  assert.equal(line, "Risk 50/100 · #3 of 8 · 20 detections in 7 days · 40 cases in 14 days · Cases steady · Mostly Anopheles");
  assert.doesNotMatch(healthTeamContextLine({ ...base, cases14d: 0 }), /cases in 14 days/);
});

test("no forecast means no trend", () => {
  assert.equal(forecastTrend({ forecast: null }), null);
});
