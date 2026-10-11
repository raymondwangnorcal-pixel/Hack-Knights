"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  RIPPLE_DELAY,
  RIPPLE_MS,
  armIntro,
  easeInOutSine,
  enterIntro,
} from "@/lib/introWave";

// First-visit Enter screen over the home page. Pressing Enter plays a short mosquito fly-by, sends
// sound-wave rings out from the button, then opens a wobbling, ever-growing hole from the button
// that uncovers the page. The map dots and the counters underneath pick up the same wave
// (see lib/introWave.ts).
//
// When it shows:
//   - first visit in this browser only (remembered in localStorage)
//   - not for people who turn on "reduce motion"
//   - ?intro=1 forces it (stage demo); ?intro=0 suppresses it
//
// The same check runs inline in the HTML before first paint, so returning visitors never see the
// screen flash, and first-time visitors never see the page flash before it.

type Phase = "off" | "gate" | "revealing";

const SEEN_KEY = "culicid-intro-seen";

const INK = "#ECE6DA";
const ORANGE = "#F07636";
const BG = "#13110F";
const DISPLAY = { fontFamily: "'Bebas Neue', var(--font-geist-sans), sans-serif" };
const TYPE = { fontFamily: "'IBM Plex Mono', var(--font-geist-mono), monospace" };
const PAPER =
  "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='240' height='240'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2' stitchTiles='stitch'/><feColorMatrix values='0 0 0 0 0.95 0 0 0 0 0.9 0 0 0 0 0.8 0 0 0 0.05 0'/></filter><rect width='100%' height='100%' filter='url(%23n)'/></svg>\")";

/**
 * Should the Enter screen show on this load? Self-contained (no outside references) because it is
 * also stringified into the inline pre-paint script.
 */
function shouldShow(seenKey: string): boolean {
  try {
    const q = new URLSearchParams(window.location.search).get("intro");
    if (q === "1") return true;
    if (q === "0") return false;
    if (window.localStorage.getItem(seenKey)) return false;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return false;
    return true;
  } catch {
    // Blocked storage: don't risk showing it on every visit.
    return false;
  }
}

function markSeen() {
  try {
    localStorage.setItem(SEEN_KEY, "1");
  } catch {
    // Private mode: it just shows again next time.
  }
}

const PRE_PAINT = `(function(){var el=document.getElementById("intro-gate");if(el&&(${shouldShow.toString()})(${JSON.stringify(
  SEEN_KEY,
)})){el.setAttribute("data-phase","gate");el.removeAttribute("aria-hidden");document.documentElement.style.overflow="hidden"}})()`;

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

/**
 * A mosquito flying past your ear, synthesised on the spot: a buzzing wingbeat tone (~550 Hz)
 * with flutter, panning left to right, rising a touch as it approaches and dropping as it passes.
 * Runs inside the click, so browsers allow the sound.
 */
