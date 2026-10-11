"use client";

import { Suspense, useEffect, useRef, useSyncExternalStore } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Intro } from "@/components/Intro";
import { ListenScreen } from "@/components/ListenScreen";
import { PreventionScreen } from "@/components/PreventionScreen";
import { scrollToId } from "@/components/SmoothScroll";
import { SponsorGate, ToSponsorsArrow, scrollToSponsors } from "@/components/SponsorTracks";

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
  // The header's Sponsors tab: switch to the prevention side, then scroll to its sponsors section.
  const toSponsors = () => {
    onChange("prevention");
    scrollToSponsors();
  };

  return (
    <>
      <Intro onPick={pick} onSponsors={toSponsors} side={side} onSide={onChange} />
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

/** Plays the For prevention fill-in (see .pv in globals.css) once the side is on screen, then
 *  leaves it static. The side mounts on each switch to "For prevention", so each switch replays it. */
function usePreventionEntrance() {
  const ref = useRef<HTMLElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let done: ReturnType<typeof setTimeout> | undefined;
    const io = new IntersectionObserver(
      ([e]) => {
        if (!e.isIntersecting) return;
        io.disconnect();
        el.classList.add("pv-play");
        done = setTimeout(() => el.classList.add("pv-done"), 2800);
      },
      { threshold: 0.15 },
    );
    io.observe(el);
    return () => {
      io.disconnect();
      clearTimeout(done);
    };
  }, []);
  return ref;
}

function PreventionSide() {
  // Governments and nonprofits: live risk map, health-team actions and the forecast (was /dashboard),
  // then the sponsors section, which only appears when the "To sponsors" arrow (or the header's
  // Sponsors tab) is pressed, so the page ends at the arrow until then.
  const ref = usePreventionEntrance();
  return (
    <main
      ref={ref}
      id="start"
      className="pv flex min-h-[calc(100svh-52px)] flex-1 scroll-mt-[86px] flex-col gap-4 px-3 pt-3 pb-3 lg:scroll-mt-[52px] sm:px-3"
      style={{ backgroundColor: POSTER_BG, color: POSTER_INK, colorScheme: "dark" }}
    >
      <div className="flex min-h-[calc(100svh-52px-24px)] flex-col gap-4">
        <PreventionScreen />
        <div data-pv="up" style={{ "--pv-d": "1500ms" } as React.CSSProperties}>
          <ToSponsorsArrow />
        </div>
      </div>
      <SponsorGate />
    </main>
  );
}
