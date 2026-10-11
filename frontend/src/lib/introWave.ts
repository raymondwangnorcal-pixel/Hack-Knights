"use client";

import { useSyncExternalStore } from "react";

// Shared state for the first-visit Enter screen (IntroGate) and the "wave" the home page comes in
// on. Pressing Enter records where and when; the map dots and the counters read it and animate
// from that point in time and space, so the whole page arrives as one ripple.
//
//   "none"    no Enter screen this visit: render normally
//   "armed"   Enter screen is up: hold maps empty and counters at 0 underneath it
//   "entered" Enter pressed at (x, y) viewport px, performance.now() = t0

export type IntroWave = { status: "none" | "armed" | "entered"; x: number; y: number; t0: number };

// Choreography, in ms after Enter is pressed.
export const RIPPLE_DELAY = 120; // rings pulse first, then the hole opens
export const RIPPLE_MS = 1300; // the hole grows to cover the screen
export const DOTS_DELAY = 600; // map dots ripple out from the click point, just behind the hole
export const DOTS_MS = 1500;
export const COUNT_DELAY = 600; // counters start rolling up from 0
export const COUNT_MS = 1900;

const NONE: IntroWave = { status: "none", x: 0, y: 0, t0: 0 };
let state: IntroWave | null = null;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

function read(): IntroWave {
  if (state === null) {
    // The pre-paint script has already decided; read its verdict from the gate element.
    const gate = document.getElementById("intro-gate");
    state = gate?.getAttribute("data-phase") === "gate" ? { ...NONE, status: "armed" } : NONE;
  }
  return state;
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

/** The Enter screen is showing (called by the gate, e.g. after a client-side navigation). */
export function armIntro() {
  if (read().status === "armed") return;
  state = { ...NONE, status: "armed" };
  emit();
}

/** Enter pressed: start the wave from this viewport point. */
export function enterIntro(x: number, y: number) {
  state = { status: "entered", x, y, t0: performance.now() };
  emit();
}

export function useIntroWave(): IntroWave {
  return useSyncExternalStore(subscribe, read, () => NONE);
}

/** 0 → 1 progress of a stage that starts `delay` ms after Enter and lasts `ms`. */
export function stage(wave: IntroWave, now: number, delay: number, ms: number) {
  return Math.min(1, Math.max(0, (now - wave.t0 - delay) / ms));
}

export const easeOutQuart = (p: number) => 1 - Math.pow(1 - p, 4);
export const easeOutSine = (p: number) => Math.sin((p * Math.PI) / 2);
export const easeInOutSine = (p: number) => (1 - Math.cos(Math.PI * p)) / 2;
