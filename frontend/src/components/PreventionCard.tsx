"use client";

import { LANGUAGES } from "@/lib/languages";
import { useVoiceState } from "@/lib/voice";
import { pickSpoken, pickSpokenFull } from "@/lib/spoken";
import type { Language, PreventionResponse } from "@/lib/types";

// The Prevention card in the poster palette: header with voice and language controls, a one-line
// evidence row, three numbered actions that expand to a reason and source link, and a footer
// naming who chose them. Same markup as the card on the For you listening screen, so both sides
// read as one product; the For prevention side uses it for health-team actions.

const ORANGE = "#F07636";
const DISPLAY = { fontFamily: "'Bebas Neue', var(--font-geist-sans), sans-serif" };
const COND = { fontFamily: "'Roboto Condensed', var(--font-geist-sans), sans-serif" };
const MONO = { fontFamily: "'IBM Plex Mono', var(--font-geist-mono), monospace" };
/** Start delay for the For prevention fill-in; has no effect outside that page (see .pv in globals.css). */
const pvDelay = (ms: number) => ({ "--pv-d": `${ms}ms` }) as React.CSSProperties;

interface PreventionCardProps {
  title?: string;
  data: PreventionResponse | null;
  language: Language;
  onLanguage: (l: Language) => void;
  canSpeak: boolean;
  onSpeak: () => void;
  /** Show every action's reason without a tap (the Action plan). */
  expanded?: boolean;
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
  onSpeak,
  expanded = false,
  contextPrefix,
  loadingContext = "Checking local mosquito data…",
  loadingFooter = "Preparing advice for your district.",
}: PreventionCardProps) {
  const voice = useVoiceState();
  const speaking = voice === "playing";
  return (
    <section
      aria-label={`${title} steps`}
      data-pv="right"
      style={pvDelay(250)}
      className="flex min-w-0 flex-col border border-[#ECE6DA]/20 px-5 pt-6 pb-6 sm:px-8 sm:pt-8"
    >
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#ECE6DA]/20 pb-5">
        <h2 className="text-[40px] leading-none tracking-wide uppercase sm:text-[48px]" style={{ ...DISPLAY, color: ORANGE }}>
          {title}
        </h2>
        <div className="flex items-center gap-3">
          {canSpeak && (
            <>
              <button
                onClick={onSpeak}
                disabled={!data && !speaking}
                aria-label={speaking ? "Pause reading" : voice === "loading" ? "Preparing audio" : "Read the steps aloud"}
                aria-pressed={speaking}
                aria-busy={voice === "loading"}
                className="flex h-9 w-9 items-center justify-center rounded-full border border-[#ECE6DA]/40 hover:border-[#ECE6DA] disabled:opacity-30"
              >
                {speaking ? <PauseIcon size={13} /> : voice === "loading" ? <SpinnerIcon size={14} /> : <PlayIcon size={13} />}
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

      {data?.stats?.length ? (
        // The numbers behind the plan, one labeled cell each, so they read at a glance.
        <div className="border-b border-[#ECE6DA]/20 py-4" aria-label="Evidence">
          {contextPrefix && (
            <p className="mb-3 text-[13px] tracking-[0.18em] uppercase" style={{ ...MONO, color: ORANGE }}>
              {contextPrefix}
            </p>
          )}
          <dl className="grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-3">
            {data.stats.map((s, i) => (
              <div key={s.label} className="min-w-0" data-pv="up" style={pvDelay(650 + i * 70)}>
                <dt className="text-[10px] tracking-[0.16em] uppercase opacity-55" style={MONO}>
                  {s.label}
                </dt>
                <dd className="m-0 mt-0.5 text-[17px] leading-tight" style={COND}>
                  {s.value}
                </dd>
              </div>
            ))}
          </dl>
        </div>
      ) : (
        <p className="border-b border-[#ECE6DA]/20 py-3 text-[14px] leading-snug opacity-70" style={COND} aria-label="Evidence">
          {data
            ? `${contextPrefix ? `${contextPrefix} · ` : ""}${data.context}${data.basis === "general" ? " · General guidance" : ""}`
            : loadingContext}
        </p>
      )}

      <ol className="flex flex-col" lang={data?.language ?? "en"}>
        {(data?.actions ?? [null, null, null]).map((item, i) => (
          <li key={item?.id ?? i} data-pv="up" style={pvDelay(950 + i * 140)} className="flex items-start gap-6 border-b border-[#ECE6DA]/20 py-6 sm:gap-8 sm:py-8">
            <span className="w-12 flex-none text-[44px] leading-none sm:text-[52px]" style={{ ...DISPLAY, color: ORANGE, opacity: item ? 1 : 0.35 }}>
              {String(i + 1).padStart(2, "0")}
            </span>
            <span className="h-14 w-px flex-none bg-[#ECE6DA]/20" />
            {item ? (
              <details className="group min-w-0 flex-1" open={expanded} lang={item.language ?? data?.language ?? "en"}>
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
        {!data
          ? loadingFooter
          : `By Gemini${
              !(expanded ? pickSpokenFull(data, language) : pickSpoken(data, language)).translated ? " · Translation unavailable, showing English" : ""
            }`}
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

export function SpinnerIcon({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="3" className="animate-spin">
      <path d="M12 3a9 9 0 1 1-9 9" strokeLinecap="round" />
    </svg>
  );
}

export function PauseIcon({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" fill="currentColor">
      <rect x="5" y="4" width="5" height="16" rx="1" />
      <rect x="14" y="4" width="5" height="16" rx="1" />
    </svg>
  );
}
