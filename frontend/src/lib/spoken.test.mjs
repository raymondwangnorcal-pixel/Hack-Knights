import assert from "node:assert/strict";
import test from "node:test";
import { pickSpokenFull } from "./spoken.ts";

const action = (over) => ({ id: "a", title: "Target breeding pools", reason: "Drain shallow pools.", sourceUrl: "https://example.org", ...over });

test("the full plan reads each title then its reason", () => {
  const out = pickSpokenFull({ actions: [action()], source: "rules", basis: "local", context: "", language: "en" }, "en");
  assert.deepEqual(out, { lines: ["Target breeding pools. Drain shallow pools."], voice: "en", translated: true });
});

test("a built-in title translation with an English reason is read fully in English", () => {
  const data = { actions: [action({ title: "Ṣe àfojúsùn", englishTitle: "Target breeding pools", language: "yo" })], source: "rules", basis: "local", context: "", language: "yo" };
  const out = pickSpokenFull(data, "yo");
  assert.equal(out.voice, "en");
  assert.equal(out.lines[0], "Target breeding pools. Drain shallow pools.");
});

test("a Gemini translation is read in its own language", () => {
  const data = { actions: [action({ title: "Alvo", reason: "Drenar poças.", language: "pt" })], source: "gemini", basis: "local", context: "", language: "pt" };
  assert.deepEqual(pickSpokenFull(data, "pt"), { lines: ["Alvo. Drenar poças."], voice: "pt", translated: true });
});
