"use client";

import { useCallback, useEffect, useRef, useState } from "react";

// Full-screen video intro that sits on top of the home page on a first visit, then fades away to
// reveal it. Flow: an "Enter" screen (the click is what lets the browser play sound) → the 8 s
// film with sound → a fade from black into the page. A Skip button and Esc work throughout.
//
// When it plays:
//   - first visit in this browser only (remembered in localStorage)
//   - never on phones (the citizen app is the first thing they should see)
//   - not for people who turn on "reduce motion"
//   - ?intro=1 forces it (stage demo); ?intro=0 suppresses it
//
// The same check runs inline in the HTML before first paint, so returning visitors never see the
// overlay flash, and first-time visitors never see the page flash before the overlay.

type Phase = "off" | "gate" | "playing" | "leaving";

const SEEN_KEY = "mozzy-intro-seen";
// Phones in either orientation; tablets and laptops with touchscreens still get the intro.
const PHONE_QUERY = "(pointer: coarse) and (max-width: 932px)";
const FADE_MS = 900;
// Give up and reveal the page if the film hasn't finished by then (stalled network, decode error).
const WATCHDOG_MS = 20_000;

const INK = "#ECE6DA";
const ORANGE = "#F07636";
const BG = "#13110F";
const DISPLAY = { fontFamily: "'Bebas Neue', var(--font-geist-sans), sans-serif" };
const TYPE = { fontFamily: "'IBM Plex Mono', var(--font-geist-mono), monospace" };
const PAPER =
  "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='240' height='240'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2' stitchTiles='stitch'/><feColorMatrix values='0 0 0 0 0.95 0 0 0 0 0.9 0 0 0 0 0.8 0 0 0 0.05 0'/></filter><rect width='100%' height='100%' filter='url(%23n)'/></svg>\")";

/**
 * Should the intro play on this load? Self-contained (no outside references) because it is also
 * stringified into the inline pre-paint script.
 */
function shouldPlay(seenKey: string, phoneQuery: string): boolean {
  try {
    const q = new URLSearchParams(window.location.search).get("intro");
    if (q === "1") return true;
    if (q === "0") return false;
    if (window.localStorage.getItem(seenKey)) return false;
    if (window.matchMedia(phoneQuery).matches) return false;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return false;
    return true;
  } catch {
    // Blocked storage: don't risk replaying on every visit.
    return false;
  }
}

function markSeen() {
  try {
    localStorage.setItem(SEEN_KEY, "1");
  } catch {
    // Private mode: it just plays again next time.
  }
}

const PRE_PAINT = `(function(){var el=document.getElementById("intro-video");if(el&&(${shouldPlay.toString()})(${JSON.stringify(
  SEEN_KEY,
)},${JSON.stringify(PHONE_QUERY)})){el.setAttribute("data-phase","gate");el.removeAttribute("aria-hidden");document.documentElement.style.overflow="hidden"}})()`;

