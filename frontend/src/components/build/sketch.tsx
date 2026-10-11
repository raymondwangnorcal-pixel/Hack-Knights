// Hand-drawn diagram primitives for the "How it's built" page, after Excalidraw: rough.js
// generates the wobbly strokes and hachure fills as plain SVG paths. Every shape is seeded from its
// own geometry, so the server and the browser draw the exact same wobble (no hydration mismatch,
// and a shape never changes when another one moves).
//
// Each primitive renders one <g data-el>, which SketchFrame uses to stagger the draw-in on scroll.
// Stroke paths carry pathLength=1 so the draw-in is a single dash offset per path.

import type { ReactNode } from "react";
import rough from "roughjs";
import type { Drawable, Options } from "roughjs/bin/core";

const gen = rough.generator();

export const INK = "#1A1714";
export const DIM = "rgba(26,23,20,0.78)";
export const FAINT = "rgba(26,23,20,0.4)";
export const BG = "#F3ECDD";
export const HAND = "'Architects Daughter', 'Comic Sans MS', cursive";

/** Fill tones. Hachure strokes sit at partial opacity so text on top stays readable. */
export const TONE = {
  ours: "rgba(212,95,30,0.6)", // creme: what we built
  input: "rgba(26,23,20,0.28)", // cream: things that send us data
  source: "rgba(90,150,70,0.55)", // sage: outside data sets
  tiger: "rgba(200,150,20,0.6)", // amber: Tiger Data
  snow: "rgba(40,130,190,0.55)", // blue: Snowflake
  sim: "rgba(190,55,55,0.55)", // red: simulated or rejected
  mute: "rgba(26,23,20,0.2)",
} as const;
export type Tone = keyof typeof TONE;

/** Opaque light tints of each tone, for shapes that carry text: a solid fill reads cleaner than hachure. */
const SOLID: Record<Tone, string> = {
  ours: "#F6CDAE",
  input: "#E6DDC8",
  source: "#D3E3C3",
  tiger: "#F2E0A2",
  snow: "#C3DFF0",
  sim: "#F1C4BD",
  mute: "#E9E0CC",
};
const solidFill = (tone?: Tone): Partial<Options> => (tone ? { fill: SOLID[tone], fillStyle: "solid" } : {});

export const ACCENT = { orange: "#C4501A", red: "#C0392B", blue: "#1F6FA5", amber: "#A87B0A", sage: "#3F7A33" };

type Pt = [number, number];

function seedOf(...parts: (number | string | undefined)[]): number {
  let h = 2166136261;
  const s = parts.join("|");
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return ((h >>> 0) % 2_000_000) + 1;
}

const BASE: Options = {
  stroke: INK,
  strokeWidth: 1.3,
  roughness: 1.15,
  bowing: 0.9,
  hachureGap: 6.5,
  hachureAngle: -41,
  fillWeight: 0.9,
};

function opts(seed: number, o: Options = {}): Options {
  return { ...BASE, seed, ...o };
}

/** Renders a rough drawable as SVG paths. */
function Paths({ d, dashed, className }: { d: Drawable; dashed?: boolean; className?: string }) {
  return (
    <>
      {gen.toPaths(d).map((p, i) => {
        const solid = p.fill && p.fill !== "none";
        return (
          <path
            key={i}
            d={p.d}
            stroke={p.stroke}
            strokeWidth={p.strokeWidth}
            fill={p.fill ?? "none"}
            strokeLinecap="round"
            strokeLinejoin="round"
            className={solid ? "sk-fill" : dashed ? "sk-dash" : (className ?? "sk-stroke")}
            strokeDasharray={dashed ? "7 7" : undefined}
            pathLength={solid || dashed ? undefined : 1}
          />
        );
      })}
    </>
  );
}

// ---- text ----

