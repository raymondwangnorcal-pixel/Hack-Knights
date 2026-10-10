import Link from "next/link";
import { LiveCounter } from "@/components/LiveCounter";
import { CASES_PER_SECOND, SECONDS_PER_DEATH } from "@/lib/burden";

// Landing page: two sides. Consumer (light) on the left, government/nonprofit (dark) on the right.
// Colors follow vercel.com: pure white / pure black, neutral grays, hairline borders, Geist.

export default function Home() {
  return (
    <main className="relative flex min-h-screen flex-1 flex-col md:flex-row">
      {/* Wordmark straddles both sides; mix-blend-difference keeps it visible on white and black. */}
      <div className="pointer-events-none absolute inset-x-0 top-6 z-10 flex justify-center mix-blend-difference">
        <span className="flex items-center gap-2 text-lg font-semibold tracking-tight text-white">
          <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
            <path d="M12 3 22 20H2z" fill="currentColor" />
          </svg>
          Mozzy
        </span>
      </div>

      {/* Consumer side — light */}
      <section className="group flex flex-1 flex-col justify-between gap-12 bg-white px-6 pt-20 pb-10 text-black transition-[flex-grow] duration-500 sm:px-12 md:hover:flex-[1.25]">
        <LiveCounter
          tone="light"
          ratePerSecond={CASES_PER_SECOND}
          label="Mosquito-borne infections this year"
          sublabel={`≈ ${CASES_PER_SECOND.toFixed(1)} people every second · malaria and dengue`}
        />

        <div className="flex max-w-md flex-col gap-5">
          <span className="w-fit rounded-full border border-neutral-200 px-3 py-1 font-mono text-xs uppercase tracking-wider text-neutral-500">
            For everyone
          </span>
          <h1 className="text-4xl font-semibold leading-[1.05] tracking-tight sm:text-5xl">
            Hear the mosquito.
            <br />
            Know the risk.
          </h1>
          <p className="text-lg text-neutral-600">
            Mozzy listens for a mosquito&apos;s buzz, names the species, and tells you which
            diseases it can carry and what to do next.
          </p>
          <ul className="flex flex-col gap-2 text-sm text-neutral-600">
            <li className="flex gap-2"><span className="text-neutral-400">01</span> Identify mosquitoes by sound, like Shazam</li>
            <li className="flex gap-2"><span className="text-neutral-400">02</span> Get next steps in your language, read aloud</li>
            <li className="flex gap-2"><span className="text-neutral-400">03</span> See risk in your neighborhood</li>
          </ul>
        </div>

        <Link
          href="/listen"
          className="flex w-fit items-center gap-2 rounded-full bg-black px-6 py-3 text-sm font-medium text-white transition-colors hover:bg-neutral-800"
        >
          Start listening <span aria-hidden="true">→</span>
        </Link>
      </section>

      {/* Government / nonprofit side — dark */}
      <section className="group flex flex-1 flex-col justify-between gap-12 border-t border-neutral-800 bg-black px-6 pt-20 pb-10 text-white transition-[flex-grow] duration-500 sm:px-12 md:border-t-0 md:border-l md:hover:flex-[1.25]">
        <LiveCounter
          tone="dark"
          ratePerSecond={1 / SECONDS_PER_DEATH}
          label="Mosquito-borne deaths this year"
          sublabel={`1 person every ${Math.round(SECONDS_PER_DEATH)} seconds · malaria and dengue`}
        />

        <div className="flex max-w-md flex-col gap-5">
          <span className="w-fit rounded-full border border-neutral-800 px-3 py-1 font-mono text-xs uppercase tracking-wider text-neutral-400">
            For governments &amp; nonprofits
          </span>
          <h2 className="text-4xl font-semibold leading-[1.05] tracking-tight sm:text-5xl">
            See outbreaks
            <br />
            before they spread.
          </h2>
          <p className="text-lg text-neutral-400">
            Turn thousands of phone detections into a live risk map, 4-week forecasts and
            AI-drafted prevention plans for every district.
          </p>
          <ul className="flex flex-col gap-2 text-sm text-neutral-400">
            <li className="flex gap-2"><span className="text-neutral-600">01</span> Live 3D risk map by district</li>
            <li className="flex gap-2"><span className="text-neutral-600">02</span> Case forecasts with ranges, 1–4 weeks out</li>
            <li className="flex gap-2"><span className="text-neutral-600">03</span> Prevention plans and multilingual alerts</li>
          </ul>
        </div>

        <Link
          href="/dashboard"
          className="flex w-fit items-center gap-2 rounded-full bg-white px-6 py-3 text-sm font-medium text-black transition-colors hover:bg-neutral-200"
        >
          Open dashboard <span aria-hidden="true">→</span>
        </Link>
      </section>

      <p className="absolute inset-x-0 bottom-3 text-center font-mono text-[10px] text-neutral-500">
        Counters estimate from WHO 2024 malaria and dengue figures; other mosquito-borne diseases excluded.
      </p>
    </main>
  );
}
