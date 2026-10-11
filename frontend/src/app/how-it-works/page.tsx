import type { Metadata } from "next";
import type { ReactNode } from "react";
import Link from "next/link";
import "@fontsource/architects-daughter";
import { ApiPanel } from "@/components/build/ApiPanel";
import {
  DataDiagram,
  EarDiagram,
  ForecastDiagram,
  MapDiagram,
  SnowflakeDiagram,
  SystemDiagram,
  TigerDiagram,
  TrainingDiagram,
} from "@/components/build/diagrams";
import { PUBLISHED_KEY, RATE_LIMIT_PER_MIN } from "@/lib/apiKeys";

// "How it works": how Mozzy was built, one hand-drawn diagram per stage, from the data to the
// Model API. Content comes from decisions.md. Standalone for now; link it from the landing header
// when it's ready.

export const metadata: Metadata = {
  title: "How it works · Mozzy",
  description: "How Mozzy was built: data, audio model, training, forecasts, Tiger Data, Snowflake and the Model API.",
};

const INK = "#1A1714";
const BG = "#F3ECDD";
const ORANGE = "#C94F17";
const DISPLAY = { fontFamily: "'Bebas Neue', var(--font-geist-sans), sans-serif" };
const TYPE = { fontFamily: "'IBM Plex Mono', var(--font-geist-mono), monospace" };
const BODY = { fontFamily: "'Roboto Condensed', var(--font-geist-sans), sans-serif" };

const SECTIONS = [
  { id: "system", label: "The system" },
  { id: "data", label: "The data" },
  { id: "ear", label: "The ear" },
  { id: "training", label: "Training" },
  { id: "forecast", label: "Forecast" },
  { id: "live", label: "Live path" },
  { id: "snowflake", label: "Snowflake" },
  { id: "map", label: "The map" },
  { id: "api", label: "Model API" },
];

const STATS = [
  { n: "274", l: "training clips, 6 species" },
  { n: "52", l: "numbers per 2 s of buzz" },
  { n: "0.73", l: "genus balanced accuracy, unseen recordings" },
  { n: "12%", l: "dengue forecast error, 1 week out" },
  { n: "~2 s", l: "from a phone to the live map" },
];

function Section({ id, n, title, children, wide }: { id: string; n: number; title: string; children: ReactNode; wide?: ReactNode }) {
  const label = SECTIONS.find((s) => s.id === id)!.label;
  return (
    <section id={id} className="scroll-mt-[72px] border-t border-[#1A1714]/12 pt-16 pb-20 sm:pt-20 sm:pb-24">
      <div className="grid grid-cols-1 gap-x-10 gap-y-4 md:grid-cols-[200px_minmax(0,1fr)]">
        <div className="pt-2 text-[12px] tracking-[0.2em] text-[#1A1714]/50 uppercase md:sticky md:top-[88px] md:self-start" style={TYPE}>
          {String(n).padStart(2, "0")} · {label}
        </div>
        <div className="flex max-w-[780px] flex-col gap-5">
          <h2 className="m-0 text-[clamp(44px,6vw,76px)] leading-[0.9] tracking-wide text-balance uppercase" style={DISPLAY}>
            {title}
          </h2>
          <div className="flex flex-col gap-4 text-[clamp(18px,1.6vw,20px)] leading-[1.6] font-light text-[#1A1714]/80" style={BODY}>
            {children}
          </div>
        </div>
      </div>
      {wide && <div className="mt-12 sm:mt-14">{wide}</div>}
    </section>
  );
}

