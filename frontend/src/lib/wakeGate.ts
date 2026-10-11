// On-device "wake gate": a cheap check that runs ~100 times a second and fires when it hears a
// steady wingbeat tone. Only after it fires do we record a clip and call the model.
//
// Each frame asks "is there a clear tone in the wingbeat band?", not "how much of the energy is in
// the band?". The old energy-share test (band power / total power >= 0.5, held for 1 s with a reset
// on any quiet frame) never fired through a laptop or phone mic: room noise outside the band pulls
// the share under 0.5, and a buzz that drifts in and out (a fly-by, or the sample clips' ~0.7 s
// bursts) never stays hot for a full unbroken second.
//
// A frame counts as buzz when the loudest peak between 300 and 1000 Hz:
//   - stands well above the noise right around it (tonal, not broadband),
//   - has an overtone at twice its pitch (wingbeats are harmonic),
//   - is the fundamental, not an overtone of a lower voice or motor hum (nothing strong at half its pitch).
// Buzz frames build a score in real milliseconds; other frames drain it slowly instead of zeroing it,
// so a buzz that fades for a moment still adds up. The gate fires when the score reaches `sustainMs`.

export interface WakeGateOptions {
  bandLowHz?: number; // wingbeat band, lower edge
  bandHighHz?: number; // wingbeat band, upper edge
  checksPerSecond?: number;
  sustainMs?: number; // buzz time needed before we trigger
  decay?: number; // how fast non-buzz time drains the score (1 = as fast as buzz fills it)
  prominenceDb?: number; // peak above the local noise floor
  harmonicDb?: number; // overtone at 2x pitch above its local noise floor
  subRejectDb?: number; // peak must beat whatever sits at half its pitch by this much
  minPeakDb?: number; // ignore near-silence
  maxPitchJump?: number; // relative pitch change still counted as the same buzz
}

export interface BuzzFrame {
  tonal: boolean; // this frame looks like a wingbeat tone
  f0: number; // loudest pitch in the wingbeat band, Hz
  prominenceDb: number;
  peakDb: number;
  bandRatio: number; // share of 100–4000 Hz power in the wingbeat band (shown for debugging only)
}

export interface WakeGateFrame extends BuzzFrame {
  hotMs: number; // buzz score so far
  progress: number; // 0–1 toward a trigger
}

const DEFAULTS: Required<WakeGateOptions> = {
  bandLowHz: 300,
  bandHighHz: 1000,
  checksPerSecond: 100,
  sustainMs: 600,
  decay: 0.5,
  prominenceDb: 12,
  harmonicDb: 6,
  subRejectDb: 10,
  minPeakDb: -100,
  maxPitchJump: 0.15,
};

