"use client";

// Odometer-style number: each digit is a vertical strip of 0–9 that scrolls to the
// current value. Commas and other characters stay put.

const DIGITS = ["0", "1", "2", "3", "4", "5", "6", "7", "8", "9"];

export function RollingNumber({
  value,
  className = "",
}: {
  value: number | null;
  className?: string;
}) {
  if (value === null) return <span className={className}>—</span>;
  const text = value.toLocaleString("en-US");

  return (
    <span className={`inline-flex overflow-hidden leading-none ${className}`} aria-label={text}>
      {text.split("").map((ch, i) => {
        // Key from the right so digits keep their identity as the number grows.
        const key = text.length - i;
        if (ch < "0" || ch > "9") {
          return (
            <span key={`s${key}`} aria-hidden="true">
              {ch}
            </span>
          );
        }
        const d = ch.charCodeAt(0) - 48;
        return (
          <span key={`d${key}`} aria-hidden="true" className="relative inline-block h-[1em] w-[0.62em] overflow-hidden">
            <span
              className="absolute inset-x-0 top-0 flex flex-col transition-transform duration-300 ease-out"
              style={{ transform: `translateY(-${d * 10}%)` }}
            >
              {DIGITS.map((n) => (
                <span key={n} className="block h-[1em] text-center">
                  {n}
                </span>
              ))}
            </span>
          </span>
        );
      })}
    </span>
  );
}
