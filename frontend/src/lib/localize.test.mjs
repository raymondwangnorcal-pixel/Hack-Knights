import assert from "node:assert/strict";
import test from "node:test";
import { localizeAction, tr } from "./localize.ts";
import { householdCandidates, preventionContextLine } from "./prevention.ts";
import { healthTeamCandidates, healthTeamContextLine, healthTeamStats } from "./healthTeam.ts";
import { applyGeminiPlan, allowedNumbers } from "./geminiPlan.ts";
import { pickSpoken, pickSpokenFull } from "./spoken.ts";
import en from "./i18n/en.json" with { type: "json" };

const LANGS = ["pt", "es", "fr", "zh", "yue", "yo", "ha"];
const GENERA = [null, "aedes", "anopheles", "culex"];

function everyAction() {
  const all = [];
  for (const country of ["NG", "BR"]) for (const recordingGenus of GENERA) for (const regionalGenus of GENERA) for (const rainMm of [0, 10]) {
    all.push(...householdCandidates({ country, district: "Ikeja", recordingGenus, regionalGenus, rainMm }));
  }
  for (const [country, disease] of [["NG", "malaria"], ["BR", "dengue"], ["US", "west_nile"]]) for (const rainMm of [0, 10]) {
    for (const unit of ["cases", "positive mosquito pools"]) {
      all.push(...healthTeamCandidates({
        country, disease, rainMm, district: "Ikeja", riskScore: 82, rank: 1, districtCount: 8, detections7d: 34, cases14d: 12,
        forecast: { unit, week1: 10, week4: 20, low4: 12, high4: 30 }, regionalGenus: "anopheles", simulated: false,
      }));
    }
  }
  return all;
}

const englishPieces = Object.values(en).filter((s) => s.length > 12 && !s.includes("{"));

for (const language of LANGS) {
  test(`every action, including chemical ones, is fully translated into ${language}`, () => {
    for (const a of everyAction()) {
      const out = localizeAction(a, language);
      assert.equal(out.language, language);
      assert.equal("i18n" in out, false, "recipe never leaves the server");
      assert.notEqual(out.title, a.title, `${language} title missing: ${a.title}`);
      assert.notEqual(out.reason, a.reason, `${language} reason missing: ${a.reason}`);
      assert.ok(!/\{\w+\}/.test(out.title + out.reason), "no unfilled placeholder");
      for (const piece of englishPieces) assert.ok(!out.reason.includes(piece), `English left in ${language}: ${piece}`);
      for (const n of a.reason.match(/\d+/g) ?? []) assert.ok(out.reason.includes(n), `${language} lost the number ${n}`);
      if (a.registryUrl) assert.equal(out.registryUrl, a.registryUrl, "registry link kept");
    }
  });

  test(`the evidence row is translated into ${language}`, () => {
    const ctx = { country: "NG", district: "Ikeja", disease: "malaria", riskScore: 82, rank: 1, districtCount: 8, detections7d: 34, cases14d: 12,
      forecast: { unit: "cases", week1: 10, week4: 20, low4: 12, high4: 30 }, regionalGenus: "anopheles", rainMm: 0, simulated: false };
    assert.notEqual(healthTeamContextLine(ctx, language), healthTeamContextLine(ctx));
    // "Mosquito" is spelled the same in Portuguese and Spanish.
    healthTeamStats(ctx, language).forEach((cell, i) => cell.label !== "Mosquito" && assert.notEqual(cell.label, healthTeamStats(ctx)[i].label));
    assert.notEqual(preventionContextLine({ recordingGenus: null, regionalGenus: null }, language), "Regional prevalence unavailable");
  });
}

test("English is untouched and carries no recipe", () => {
  const [a] = householdCandidates({ country: "NG", district: "Ikeja", recordingGenus: null, regionalGenus: null, rainMm: 0 });
  const out = localizeAction(a, "en");
  assert.equal(out.title, a.title);
  assert.equal("i18n" in out, false);
  assert.equal(tr("en", "s.rankValue", { rank: 2, count: 8 }), "#2 of 8");
});

test("when Gemini's reason fails a check, the fallback is the built-in translation, not English", () => {
  const candidates = householdCandidates({ country: "NG", district: "Ikeja", recordingGenus: null, regionalGenus: "anopheles", rainMm: 0 });
  const out = applyGeminiPlan(
    { ids: candidates.slice(0, 3).map((c) => c.id), actions: [] },
    candidates,
    { language: "yo", validIds: () => true, allowed: allowedNumbers({}, candidates) },
  );
  assert.ok(out.every((a) => a.language === "yo"));
  assert.ok(out.every((a, i) => a.title !== candidates[i].title));
  const spoken = pickSpoken({ actions: out, source: "gemini", basis: "local", context: "", language: "yo" }, "yo");
  assert.equal(spoken.voice, "yo");
  assert.equal(spoken.translated, true);
});

test("speech never switches to the English voice for another language", () => {
  const actions = [{ id: "a", title: "Check screens", reason: "Repair gaps.", sourceUrl: "https://example.org", language: "en" }];
  const data = { actions, source: "rules", basis: "local", context: "", language: "yo" };
  assert.deepEqual(pickSpoken(data, "yo"), { titles: [], voice: "yo", translated: false });
  assert.deepEqual(pickSpokenFull(data, "yo"), { lines: [], voice: "yo", translated: false });
});
