"use client";

import { useEffect, useRef } from "react";

// Live spectrogram for the listening screen. It sweeps left to right across one clip's length,
// drawing whatever `source` hears (the mic, or a sample clip as it plays), so a full capture
// fills the panel exactly. Frequency runs 100 Hz → 2.4 kHz bottom to top: the wingbeat
// fundamental (a few hundred Hz) and its harmonics show up as bright horizontal bands.
// With no source the last picture stays frozen; `epoch` changes clear it and restart the sweep.

const COLS = 480; // columns across the window
const ROWS = 160; // frequency rows
const LO_HZ = 100;
const HI_HZ = 2400;

// Ember colour map: near-black → deep red → orange → pale yellow.
const STOPS: [number, [number, number, number]][] = [
  [0, [12, 10, 9]],
  [0.25, [48, 14, 8]],
  [0.5, [150, 40, 14]],
  [0.72, [240, 118, 54]],
  [0.9, [255, 196, 110]],
  [1, [255, 240, 205]],
];
const LUT = (() => {
  const lut = new Uint8ClampedArray(256 * 3);
  for (let i = 0; i < 256; i++) {
    const v = i / 255;
    let k = 0;
    while (k < STOPS.length - 2 && v > STOPS[k + 1][0]) k++;
    const [a, ca] = STOPS[k];
    const [b, cb] = STOPS[k + 1];
    const t = Math.min(1, Math.max(0, (v - a) / (b - a)));
    for (let c = 0; c < 3; c++) lut[i * 3 + c] = ca[c] + (cb[c] - ca[c]) * t;
  }
  return lut;
})();

export function Spectrogram({
  source,
  epoch,
  windowSec,
  playhead,
  showPlayhead,
  className,
}: {
  /** Node to draw from. Null = frozen (keep the last picture). */
  source: AnalyserNode | null;
  /** Change to clear the picture and restart the sweep at 0 s. */
  epoch: number;
  windowSec: number;
  /** Optional: seconds into the window to place the playhead (for replaying a clip). */
  playhead?: () => number | null;
  showPlayhead: boolean;
  className?: string;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const lineRef = useRef<HTMLDivElement>(null);
  const img = useRef<ImageData | null>(null);
  const buffer = useRef<HTMLCanvasElement | null>(null);
  const sweep = useRef({ start: 0, col: -1 });
  const sourceRef = useRef(source);
  const playheadRef = useRef(playhead);
  const showRef = useRef(showPlayhead);

  useEffect(() => {
    sourceRef.current = source;
    playheadRef.current = playhead;
    showRef.current = showPlayhead;
  });

  // Clear to a faint noise floor and restart the sweep whenever the epoch changes.
  useEffect(() => {
    if (!buffer.current) {
      buffer.current = document.createElement("canvas");
      buffer.current.width = COLS;
      buffer.current.height = ROWS;
    }
    const data = new ImageData(COLS, ROWS);
    for (let i = 0; i < COLS * ROWS; i++) {
      const v = Math.floor(Math.random() * 28 + 6);
      data.data[i * 4] = LUT[v * 3];
      data.data[i * 4 + 1] = LUT[v * 3 + 1];
      data.data[i * 4 + 2] = LUT[v * 3 + 2];
      data.data[i * 4 + 3] = 255;
    }
    img.current = data;
    buffer.current.getContext("2d")?.putImageData(data, 0, 0);
    sweep.current = { start: performance.now(), col: -1 };
  }, [epoch]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const fit = () => {
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      canvas.width = Math.max(1, Math.round(canvas.clientWidth * dpr));
      canvas.height = Math.max(1, Math.round(canvas.clientHeight * dpr));
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(canvas);

    let bins = new Uint8Array(0);
    let raf = 0;

    const writeColumn = (col: number, an: AnalyserNode) => {
      const data = img.current;
      if (!data) return;
      if (bins.length !== an.frequencyBinCount) bins = new Uint8Array(an.frequencyBinCount);
      an.getByteFrequencyData(bins);
      const hzPerBin = an.context.sampleRate / an.fftSize;
      for (let r = 0; r < ROWS; r++) {
        const hz = LO_HZ + ((HI_HZ - LO_HZ) * r) / (ROWS - 1);
        const x = hz / hzPerBin;
        const i = Math.floor(x);
        const f = x - i;
        const raw = (bins[i] ?? 0) * (1 - f) + (bins[i + 1] ?? 0) * f;
        // Lift quiet sounds: a mosquito across the room is faint.
        const v = Math.min(255, Math.round(255 * Math.pow(raw / 255, 1.6) * 1.15 + Math.random() * 10));
        const y = ROWS - 1 - r;
        const o = (y * COLS + col) * 4;
        data.data[o] = LUT[v * 3];
        data.data[o + 1] = LUT[v * 3 + 1];
        data.data[o + 2] = LUT[v * 3 + 2];
        data.data[o + 3] = 255;
      }
    };

    const frame = () => {
      raf = requestAnimationFrame(frame);
      const an = sourceRef.current;
      const s = sweep.current;
      const elapsed = (performance.now() - s.start) / 1000;
      const pos = (elapsed % windowSec) / windowSec; // 0–1 across the window
      const target = Math.min(COLS - 1, Math.floor(pos * COLS));

      if (an && img.current && buffer.current) {
        // Fill every column between the last one drawn and now, wrapping at the right edge.
        let c = s.col;
        let first = -1;
        let steps = 0;
        while (c !== target && steps < COLS) {
          c = (c + 1) % COLS;
          if (first < 0) first = c;
          writeColumn(c, an);
          steps++;
        }
        if (steps > 0) {
          const bctx = buffer.current.getContext("2d");
          if (first <= c) bctx?.putImageData(img.current, 0, 0, first, 0, c - first + 1, ROWS);
          else bctx?.putImageData(img.current, 0, 0);
          s.col = c;
        }
      }

      if (buffer.current) {
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = "high";
        ctx.drawImage(buffer.current, 0, 0, canvas.width, canvas.height);
      }

      const line = lineRef.current;
      if (line) {
        const ph = playheadRef.current?.();
        const at = ph != null ? Math.min(1, ph / windowSec) : an ? pos : null;
        if (showRef.current && at != null) {
          line.style.opacity = "1";
          line.style.left = `${at * 100}%`;
        } else {
          line.style.opacity = "0";
        }
      }
    };
    raf = requestAnimationFrame(frame);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, [windowSec]);

  return (
    <div className={`relative ${className ?? ""}`}>
      <canvas
        ref={canvasRef}
        className="block h-full w-full"
        role="img"
        aria-label="Live spectrogram of what the microphone hears"
      />
      <div
        ref={lineRef}
        aria-hidden="true"
        className="pointer-events-none absolute inset-y-0 w-[2px] -translate-x-1/2 bg-[#E0434A] opacity-0 shadow-[0_0_8px_rgba(224,67,74,0.6)]"
      />
    </div>
  );
}