export function T({
  x,
  y,
  children,
  size = 18,
  color = INK,
  anchor = "start",
  lh = 1.3,
  rotate,
  font = HAND,
  ls,
  halo = true,
}: {
  x: number;
  y: number;
  children: string;
  size?: number;
  color?: string;
  anchor?: "start" | "middle" | "end";
  lh?: number;
  rotate?: number;
  font?: string;
  ls?: number;
  halo?: boolean;
}) {
  const lines = children.split("\n");
  return (
    <text
      x={x}
      y={y}
      fill={color}
      fontSize={size}
      fontFamily={font}
      textAnchor={anchor}
      letterSpacing={ls}
      className="sk-text"
      // A halo in the page colour keeps text readable where it crosses hachure or lines.
      stroke={halo ? BG : undefined}
      strokeWidth={halo ? Math.max(3, size * 0.26) : undefined}
      strokeLinejoin="round"
      paintOrder="stroke"
      xmlSpace="preserve"
      transform={rotate ? `rotate(${rotate} ${x} ${y})` : undefined}
    >
      {lines.map((l, i) => (
        <tspan key={i} x={x} dy={i === 0 ? 0 : size * lh}>
          {l}
        </tspan>
      ))}
    </text>
  );
}

/** Free handwritten note, its own reveal step. */
export function Note(props: Parameters<typeof T>[0]) {
  return (
    <g data-el>
      <T size={16} color={DIM} {...props} />
    </g>
  );
}

/** Title + subtitle lines, centred (or left-aligned) inside a w × h box at x, y. */
function Label({
  x,
  y,
  w,
  h,
  title,
  sub,
  align = "center",
  titleSize = 23,
  subSize = 15,
  titleColor = INK,
  pad = 20,
}: {
  x: number;
  y: number;
  w: number;
  h: number;
  title?: string;
  sub?: string | string[];
  align?: "center" | "left";
  titleSize?: number;
  subSize?: number;
  titleColor?: string;
  pad?: number;
}) {
  const subs = sub === undefined ? [] : Array.isArray(sub) ? sub : [sub];
  const subLh = subSize * 1.4;
  const gap = title && subs.length ? 9 : 0;
  const total = (title ? titleSize : 0) + gap + (subs.length ? (subs.length - 1) * subLh + subSize : 0);
  const top = y + (h - total) / 2;
  const tx = align === "center" ? x + w / 2 : x + pad;
  const anchor = align === "center" ? "middle" : "start";
  const subTop = top + (title ? titleSize : 0) + gap;
  // A sub line starting with "!" is drawn in the accent colour.
  return (
    <>
      {title && (
        <T x={tx} y={top + titleSize * 0.8} size={titleSize} anchor={anchor} color={titleColor} halo={false}>
          {title}
        </T>
      )}
      {subs.map((s, i) => (
        <T key={i} x={tx} y={subTop + i * subLh + subSize * 0.8} size={subSize} anchor={anchor} color={s.startsWith("!") ? ACCENT.orange : DIM} halo={false}>
          {s.startsWith("!") ? s.slice(1) : s}
        </T>
      ))}
    </>
  );
}

// ---- shapes ----

type ShapeProps = {
  tone?: Tone;
  fillStyle?: "hachure" | "cross-hatch" | "zigzag" | "dots";
  dashed?: boolean;
  title?: string;
  sub?: string | string[];
  align?: "center" | "left";
  titleSize?: number;
  subSize?: number;
  titleColor?: string;
  stroke?: string;
  children?: ReactNode;
};

export function Box({
  x,
  y,
  w,
  h,
  tone,
  fillStyle = "hachure",
  dashed,
  stroke,
  children,
  ...label
}: ShapeProps & { x: number; y: number; w: number; h: number }) {
  const s = seedOf("box", x, y, w, h);
  const d = gen.rectangle(
    x,
    y,
    w,
    h,
    opts(s, { ...solidFill(tone), stroke: stroke ?? INK }),
  );
  return (
    <g data-el>
      <Paths d={d} dashed={dashed} />
      <Label x={x} y={y} w={w} h={h} {...label} />
      {children}
    </g>
  );
}

