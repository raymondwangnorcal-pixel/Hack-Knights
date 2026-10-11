"use client";

import { Suspense, useSyncExternalStore } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Intro } from "@/components/Intro";
import { ListenScreen } from "@/components/ListenScreen";
import { PreventionScreen } from "@/components/PreventionScreen";
import { scrollToId } from "@/components/SmoothScroll";

// One full-screen landing page with two sides under the intro, switched by the header toggle.
// "For you" is the live listening screen; "For prevention" (governments & nonprofits) is the live
// risk map, health-team actions and forecast. Both use the intro's poster palette.
// The chosen side is remembered in the URL (?side=prevention, shareable) and on the device.

export type Side = "you" | "prevention";

const STORAGE_KEY = "mozzy-side";
const listeners = new Set<() => void>();

function readStoredSide(): Side | null {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    return v === "you" || v === "prevention" ? v : null;
  } catch {
    return null;
  }
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  window.addEventListener("storage", cb);
  return () => {
    listeners.delete(cb);
    window.removeEventListener("storage", cb);
  };
}

function storeSide(side: Side) {
  try {
    localStorage.setItem(STORAGE_KEY, side);
  } catch {
    // Private mode or blocked storage: the URL still remembers the side.
  }
  listeners.forEach((l) => l());
}

export function Landing() {
  return (
    <Suspense fallback={<LandingView side="you" onChange={() => {}} />}>
      <LandingWithMemory />
    </Suspense>
  );
}

function LandingWithMemory() {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const stored = useSyncExternalStore(subscribe, readStoredSide, () => null);

  const fromUrl = params.get("side");
  const side: Side = fromUrl === "you" || fromUrl === "prevention" ? fromUrl : (stored ?? "you");

  const onChange = (next: Side) => {
    storeSide(next);
    router.replace(`${pathname}?side=${next}`, { scroll: false });
  };

  return <LandingView side={side} onChange={onChange} />;
}

function LandingView({ side, onChange }: { side: Side; onChange: (s: Side) => void }) {
  // The intro picks a side and scrolls down to it.
  const pick = (s: Side) => {
    onChange(s);
    scrollToId("start");
  };

  return (
    <>
      <Intro onPick={pick} side={side} onSide={onChange} />
      {/* Both sides sit under the intro in its poster palette; the toggle lives in the pinned header. */}
      {side === "prevention" ? <PreventionSide /> : <YouSide />}
    </>
  );
}

const POSTER_INK = "#ECE6DA";
const POSTER_BG = "#13110F";

function YouSide() {
  // The For you / For prevention toggle lives in the pinned header once you've scrolled here.
  return (
    <main
      id="start"
      className="flex min-h-[calc(100svh-52px)] flex-1 scroll-mt-[86px] flex-col gap-4 px-3 pt-3 pb-3 lg:scroll-mt-[52px] sm:px-3"
      style={{ backgroundColor: POSTER_BG, color: POSTER_INK }}
    >
      <ListenScreen />
    </main>
  );
}

function PreventionSide() {
  // Governments and nonprofits: live risk map, health-team actions and the forecast (was /dashboard).
  return (
    <main
      id="start"
      className="flex min-h-[calc(100svh-52px)] flex-1 scroll-mt-[86px] flex-col gap-4 px-3 pt-3 pb-3 lg:scroll-mt-[52px] sm:px-3"
      style={{ backgroundColor: POSTER_BG, color: POSTER_INK, colorScheme: "dark" }}
    >
      <PreventionScreen />
    </main>
  );
}
