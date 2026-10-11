"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { Spectrogram } from "@/components/Spectrogram";
import classifyMock from "@/mocks/classify.json";
import { WakeGate, recordClip, type WakeGateFrame } from "@/lib/wakeGate";
import { readAutoSpeak, setAutoSpeak, speak as speakLine, stopSpeaking, subscribeAutoSpeak, unlockAudio } from "@/lib/voice";
import { LANGUAGES } from "@/lib/languages";
import { pickSpoken } from "@/lib/spoken";
import { DISEASE_LABEL, GENUS_INFO, carryInfo, listOr } from "@/lib/species";
import type {
  ClassifyResponse,
  Country,
  DistrictRisk,
  Language,
  PreventionResponse,
  RiskResponse,
  VoiceLanguagesResponse,
} from "@/lib/types";

// The "For you" screen under the intro: Shazam for mosquitoes, in the intro's poster palette.
// Left: live spectrogram, the big listen button, and the result row (species, how sure we are,
// risk in the chosen district, what it can carry). Right: three location-aware prevention
// actions, refined by a reliable mosquito signal and selected by Gemini when configured.

const INK = "#ECE6DA";
const ORANGE = "#F07636";
const RED = "#E0434A";
const TEAL = "#3DD39A";
const AMBER = "#F2B544";
const DISPLAY = { fontFamily: "'Bebas Neue', var(--font-geist-sans), sans-serif" };
const COND = { fontFamily: "'Roboto Condensed', var(--font-geist-sans), sans-serif" };
const MONO = { fontFamily: "'IBM Plex Mono', var(--font-geist-mono), monospace" };

const CLIP_SECONDS = 10;
// The picker offers Lagos and São Paulo; US (New York, from the backend) isn't on this screen yet.
const CITY: Record<Country, string> = { NG: "Lagos", BR: "São Paulo", US: "New York" };
const SAMPLE: Record<Country, string> = {
  NG: "/samples/anopheles-gambiae.wav",
  BR: "/samples/aedes-aegypti.wav",
  US: "/samples/aedes-aegypti.wav",
};
const PLACE_KEY = "mozzy-place";

type Stage = "idle" | "listening" | "recording" | "sample" | "uploading" | "result" | "error";
type Place = { country: Country; district: string };

function readPlaceRaw(): string | null {
  try {
    return localStorage.getItem(PLACE_KEY);
  } catch {
    return null;
  }
}
function parsePlace(raw: string | null): Place | null {
  try {
    const v = JSON.parse(raw ?? "null");
    return v && (v.country === "NG" || v.country === "BR") && typeof v.district === "string" ? v : null;
  } catch {
    return null;
  }
}
const noSubscribe = () => () => {};
function savePlace(p: Place) {
  try {
    localStorage.setItem(PLACE_KEY, JSON.stringify(p));
  } catch {
    // Blocked storage: the choice just won't survive a reload.
  }
}

const mmss = (s: number) => `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(Math.floor(s % 60)).padStart(2, "0")}`;

/** `loud` is for clips played at full volume, so they don't saturate the picture; the mic
 *  keeps a hotter range because a real mosquito is faint. */
function makeAnalyser(ctx: BaseAudioContext, loud = false): AnalyserNode {
  const an = ctx.createAnalyser();
  an.fftSize = 4096;
  an.smoothingTimeConstant = 0.35;
  an.minDecibels = loud ? -85 : -100;
  an.maxDecibels = loud ? -5 : -25;
  return an;
}

