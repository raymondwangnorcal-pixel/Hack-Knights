import assert from "node:assert/strict";
import test from "node:test";
import { BuzzTracker, assessSpectrum, isBuiltInMic } from "./wakeGate.ts";

// Simulates what the browser's AnalyserNode hands the gate (2048-point Blackman FFT, 0.3 smoothing,
// dB per bin) for synthetic audio at 48 kHz, checked 100 times a second like the live gate.
const SR = 48000;
const N = 2048;
const STEP = SR / 100;

function fftMag(re) {
  const n = re.length;
  const im = new Float64Array(n);
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) [re[i], re[j]] = [re[j], re[i]];
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = (-2 * Math.PI) / len;
    for (let i = 0; i < n; i += len) {
      for (let k = 0; k < len / 2; k++) {
        const wr = Math.cos(ang * k);
        const wi = Math.sin(ang * k);
        const ar = re[i + k + len / 2] * wr - im[i + k + len / 2] * wi;
        const ai = re[i + k + len / 2] * wi + im[i + k + len / 2] * wr;
        re[i + k + len / 2] = re[i + k] - ar;
        im[i + k + len / 2] = im[i + k] - ai;
        re[i + k] += ar;
        im[i + k] += ai;
      }
    }
  }
  const out = new Float64Array(n / 2);
  for (let k = 0; k < n / 2; k++) out[k] = Math.hypot(re[k], im[k]) / n;
  return out;
}

const blackman = Float64Array.from({ length: N }, (_, i) => 0.42 - 0.5 * Math.cos((2 * Math.PI * i) / N) + 0.08 * Math.cos((4 * Math.PI * i) / N));

/** Runs the gate over `signal`; returns the time (s) of the first trigger, or null. */
function firstTrigger(signal) {
  const tracker = new BuzzTracker();
  let smooth = new Float64Array(N / 2);
  for (let end = N; end <= signal.length; end += STEP) {
    const frame = new Float64Array(N);
    for (let i = 0; i < N; i++) frame[i] = signal[end - N + i] * blackman[i];
    const mag = fftMag(frame);
    smooth = smooth.map((prev, k) => 0.3 * prev + 0.7 * mag[k]);
    const db = Array.from(smooth, (m) => 20 * Math.log10(m));
    if (tracker.step(assessSpectrum(db, SR / N), 10)) return end / SR;
  }
  return null;
}

// Deterministic noise so the test never flakes.
function rng(seed) {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32) * 2 - 1;
}
function pinkNoise(seconds, db, seed = 1) {
  const r = rng(seed);
  const out = new Float64Array(seconds * SR);
  let b0 = 0, b1 = 0, b2 = 0;
  for (let i = 0; i < out.length; i++) {
    const w = r();
    b0 = 0.99765 * b0 + w * 0.099046;
    b1 = 0.963 * b1 + w * 0.2965164;
    b2 = 0.57 * b2 + w * 1.0526913;
    out[i] = b0 + b1 + b2 + w * 0.1848;
  }
  const rms = Math.sqrt(out.reduce((a, v) => a + v * v, 0) / out.length);
  return out.map((v) => (v / rms) * 10 ** (db / 20));
}
const mix = (a, b) => a.map((v, i) => v + b[i]);

/** Wingbeat tone with overtones, optionally drifting in and out like a fly-by. */
function buzz(seconds, f0, peakDb, { burstOn = 0, burstEvery = 1 } = {}) {
  const amp = 10 ** (peakDb / 20);
  return Float64Array.from({ length: seconds * SR }, (_, i) => {
    const t = i / SR;
    const env = burstOn ? Math.max(0.03, Math.sin((Math.PI * (t % burstEvery)) / burstOn) * ((t % burstEvery) < burstOn)) : 1;
    const f = f0 * (1 + 0.01 * Math.sin(2 * Math.PI * 3 * t));
    const ph = 2 * Math.PI * f * t;
    return amp * env * (0.6 * Math.sin(ph) + 0.3 * Math.sin(2 * ph) + 0.15 * Math.sin(3 * ph));
  });
}

