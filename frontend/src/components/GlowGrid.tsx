"use client";

import { useEffect, useRef } from "react";

// A faint dot grid across the whole intro that lights up around the cursor, like pixels warming
// under a torch. Dots take the left accent on the left half and the right accent on the right.
// Drawn on a canvas behind the content; skipped entirely for people who turn off motion.

const GAP = 14; // px between dots
const RADIUS = 170; // px of light around the cursor
const DOT = 2.5; // px dot size

export function GlowGrid({ colors }: { colors: [string, string] }) {
  const canvas = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const el = canvas.current;
    const host = el?.parentElement;
    const ctx = el?.getContext("2d");
    if (!el || !host || !ctx) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    let w = 0;
    let h = 0;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const resize = () => {
      w = host.clientWidth;
      h = host.clientHeight;
      el.width = w * dpr;
      el.height = h * dpr;
      el.style.width = `${w}px`;
      el.style.height = `${h}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(host);

    // Pointer target, the eased light position, and an intensity that fades in and out.
    const target = { x: -9999, y: -9999, on: false };
    const light = { x: -9999, y: -9999, k: 0 };
    let raf = 0;

    const draw = () => {
      light.x += (target.x - light.x) * 0.25;
      light.y += (target.y - light.y) * 0.25;
      light.k += ((target.on ? 1 : 0) - light.k) * 0.12;
      ctx.clearRect(0, 0, w, h);
      if (light.k > 0.01) {
        const x0 = Math.max(0, Math.floor((light.x - RADIUS) / GAP));
        const x1 = Math.min(Math.ceil(w / GAP), Math.ceil((light.x + RADIUS) / GAP));
        const y0 = Math.max(0, Math.floor((light.y - RADIUS) / GAP));
        const y1 = Math.min(Math.ceil(h / GAP), Math.ceil((light.y + RADIUS) / GAP));
        for (let gy = y0; gy <= y1; gy++) {
          for (let gx = x0; gx <= x1; gx++) {
            const px = gx * GAP + GAP / 2;
            const py = gy * GAP + GAP / 2;
            const d = Math.hypot(px - light.x, py - light.y);
            if (d > RADIUS) continue;
            const a = (1 - d / RADIUS) ** 2 * 0.9 * light.k;
            ctx.globalAlpha = a;
            ctx.fillStyle = px < w / 2 ? colors[0] : colors[1];
            ctx.fillRect(px - DOT / 2, py - DOT / 2, DOT, DOT);
          }
        }
        ctx.globalAlpha = 1;
      }
      // Keep animating while the light is visible or still settling.
      if (target.on || light.k > 0.01) raf = requestAnimationFrame(draw);
      else raf = 0;
    };
    const wake = () => {
      if (!raf) raf = requestAnimationFrame(draw);
    };

    const onMove = (e: PointerEvent) => {
      const r = host.getBoundingClientRect();
      target.x = e.clientX - r.left;
      target.y = e.clientY - r.top;
      if (!target.on && light.k < 0.02) {
        light.x = target.x;
        light.y = target.y;
      }
      target.on = true;
      wake();
    };
    const onLeave = () => {
      target.on = false;
      wake();
    };
    host.addEventListener("pointermove", onMove);
    host.addEventListener("pointerleave", onLeave);
    return () => {
      ro.disconnect();
      cancelAnimationFrame(raf);
      host.removeEventListener("pointermove", onMove);
      host.removeEventListener("pointerleave", onLeave);
    };
  }, [colors]);

  return <canvas ref={canvas} aria-hidden="true" className="pointer-events-none absolute inset-0 z-0" />;
}