export function Ellipse({
  cx,
  cy,
  w,
  h,
  tone,
  fillStyle = "hachure",
  dashed,
  children,
  ...label
}: ShapeProps & { cx: number; cy: number; w: number; h: number }) {
  const d = gen.ellipse(cx, cy, w, h, opts(seedOf("ell", cx, cy, w, h), solidFill(tone)));
  return (
    <g data-el>
      <Paths d={d} dashed={dashed} />
      <Label x={cx - w / 2} y={cy - h / 2} w={w} h={h} {...label} />
      {children}
    </g>
  );
}

export function Diamond({
  cx,
  cy,
  w,
  h,
  tone,
  children,
  ...label
}: ShapeProps & { cx: number; cy: number; w: number; h: number }) {
  const d = gen.polygon(
    [
      [cx, cy - h / 2],
      [cx + w / 2, cy],
      [cx, cy + h / 2],
      [cx - w / 2, cy],
    ],
    opts(seedOf("dia", cx, cy, w, h), solidFill(tone)),
  );
  return (
    <g data-el>
      <Paths d={d} />
      <Label x={cx - w / 2} y={cy - h / 2} w={w} h={h} titleSize={20} {...label} />
      {children}
    </g>
  );
}

/** A database drum: elliptical top, straight sides, curved bottom. */
export function Cylinder({
  x,
  y,
  w,
  h,
  tone,
  title,
  sub,
  rows,
  titleSize = 26,
  dashed,
}: {
  x: number;
  y: number;
  w: number;
  h: number;
  tone?: Tone;
  title: string;
  sub?: string;
  rows?: string[];
  titleSize?: number;
  dashed?: boolean;
}) {
  const ry = Math.min(26, h * 0.12);
  const s = seedOf("cyl", x, y, w, h);
  const top = gen.ellipse(x + w / 2, y + ry, w, ry * 2, opts(s, solidFill(tone)));
  const body = gen.path(
    `M ${x} ${y + ry} L ${x} ${y + h - ry} A ${w / 2} ${ry} 0 0 0 ${x + w} ${y + h - ry} L ${x + w} ${y + ry}`,
    opts(s + 1),
  );
  const subY = y + ry * 2 + 30 + titleSize * 0.85;
  return (
    <g data-el>
      <Paths d={top} dashed={dashed} />
      <Paths d={body} dashed={dashed} />
      <T x={x + w / 2} y={y + ry * 2 + 26 + titleSize * 0.2} size={titleSize} anchor="middle" halo={false}>
        {title}
      </T>
      {sub && (
        <T x={x + w / 2} y={subY} size={15} anchor="middle" color={DIM}>
          {sub}
        </T>
      )}
      {rows?.map((r, i) => (
        <T key={i} x={x + 20} y={subY + 40 + i * 30} size={16} color={r.startsWith("~") ? DIM : INK}>
          {r.startsWith("~") ? r.slice(1) : r}
        </T>
      ))}
    </g>
  );
}

/** A sticky note in the accent colour, slightly askew. */
export function Sticky({
  x,
  y,
  w,
  h,
  children,
  rotate = -1.2,
  tone = "ours",
  size = 18,
}: {
  x: number;
  y: number;
  w: number;
  h: number;
  children: string;
  rotate?: number;
  tone?: Tone;
  size?: number;
}) {
  const d = gen.rectangle(x, y, w, h, opts(seedOf("sticky", x, y, w), { ...solidFill(tone), roughness: 1.4 }));
  const lines = children.split("\n").length;
  return (
    <g data-el transform={`rotate(${rotate} ${x + w / 2} ${y + h / 2})`}>
      <Paths d={d} />
      <T x={x + 20} y={y + h / 2 - ((lines - 1) * size * 1.3) / 2 + size * 0.35} size={size} halo={false}>
        {children}
      </T>
    </g>
  );
}

// ---- lines ----