/** Inline script that runs during HTML parsing only (ignored on client renders). */
function InlineScript({ html }: { html: string }) {
  return (
    <script
      type={typeof window === "undefined" ? "text/javascript" : "text/plain"}
      suppressHydrationWarning
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}

export function IntroVideo() {
  // Matches what the pre-paint script decided, so hydration keeps the DOM as it is.
  const [phase, setPhase] = useState<Phase>(() =>
    typeof window === "undefined" ? "off" : shouldPlay(SEEN_KEY, PHONE_QUERY) ? "gate" : "off",
  );
  const video = useRef<HTMLVideoElement>(null);
  const enter = useRef<HTMLButtonElement>(null);
  const leaving = useRef(false);

  // Lock page scrolling while the overlay is up; restore it (at the top) once it's gone.
  useEffect(() => {
    if (phase === "off") {
      document.documentElement.style.overflow = "";
      return;
    }
    document.documentElement.style.overflow = "hidden";
  }, [phase]);

  // Start buffering the film as soon as the Enter screen shows, so it's ready by the click.
  useEffect(() => {
    if (phase !== "gate") return;
    const v = video.current;
    if (v && !v.getAttribute("src")) {
      const webm = v.canPlayType('video/webm; codecs="vp9, opus"') === "probably";
      v.src = webm ? "/intro/intro.webm" : "/intro/intro.mp4";
      v.preload = "auto";
      v.load();
    }
    enter.current?.focus({ preventScroll: true });
  }, [phase]);

  const finish = useCallback(() => {
    if (leaving.current) return;
    leaving.current = true;
    markSeen();
    setPhase("leaving");
    // Fade the sound out with the picture (matters when skipping mid-film).
    const v = video.current;
    if (v && !v.paused) {
      const from = v.volume;
      const t0 = performance.now();
      const step = (t: number) => {
        const k = Math.min(1, (t - t0) / FADE_MS);
        v.volume = from * (1 - k);
        if (k < 1) requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
    }
    window.setTimeout(() => {
      setPhase("off");
      if (v) {
        v.pause();
        v.removeAttribute("src");
        v.load(); // releases the buffered film
      }
      window.scrollTo(0, 0);
    }, FADE_MS);
  }, []);

  const start = useCallback(() => {
    const v = video.current;
    if (!v) return finish();
    setPhase("playing");
    v.muted = false;
    v.volume = 1;
    // This click is the user gesture that unlocks sound; if the browser still refuses, play muted.
    v.play().catch(() => {
      v.muted = true;
      v.play().catch(finish);
    });
  }, [finish]);

  // Esc skips; a watchdog reveals the page if playback stalls.
  useEffect(() => {
    if (phase !== "gate" && phase !== "playing") return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") finish();
    };
    document.addEventListener("keydown", onKey);
    const dog = phase === "playing" ? window.setTimeout(finish, WATCHDOG_MS) : 0;
    return () => {
      document.removeEventListener("keydown", onKey);
      window.clearTimeout(dog);
    };
  }, [phase, finish]);

  return (
    <>
      <div
        id="intro-video"
        data-phase={phase}
        suppressHydrationWarning
        role="dialog"
        aria-modal="true"
        aria-label="Culicid intro film"
        aria-hidden={phase === "off" ? true : undefined}
        // Lenis (smooth scroll) ignores wheel events over the overlay.
        data-lenis-prevent=""
        className="intro-video fixed inset-0 z-[1000] items-center justify-center bg-black"
        style={{ color: INK }}
      >
        <video
          ref={video}
          className="intro-video-film absolute inset-0 h-full w-full"
          playsInline
          disablePictureInPicture
          disableRemotePlayback
          preload="none"
          onEnded={finish}
          onError={() => {
            // A load error on the Enter screen is ignored (the click retries); during play, move on.
            if (phase === "playing") finish();
          }}
          aria-label="News reports on malaria, dengue, West Nile and chikungunya outbreaks"
        />

        {/* Enter screen: the click lets the film play with sound */}
        <div
          className="intro-video-gate absolute inset-0 flex flex-col items-center justify-center px-6 text-center"
          style={{ backgroundColor: BG, backgroundImage: PAPER }}
        >
          <p className="text-[11px] tracking-[0.28em] uppercase opacity-60" style={TYPE}>
            Shazam for mosquitoes
          </p>
          <h1 className="mt-2 text-[clamp(5.5rem,16vw,13rem)] leading-[0.85] tracking-wide" style={DISPLAY}>
            Culicid
          </h1>
          <button
            ref={enter}
            type="button"
            onClick={start}
            className="group relative isolate mt-10 flex items-center gap-3 rounded-full border px-8 py-3 text-3xl tracking-[0.08em] transition-colors hover:text-[#13110F] focus-visible:outline-2 focus-visible:outline-offset-4"
            style={{ ...DISPLAY, borderColor: ORANGE, outlineColor: ORANGE }}
          >
            <span
              aria-hidden="true"
              className="absolute inset-0 -z-10 rounded-full opacity-0 transition-opacity group-hover:opacity-100"
              style={{ backgroundColor: ORANGE }}
            />
            <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true" fill="currentColor" style={{ color: "inherit" }}>
              <path d="M3 1.5v13l11-6.5z" />
            </svg>
            Enter
          </button>
          <p className="mt-5 text-[11px] tracking-[0.2em] uppercase opacity-50" style={TYPE}>
            Sound on · 8 sec
          </p>
        </div>

        <button
          type="button"
          onClick={finish}
          className="intro-video-skip absolute right-5 bottom-5 z-10 flex items-center gap-2 rounded-full border border-[#ECE6DA]/30 bg-black/40 px-4 py-2 text-[11px] tracking-[0.2em] uppercase backdrop-blur-sm transition-colors hover:border-[#ECE6DA]/80"
          style={TYPE}
        >
          Skip intro
          <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
            <path d="M2 2.5v11l7-5.5zM9 2.5v11l7-5.5z" />
          </svg>
        </button>
      </div>
      <InlineScript html={PRE_PAINT} />
    </>
  );
}
