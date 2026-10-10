"use client";

import { useEffect, useRef } from "react";

// A faint dot grid that lights up around the cursor, like pixels warming under a torch.
// It only lives inside elements marked `data-glow-zone` (the area around the maps) and switches
// off within a margin of anything marked `data-glow-block` (the maps), so it never competes with
// their own hover. Left half glows in the first colour, right half in the second.
// Drawn on a canvas behind the content; skipped entirely for people who turn off motion.

const GAP = 12; // px between dots
const RADIUS = 110; // px of light around the cursor
const DOT = 2.5; // px dot size
const BLOCK_MARGIN = 28; // px kept clear around blocked elements

type Rect = { x: number; y: number; w: number; h: number };

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

    // Zones and blocks in host coordinates, refreshed on every pointer move.
    let zones: Rect[] = [];
    let blocks: Rect[] = [];
    const measure = () => {
      const hr = host.getBoundingClientRect();
      const toRect = (n: Element, m = 0): Rect => {
        const r = n.getBoundingClientRect();
        return { x: r.left - hr.left - m, y: r.top - hr.top - m, w: r.width + 2 * m, h: r.height + 2 * m };
      };
      zones = [...host.querySelectorAll("[data-glow-zone]")].map((n) => toRect(n));
      blocks = [...host.querySelectorAll("[data-glow-block]")].map((n) => toRect(n, BLOCK_MARGIN));
    };
    const inside = (rs: Rect[], x: number, y: number) =>
      rs.some((r) => x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h);

    const target = { x: -9999, y: -9999, on: false };
    const light = { x: -9999, y: -9999, k: 0 };
    let raf = 0;

    const draw = () => {
      light.x += (target.x - light.x) * 0.3;
      light.y += (target.y - light.y) * 0.3;
      light.k += ((target.on ? 1 : 0) - light.k) * 0.15;
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
            if (d > RADIUS || !inside(zones, px, py) || inside(blocks, px, py)) continue;
            ctx.globalAlpha = (1 - d / RADIUS) ** 2 * 0.9 * light.k;
            ctx.fillStyle = px < w / 2 ? colors[0] : colors[1];
            ctx.fillRect(px - DOT / 2, py - DOT / 2, DOT, DOT);
          }
        }
        ctx.globalAlpha = 1;
      }
      if (target.on || light.k > 0.01) raf = requestAnimationFrame(draw);
      else raf = 0;
    };
    const wake = () => {
      if (!raf) raf = requestAnimationFrame(draw);
    };

    const onMove = (e: PointerEvent) => {
      measure();
      const r = host.getBoundingClientRect();
      const x = e.clientX - r.left;
      const y = e.clientY - r.top;
      const on = inside(zones, x, y) && !inside(blocks, x, y);
      if (on && !target.on && light.k < 0.02) {
        light.x = x;
        light.y = y;
      }
      target.x = x;
      target.y = y;
      target.on = on;
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