export function ListenScreen() {
  const [risk, setRisk] = useState<Record<Country, DistrictRisk[]>>({ NG: [], BR: [], US: [] });
  const [riskSimulated, setRiskSimulated] = useState(false);
  const [chosen, setChosen] = useState<Place | null>(null);
  const savedRaw = useSyncExternalStore(noSubscribe, readPlaceRaw, () => null);
  const [stage, setStage] = useState<Stage>("idle");
  const [analyser, setAnalyser] = useState<AnalyserNode | null>(null);
  const [epoch, setEpoch] = useState(0);
  const [elapsed, setElapsed] = useState(0);
  const [level, setLevel] = useState(0);
  const [result, setResult] = useState<ClassifyResponse | null>(null);
  const [clip, setClip] = useState<{ url: string; seconds: number } | null>(null);
  const [replaying, setReplaying] = useState(false);
  const [error, setError] = useState("");
  const [language, setLanguage] = useState<Language>("en");
  const [voiced, setVoiced] = useState<Language[]>([]);
  // Keyed by place, detection, and language so stale advice never appears after a switch.
  const [prevention, setPrevention] = useState<{ key: string; data: PreventionResponse } | null>(null);
  const [preventionRefresh, setPreventionRefresh] = useState(0);

  const gate = useRef<WakeGate | null>(null);
  const sampleCtx = useRef<AudioContext | null>(null);
  const frame = useRef<WakeGateFrame | null>(null);
  const startedAt = useRef(0);
  const run = useRef(0); // bumps on every start/stop so stale async work drops its result
  const replay = useRef<HTMLAudioElement | null>(null);
  const spokenFor = useRef<string | null>(null); // detection already read aloud
  const autoSpeak = useSyncExternalStore(subscribeAutoSpeak, readAutoSpeak, () => true);

  // District list + risk for both cities (the picker needs both).
  useEffect(() => {
    (["NG", "BR"] as Country[]).forEach((c) =>
      fetch(`/api/risk?country=${c}`)
        .then((r) => r.json())
        .then((d: RiskResponse) => {
          setRisk((prev) => ({ ...prev, [c]: d.districts }));
          if (d.is_simulated) setRiskSimulated(true);
        })
        .catch(() => {}),
    );
    fetch("/api/voice")
      .then((r) => r.json())
      .then((d: VoiceLanguagesResponse) => setVoiced(d.languages ?? []))
      .catch(() => setVoiced([]));
  }, []);

  // This visit's pick, else the last one saved on this device, else the first Lagos district.
  const place: Place = useMemo(() => {
    if (chosen) return chosen;
    const saved = parsePlace(savedRaw);
    if (saved && risk[saved.country].some((d) => d.district === saved.district)) return saved;
    return { country: "NG", district: risk.NG[0]?.district ?? "" };
  }, [chosen, savedRaw, risk]);

  const active = stage === "listening" || stage === "recording" || stage === "sample" || stage === "uploading";

  // Timer + wake-gate level, a few times a second (not 100×, which would re-render constantly).
  useEffect(() => {
    if (!active) return;
    const id = setInterval(() => {
      setElapsed((performance.now() - startedAt.current) / 1000);
      setLevel(frame.current?.bandRatio ?? 0);
    }, 200);
    return () => clearInterval(id);
  }, [active]);

  const releaseAudio = useCallback(() => {
    gate.current?.stop();
    gate.current = null;
    sampleCtx.current?.close().catch(() => {});
    sampleCtx.current = null;
    replay.current?.pause();
    setReplaying(false);
    setAnalyser(null);
  }, []);

  useEffect(() => releaseAudio, [releaseAudio]);

  const newClip = (blob: Blob, seconds: number) =>
    setClip((prev) => {
      if (prev) URL.revokeObjectURL(prev.url);
      return { url: URL.createObjectURL(blob), seconds };
    });

  /** Sends the clip for identification. Never throws for a server problem: if even our own
   *  route can't answer, it falls back to the labeled demo result so the screen never dead-ends. */
  async function classify(audio: Blob, filename: string, id: number, recordedAt: string, device = "web"): Promise<ClassifyResponse> {
    const form = new FormData();
    form.append("device", device); // "sample" uploads are stored as simulated, never as real detections
    form.append("audio", audio, filename);
    form.append("country", place.country);
    form.append("district", place.district);
    form.append("client_id", crypto.randomUUID());
    form.append("recorded_at", recordedAt);
    let data: ClassifyResponse;
    try {
      const res = await fetch("/api/classify", { method: "POST", body: form, signal: AbortSignal.timeout(30_000) });
      if (!res.ok) throw new Error(`status ${res.status}`);
      data = (await res.json()) as ClassifyResponse;
    } catch {
      const mock = (classifyMock as Record<Country, ClassifyResponse>)[place.country];
      data = { ...mock, detection_id: `offline-${Date.now()}`, is_simulated: true, fallback_reason: "Couldn't reach Mozzy's server" };
    }
    if (id !== run.current) throw new Error("stale");
    return data;
  }

  function beginUpload() {
    startedAt.current = performance.now();
    setElapsed(0);
    setStage("uploading");
  }

  function fail(e: unknown, id: number) {
    if (id !== run.current) return;
    releaseAudio();
    const msg = e instanceof Error ? e.message : String(e);
    setError(msg.includes("Permission") || msg.includes("NotAllowed") ? "Microphone blocked. Allow it in your browser settings." : msg);
    setStage("error");
  }

  async function onTrigger(id: number) {
    const g = gate.current;
    if (!g?.stream || id !== run.current) return;
    g.pause();
    const recordedAt = new Date().toISOString();
    setStage("recording");
    setEpoch((e) => e + 1); // the clip starts at 0 s on the spectrogram
    startedAt.current = performance.now();
    setElapsed(0);
    try {
      const blob = await recordClip(g.stream, CLIP_SECONDS);
      if (id !== run.current) return;
      g.stop();
      gate.current = null;
      setAnalyser(null); // freeze the picture of the clip
      newClip(blob, CLIP_SECONDS);
      beginUpload();
      const ext = blob.type.includes("mp4") ? "m4a" : blob.type.includes("ogg") ? "ogg" : "webm";
      const data = await classify(blob, `clip.${ext}`, id, recordedAt);
      setResult(data);
      setStage("result");
    } catch (e) {
      fail(e, id);
    }
  }

  async function startListening() {
    unlockAudio(); // inside the tap, so the result can speak later
    const id = ++run.current;
    releaseAudio();
    setError("");
    try {
      const g = new WakeGate();
      gate.current = g;
      await g.start((f) => (frame.current = f), () => onTrigger(id));
      if (id !== run.current) return g.stop();
      const an = makeAnalyser(g.context!);
      g.tap(an);
      setAnalyser(an);
      setEpoch((e) => e + 1);
      startedAt.current = performance.now();
      setElapsed(0);
      setStage("listening");
    } catch (e) {
      fail(e, id);
    }
  }

  function stop() {
    stopSpeaking();
    run.current++;
    releaseAudio();
    setStage(result ? "result" : "idle");
  }

  async function playSample() {
    unlockAudio();
    const id = ++run.current;
    releaseAudio();
    setError("");
    try {
      const ctx = new AudioContext();
      sampleCtx.current = ctx;
      const blob = await (await fetch(SAMPLE[place.country])).blob();
      const buf = await ctx.decodeAudioData(await blob.arrayBuffer());
      if (id !== run.current) return;
      const src = ctx.createBufferSource();
      src.buffer = buf;
      const an = makeAnalyser(ctx, true);
      src.connect(an);
      an.connect(ctx.destination);
      setAnalyser(an);
      setEpoch((e) => e + 1);
      startedAt.current = performance.now();
      setElapsed(0);
      setStage("sample");
      newClip(blob, buf.duration);
      // Identify while it plays; show the answer once the clip has finished.
      const answer = classify(blob, SAMPLE[place.country].split("/").pop()!, id, new Date().toISOString(), "sample");
      answer.catch(() => {}); // handled below
      await new Promise<void>((done) => {
        src.onended = () => done();
        src.start();
      });
      if (id !== run.current) return;
      ctx.close().catch(() => {});
      sampleCtx.current = null;
      setAnalyser(null);
      beginUpload();
      const data = await answer;
      setResult(data);
      setStage("result");
    } catch (e) {
      fail(e, id);
    }
  }

  async function captureNow() {
    await onTrigger(run.current);
  }

  function toggleReplay() {
    if (!clip) return;
    if (replaying) {
      replay.current?.pause();
      setReplaying(false);
      return;
    }
    if (!replay.current || replay.current.src !== clip.url) {
      replay.current?.pause();
      replay.current = new Audio(clip.url);
      replay.current.onended = () => setReplaying(false);
    }
    replay.current.currentTime = 0;
    replay.current.play().then(() => setReplaying(true)).catch(() => setReplaying(false));
  }

  // Update when the location, recording, or local mosquito data changes.
  useEffect(() => {
    const timer = setInterval(() => setPreventionRefresh((n) => n + 1), 5 * 60_000);
    return () => clearInterval(timer);
  }, []);
  const preventionKey = `${place.country}:${place.district}:${result?.detection_id ?? "none"}:${language}:${preventionRefresh}`;
  useEffect(() => {
    if (!place.district) return;
    const controller = new AbortController();
    const key = preventionKey;
    fetch("/api/prevention", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        country: place.country,
        district: place.district,
        language,
        detection: result?.is_mosquito ? {
          genus: result.genus,
          confidence: result.confidence,
          is_simulated: result.is_simulated,
        } : undefined,
      }),
      signal: controller.signal,
    })
      .then((r) => {
        if (!r.ok) throw new Error("Prevention unavailable");
        return r.json();
      })
      .then((data: PreventionResponse) => {
        if (!controller.signal.aborted && data.actions?.length === 3) setPrevention({ key, data });
      })
      .catch(() => {});
    return () => controller.abort();
  }, [place.country, place.district, result, language, preventionKey]);

  const shownPrevention = prevention?.key === preventionKey ? prevention.data : null;

  // Titles in the chosen language are read in its voice; untranslated ones in the English voice.
  const spoken = useMemo(() => (shownPrevention ? pickSpoken(shownPrevention, language) : null), [shownPrevention, language]);
  const voice = spoken?.voice ?? language;
  const spokenTitles = useMemo(() => spoken?.titles ?? [], [spoken]);
  const canSpeak = voiced.includes(voice);

  // Read the result aloud once per detection, as soon as its prevention actions are in.
  useEffect(() => {
    if (!autoSpeak || !canSpeak || !shownPrevention || !result?.is_mosquito || !spokenTitles.length) return;
    if (spokenFor.current === result.detection_id) return;
    spokenFor.current = result.detection_id;
    speakLine(spokenLine(result, spokenTitles, voice), voice);
  }, [autoSpeak, canSpeak, shownPrevention, result, voice, spokenTitles]);

  function speak() {
    if (!shownPrevention || !spokenTitles.length) return;
    unlockAudio();
    // With a result: species + actions; before one: just the district's actions.
    const text = result?.is_mosquito ? spokenLine(result, spokenTitles, voice) : spokenTitles.join(voice === "zh" ? "。" : ". ");
    speakLine(text, voice);
  }

  const district = risk[place.country].find((d) => d.district === place.district) ?? null;
  const timer =
    (stage === "result" || stage === "uploading") && clip ? clip.seconds : stage === "recording" ? Math.min(CLIP_SECONDS, elapsed) : active ? elapsed : 0;

  const HEADER: Record<Stage, string> = {
    idle: "Tap to listen",
    listening: "Listening",
    recording: "Recording",
    sample: "Sample clip",
    uploading: "Identifying",
    result: "Identified",
    error: "Error",
  };

  return (
    <div className="grid flex-1 gap-3 lg:min-h-0 lg:grid-cols-[minmax(0,1.62fr)_minmax(0,1fr)] lg:grid-rows-[minmax(0,1fr)]">
      {/* ---------- Listening card ---------- */}
      <section
        aria-label="Listen for a mosquito"
        className="flex min-w-0 flex-col border border-[#ECE6DA]/20 px-4 pt-4 pb-5 sm:px-7 sm:pt-6 lg:min-h-0 lg:overflow-hidden lg:pt-5 lg:pb-4"
      >
        {/* Header: state · place · timer */}
        <div className="flex flex-wrap items-center gap-x-6 gap-y-2 border-b border-[#ECE6DA]/20 pb-4 sm:pb-5">
          <span
            className="text-[22px] leading-none tracking-[0.18em] uppercase sm:text-[26px]"
            style={{ ...DISPLAY, color: stage === "error" ? RED : ORANGE }}
            aria-live="polite"
          >
            {HEADER[stage]}
          </span>
          <span className="hidden h-7 w-px bg-[#ECE6DA]/25 sm:block" />
          <label className="relative flex items-center gap-1.5 text-[19px] sm:text-[22px]" style={COND}>
            <span>{place.district ? `${place.district}, ${CITY[place.country]}` : "Choose a district"}</span>
            <span aria-hidden="true" className="text-sm opacity-50">▾</span>
            <select
              aria-label="Your district"
              className="absolute inset-0 cursor-pointer opacity-0 disabled:cursor-not-allowed"
              value={`${place.country}|${place.district}`}
              disabled={active}
              onChange={(e) => {
                const [country, d] = e.target.value.split("|") as [Country, string];
                const next = { country, district: d };
                setChosen(next);
                savePlace(next);
              }}
            >
              {(["NG", "BR"] as Country[]).map((c) => (
                <optgroup key={c} label={c === "NG" ? "Lagos, Nigeria" : "São Paulo, Brazil"}>
                  {risk[c].map((d) => (
                    <option key={d.district} value={`${c}|${d.district}`}>
                      {d.district}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
          </label>
          <span className="hidden h-7 w-px bg-[#ECE6DA]/25 sm:block" />
          <span className="text-[19px] tabular-nums sm:text-[22px]" style={COND}>
            {mmss(timer)}
          </span>
        </div>

        {/* Spectrogram */}
        <div className="relative mt-6 lg:mt-4 lg:flex lg:min-h-[110px] lg:flex-1 lg:flex-col">
          <Spectrogram
            source={analyser}
            epoch={epoch}
            windowSec={CLIP_SECONDS}
            showPlayhead={active || replaying}
            playhead={() => (replaying && replay.current ? replay.current.currentTime : null)}
            className="h-[190px] w-full overflow-hidden sm:h-[260px] lg:h-auto lg:min-h-0 lg:flex-1"
          />
          {/* Centre button: start listening when idle, replay the clip once there's a result */}
          {!active && (
            <button
              onClick={clip && stage === "result" ? toggleReplay : startListening}
              aria-label={clip && stage === "result" ? (replaying ? "Pause clip" : "Replay clip") : "Start listening"}
              className="absolute top-1/2 left-1/2 flex h-14 w-14 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border-2 border-[#ECE6DA]/90 bg-[#13110F]/70 backdrop-blur-sm transition-transform hover:scale-105"
            >
              {clip && stage === "result" ? (replaying ? <PauseIcon size={18} /> : <PlayIcon size={18} />) : <MicIcon size={20} />}
            </button>
          )}
          {stage === "uploading" && (
            <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-3 bg-[#13110F]/55" aria-live="polite">
              <span className="identify-bar h-[2px] w-40 overflow-hidden bg-[#ECE6DA]/15" aria-hidden="true">
                <span className="block h-full w-1/3" style={{ backgroundColor: ORANGE }} />
              </span>
              <span className="text-[22px] tracking-[0.16em] uppercase" style={DISPLAY}>
                {elapsed > 6 ? "Still identifying…" : "Identifying…"}
              </span>
              {elapsed > 6 && (
                <span className="text-[11px] tracking-[0.12em] uppercase opacity-60" style={MONO}>
                  Slow connection; a demo answer shows if the model doesn&apos;t reply
                </span>
              )}
            </div>
          )}
          {stage === "idle" && (
            <span
              className="pointer-events-none absolute inset-x-0 bottom-3 text-center text-[11px] tracking-[0.14em] uppercase opacity-60"
              style={MONO}
            >
              Hold your phone near the buzz
            </span>
          )}
        </div>
        {/* Time axis */}
        <div className="relative mt-0 h-7 border-t border-[#ECE6DA]/40" style={COND} aria-hidden="true">
          {Array.from({ length: CLIP_SECONDS + 1 }, (_, s) => (
            <span
              key={s}
              className={`absolute top-0 flex -translate-x-1/2 flex-col items-center text-[13px] opacity-80 sm:text-[15px] ${s % 2 ? "max-sm:hidden" : ""}`}
              style={{ left: `${(s / CLIP_SECONDS) * 100}%` }}
            >
              <span className="h-2 w-px bg-[#ECE6DA]/50" />
              <span className={s === 0 ? "translate-x-1/2" : s === CLIP_SECONDS ? "-translate-x-1/2" : ""}>{s}s</span>
            </span>
          ))}
        </div>

        {/* Controls */}
        <div className="mt-6 flex flex-wrap items-center gap-x-6 gap-y-3 border-b border-[#ECE6DA]/20 pb-6 lg:mt-4 lg:pb-4">
          <button
            onClick={active ? stop : startListening}
            aria-label={active ? "Stop" : "Start listening"}
            className="flex h-16 w-16 flex-none items-center justify-center rounded-full text-[#13110F] transition-transform hover:scale-105 sm:h-[76px] sm:w-[76px]"
            style={{ backgroundColor: ORANGE }}
          >
            {active ? <PauseIcon size={24} /> : <MicIcon size={26} />}
          </button>
          <Status stage={stage} level={level} countdown={Math.max(0, Math.ceil(CLIP_SECONDS - elapsed))} />
          <span className="h-9 w-px bg-[#ECE6DA]/20" />
          {stage === "listening" ? (
            <button onClick={captureNow} className="flex items-center gap-2.5 text-[22px] tracking-wider uppercase hover:opacity-80" style={DISPLAY}>
              <RecIcon /> Capture now
            </button>
          ) : (
            <button
              onClick={playSample}
              disabled={active || !place.district}
              className="flex items-center gap-2.5 text-[22px] tracking-wider uppercase hover:opacity-80 disabled:opacity-35"
              style={DISPLAY}
              title={`Play and identify a sample ${place.country === "NG" ? "Anopheles" : "Aedes"} clip`}
            >
              <WaveIcon /> Sample
            </button>
          )}
          {error && (
            <span className="basis-full text-sm" style={{ ...COND, color: RED }} role="alert">
              {error}
            </span>
          )}
        </div>

        {/* Result row */}
        <ResultRow result={result} district={district} city={CITY[place.country]} riskSimulated={riskSimulated} />
      </section>

      {/* ---------- Prevention card ---------- */}
      <section
        aria-label="Prevention steps"
        className="flex min-w-0 flex-col border border-[#ECE6DA]/20 px-5 pt-6 pb-6 sm:px-8 sm:pt-8 lg:min-h-0 lg:overflow-hidden lg:pt-6 lg:pb-5"
      >
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#ECE6DA]/20 pb-5">
          <h2 className="text-[40px] leading-none tracking-wide uppercase sm:text-[48px]" style={{ ...DISPLAY, color: ORANGE }}>
            Prevention
          </h2>
          <div className="flex items-center gap-3">
            {canSpeak && (
              <>
                <button
                  onClick={() => setAutoSpeak(!autoSpeak)}
                  aria-pressed={autoSpeak}
                  aria-label={autoSpeak ? "Auto-speak on: tap to mute" : "Auto-speak off: tap to turn on"}
                  title={autoSpeak ? "Results are read aloud. Tap to mute." : "Muted. Tap to read results aloud."}
                  className="flex h-9 items-center gap-2 rounded-full border border-[#ECE6DA]/30 px-3 text-[14px] hover:border-[#ECE6DA]"
                  style={COND}
                >
                  {autoSpeak ? <SpeakerIcon /> : <SpeakerOffIcon />}
                  <span className="max-sm:hidden">{autoSpeak ? "Auto" : "Muted"}</span>
                </button>
                <button
                  onClick={speak}
                  disabled={!shownPrevention}
                  aria-label="Read the steps aloud"
                  className="flex h-9 w-9 items-center justify-center rounded-full border border-[#ECE6DA]/40 hover:border-[#ECE6DA] disabled:opacity-30"
                >
                  <PlayIcon size={13} />
                </button>
              </>
            )}
            <label className="relative flex items-center gap-1.5 rounded-full border border-[#ECE6DA]/30 px-3.5 py-1.5 text-[15px]" style={COND}>
              <span>{LANGUAGES.find((l) => l.code === language)?.label}</span>
              <span aria-hidden="true" className="text-xs opacity-50">▾</span>
              <select
                aria-label="Advice language"
                className="absolute inset-0 cursor-pointer opacity-0"
                value={language}
                onChange={(e) => setLanguage(e.target.value as Language)}
              >
                {LANGUAGES.map((l) => (
                  <option key={l.code} value={l.code}>
                    {l.label}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </div>

        <p className="border-b border-[#ECE6DA]/20 py-3 text-[14px] leading-snug opacity-70" style={COND} aria-label="Mosquito evidence">
          {shownPrevention
            ? `${shownPrevention.context}${shownPrevention.basis === "general" ? " · General guidance" : ""}`
            : "Checking local mosquito data…"}
        </p>

        <ol className="flex flex-col lg:min-h-0 lg:flex-1 lg:overflow-y-auto" data-lenis-prevent lang={shownPrevention?.language ?? "en"}>
          {(shownPrevention?.actions ?? [null, null, null]).map((item, i) => (
            <li key={item?.id ?? i} className="flex items-start gap-6 border-b border-[#ECE6DA]/20 py-6 sm:gap-8 sm:py-8 lg:py-5">
              <span
                className="w-12 flex-none text-[44px] leading-none sm:text-[52px]"
                style={{ ...DISPLAY, color: ORANGE, opacity: item ? 1 : 0.35 }}
              >
                {String(i + 1).padStart(2, "0")}
              </span>
              <span className="h-14 w-px flex-none bg-[#ECE6DA]/20" />
              {item ? (
                <details className="min-w-0 flex-1 group" lang={item.language ?? shownPrevention?.language ?? "en"}>
                  <summary className="flex cursor-pointer list-none items-start justify-between gap-3 text-[22px] leading-tight font-light sm:text-[27px] [&::-webkit-details-marker]:hidden" style={COND}>
                    <span>{item.title}</span><span className="mt-1 flex-none text-sm opacity-50 group-open:hidden" aria-hidden="true">＋</span>
                  </summary>
                  <p className="mt-3 max-w-prose text-[16px] leading-snug opacity-75" style={COND}>{item.reason}</p>
                  <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-sm underline underline-offset-2" style={COND}>
                    <a href={item.sourceUrl} target="_blank" rel="noopener noreferrer">Why this action ↗</a>
                    {item.registryUrl && <a href={item.registryUrl} target="_blank" rel="noopener noreferrer">Check registration and label ↗</a>}
                  </div>
                </details>
              ) : (
                <span className="text-[22px] leading-tight font-light opacity-35 sm:text-[27px]" style={COND}>
                  {i === 0 ? "Preparing local guidance…" : "—"}
                </span>
              )}
            </li>
          ))}
        </ol>
        <p className="mt-auto pt-6 text-[15px] opacity-70" style={COND}>
          {!shownPrevention
            ? "Preparing advice for your district."
            : `${shownPrevention.source === "gemini" ? "By Gemini" : "From Mozzy guidance"}${
                spoken && !spoken.translated ? " · Translation unavailable, showing English" : ""
              }`}
        </p>
      </section>
    </div>
  );
}

/** What gets read aloud: the mosquito, (in English) what it carries, then the actions. */
function spokenLine(r: ClassifyResponse, steps: string[], language: Language): string {
  const name = r.species ?? GENUS_INFO[r.genus ?? "other"].label;
  const carry = carryInfo(r.species, r.genus, r.diseases);
  const sep = language === "zh" ? "。" : ". ";
  const body = steps.map((l) => l.replace(/[.。!！]+$/, "")).join(sep) + (language === "zh" ? "。" : ".");
  if (language === "en" && carry.main) {
    const disease = carry.main === "zika" || carry.main === "west_nile" ? DISEASE_LABEL[carry.main] : DISEASE_LABEL[carry.main].toLowerCase();
    return `${name}. This mosquito can carry ${disease}. ${body}`;
  }
  return `${name}${sep}${body}`;
}

function Status({ stage, level, countdown }: { stage: Stage; level: number; countdown: number }) {
  const map: Record<Stage, [string, string, boolean]> = {
    idle: ["Ready", TEAL, false],
    result: ["Ready", TEAL, false],
    listening: ["Listening", AMBER, true],
    recording: [`Buzz heard · ${countdown}s`, RED, true],
    sample: ["Playing sample", AMBER, true],
    uploading: ["Identifying…", AMBER, true],
    error: ["Try again", RED, false],
  };
  const [label, color, pulse] = map[stage];
  return (
    <span className="flex items-center gap-3 text-[22px] tracking-wider uppercase" style={{ ...DISPLAY, color }}>
      <span className="relative flex h-3.5 w-3.5">
        {pulse && <span className="absolute inset-0 animate-ping rounded-full opacity-60" style={{ backgroundColor: color }} />}
        <span className="relative h-3.5 w-3.5 rounded-full" style={{ backgroundColor: color }} />
      </span>
      {label}
      {stage === "listening" && (
        // How much of what the mic hears sits in the wingbeat band
        <span className="flex h-4 items-end gap-[3px]" aria-hidden="true">
          {[0.15, 0.3, 0.45, 0.6, 0.75].map((t) => (
            <span
              key={t}
              className="w-[3px] rounded-sm transition-colors"
              style={{ height: `${t * 100 + 20}%`, backgroundColor: level >= t ? color : "rgba(236,230,218,0.2)" }}
            />
          ))}
        </span>
      )}
    </span>
  );
}

function ResultRow({
  result,
  district,
  city,
  riskSimulated,
}: {
  result: ClassifyResponse | null;
  district: DistrictRisk | null;
  city: string;
  riskSimulated: boolean;
}) {
  const heard = result?.is_mosquito ? result : null;
  const carry = heard ? carryInfo(heard.species, heard.genus, heard.diseases) : null;
  const genusLabel = heard?.genus ? GENUS_INFO[heard.genus].label : null;
  const conf = heard ? Math.round(heard.confidence * 100) : null;
  const confLevel = conf == null ? null : conf >= 75 ? ["High confidence", TEAL] : conf >= 50 ? ["Medium confidence", AMBER] : ["Low confidence", RED];
  const score = district?.risk_score ?? null;
  const riskLevel = score == null ? null : score >= 67 ? 2 : score >= 34 ? 1 : 0;
  const riskColor = riskLevel === 2 ? RED : riskLevel === 1 ? ORANGE : TEAL;
  const dim = { opacity: 0.4 };
  // Risk near you stays out of the page until a clip has been identified (recorded or Sample).
  const showRisk = result !== null;
  const pitchOnly = heard?.model_version?.startsWith("pitch-rule") ?? false;
  const demoNote = !result?.is_simulated
    ? null
    : !result.fallback_reason || result.fallback_reason === "No model connected"
      ? "Demo mode: no model is connected yet, so this is a sample answer, not an identification of your clip."
      : `Demo result: ${result.fallback_reason.charAt(0).toLowerCase()}${result.fallback_reason.slice(1)}, so this is a sample answer, not your clip.`;

  return (
    <>
    {demoNote && (
      <p className="mt-5 flex items-start gap-2.5 border border-[#F2B544]/35 bg-[#F2B544]/[0.07] px-3 py-2 text-[14px] leading-snug lg:mt-3" style={COND} role="status">
        <span className="mt-[5px] h-2 w-2 flex-none rounded-full" style={{ backgroundColor: AMBER }} aria-hidden="true" />
        <span>{demoNote}</span>
      </p>
    )}
    <div
      className={`grid grid-cols-2 gap-y-6 pt-6 lg:pt-4 lg:divide-x lg:divide-[#ECE6DA]/20 ${showRisk ? "lg:grid-cols-4" : "lg:grid-cols-3"}`}
      style={COND}
    >
      {/* Species */}
      <div className="flex flex-col gap-1.5 pr-4 lg:pr-5">
        <Label>Species</Label>
        {heard ? (
          <>
            <span className="text-[26px] leading-[1.05] font-bold italic sm:text-[32px]">
              {heard.species ?? genusLabel}
            </span>
            <span className="text-[15px] opacity-75">{heard.species ? carry?.common ?? `${genusLabel} mosquito` : "Genus only · species unsure"}</span>
            {heard.is_simulated && <Chip>Demo result</Chip>}
          </>
        ) : result ? (
          <>
            <span className="text-[26px] leading-[1.05] font-bold sm:text-[30px]">No mosquito</span>
            <span className="text-[15px] opacity-75">That didn&apos;t sound like one. Try closer.</span>
          </>
        ) : (
          <>
            <span className="text-[26px] leading-[1.05] font-bold sm:text-[30px]" style={dim}>—</span>
            <span className="text-[15px]" style={dim}>Waiting for a buzz</span>
          </>
        )}
      </div>

      {/* How sure we are */}
      <div className="flex flex-col gap-1.5 pl-4 lg:px-5 max-lg:border-l max-lg:border-[#ECE6DA]/20">
        <Label>How sure we are</Label>
        <span className="text-[22px] leading-tight sm:text-[26px]" style={{ color: confLevel?.[1] ?? INK, opacity: confLevel ? 1 : 0.4 }}>
          {confLevel?.[0] ?? "—"}
        </span>
        <span className="flex items-baseline gap-2">
          <span className="text-[28px] font-bold leading-none sm:text-[32px]" style={{ color: confLevel?.[1] ?? TEAL, opacity: conf == null ? 0.4 : 1 }}>
            {conf == null ? "—" : `${conf}%`}
          </span>
          <span className="text-[15px] opacity-70">match</span>
        </span>
        <span className="relative mt-2 h-1.5 w-full max-w-[200px] bg-[#ECE6DA]/15">
          {conf != null && (
            <>
              <span className="absolute inset-y-0 left-0" style={{ width: `${conf}%`, backgroundColor: confLevel?.[1], opacity: 0.55 }} />
              <span className="absolute -top-1 h-3.5 w-[2px] -translate-x-1/2 bg-[#ECE6DA]" style={{ left: `${conf}%` }} />
            </>
          )}
        </span>
        <span className="flex max-w-[200px] justify-between text-[11px] opacity-50">
          <span>0</span>
          <span>100</span>
        </span>
        {conf != null && conf < 50 && (
          <span className="mt-1 max-w-[220px] text-[13px] leading-snug opacity-75">
            {pitchOnly ? "Pitch-only estimate." : "Rough guess."} Try again closer to the sound.
          </span>
        )}
      </div>

      {/* Risk near you */}
      {showRisk && (
      <div className="flex flex-col gap-1.5 pr-4 lg:px-5">
        <Label>Risk near you</Label>
        <span className="text-[22px] leading-tight sm:text-[26px]" style={{ color: riskColor, opacity: riskLevel == null ? 0.4 : 1 }}>
          {riskLevel == null ? "—" : ["Low risk", "Moderate risk", "High risk"][riskLevel]}
        </span>
        <span className="text-[30px] leading-none tracking-wide sm:text-[36px]" style={{ ...DISPLAY, color: riskColor, opacity: score == null ? 0.4 : 1 }}>
          {score == null ? "—" : `${score} / 100`}
        </span>
        <span className="mt-1.5 grid max-w-[200px] grid-cols-3 gap-[3px]">
          {[0, 1, 2].map((i) => (
            <span key={i} className="h-1.5" style={{ backgroundColor: riskLevel != null && i <= riskLevel ? riskColor : "rgba(236,230,218,0.15)" }} />
          ))}
        </span>
        <span className="grid max-w-[200px] grid-cols-3 text-[11px] opacity-50">
          <span>Low</span>
          <span>Moderate</span>
          <span>High</span>
        </span>
        {district && (
          <span className="mt-1 text-[13px] leading-snug opacity-75">
            {district.district}, {city}: {district.cases_14d.toLocaleString()} {DISEASE_LABEL[district.main_disease].toLowerCase()} cases
            in 14 days, {district.detections_7d} detections in 7 days{riskSimulated ? " (simulated)" : ""}
          </span>
        )}
      </div>
      )}

      {/* Can carry */}
      <div
        className={`flex flex-col gap-1.5 lg:pl-5 ${showRisk ? "pl-4 max-lg:border-l max-lg:border-[#ECE6DA]/20" : "pr-4"}`}
      >
        <Label>Can carry</Label>
        {carry?.main ? (
          <>
            <span className="text-[22px] leading-tight sm:text-[26px]">{DISEASE_LABEL[carry.main]}</span>
            <span className="text-[26px] leading-none tracking-wide uppercase sm:text-[32px]" style={DISPLAY}>
              {carry.role}
            </span>
            {carry.also.length > 0 && (
              <span className="mt-1 text-[14px] leading-snug opacity-75">
                Also: {carry.also.map((d) => DISEASE_LABEL[d]).join(", ")}
              </span>
            )}
            {carry.not.length > 0 && <span className="text-[14px] opacity-45">Not {listOr(carry.not)}</span>}
          </>
        ) : (
          <>
            <span className="text-[22px] leading-tight sm:text-[26px]" style={dim}>—</span>
            <span className="text-[14px]" style={dim}>
              {result && !heard ? "Nothing to report" : "Which diseases it can spread"}
            </span>
          </>
        )}
      </div>
    </div>
    </>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return (
    <span className="text-[11px] tracking-[0.18em] uppercase opacity-55" style={MONO}>
      {children}
    </span>
  );
}

function Chip({ children }: { children: React.ReactNode }) {
  return (
    <span className="mt-1 w-fit border border-[#ECE6DA]/30 px-1.5 py-0.5 text-[10px] tracking-[0.14em] uppercase opacity-70" style={MONO}>
      {children}
    </span>
  );
}

/* ---------- icons ---------- */
function PauseIcon({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" fill="currentColor">
      <rect x="5" y="4" width="5" height="16" rx="1" />
      <rect x="14" y="4" width="5" height="16" rx="1" />
    </svg>
  );
}
function PlayIcon({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" fill="currentColor">
      <path d="M7 4.5v15a1 1 0 0 0 1.5.86l12.5-7.5a1 1 0 0 0 0-1.72L8.5 3.64A1 1 0 0 0 7 4.5z" />
    </svg>
  );
}
function MicIcon({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
      <rect x="9" y="3" width="6" height="11" rx="3" fill="currentColor" stroke="none" />
      <path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21" />
    </svg>
  );
}
function WaveIcon() {
  return (
    <svg width="26" height="20" viewBox="0 0 26 20" aria-hidden="true" fill="currentColor">
      {[[1, 8, 4], [6, 4, 12], [11, 0, 20], [16, 5, 10], [21, 8, 4]].map(([x, y, h]) => (
        <rect key={x} x={x} y={y} width="2" height={h} rx="1" />
      ))}
    </svg>
  );
}
function RecIcon() {
  return <span className="h-3.5 w-3.5 rounded-full" style={{ backgroundColor: RED }} aria-hidden="true" />;
}
function SpeakerOffIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <path d="M4 9v6h4l5 4V5L8 9H4z" fill="currentColor" />
      <path d="M17 9.5l5 5M22 9.5l-5 5" />
    </svg>
  );
}

function SpeakerIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <path d="M4 9v6h4l5 4V5L8 9H4z" fill="currentColor" />
      <path d="M16.5 8.5a5 5 0 0 1 0 7M19 6a8.5 8.5 0 0 1 0 12" />
    </svg>
  );
}
