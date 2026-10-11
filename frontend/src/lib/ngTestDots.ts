import type { Detection } from "./types";

// "Nigeria test": simulated malaria detections for this week and the next two (scripts/build_ng_test_dots.py).
// Each week's dots are the previous week's dots, moved on: hotspots drift, widen and gain dots, and new ones appear
// nearby, so stepping through the weeks looks like an outbreak spreading. At most 6,000 dots a week.

export const MAX_NG_TEST_DOTS = 6000;
export const NG_TEST_WEEK_LABELS = ["This week", "+1 week", "+2 weeks"] as const;

interface Payload {
  species: string[];
  hotspots: string[];
  centers: number[][][]; // [week][hotspot] -> [lat * 1000, lng * 1000]
  weeks: number[][][]; // [week][dot] -> [lat * 1000, lng * 1000, age in tenths of a day, hotspot, species, confidence %, flags (bit 1 trap)]
}

export interface NgTestWeeks {
  /** The dots shown part-way (t from 0 to 1) from one week to another; t = 1 is exactly the target week. */
  frame(from: number, to: number, t: number, days: number): Detection[];
}

let cached: Promise<NgTestWeeks> | null = null;

export function loadNgTestWeeks(): Promise<NgTestWeeks> {
  cached ??= fetch("/geo/ng-test-dots.json")
    .then((r) => {
      if (!r.ok) throw new Error(`/geo/ng-test-dots.json returned ${r.status}: run scripts/build_ng_test_dots.py`);
      return r.json() as Promise<Payload>;
    })
    .then((p) => ({
      frame(from, to, t, days) {
        const a = p.weeks[from].slice(0, MAX_NG_TEST_DOTS);
        const b = p.weeks[to].slice(0, MAX_NG_TEST_DOTS);
        const now = Date.now();
        const times = new Map<number, string>(); // one timestamp string per age, not one per dot
        const out: Detection[] = [];
        const n = Math.max(a.length, b.length);
        for (let j = 0; j < n; j++) {
          const A = a[j];
          const B = b[j];
          const ref = B ?? A;
          if (ref[2] / 10 > days) continue;
          let lat: number;
          let lng: number;
          if (A && B) {
            lat = A[0] + (B[0] - A[0]) * t;
            lng = A[1] + (B[1] - A[1]) * t;
          } else if (B) {
            // a dot that is new this week starts out at its hotspot's centre and spreads out to its place
            const c = p.centers[to][B[3]];
            lat = c[0] + (B[0] - c[0]) * t;
            lng = c[1] + (B[1] - c[1]) * t;
          } else {
            // a dot that is gone this week (stepping back) pulls in to its hotspot's centre, and is dropped at the end
            if (t >= 1) continue;
            const c = p.centers[to][A[3]];
            lat = A[0] + (c[0] - A[0]) * t;
            lng = A[1] + (c[1] - A[1]) * t;
          }
          out.push({
            detection_id: `ng-test-${j}`,
            time: times.get(ref[2]) ?? (times.set(ref[2], new Date(now + to * 7 * 864e5 - (ref[2] / 10) * 864e5).toISOString()), times.get(ref[2])!),
            country: "NG",
            district: `the ${p.hotspots[ref[3]]} area`,
            district_id: `ng-test-h${ref[3]}`, // dots of one hotspot share a colour scale: dark in the middle, light at the edge
            lat: lat / 1000,
            lng: lng / 1000,
            species: p.species[ref[4]],
            genus: "anopheles",
            confidence: ref[5] / 100,
            source: ref[6] & 2 ? "trap" : "phone",
            is_simulated: true,
          });
        }
        return out;
      },
    }));
  return cached;
}