function playBuzz() {
  try {
    const AC =
      window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return;
    const ctx = new AC();
    const t = ctx.currentTime;
    const dur = 1.4;

    const out = ctx.createGain();
    out.gain.setValueAtTime(0.0001, t);
    out.gain.exponentialRampToValueAtTime(0.2, t + 0.25);
    out.gain.setValueAtTime(0.2, t + 0.75);
    out.gain.exponentialRampToValueAtTime(0.0001, t + dur);

    const pan = ctx.createStereoPanner();
    pan.pan.setValueAtTime(-0.8, t);
    pan.pan.linearRampToValueAtTime(0.8, t + dur);

    // Wingbeat flutter: a fast wobble in loudness.
    const trem = ctx.createGain();
    trem.gain.value = 0.75;
    const tremLfo = ctx.createOscillator();
    tremLfo.frequency.value = 11;
    const tremDepth = ctx.createGain();
    tremDepth.gain.value = 0.25;
    tremLfo.connect(tremDepth).connect(trem.gain);

    const hp = ctx.createBiquadFilter();
    hp.type = "highpass";
    hp.frequency.value = 280;
    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = 3800;

    // Two slightly detuned sawtooth wings, with pitch flutter and a Doppler sweep.
    const vibrato = ctx.createOscillator();
    vibrato.frequency.value = 23;
    const vibDepth = ctx.createGain();
    vibDepth.gain.value = 9;
    vibrato.connect(vibDepth);
    const wings = [0, 9].map((cents) => {
      const o = ctx.createOscillator();
      o.type = "sawtooth";
      o.detune.value = cents;
      o.frequency.setValueAtTime(545, t);
      o.frequency.linearRampToValueAtTime(590, t + 0.6);
      o.frequency.linearRampToValueAtTime(490, t + dur);
      vibDepth.connect(o.frequency);
      o.connect(hp);
      return o;
    });

    hp.connect(lp).connect(trem).connect(out).connect(pan).connect(ctx.destination);
    for (const o of [...wings, vibrato, tremLfo]) {
      o.start(t);
      o.stop(t + dur + 0.05);
    }
    window.setTimeout(() => void ctx.close(), (dur + 0.3) * 1000);
  } catch {
    // No Web Audio: the wave still runs, silently.
  }
}

/**
 * Adds a wobbly circle around (cx, cy) to the current canvas path: a sound-wave edge. The wobble
 * shrinks to nothing as `p` reaches 1.
 */
function wobblyCircle(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number, p: number, secs: number) {
  const n = 144;
  const amp = Math.min(22, 5 + r * 0.035) * (1 - p * p * p);
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const rr =
      r +
      amp *
        (0.55 * Math.sin(6 * a + 10 * secs) + 0.3 * Math.sin(11 * a - 15 * secs) + 0.15 * Math.sin(17 * a + 7 * secs));
    const x = cx + Math.cos(a) * rr;
    const y = cy + Math.sin(a) * rr;
    if (i) ctx.lineTo(x, y);
    else ctx.moveTo(x, y);
  }
  ctx.closePath();
}

