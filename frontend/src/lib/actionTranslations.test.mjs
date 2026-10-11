import assert from "node:assert/strict";
import test from "node:test";
import { withBuiltinTitles } from "./actionTranslations.ts";
import { householdCandidates } from "./prevention.ts";
import { healthTeamCandidates } from "./healthTeam.ts";

const GENERA = [null, "aedes", "anopheles", "culex"];

function everyAction() {
  const all = new Map();
  for (const country of ["NG", "BR"]) {
    for (const recordingGenus of GENERA) {
      for (const regionalGenus of GENERA) {
        for (const rainMm of [0, 10]) {
          for (const a of householdCandidates({ country, district: "X", recordingGenus, regionalGenus, rainMm })) all.set(a.title, a);
        }
      }
    }
  }
  const base = {
    district: "X", riskScore: 50, rank: 1, districtCount: 8, detections7d: 10, cases14d: 10,
    forecast: { unit: "cases", week1: 10, week4: 10, low4: 8, high4: 12 }, regionalGenus: null, simulated: false,
  };
  for (const [country, disease] of [["NG", "malaria"], ["BR", "dengue"], ["US", "west_nile"]]) {
    for (const rainMm of [0, 10]) {
      for (const a of healthTeamCandidates({ ...base, country, disease, rainMm })) all.set(a.title, a);
    }
  }
  return [...all.values()];
}

for (const language of ["pt", "es", "fr", "zh", "yue", "ha"]) {
  test(`every non-chemical action title has a built-in ${language} translation`, () => {
    const actions = everyAction();
    const { actions: out } = withBuiltinTitles(actions, language);
    out.forEach((a, i) => {
      if (actions[i].registryUrl) {
        assert.equal(a.title, actions[i].title, "chemical actions stay curated English");
        assert.equal(a.language, "en");
      } else {
        assert.notEqual(a.title, actions[i].title, `missing ${language}: ${actions[i].title}`);
        assert.equal(a.language, language);
      }
    });
  });
}

test("English and untranslated languages come back marked English", () => {
  const actions = everyAction().slice(0, 3);
  assert.equal(withBuiltinTitles(actions, "en").language, "en");
  const yo = withBuiltinTitles(actions, "yo");
  assert.equal(yo.language, "en");
  assert.ok(yo.actions.every((a) => a.language === "en"));
});

test("speech uses the chosen voice for translated titles and English otherwise", async () => {
  const { pickSpoken } = await import("./spoken.ts");
  const actions = everyAction().slice(0, 3);
  const pt = withBuiltinTitles(actions, "pt");
  const ptSpoken = pickSpoken({ actions: pt.actions, language: pt.language, source: "rules", basis: "general", context: "" }, "pt");
  assert.equal(ptSpoken.voice, "pt");
  assert.ok(ptSpoken.translated);
  assert.ok(ptSpoken.titles.every((t) => !actions.some((a) => a.title === t)), "no English title spoken with the Portuguese voice");
  const english = pickSpoken({ actions, language: "en", source: "rules", basis: "general", context: "" }, "yo");
  assert.equal(english.voice, "en");
  assert.equal(english.translated, false);
});
