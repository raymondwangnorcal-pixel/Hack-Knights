"use client";

import { useEffect, useId, useRef, useState, type CSSProperties, type ReactNode } from "react";

// A label with an (i) mark that opens an information box: on hover, or pinned open by clicking
// (click again, click elsewhere or press Esc to close). The mark and the dotted underline are the
// "this explains itself" cue.

const INK = "#ECE6DA";
const MONO = { fontFamily: "'IBM Plex Mono', var(--font-geist-mono), monospace" };

interface InfoTipProps {
  /** What is shown in the page, e.g. "71 out of 100" or a column heading. */
  children: ReactNode;
  /** Heading of the box. */
  title: string;
  /** Body of the box. */
  body: ReactNode;
  side?: "top" | "bottom";
  align?: "left" | "right";
  width?: number;
  /** Styles for the clickable label (colour, size, alignment). */
  style?: CSSProperties;
  className?: string;
  /** Dotted underline under the whole label (default). Turn off to underline only part of it yourself. */
  underline?: boolean;
}

export function InfoTip({ children, title, body, side = "bottom", align = "left", width = 300, style, className, underline = true }: InfoTipProps) {
  const [hover, setHover] = useState(false);
  const [pinned, setPinned] = useState(false);
  const wrap = useRef<HTMLSpanElement>(null);
  const id = useId();
  const open = hover || pinned;

  useEffect(() => {
    if (!pinned) return;
    const away = (e: PointerEvent) => {
      if (!wrap.current?.contains(e.target as Node)) setPinned(false);
    };
    const esc = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.stopPropagation();
      setPinned(false);
    };
    document.addEventListener("pointerdown", away);
    window.addEventListener("keydown", esc, true);
    return () => {
      document.removeEventListener("pointerdown", away);
      window.removeEventListener("keydown", esc, true);
    };
  }, [pinned]);

  return (
    <span
      ref={wrap}
      className="relative inline-flex"
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
    >
      <button
        type="button"
        aria-expanded={open}
        aria-describedby={open ? id : undefined}
        onClick={() => setPinned((p) => !p)}
        className={`inline-flex cursor-pointer items-start gap-1 text-inherit ${className ?? ""}`}
        style={underline ? { textDecoration: "underline dotted", textUnderlineOffset: 4, textDecorationColor: `${INK}80`, ...style } : style}
      >
        {children}
        <svg
          width="12"
          height="12"
          viewBox="0 0 12 12"
          fill="none"
          stroke="currentColor"
          strokeWidth="1"
          aria-hidden="true"
          className="mt-[1px] flex-none opacity-80"
        >
          <circle cx="6" cy="6" r="5" />
          <path d="M6 5.2v3.2M6 3.4v.1" strokeLinecap="round" />
        </svg>
      </button>
      {open && (
        <span
          role="tooltip"
          id={id}
          data-infotip-open
          className="absolute z-30 block rounded-sm border p-3 text-left normal-case"
          style={{
            ...MONO,
            width,
            maxWidth: "calc(100vw - 2rem)",
            [side === "top" ? "bottom" : "top"]: "calc(100% + 8px)",
            [align === "right" ? "right" : "left"]: 0,
            borderColor: `${INK}4d`,
            backgroundColor: "rgba(19,17,15,0.97)",
            boxShadow: "0 8px 24px rgba(0,0,0,0.5)",
            color: INK,
            letterSpacing: 0,
            textDecoration: "none",
            whiteSpace: "normal",
            fontWeight: 400,
            cursor: "default",
          }}
        >
          <span className="block text-[11px] font-bold tracking-[0.12em] uppercase">{title}</span>
          <span className="mt-1.5 block text-[12px] leading-snug" style={{ color: `${INK}d9` }}>
            {body}
          </span>
        </span>
      )}
    </span>
  );
}