function median(values: number[]): number {
  if (!values.length) return 0;
  const s = values.slice().sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

const toPower = (db: number) => (Number.isFinite(db) ? Math.pow(10, db / 10) : 0);
const toDb = (p: number) => 10 * Math.log10(p + 1e-20);

/** Judges one analyser frame (dB per bin, as from getFloatFrequencyData). Pure, so it can be tested. */
export function assessSpectrum(db: ArrayLike<number>, hzPerBin: number, options: WakeGateOptions = {}): BuzzFrame {
  const o = { ...DEFAULTS, ...options };
  const n = db.length;
  const bin = (hz: number) => Math.max(0, Math.min(n - 1, Math.round(hz / hzPerBin)));
  const maxDbNear = (k: number, half: number) => {
    let m = -Infinity;
    for (let i = Math.max(0, k - half); i <= Math.min(n - 1, k + half); i++) m = Math.max(m, db[i]);
    return m;
  };
  // Median power a few bins away on each side: the noise right around a candidate tone.
  const localFloorDb = (k: number) => {
    const near: number[] = [];
    for (let d = 3; d <= 10; d++) {
      if (k - d >= 0) near.push(toPower(db[k - d]));
      if (k + d < n) near.push(toPower(db[k + d]));
    }
    return toDb(median(near));
  };

  const lo = bin(o.bandLowHz);
  const hi = bin(o.bandHighHz);
  let k = lo;
  for (let i = lo; i <= hi; i++) if (db[i] > db[k]) k = i;
  const f0 = k * hzPerBin;
  const peakDb = db[k];

  let band = 0;
  let total = 0;
  for (let i = bin(100); i <= bin(4000); i++) {
    const p = toPower(db[i]);
    total += p;
    if (i >= lo && i <= hi) band += p;
  }

  const prominenceDb = peakDb - localFloorDb(k);
  const k2 = Math.round(k * 2);
  const harmonic = k2 * hzPerBin > 4000 || k2 >= n || maxDbNear(k2, 2) - localFloorDb(k2) >= o.harmonicDb;
  const kHalf = Math.round(k / 2);
  const isFundamental = kHalf * hzPerBin < 100 || peakDb - maxDbNear(kHalf, 1) >= o.subRejectDb;

  return {
    tonal: Number.isFinite(peakDb) && peakDb >= o.minPeakDb && prominenceDb >= o.prominenceDb && harmonic && isFundamental,
    f0,
    prominenceDb,
    peakDb,
    bandRatio: total > 0 ? band / total : 0,
  };
}

/** Turns per-frame verdicts into a trigger: buzz time fills the score, anything else drains it. */
export class BuzzTracker {
  private score = 0;
  private lastF0 = 0;
  private o: Required<WakeGateOptions>;

  constructor(options: WakeGateOptions = {}) {
    this.o = { ...DEFAULTS, ...options };
  }

  /** Returns true when the gate should fire (the score then resets). */
  step(frame: BuzzFrame, dtMs: number): boolean {
    const dt = Math.min(Math.max(dtMs, 0), 100); // a stalled tab must not count as 1 s of buzz
    const sameBuzz = this.lastF0 === 0 || Math.abs(frame.f0 - this.lastF0) / this.lastF0 <= this.o.maxPitchJump;
    if (frame.tonal && sameBuzz) this.score += dt;
    else this.score = Math.max(0, this.score - dt * this.o.decay);
    if (frame.tonal) this.lastF0 = frame.f0;
    else if (this.score === 0) this.lastF0 = 0;
    if (this.score >= this.o.sustainMs) {
      this.reset();
      return true;
    }
    return false;
  }

  get hotMs() {
    return this.score;
  }

  get progress() {
    return Math.min(1, this.score / this.o.sustainMs);
  }

  reset() {
    this.score = 0;
    this.lastF0 = 0;
  }
}

export class WakeGate {
  private ctx: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private source: MediaStreamAudioSourceNode | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;
  stream: MediaStream | null = null;
  private opts: Required<WakeGateOptions>;

  constructor(opts: WakeGateOptions = {}) {
    this.opts = { ...DEFAULTS, ...opts };
  }

  async start(onFrame: (f: WakeGateFrame) => void, onTrigger: () => void) {
    // Turn OFF browser processing: noise suppression can filter out wingbeat frequencies.
    this.stream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
    });
    this.ctx = new AudioContext();
    // Safari (and Chrome when the permission prompt eats the tap) can create the context suspended;
    // a suspended context hands the analyser silence, so the gate and spectrogram see nothing.
    if (this.ctx.state === "suspended") await this.ctx.resume().catch(() => {});
    const source = this.ctx.createMediaStreamSource(this.stream);
    this.source = source;
    this.analyser = this.ctx.createAnalyser();
    this.analyser.fftSize = 2048;
    this.analyser.smoothingTimeConstant = 0.3;
    source.connect(this.analyser);

    const bins = new Float32Array(this.analyser.frequencyBinCount);
    const hzPerBin = this.ctx.sampleRate / this.analyser.fftSize;
    const tracker = new BuzzTracker(this.opts);
    let last = performance.now();

    this.timer = setInterval(() => {
      if (!this.analyser) return;
      const now = performance.now();
      const dt = now - last; // real time: timers run late on a busy page
      last = now;
      this.analyser.getFloatFrequencyData(bins);
      const frame = assessSpectrum(bins, hzPerBin, this.opts);
      const fire = tracker.step(frame, dt);
      onFrame({ ...frame, hotMs: tracker.hotMs, progress: tracker.progress });
      if (fire) onTrigger();
    }, 1000 / this.opts.checksPerSecond);
  }

  /** Connect an extra node (e.g. a finer analyser for a spectrogram) to the live mic. */
  tap(node: AudioNode): AudioContext | null {
    if (!this.source || !this.ctx) return null;
    this.source.connect(node);
    return this.ctx;
  }

  get context(): AudioContext | null {
    return this.ctx;
  }

  pause() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  stop() {
    this.pause();
    this.stream?.getTracks().forEach((t) => t.stop());
    this.ctx?.close();
    this.stream = null;
    this.ctx = null;
    this.analyser = null;
    this.source = null;
  }
}

/** Record `seconds` of audio from an existing stream. */
export function recordClip(stream: MediaStream, seconds = 10): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const chunks: BlobPart[] = [];
    const recorder = new MediaRecorder(stream);
    recorder.ondataavailable = (e) => e.data.size && chunks.push(e.data);
    recorder.onerror = () => reject(new Error("Recording failed"));
    recorder.onstop = () => resolve(new Blob(chunks, { type: recorder.mimeType }));
    recorder.start();
    setTimeout(() => recorder.state !== "inactive" && recorder.stop(), seconds * 1000);
  });
}
