// On-device "wake gate": a cheap check that runs ~100 times a second and fires
// when it hears sustained energy in the mosquito wingbeat band.
// Only after it fires do we record a clip and call the model.

export interface WakeGateOptions {
  bandLowHz?: number; // wingbeat band, lower edge
  bandHighHz?: number; // wingbeat band, upper edge
  checksPerSecond?: number;
  sustainMs?: number; // how long the band must stay hot before we trigger
  ratioThreshold?: number; // band power / total power
  minLevelDb?: number; // ignore near-silence
}

export interface WakeGateFrame {
  bandRatio: number; // 0–1
  levelDb: number;
  hotMs: number; // how long the band has been hot so far
}

export class WakeGate {
  private ctx: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;
  stream: MediaStream | null = null;
  private opts: Required<WakeGateOptions>;

  constructor(opts: WakeGateOptions = {}) {
    this.opts = {
      bandLowHz: 300,
      bandHighHz: 1000,
      checksPerSecond: 100,
      sustainMs: 1000,
      ratioThreshold: 0.5,
      minLevelDb: -70,
      ...opts,
    };
  }

  async start(onFrame: (f: WakeGateFrame) => void, onTrigger: () => void) {
    // Turn OFF browser processing: noise suppression can filter out wingbeat frequencies.
    this.stream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
    });
    this.ctx = new AudioContext();
    const source = this.ctx.createMediaStreamSource(this.stream);
    this.analyser = this.ctx.createAnalyser();
    this.analyser.fftSize = 2048;
    this.analyser.smoothingTimeConstant = 0;
    source.connect(this.analyser);

    const bins = new Float32Array(this.analyser.frequencyBinCount);
    const hzPerBin = this.ctx.sampleRate / this.analyser.fftSize;
    const lo = Math.floor(this.opts.bandLowHz / hzPerBin);
    const hi = Math.ceil(this.opts.bandHighHz / hzPerBin);
    const totalLo = Math.floor(100 / hzPerBin);
    const totalHi = Math.min(bins.length - 1, Math.ceil(4000 / hzPerBin));
    const intervalMs = 1000 / this.opts.checksPerSecond;
    let hotMs = 0;

    this.timer = setInterval(() => {
      if (!this.analyser) return;
      this.analyser.getFloatFrequencyData(bins);
      let band = 0;
      let total = 0;
      for (let i = totalLo; i <= totalHi; i++) {
        const p = Math.pow(10, bins[i] / 10); // dB -> linear power
        total += p;
        if (i >= lo && i <= hi) band += p;
      }
      const levelDb = 10 * Math.log10(total + 1e-12);
      const bandRatio = total > 0 ? band / total : 0;
      const hot = bandRatio >= this.opts.ratioThreshold && levelDb >= this.opts.minLevelDb;
      hotMs = hot ? hotMs + intervalMs : 0;
      onFrame({ bandRatio, levelDb, hotMs });
      if (hotMs >= this.opts.sustainMs) {
        hotMs = 0;
        onTrigger();
      }
    }, intervalMs);
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