function head(tip: Pt, from: Pt, size = 13): Pt[] {
  const a = Math.atan2(tip[1] - from[1], tip[0] - from[0]);
  const s = 0.48;
  return [
    [tip[0] - size * Math.cos(a - s), tip[1] - size * Math.sin(a - s)],
    tip,
    [tip[0] - size * Math.cos(a + s), tip[1] - size * Math.sin(a + s)],
  ];
}

/** An arrow along `pts` (2 points = straight, 3+ = a smooth curve through them). */
export function Arrow({
  pts,
  dashed,
  label,
  at,
  labelSize = 15,
  labelColor = DIM,
  anchor = "middle",
  noHead,
  both,
  color = INK,
}: {
  pts: Pt[];
  dashed?: boolean;
  label?: string;
  at?: Pt;
  labelSize?: number;
  labelColor?: string;
  anchor?: "start" | "middle" | "end";
  noHead?: boolean;
  both?: boolean;
  color?: string;
}) {
  const s = seedOf("arr", ...pts.flat());
  const o = opts(s, { roughness: 0.9, bowing: 1.4, stroke: color, strokeWidth: 1.25 });
  const line = pts.length === 2 ? gen.line(pts[0][0], pts[0][1], pts[1][0], pts[1][1], o) : gen.curve(pts, o);
  const n = pts.length;
  // For curves, aim the head along the last stretch of the curve.
  const tipFrom: Pt = n === 2 ? pts[0] : [pts[n - 1][0] * 0.35 + pts[n - 2][0] * 0.65, pts[n - 1][1] * 0.35 + pts[n - 2][1] * 0.65];
  const h1 = gen.linearPath(head(pts[n - 1], tipFrom), opts(s + 7, { roughness: 0.5, stroke: color, strokeWidth: 1.35 }));
  const tailFrom: Pt = n === 2 ? pts[1] : [pts[0][0] * 0.35 + pts[1][0] * 0.65, pts[0][1] * 0.35 + pts[1][1] * 0.65];
  const h2 = both ? gen.linearPath(head(pts[0], tailFrom), opts(s + 9, { roughness: 0.5, stroke: color, strokeWidth: 1.35 })) : null;
  const mid = at ?? [(pts[0][0] + pts[n - 1][0]) / 2, (pts[0][1] + pts[n - 1][1]) / 2 - 8];
  return (
    <g data-el>
      <Paths d={line} dashed={dashed} />
      {!noHead && <Paths d={h1} />}
      {h2 && <Paths d={h2} />}
      {label && (
        <T x={mid[0]} y={mid[1]} size={labelSize} color={labelColor} anchor={anchor}>
          {label}
        </T>
      )}
    </g>
  );
}

/** A plain rough polyline (chart lines, waveforms). */
export function Line({
  pts,
  color = INK,
  width = 1.3,
  roughness = 0.8,
  dashed,
  curve,
}: {
  pts: Pt[];
  color?: string;
  width?: number;
  roughness?: number;
  dashed?: boolean;
  curve?: boolean;
}) {
  const o = opts(seedOf("line", ...pts.slice(0, 6).flat(), pts.length), { stroke: color, strokeWidth: width, roughness, bowing: 0.4 });
  const d = curve ? gen.curve(pts, o) : gen.linearPath(pts, o);
  return (
    <g data-el>
      <Paths d={d} dashed={dashed} />
    </g>
  );
}

/** A wavy underline like a marker swipe under a heading. */
export function Squiggle({ x, y, w, color = INK }: { x: number; y: number; w: number; color?: string }) {
  const pts: Pt[] = [];
  for (let i = 0; i <= 24; i++) pts.push([x + (w * i) / 24, y + Math.sin(i * 1.15) * 3.2]);
  return <Line pts={pts} color={color} width={2} roughness={0.5} curve />;
}

/** A heading with its squiggle. */
export function Heading({ x, y, children, w, size = 26, color = INK }: { x: number; y: number; children: string; w: number; size?: number; color?: string }) {
  return (
    <>
      <g data-el>
        <T x={x} y={y} size={size} color={color}>
          {children}
        </T>
      </g>
      <Squiggle x={x} y={y + 13} w={w} color={color} />
    </>
  );
}

