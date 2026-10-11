"use client";

import { useLayoutEffect, useRef, type ReactNode } from "react";

// Slides between full-size panes horizontally: the old pane glides out one way while the new one glides
// in from the other, on a gentle ease-in-out sine curve (no snap at either end).
//
// Every pane stays mounted, parked off-screen, so a slide only moves layers that are already built and
// painted (transform on the compositor): nothing is created or laid out while it runs. That is what keeps
// it smooth. Transforms are written straight to the elements, not through React state, because a slide
// needs "place the new pane off-screen with no transition, paint, then transition to 0" in that order.

export const SLIDE_MS = 1500;
const EASE = "cubic-bezier(0.37, 0, 0.63, 1)"; // easeInOutSine
const PARKED = 200; // % off to the right, past the clipped edge

interface SlideStageProps<K extends string> {
  keys: readonly K[];
  /** The pane to show. Changing it starts a slide. */
  current: K;
  /** +1: the new pane enters from the right (moving "forward"); -1: from the left. */
  dir: 1 | -1;
  render: (key: K) => ReactNode;
}

const place = (el: HTMLElement, x: number, animate: boolean) => {
  el.style.transition = animate ? `transform ${SLIDE_MS}ms ${EASE}` : "none";
  el.style.transform = `translate3d(${x}%, 0, 0)`;
};

export function SlideStage<K extends string>({ keys, current, dir, render }: SlideStageProps<K>) {
  const panes = useRef(new Map<K, HTMLDivElement>());
  const shown = useRef<K | null>(null);
  const parkTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  useLayoutEffect(() => {
    const incoming = panes.current.get(current);
    const outgoing = shown.current === null ? undefined : panes.current.get(shown.current);
    if (!incoming || shown.current === current) return;
    clearTimeout(parkTimer.current);

    if (!outgoing) {
      // First paint: no slide, just park everything else.
      keys.forEach((k) => place(panes.current.get(k)!, k === current ? 0 : PARKED, false));
      shown.current = current;
      return;
    }
    place(incoming, dir * 100, false);
    incoming.getBoundingClientRect(); // commit the parked position before animating from it
    let raf2 = 0;
    const raf1 = requestAnimationFrame(() => {
      raf2 = requestAnimationFrame(() => {
        place(incoming, 0, true);
        place(outgoing, -dir * 100, true);
      });
    });
    const leaving = outgoing;
    parkTimer.current = setTimeout(() => place(leaving, PARKED, false), SLIDE_MS + 60);
    shown.current = current;
    return () => {
      cancelAnimationFrame(raf1);
      cancelAnimationFrame(raf2);
    };
  }, [current, dir, keys]);

  return (
    <div className="absolute inset-0 overflow-hidden">
      {keys.map((k) => (
        <div
          key={k}
          ref={(el) => {
            if (el) panes.current.set(k, el);
            else panes.current.delete(k);
          }}
          className="absolute inset-0"
          style={{ willChange: "transform" }}
        >
          {render(k)}
        </div>
      ))}
    </div>
  );
}
