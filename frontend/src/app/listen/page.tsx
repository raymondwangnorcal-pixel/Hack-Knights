"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { WakeGate, recordClip, type WakeGateFrame } from "@/lib/wakeGate";
import { DISEASE_LABEL, GENUS_INFO } from "@/lib/species";
import type { ClassifyResponse, Country, RiskResponse } from "@/lib/types";

type Stage = "idle" | "listening" | "recording" | "uploading" | "result" | "error";

const CLIP_SECONDS = 10;

export default function ListenPage() {
  const [stage, setStage] = useState<Stage>("idle");
  const [country, setCountry] = useState<Country>("NG");
  const [districts, setDistricts] = useState<string[]>([]);
  const [district, setDistrict] = useState("");
  const [frame, setFrame] = useState<WakeGateFrame | null>(null);
  const [countdown, setCountdown] = useState(CLIP_SECONDS);
  const [result, setResult] = useState<ClassifyResponse | null>(null);
  const [advice, setAdvice] = useState("");
  const [error, setError] = useState("");
  const gate = useRef<WakeGate | null>(null);

  useEffect(() => {
    fetch(`/api/risk?country=${country}`)
      .then((r) => r.json())
      .then((data: RiskResponse) => {
        const names = data.districts.map((d) => d.district);
        setDistricts(names);
        setDistrict(names[0] ?? "");
      });
  }, [country]);

  useEffect(() => () => gate.current?.stop(), []);

  async function classify(audio: Blob) {
    setStage("uploading");
    const form = new FormData();
    form.append("audio", audio, "clip.webm");
    form.append("country", country);
    form.append("district", district);
    const res = await fetch("/api/classify", { method: "POST", body: form });
    if (!res.ok) throw new Error((await res.json()).error ?? "Classification failed");
    const data = (await res.json()) as ClassifyResponse;
    setResult(data);
    setStage("result");

    const rec = await fetch("/api/recommend", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ kind: "species_advice", species: data.species, genus: data.genus }),
    });
    setAdvice((await rec.json()).text ?? "");
  }

  async function onTrigger() {
    const g = gate.current;
    if (!g?.stream) return;
    g.pause();
    setStage("recording");
    setCountdown(CLIP_SECONDS);
    const tick = setInterval(() => setCountdown((c) => Math.max(0, c - 1)), 1000);
    try {
      const clip = await recordClip(g.stream, CLIP_SECONDS);
      clearInterval(tick);
      g.stop();
      await classify(clip);
    } catch (e) {
      clearInterval(tick);
      g.stop();
      setError(String(e));
      setStage("error");
    }
  }

  async function startListening() {
    setError("");
    setResult(null);
    setAdvice("");
    try {
      gate.current = new WakeGate();
      await gate.current.start(setFrame, onTrigger);
      setStage("listening");
    } catch (e) {
      setError(`Microphone unavailable: ${String(e)}`);
      setStage("error");
    }
  }

  function stopListening() {
    gate.current?.stop();
    setStage("idle");
  }

  async function onFile(file: File) {
    try {
      await classify(file);
    } catch (e) {
      setError(String(e));
      setStage("error");
    }
  }

  async function playVoice() {
    const text = advice || (result ? GENUS_INFO[result.genus ?? "other"].nextSteps.join(" ") : "");
    const res = await fetch("/api/voice", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text, language: "en" }),
    });
    if (!res.ok) {
      setError((await res.json()).error ?? "Voice unavailable");
      return;
    }
    new Audio(URL.createObjectURL(await res.blob())).play();
  }

  const genusInfo = result ? GENUS_INFO[result.genus ?? "other"] : null;

  return (
    <div className="theme-light flex min-h-screen flex-1 flex-col">
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col gap-6 px-4 py-8">
      <header className="flex items-center justify-between">
        <Link href="/" className="text-sm opacity-60">← Mozzy</Link>
        <Link href="/dashboard" className="text-sm opacity-60">Dashboard →</Link>
      </header>

      <div className="flex gap-2">
        <select
          className="flex-1 rounded-lg border px-3 py-2"
          value={country}
          onChange={(e) => setCountry(e.target.value as Country)}
          disabled={stage !== "idle" && stage !== "result" && stage !== "error"}
        >
          <option value="NG">Nigeria (Lagos)</option>
          <option value="BR">Brazil (São Paulo)</option>
        </select>
        <select
          className="flex-1 rounded-lg border px-3 py-2"
          value={district}
          onChange={(e) => setDistrict(e.target.value)}
          disabled={stage !== "idle" && stage !== "result" && stage !== "error"}
        >
          {districts.map((d) => (
            <option key={d}>{d}</option>
          ))}
        </select>
      </div>

      {(stage === "idle" || stage === "result" || stage === "error") && (
        <div className="flex flex-col gap-3">
          <button
            onClick={startListening}
            className="rounded-full bg-foreground py-4 text-lg font-semibold text-background"
          >
            Start listening
          </button>
          <label className="cursor-pointer text-center text-sm underline opacity-60">
            Or upload a recording
            <input
              type="file"
              accept="audio/*"
              className="hidden"
              onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])}
            />
          </label>
        </div>
      )}

      {stage === "listening" && (
        <section className="flex flex-col items-center gap-4">
          <p className="text-lg font-semibold">Listening for a buzz…</p>
          <div className="h-3 w-full overflow-hidden rounded-full bg-current/10">
            <div
              className="h-full bg-amber-500 transition-[width]"
              style={{ width: `${Math.round((frame?.bandRatio ?? 0) * 100)}%` }}
            />
          </div>
          <p className="text-xs opacity-60">
            Wingbeat band {Math.round((frame?.bandRatio ?? 0) * 100)}% · held{" "}
            {Math.round(frame?.hotMs ?? 0)} ms / 1000 ms
          </p>
          <div className="flex gap-3">
            <button onClick={onTrigger} className="rounded-full border px-4 py-2 text-sm">
              Capture now
            </button>
            <button onClick={stopListening} className="rounded-full border px-4 py-2 text-sm">
              Stop
            </button>
          </div>
        </section>
      )}

      {stage === "recording" && (
        <p className="text-center text-lg font-semibold">Buzz detected · recording {countdown}s</p>
      )}
      {stage === "uploading" && <p className="text-center text-lg">Identifying…</p>}

      {stage === "result" && result && genusInfo && (
        <section className="flex flex-col gap-4 rounded-2xl border p-5">
          {result.is_simulated && (
            <span className="self-start rounded-full bg-current/10 px-2 py-0.5 text-xs">
              Simulated result
            </span>
          )}
          {!result.is_mosquito ? (
            <p className="text-lg font-semibold">That didn&apos;t sound like a mosquito. Try again closer.</p>
          ) : (
            <>
              <div>
                <p className="text-sm opacity-60">Most likely</p>
                <p className="text-2xl font-semibold">{result.species ?? `${genusInfo.label} (genus)`}</p>
              </div>
              <div>
                <div className="h-2 w-full overflow-hidden rounded-full bg-current/10">
                  <div className="h-full bg-amber-500" style={{ width: `${result.confidence * 100}%` }} />
                </div>
                <p className="mt-1 text-xs opacity-60">{Math.round(result.confidence * 100)}% confidence</p>
              </div>
              {result.diseases.length > 0 && (
                <div>
                  <p className="text-sm opacity-60">This species can carry</p>
                  <div className="mt-1 flex flex-wrap gap-2">
                    {result.diseases.map((d) => (
                      <span key={d} className="rounded-full bg-red-500/15 px-3 py-1 text-sm">
                        {DISEASE_LABEL[d]}
                      </span>
                    ))}
                  </div>
                </div>
              )}
              <div>
                <p className="text-sm opacity-60">What to do</p>
                <p className="mt-1">{advice || genusInfo.nextSteps.join(" ")}</p>
              </div>
              <button onClick={playVoice} className="rounded-full border py-2 text-sm">
                ▶ Play advice
              </button>
            </>
          )}
        </section>
      )}

      {error && <p className="text-sm text-red-600">{error}</p>}
    </main>
    </div>
  );
}