export function IntroGate() {
  // Matches what the pre-paint script decided, so hydration keeps the DOM as it is.
  const [phase, setPhase] = useState<Phase>(() =>
    typeof window === "undefined" ? "off" : shouldShow(SEEN_KEY) ? "gate" : "off",
  );
  const cover = useRef<HTMLCanvasElement>(null);
  const enter = useRef<HTMLButtonElement>(null);
  const started = useRef(false);

  // Lock page scrolling while the screen is up; restore it once it's gone.
  useEffect(() => {
    document.documentElement.style.overflow = phase === "off" ? "" : "hidden";
  }, [phase]);

  useEffect(() => {
    if (phase !== "gate") return;
    armIntro(); // tell the maps and counters to wait underneath
    enter.current?.focus({ preventScroll: true });
  }, [phase]);

  const start = useCallback(() => {
    if (started.current) return;
    started.current = true;
    const btn = enter.current?.getBoundingClientRect();
    const cx = btn ? btn.left + btn.width / 2 : window.innerWidth / 2;
    const cy = btn ? btn.top + btn.height / 2 : window.innerHeight / 2;
    playBuzz();
    enterIntro(cx, cy);
    markSeen();

    // From here the cover is a canvas (the hole is cut out of it each frame), which repaints far
    // more cheaply than clipping the full-screen panel; the panel's own background drops away.
    const w = window.innerWidth;
    const h = window.innerHeight;
    const canvas = cover.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) {
      setPhase("off");
      return;
    }
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const maxR = Math.hypot(Math.max(cx, w - cx), Math.max(cy, h - cy)) + 40;
    const t0 = performance.now();
    const draw = (now: number) => {
      const p = Math.min(1, Math.max(0, (now - t0 - RIPPLE_DELAY) / RIPPLE_MS));
      const secs = (now - t0) / 1000;
      const r = easeInOutSine(p) * maxR;
      ctx.clearRect(0, 0, w, h);
      // Everything except the hole stays covered (even-odd: the circle cuts out of the rectangle).
      ctx.globalAlpha = 1;
      ctx.fillStyle = BG;
      ctx.beginPath();
      ctx.rect(0, 0, w, h);
      if (r > 0.5) wobblyCircle(ctx, cx, cy, r, p, secs);
      ctx.fill("evenodd");
      if (r > 0.5) {
        // The hole's wobbling orange edge, and a fainter echo inside it.
        ctx.strokeStyle = ORANGE;
        ctx.globalAlpha = 0.9 * (1 - p);
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        wobblyCircle(ctx, cx, cy, r, p, secs);
        ctx.stroke();
        if (r > 30) {
          ctx.globalAlpha = 0.4 * (1 - p);
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          wobblyCircle(ctx, cx, cy, r * 0.82, p, secs + 0.35);
          ctx.stroke();
        }
      }
      return p;
    };
    draw(t0); // full cover in place before the panel's background drops
    setPhase("revealing");
    const frame = (now: number) => {
      if (draw(now) < 1) requestAnimationFrame(frame);
      else setPhase("off");
    };
    requestAnimationFrame(frame);
  }, []);

  return (
    <>
      <div
        id="intro-gate"
        data-phase={phase}
        suppressHydrationWarning
        role="dialog"
        aria-modal="true"
        aria-label="Welcome to Culicid"
        aria-hidden={phase === "off" ? true : undefined}
        // Lenis (smooth scroll) ignores wheel events over the screen.
        data-lenis-prevent=""
        className="intro-gate fixed inset-0 z-[1000]"
        style={{ color: INK }}
        onKeyDown={(e) => {
          if (e.key === "Escape") start();
        }}
      >
        <canvas ref={cover} aria-hidden="true" className="intro-gate-cover pointer-events-none absolute inset-0 h-full w-full" />
        <div
          className="intro-gate-panel absolute inset-0 flex flex-col items-center justify-center px-6 text-center"
          style={{ backgroundColor: BG, backgroundImage: PAPER }}
        >
          <div className="intro-gate-title flex flex-col items-center">
            <p className="text-[11px] tracking-[0.28em] uppercase opacity-60" style={TYPE}>
              Shazam for mosquitoes
            </p>
            <h1 className="mt-2 text-[clamp(5.5rem,16vw,13rem)] leading-[0.85] tracking-wide" style={DISPLAY}>
              Culicid
            </h1>
          </div>
          <button
            ref={enter}
            type="button"
            onClick={start}
            className="intro-gate-enter group relative isolate mt-10 flex items-center gap-3 rounded-full border px-8 py-3 text-3xl tracking-[0.08em] transition-colors hover:text-[#13110F] focus-visible:outline-2 focus-visible:outline-offset-4"
            style={{ ...DISPLAY, borderColor: ORANGE, outlineColor: ORANGE }}
          >
            {/* Sound-wave rings, sent out when pressed */}
            {[0, 1, 2].map((i) => (
              <span
                key={i}
                aria-hidden="true"
                className="intro-gate-ring pointer-events-none absolute inset-0 -z-20 rounded-full border-2"
                style={{ borderColor: ORANGE, animationDelay: `${i * 130}ms` }}
              />
            ))}
            <span
              aria-hidden="true"
              className="absolute inset-0 -z-10 rounded-full opacity-0 transition-opacity group-hover:opacity-100"
              style={{ backgroundColor: ORANGE }}
            />
            <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true" fill="currentColor">
              <path d="M3 1.5v13l11-6.5z" />
            </svg>
            Enter
          </button>
          <p className="mt-5 text-[11px] tracking-[0.2em] uppercase opacity-50" style={TYPE}>
            Sound on
          </p>
        </div>
      </div>
      <InlineScript html={PRE_PAINT} />
    </>
  );
}