/** A buzz whose 2x overtone is louder than the wingbeat itself, as real recordings on a phone speaker often are. */
function overtoneBuzz(seconds, f0, peakDb) {
  const amp = 10 ** (peakDb / 20);
  return Float64Array.from({ length: seconds * SR }, (_, i) => {
    const t = i / SR;
    const ph = 2 * Math.PI * f0 * (1 + 0.01 * Math.sin(2 * Math.PI * 3 * t)) * t;
    return amp * (0.25 * Math.sin(ph) + 0.6 * Math.sin(2 * ph) + 0.3 * Math.sin(3 * ph) + 0.15 * Math.sin(4 * ph));
  });
}

/** Voice-like sound: a gliding low pitch with many overtones, in syllables. */
function voice(seconds, peakDb) {
  const amp = 10 ** (peakDb / 20);
  let phase = 0;
  return Float64Array.from({ length: seconds * SR }, (_, i) => {
    const t = i / SR;
    const f0 = 140 + 50 * Math.sin(2 * Math.PI * 0.9 * t) + 25 * Math.sin(2 * Math.PI * 4.1 * t);
    phase += (2 * Math.PI * f0) / SR;
    const syl = (t % 0.3) < 0.2 ? 1 : 0.02;
    let v = 0;
    for (let h = 1; h <= 20; h++) v += Math.sin(h * phase) / h;
    return amp * syl * v * 0.4;
  });
}

/** Fan or fridge: steady low hum with overtones. */
function hum(seconds, peakDb) {
  const amp = 10 ** (peakDb / 20);
  return Float64Array.from({ length: seconds * SR }, (_, i) => {
    const ph = 2 * Math.PI * 120 * (i / SR);
    let v = 0;
    for (let h = 1; h <= 12; h++) v += Math.sin(h * ph) / h;
    return amp * v * 0.5;
  });
}

test("a steady faint buzz in a quiet room wakes the gate within a second or so", () => {
  const t = firstTrigger(mix(buzz(4, 560, -40), pinkNoise(4, -55)));
  assert.ok(t !== null && t < 1.5, `triggered at ${t}`);
});

test("a buzz that drifts in and out (0.7 s bursts, like the sample clips) still wakes the gate", () => {
  for (const f0 of [450, 600, 800]) {
    const t = firstTrigger(mix(buzz(6, f0, -30, { burstOn: 0.7, burstEvery: 1.1 }), pinkNoise(6, -55, f0)));
    assert.ok(t !== null && t < 4, `${f0} Hz triggered at ${t}`);
  }
});

test("a buzz whose overtone is louder than its wingbeat still wakes the gate", () => {
  for (const f0 of [380, 480]) {
    const t = firstTrigger(mix(overtoneBuzz(4, f0, -30), pinkNoise(4, -55, f0)));
    assert.ok(t !== null && t < 1.5, `${f0} Hz triggered at ${t}`);
  }
});

test("room noise alone never wakes the gate", () => {
  assert.equal(firstTrigger(pinkNoise(10, -45, 7)), null);
});

test("talking near the phone does not wake the gate", () => {
  assert.equal(firstTrigger(mix(voice(10, -20), pinkNoise(10, -55, 3))), null);
});

test("a fan or fridge hum does not wake the gate", () => {
  assert.equal(firstTrigger(mix(hum(10, -25), pinkNoise(10, -50, 5))), null);
});

test("the laptop's own mic is preferred over an iPhone, AirPods or a virtual device", () => {
  for (const label of ["MacBook Pro Microphone (Built-in)", "MacBook Air Microphone", "Built-in Microphone", "Microphone Array (Internal)"]) {
    assert.ok(isBuiltInMic(label), label);
  }
  for (const label of ["iPhone Microphone", "Raymond's iPhone Microphone (Continuity)", "AirPods Pro", "BlackHole 2ch (Virtual)", "Default - iPhone Microphone"]) {
    assert.ok(!isBuiltInMic(label), label);
  }
});
