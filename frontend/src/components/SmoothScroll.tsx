"use client";

import { useEffect } from "react";
import Lenis from "lenis";
import "lenis/dist/lenis.css";

// Heavier, inertial page scrolling: the wheel and trackpad glide and ease to a stop instead of
// jumping. Touch scrolling stays native (phones already have momentum), and people who turn on
// "reduce motion" get normal 1:1 scrolling (Lenis honours that setting on its own).
// Tune the feel with LERP: lower = heavier and slower to settle.

const LERP = 0.07; // Lenis default is 0.1
const WHEEL = 0.85; // distance per wheel notch; below 1 feels weightier

let lenis: Lenis | null = null;

/** Scroll to an element with the same weighted motion (falls back to native smooth scroll). */
export function scrollToId(id: string) {
  const el = document.getElementById(id);
  if (!el) return;
  if (lenis) {
    // Exact pixel target (element top minus its scroll-margin), so the margin is applied once.
    const margin = parseFloat(getComputedStyle(el).scrollMarginTop || "0");
    lenis.scrollTo(el.getBoundingClientRect().top + window.scrollY - margin, { lerp: 0.06 });
  } else {
    el.scrollIntoView({ behavior: "smooth" });
  }
}

export function SmoothScroll() {
  useEffect(() => {
    lenis = new Lenis({
      lerp: LERP,
      wheelMultiplier: WHEEL,
      autoRaf: true,
      anchors: true,
      // Dropdowns, the photo strip and anything else that scrolls on its own keep native scrolling.
      allowNestedScroll: true,
      stopInertiaOnNavigate: true,
    });
    return () => {
      lenis?.destroy();
      lenis = null;
    };
  }, []);
  return null;
}
