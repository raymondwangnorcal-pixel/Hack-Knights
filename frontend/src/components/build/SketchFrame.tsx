"use client";

import { useEffect, useRef, type ReactNode } from "react";

// Holds one hand-drawn diagram. The first time it scrolls into view its strokes draw in, in the
// order the shapes were written, then the text fades in behind them. It only arms the animation
// if the diagram starts below the fold and motion is allowed, so a screenshot, a reload halfway
// down the page or reduced motion all show the finished drawing.

export function SketchFrame({
  w,
  h,
  label,
  minWidth = 760,
  children,
}: {
  w: number;
  h: number;
  label: string;
  /** Below this width the diagram scrolls sideways instead of shrinking past legibility. */
  minWidth?: number;
  children: ReactNode;
}) {
  const ref = useRef<SVGSVGElement>(null);

  useEffect(() => {
    const svg = ref.current;
    if (!svg) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    if (svg.getBoundingClientRect().top < window.innerHeight * 0.85) return; // already in view

    const els = Array.from(svg.querySelectorAll<SVGGElement>("g[data-el]"));
    const step = Math.min(55, 2400 / Math.max(1, els.length));
    els.forEach((el, i) => el.style.setProperty("--d", `${Math.round(i * step)}ms`));
    svg.classList.add("sk-armed");

    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          svg.classList.add("sk-drawn");
          io.disconnect();
        }
      },
      { threshold: 0.22 },
    );
    io.observe(svg);
    return () => io.disconnect();
  }, []);

  return (
    <div className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
      <div className="mx-auto max-w-[1020px]">
      <svg
        ref={ref}
        viewBox={`0 0 ${w} ${h}`}
        role="img"
        aria-label={label}
        className="sk block h-auto w-full"
        style={{ minWidth }}
      >
        {children}
      </svg>
      </div>
    </div>
  );
}