export default function HowItWorksPage() {
  return (
    <div className="hiw min-h-screen" style={{ backgroundColor: BG, color: INK, colorScheme: "light" }}>
      <header className="fixed inset-x-0 top-0 z-40 border-b border-[#1A1714]/20" style={{ backgroundColor: BG }}>
        <div className="mx-auto flex h-[56px] max-w-[1320px] items-center gap-5 px-4 sm:px-10">
          <Link href="/" className="text-[34px] leading-none tracking-wide" style={DISPLAY}>
            Mozzy
          </Link>
          <span className="hidden h-6 w-px bg-[#1A1714]/40 sm:block" />
          <span className="hidden text-[12.5px] tracking-[0.16em] uppercase sm:block" style={TYPE}>
            How it works
          </span>
          <nav className="ml-auto flex items-center gap-2 sm:gap-6" style={DISPLAY}>
            <Link href="/" className="hidden px-2 py-1 text-base tracking-wider hover:underline sm:block">
              Back to Mozzy
            </Link>
            <a
              href="#api"
              className="rounded-sm px-4 py-1.5 text-base tracking-wider whitespace-nowrap text-[#F3ECDD] transition-opacity hover:opacity-85"
              style={{ backgroundColor: INK }}
            >
              Model API
            </a>
          </nav>
        </div>
      </header>

      <main className="mx-auto max-w-[1320px] px-4 pt-[56px] sm:px-10">
        {/* Hero */}
        <div className="flex flex-col gap-8 pt-16 pb-16 sm:pt-24 sm:pb-20">
          <span className="text-[12px] tracking-[0.2em] text-[#1A1714]/55 uppercase" style={TYPE}>
            Under the hood
          </span>
          <h1 className="m-0 text-[clamp(72px,13vw,184px)] leading-[0.82] tracking-wide uppercase" style={DISPLAY}>
            How Mozzy <span style={{ color: ORANGE }}>works</span>
          </h1>
          <p className="m-0 max-w-[60ch] text-[clamp(19px,1.8vw,23px)] leading-[1.55] font-light text-[#1A1714]/85" style={BODY}>
            Everything between a buzz and a map: the data we found and the data we had to simulate, the models we kept and the ones we threw
            away, the two databases that keep it live, and an API so health teams can use the model themselves.
          </p>
          <dl className="m-0 grid grid-cols-2 gap-x-6 gap-y-6 border-t border-[#1A1714]/15 pt-8 sm:grid-cols-3 lg:grid-cols-5">
            {STATS.map((s) => (
              <div key={s.l} className="flex flex-col gap-1.5">
                <dt className="order-2 text-[11.5px] leading-[1.45] tracking-[0.12em] text-[#1A1714]/55 uppercase" style={TYPE}>
                  {s.l}
                </dt>
                <dd className="order-1 m-0 text-[clamp(44px,5vw,60px)] leading-[0.9] tracking-wide" style={DISPLAY}>
                  {s.n}
                </dd>
              </div>
            ))}
          </dl>
          <nav aria-label="Sections" className="flex flex-wrap gap-x-6 gap-y-2 pt-2 text-[12px] tracking-[0.16em] uppercase" style={TYPE}>
            {SECTIONS.map((s, i) => (
              <a key={s.id} href={`#${s.id}`} className="text-[#1A1714]/60 transition-colors hover:text-[#1A1714]">
                {String(i + 1).padStart(2, "0")} {s.label}
              </a>
            ))}
          </nav>
        </div>

        <Section id="system" n={1} title="Two paths, one map" wide={<SystemDiagram />}>
          <p className="m-0">
            A phone hears a buzz and sends three seconds of audio. Next.js on Vercel passes it through one adapter to our model service on
            Railway, which needs ffmpeg and a database connection that stays open: two things a Vercel function can&apos;t hold.
          </p>
          <p className="m-0">
            From there the data splits by speed. Tiger Data carries the live path, where a detection reaches the map in seconds. Snowflake
            carries the forecast path, where years of weekly cases become next month&apos;s range. Snowflake writes its forecasts back into
            Tiger, so the dashboard has exactly one place to read from.
          </p>
        </Section>

        <Section id="data" n={2} title="Real where it exists, simulated where it doesn't" wide={<DataDiagram />}>
          <p className="m-0">
            Mosquito audio came from two research sets, Stanford&apos;s Abuzz and Oxford&apos;s HumBugDB. Dengue cases are real: weekly, per
            municipality, from Brazil&apos;s InfoDengue. Weather is real, from Open-Meteo.
          </p>
          <p className="m-0">
            Nobody publishes weekly malaria counts per Lagos district or West Nile counts per New York borough, so we simulated both from
            real rainfall and temperature, with the lags the biology predicts. Every simulated row says so, in the database and on screen.
          </p>
        </Section>

        <Section id="ear" n={3} title="From a buzz to a genus" wide={<EarDiagram />}>
          <p className="m-0">
            The phone listens for a steady wingbeat tone before it records anything. The clip is decoded to 8 kHz, cut into the six
            two-second windows where the buzz is strongest, and each window becomes 52 numbers that don&apos;t care how loud the phone was.
          </p>
          <p className="m-0">
            A tonality gate throws out fans, voices and silence before the model sees them, because the genus model has only ever heard
            mosquitoes and has no way to say &ldquo;none of these.&rdquo; Then it votes across the windows, and the diseases follow from the genus.
          </p>
        </Section>

        <Section id="training" n={4} title="What we tried, and what we kept" wide={<TrainingDiagram />}>
          <p className="m-0">
            Two of four approaches failed, usefully. A pitch rule couldn&apos;t separate genera whose wingbeats overlap, and a trained detector
            learned which phone made the recording instead of whether a mosquito was in it.
          </p>
          <p className="m-0">
            Every number below is on recording sets the model never saw. Anopheles versus Aedes, the malaria and dengue vectors, comes in at
            0.73 balanced accuracy. Six-way species is 0.19, so the app only ever calls a species its &ldquo;closest match.&rdquo;
          </p>
        </Section>

        <Section id="forecast" n={5} title="Next month, as a range" wide={<ForecastDiagram />}>
          <p className="m-0">
            Snowflake&apos;s built-in ML.FORECAST trains one model, with a series per municipality, in seconds. We forecast the log of
            InfoDengue&apos;s nowcast so small towns never get negative cases, drop the two newest weeks while they&apos;re still being reported,
            and publish an 80% band instead of a single number.
          </p>
          <p className="m-0">Malaria and West Nile run through the same code on their simulated histories, and their scores are labelled that way.</p>
        </Section>

        <Section id="live" n={6} title="Tiger Data, the live wire" wide={<TigerDiagram />}>
          <p className="m-0">
            Every detection is a row in a TimescaleDB hypertable. The phone makes the clip&apos;s id, so a retry after a dropped connection gets
            the original row back instead of a duplicate.
          </p>
          <p className="m-0">
            A trigger sends NOTIFY for each new mosquito. Our service holds one LISTEN connection and fans those out as Server-Sent Events,
            so a recording in Lagos shows up on the map in about two seconds. Continuous aggregates and a transparent risk view do the
            counting inside the database.
          </p>
        </Section>

        <Section id="snowflake" n={7} title="Snowflake, over REST only" wide={<SnowflakeDiagram />}>
          <p className="m-0">
            Every load, simulation and forecast goes through Snowflake&apos;s SQL API, with a token scoped to one
            role. Bulk loads send 4,000 rows as one JSON binding and flatten them in SQL.
          </p>
          <p className="m-0">
            Forecasts come back as plain rows and a publish job writes them into Tiger, so Snowflake is never on the dashboard&apos;s critical
            path.
          </p>
        </Section>

        <Section id="map" n={8} title="Forty thousand dots, placed by geography" wide={<MapDiagram />}>
          <p className="m-0">
            We had real data for the cities we focused on: Lagos, São Paulo and New York. Everywhere else we extrapolated and simulated, using elevation, weather, water, how close people live, and the data we already had.
          </p>
          <p className="m-0">
            The dots cluster when you zoom out and split as you zoom in.
          </p>
        </Section>

        <Section id="api" n={9} title="Call the model yourself">
          <p className="m-0">
            Health ministries, NGOs and researchers can send their own recordings to the same model the app uses, and pull the risk scores
            and forecasts behind the map. Each organisation gets its own key.
          </p>
        </Section>
        <div className="-mt-8 pb-28">
          <ApiPanel apiKey={PUBLISHED_KEY.key} org={PUBLISHED_KEY.org} limit={RATE_LIMIT_PER_MIN} />
        </div>
      </main>
    </div>
  );
}
