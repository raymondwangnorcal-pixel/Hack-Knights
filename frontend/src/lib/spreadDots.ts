import type { Detection } from "./types";

// "Nigeria test": the current Nigeria map's dots, carried into the future. Dots never move: by t = 1 (+1 week) and
// t = 2 (+2 weeks) some of the oldest dots have faded out and new dots have faded in between existing ones of the same
// hotspot, so the hotspots thicken where they already are. t is continuous so a slider can be dragged.

const NEW_PER_WEEK = 0.3; // new dots each week, as a share of the current map (unless the caller says otherwise)
const GONE_PER_WEEK = 0.15; // share of the current dots that fade out each week
const FADE = 0.5; // a dot's fade takes this share of a week; each starts at its own moment in the rest

// A fixed pseudo-random number per (index, salt), so the future is always the same.
function rnd(i: number, salt: number): number {
  let h = Math.imul(i + 1, 0x9e3779b1) ^ Math.imul(salt + 1, 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 15), 0x2c1b3c6d);
  h = Math.imul(h ^ (h >>> 12), 0x297a2d39);
  return ((h ^ (h >>> 15)) >>> 0) / 4294967296;
}

export interface Spread {
  /** The map's dots `t` weeks from now (-2 to 2); negative weeks fade a share of today's dots away. */
  frame(t: number): Detection[];
}

const ramp = (u: number, start: number) => Math.min(1, Math.max(0, (u - start * (1 - FADE)) / FADE));

export function makeSpread(base: Detection[], newPerWeek = NEW_PER_WEEK): Spread {
  const n = base.length;
  const members = new Map<string, number[]>();
  base.forEach((d, i) => {
    const k = d.district_id ?? d.district;
    const list = members.get(k);
    if (list) list.push(i);
    else members.set(k, [i]);
  });

  // New dots sit between two existing dots of one hotspot (close to the first), so they stay inside the hotspot.
  const fresh: { week: number; start: number; dot: Detection }[] = [];
  const count = Math.round(n * newPerWeek);
  for (let w = 1; w <= 2; w++) {
    for (let k = 0; k < count; k++) {
      const src = base[Math.floor(rnd(k + w * 100003, 4) * n)];
      const group = members.get(src.district_id ?? src.district)!;
      const other = base[group[Math.floor(rnd(k + w * 100003, 6) * group.length)]];
      const f = rnd(k + w * 100003, 7) * 0.5;
      fresh.push({
        week: w,
        start: rnd(k + w * 100003, 8),
        dot: {
          ...src,
          detection_id: `${src.detection_id}-new${w}-${k}`,
          lat: src.lat + (other.lat - src.lat) * f,
          lng: src.lng + (other.lng - src.lng) * f,
          is_simulated: true,
        },
      });
    }
  }
  // The oldest dots go: each is assigned a week to fade out in, a share of the dots per week.
  const goneWeek = base.map((_, i) => {
    const h = rnd(i, 3);
    return h < GONE_PER_WEEK ? 1 : h < 2 * GONE_PER_WEEK ? 2 : 0;
  });

  // Going back in time, a share of today's dots (the same share as new dots a week ahead) fade away each week.
  const pastWeek = base.map((_, i) => {
    const h = rnd(i, 9);
    return h < newPerWeek ? 1 : h < 2 * newPerWeek ? 2 : 0;
  });

  return {
    frame(t) {
      const out: Detection[] = [];
      for (let i = 0; i < n; i++) {
        const w = goneWeek[i];
        const p = pastWeek[i];
        let left = 1;
        if (w) left = Math.min(left, 1 - ramp(t - (w - 1), rnd(i, 5)));
        if (p) left = Math.min(left, 1 - ramp(-t - (p - 1), rnd(i, 10)));
        if (left >= 1) out.push(base[i]);
        else if (left > 0) out.push({ ...base[i], opacity: left });
      }
      for (const f of fresh) {
        const here = ramp(t - (f.week - 1), f.start);
        if (here >= 1) out.push(f.dot);
        else if (here > 0) out.push({ ...f.dot, opacity: here });
      }
      return out;
    },
  };
}
