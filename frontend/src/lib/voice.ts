"use client";

import type { Language } from "./types";

// Plays spoken lines from /api/voice on the phone.
// - Phones block audio that starts without a tap, so unlockAudio() is called from the listen /
//   Sample tap; the same <audio> element is reused later, when the result arrives, and is allowed.
// - Every line is kept in Cache Storage after its first play, so playing the demo once before the
//   show means it still speaks with no connection.

const CACHE = "mozzy-voice-v1";
const SILENT =
  "data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQAAAAA=";

let player: HTMLAudioElement | null = null;
let currentUrl: string | null = null;

function getPlayer(): HTMLAudioElement {
  if (!player) player = new Audio();
  return player;
}

/** Call inside a tap handler. Makes later play() calls on this page allowed on iOS and Android. */
export function unlockAudio() {
  const p = getPlayer();
  if (p.src && p.src !== SILENT && !p.paused) return;
  p.src = SILENT;
  p.play().catch(() => {});
}

export function stopSpeaking() {
  player?.pause();
}

export function voiceUrl(text: string, language: Language): string {
  return `/api/voice?lang=${language}&text=${encodeURIComponent(text)}`;
}

async function fetchAudio(url: string): Promise<Blob | null> {
  try {
    const cache = "caches" in window ? await caches.open(CACHE) : null;
    const hit = await cache?.match(url);
    if (hit) return await hit.blob();
    const res = await fetch(url);
    if (!res.ok) return null;
    await cache?.put(url, res.clone()).catch(() => {});
    return await res.blob();
  } catch {
    return null;
  }
}

/** Speaks `text`; resolves false (silently) when the voice isn't available. */
export async function speak(text: string, language: Language): Promise<boolean> {
  const blob = await fetchAudio(voiceUrl(text, language));
  if (!blob) return false;
  const p = getPlayer();
  p.pause();
  if (currentUrl) URL.revokeObjectURL(currentUrl);
  currentUrl = URL.createObjectURL(blob);
  p.src = currentUrl;
  try {
    await p.play();
    return true;
  } catch {
    return false;
  }
}

// Auto-speak preference, remembered on this device (default on).
const PREF = "mozzy-autospeak";
const listeners = new Set<() => void>();
let memoryPref: boolean | null = null; // used when storage is blocked

export function readAutoSpeak(): boolean {
  if (memoryPref !== null) return memoryPref;
  try {
    return localStorage.getItem(PREF) !== "off";
  } catch {
    return true;
  }
}

export function setAutoSpeak(on: boolean) {
  memoryPref = on;
  try {
    localStorage.setItem(PREF, on ? "on" : "off");
  } catch {
    // Blocked storage: the choice lasts until reload.
  }
  if (!on) stopSpeaking();
  listeners.forEach((l) => l());
}

export function subscribeAutoSpeak(cb: () => void) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}
