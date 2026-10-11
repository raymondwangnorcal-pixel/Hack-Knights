"use client";

import { LANGUAGES } from "@/lib/languages";
import type { Language, PreventionResponse } from "@/lib/types";

// The Prevention card in the poster palette: header with voice and language controls, a one-line
// evidence row, three numbered actions that expand to a reason and source link, and a footer
// naming who chose them. Same markup as the card on the For you listening screen, so both sides
// read as one product; the For prevention side uses it for health-team actions.

const ORANGE = "#F07636";
const DISPLAY = { fontFamily: "'Bebas Neue', var(--font-geist-sans), sans-serif" };
const COND = { fontFamily: "'Roboto Condensed', var(--font-geist-sans), sans-serif" };

interface PreventionCardProps {
  title?: string;
  data: PreventionResponse | null;
  language: Language;
  onLanguage: (l: Language) => void;
  canSpeak: boolean;
  autoSpeak: boolean;
  onAutoSpeak: (on: boolean) => void;
  onSpeak: () => void;
  /** Shown before the evidence line, e.g. the district name. */
  contextPrefix?: string;
  loadingContext?: string;
  loadingFooter?: string;
}

export function PreventionCard({
  title = "Prevention",
  data,
  language,
  onLanguage,
  canSpeak,
  autoSpeak,
  onAutoSpeak,
  onSpeak,
  contextPrefix,
  loadingContext = "Checking local mosquito data…",
  loadingFooter = "Preparing advice for your district.",
}: PreventionCardProps) {
  return (
    <section aria-label={`${title} steps`} className="flex min-w-0 flex-col border border-[#ECE6DA]/20 px-5 pt-6 pb-6 sm:px-8 sm:pt-8">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#ECE6DA]/20 pb-5">
        <h2 className="text-[40px] leading-none tracking-wide uppercase sm:text-[48px]" style={{ ...DISPLAY, color: ORANGE }}>
          {title}
        </h2>
        <div className="flex items-center gap-3">
          {canSpeak && (
            <>
              <button
                onClick={() => onAutoSpeak(!autoSpeak)}
                aria-pressed={autoSpeak}
                aria-label={autoSpeak ? "Auto-speak on: tap to mute" : "Auto-speak off: tap to turn on"}
                title={autoSpeak ? "Plans are read aloud. Tap to mute." : "Muted. Tap to read plans aloud."}
                className="flex h-9 items-center gap-2 rounded-full border border-[#ECE6DA]/30 px-3 text-[14px] hover:border-[#ECE6DA]"
                style={COND}
              >
                {autoSpeak ? <SpeakerIcon /> : <SpeakerOffIcon />}
                <span className="max-sm:hidden">{autoSpeak ? "Auto" : "Muted"}</span>
              </button>
              <button
                onClick={onSpeak}
                disabled={!data}
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
              onChange={(e) => onLanguage(e.target.value as Language)}
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

      <p className="border-b border-[#ECE6DA]/20 py-3 text-[14px] leading-snug opacity-70" style={COND} aria-label="Evidence">
        {data
          ? `${contextPrefix ? `${contextPrefix} · ` : ""}${data.context}${data.basis === "general" ? " · General guidance" : ""}`
          : loadingContext}
      </p>

      <ol className="flex flex-col" lang={data?.language ?? "en"}>
        {(data?.actions ?? [null, null, null]).map((item, i) => (
          <li key={item?.id ?? i} className="flex items-start gap-6 border-b border-[#ECE6DA]/20 py-6 sm:gap-8 sm:py-8">
            <span className="w-12 flex-none text-[44px] leading-none sm:text-[52px]" style={{ ...DISPLAY, color: ORANGE, opacity: item ? 1 : 0.35 }}>
              {String(i + 1).padStart(2, "0")}
            </span>
            <span className="h-14 w-px flex-none bg-[#ECE6DA]/20" />
            {item ? (
              <details className="group min-w-0 flex-1" lang={item.language ?? data?.language ?? "en"}>
                <summary
                  className="flex cursor-pointer list-none items-start justify-between gap-3 text-[22px] leading-tight font-light sm:text-[27px] [&::-webkit-details-marker]:hidden"
                  style={COND}
                >
                  <span>{item.title}</span>
                  <span className="mt-1 flex-none text-sm opacity-50 group-open:hidden" aria-hidden="true">＋</span>
                </summary>
                <p className="mt-3 max-w-prose text-[16px] leading-snug opacity-75" style={COND}>{item.reason}</p>
                <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-sm underline underline-offset-2" style={COND}>
                  <a href={item.sourceUrl} target="_blank" rel="noopener noreferrer">Why this action ↗</a>
                  {item.registryUrl && (
                    <a href={item.registryUrl} target="_blank" rel="noopener noreferrer">Check registration and label ↗</a>
                  )}
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
        {!data ? loadingFooter : data.source === "gemini" ? "By Gemini" : "From Mozzy guidance"}
      </p>
    </section>
  );
}

export function PlayIcon({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" fill="currentColor">
      <path d="M7 4.5v15a1 1 0 0 0 1.5.86l12.5-7.5a1 1 0 0 0 0-1.72L8.5 3.64A1 1 0 0 0 7 4.5z" />
    </svg>
  );
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