export function Circle({
  cx,
  cy,
  r,
  tone,
  fillStyle = "hachure",
  stroke = INK,
  solid,
}: {
  cx: number;
  cy: number;
  r: number;
  tone?: Tone;
  fillStyle?: "hachure" | "cross-hatch" | "solid";
  stroke?: string;
  solid?: string;
}) {
  const d = gen.circle(
    cx,
    cy,
    r * 2,
    opts(seedOf("cir", cx, cy, r), {
      fill: solid ?? (tone ? TONE[tone] : undefined),
      fillStyle: solid ? "solid" : fillStyle,
      stroke,
      roughness: 0.7,
      hachureGap: Math.max(2.5, r / 3),
    }),
  );
  return (
    <g data-el>
      <Paths d={d} />
    </g>
  );
}

/** A rough rectangle without a label (bars, cells, highlights). */
export function Rect({
  x,
  y,
  w,
  h,
  tone,
  fillStyle = "hachure",
  stroke = INK,
  gap,
  dashed,
  roughness,
}: {
  x: number;
  y: number;
  w: number;
  h: number;
  tone?: Tone;
  fillStyle?: "hachure" | "cross-hatch" | "zigzag" | "solid";
  stroke?: string;
  gap?: number;
  dashed?: boolean;
  roughness?: number;
}) {
  const d = gen.rectangle(
    x,
    y,
    w,
    h,
    opts(seedOf("rect", x, y, w, h), {
      fill: tone ? TONE[tone] : undefined,
      fillStyle,
      stroke,
      hachureGap: gap ?? 5,
      roughness: roughness ?? 0.9,
    }),
  );
  return (
    <g data-el>
      <Paths d={d} dashed={dashed} />
    </g>
  );
}

/** A tiny hand-drawn tick or cross. */
export function Mark({ x, y, ok, size = 14 }: { x: number; y: number; ok: boolean; size?: number }) {
  const o = opts(seedOf("mark", x, y), { stroke: ok ? ACCENT.sage : ACCENT.red, strokeWidth: 2.4, roughness: 0.6 });
  const d = ok
    ? gen.linearPath(
        [
          [x - size * 0.6, y],
          [x - size * 0.15, y + size * 0.5],
          [x + size * 0.7, y - size * 0.6],
        ],
        o,
      )
    : gen.path(`M ${x - size / 2} ${y - size / 2} L ${x + size / 2} ${y + size / 2} M ${x + size / 2} ${y - size / 2} L ${x - size / 2} ${y + size / 2}`, o);
  return (
    <g data-el>
      <Paths d={d} />
    </g>
  );
}

/** A rough polygon, with optional centred label (for layers, bands and other odd shapes). */
export function Poly({
  pts,
  tone,
  gap,
  stroke = INK,
  title,
  titleSize = 15,
  dashed,
  noStroke,
}: {
  pts: Pt[];
  tone?: Tone;
  gap?: number;
  stroke?: string;
  title?: string;
  titleSize?: number;
  dashed?: boolean;
  noStroke?: boolean;
}) {
  const d = gen.polygon(
    pts,
    opts(seedOf("poly", ...pts.flat()), {
      ...(title ? solidFill(tone) : { fill: tone ? TONE[tone] : undefined, fillStyle: "hachure" as const }),
      hachureGap: gap ?? 5.5,
      stroke: noStroke ? "none" : stroke,
    }),
  );
  const cx = pts.reduce((s, p) => s + p[0], 0) / pts.length;
  const cy = pts.reduce((s, p) => s + p[1], 0) / pts.length;
  return (
    <g data-el>
      <Paths d={d} dashed={dashed} />
      {title && (
        <T x={cx} y={cy + titleSize * 0.35} size={titleSize} anchor="middle" halo={false}>
          {title}
        </T>
      )}
    </g>
  );
}
