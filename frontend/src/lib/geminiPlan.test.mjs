import assert from "node:assert/strict";
import test from "node:test";
import { allowedNumbers, applyGeminiPlan } from "./geminiPlan.ts";

const c = (id, extra = {}) => ({ id, title: `Title ${id}`, reason: `Built-in reason for ${id}.`, sourceUrl: "https://example.org", ...extra });
const candidates = [c("a"), c("b"), c("c"), c("d", { registryUrl: "https://reg.example.org" })];
const ctx = { district: "Shomolu", riskScore: 70, rank: 1, districtCount: 20, detections7d: 42, rainMm: 3 };
const opts = (over = {}) => ({ language: "en", validIds: (ids) => ids.includes("a"), allowed: allowedNumbers(ctx, candidates), ...over });

test("Gemini's district-specific reasons replace the built-in ones; titles stay curated in English", () => {
  const out = applyGeminiPlan({
    ids: ["a", "b", "c"],
    actions: [
      { id: "a", title: "Changed", reason: "Shomolu ranks 1 of 20 with 42 detections this week, so act here first." },
      { id: "b", title: "x", reason: "About 3 mm of rain fell recently, so new pools are likely to form soon." },
      { id: "c", title: "x", reason: "Clinics should be ready as the risk score sits at 70 out of 100." },
    ],
  }, candidates, opts());
  assert.deepEqual(out.map((a) => a.title), ["Title a", "Title b", "Title c"]);
  assert.match(out[0].reason, /42 detections/);
});

test("a reason citing a number that isn't in the data falls back to the built-in text", () => {
  const out = applyGeminiPlan({ ids: ["a", "b", "c"], actions: [{ id: "a", reason: "Cases jumped 380% last month in Shomolu, so act now." }] }, candidates, opts());
  assert.equal(out[0].reason, "Built-in reason for a.");
});

test("registry-linked (chemical) actions keep their curated text", () => {
  const out = applyGeminiPlan({ ids: ["a", "b", "d"], actions: [{ id: "d", reason: "Spray anything you like around Shomolu this week." }] }, candidates, opts());
  assert.equal(out[2].reason, "Built-in reason for d.");
});

test("invalid picks reject the whole reply", () => {
  assert.equal(applyGeminiPlan({ ids: ["b", "c", "d"] }, candidates, opts()), null);
  assert.equal(applyGeminiPlan({ ids: ["a", "a", "b"] }, candidates, opts()), null);
});

test("forbidden words and missing translated titles fall back per action", () => {
  const out = applyGeminiPlan({
    ids: ["a", "b", "c"],
    actions: [
      { id: "a", title: "Título", reason: "Os Anopheles picam à noite em Shomolu, por isso use redes." },
      { id: "b", reason: "Choveu cerca de 3 mm em Shomolu, então esvazie recipientes hoje." },
      { id: "c", title: "Clínicas prontas", reason: "Com risco 70 de 100, as clínicas devem estar prontas em Shomolu." },
    ],
  }, candidates, opts({ language: "pt", forbid: /\banopheles\b/i }));
  assert.equal(out[0].reason, "Built-in reason for a.");
  assert.equal(out[0].language, "en");
  assert.equal(out[1].language, "en");
  assert.equal(out[2].title, "Clínicas prontas");
});
