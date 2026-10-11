// The eight hand-drawn diagrams on the "How it's built" page. Every number here comes from
// decisions.md (measured, not estimated); simulated data is drawn red and dashed and says so.
// Coordinates are in each diagram's own viewBox (1200 wide); SketchFrame scales it to the page.

import { SketchFrame } from "./SketchFrame";
import {
  ACCENT,
  Arrow,
  Box,
  Circle,
  Cylinder,
  DIM,
  Diamond,
  FAINT,
  Heading,
  INK,
  Line,
  Mark,
  Note,
  Poly,
  Rect,
  Sticky,
  T,
} from "./sketch";

type Pt = [number, number];

/** Small deterministic random source, so the waveform and dots never change between renders. */
function rand(seed: number) {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296;
    return s / 4294967296;
  };
}

// ---------------------------------------------------------------- 01 · the system

export function SystemDiagram() {
  return (
    <SketchFrame w={1200} h={660} label="System overview: phones, traps and partner organisations send clips to the Next.js app on Vercel, which proxies to the FastAPI model service on Railway. Tiger Data holds the live path, Snowflake the forecast path, and forecasts are written back into Tiger.">
      <Heading x={20} y={36} w={140}>in the field</Heading>
      <Heading x={330} y={36} w={170}>our services</Heading>
      <Heading x={990} y={36} w={140}>databases</Heading>

      <Box x={20} y={70} w={230} h={86} tone="input" title="your phone" sub="3 s clip after a buzz" />
      <Box x={20} y={176} w={230} h={86} tone="input" title="smart trap" sub="same upload, source = trap" />
      <Box x={20} y={282} w={230} h={86} tone="input" title="partner orgs" sub="Model API, one key each" />

      <Arrow pts={[[252, 113], [330, 190]]} />
      <Arrow pts={[[252, 219], [330, 225]]} />
      <Arrow pts={[[252, 325], [330, 262]]} />

      <Box
        x={330}
        y={150}
        w={260}
        h={150}
        title="Next.js · Vercel"
        sub={["every /api route goes", "through one adapter:", "renames shapes, finds districts"]}
      />
      <Arrow pts={[[592, 225], [658, 225]]} both label="proxy" at={[625, 212]} />

      <Box
        x={660}
        y={150}
        w={260}
        h={150}
        tone="ours"
        title="FastAPI · Railway"
        sub={["ffmpeg + the audio models", "one LISTEN connection", "!not Vercel: it needs both"]}
      />

      <Box x={330} y={360} w={260} h={78} title="Gemini" sub="district plans from live numbers" />
      <Box x={330} y={470} w={260} h={78} title="ElevenLabs" sub="advice read aloud, 6 voices" />
      <Arrow pts={[[460, 302], [460, 358]]} />
      <Arrow pts={[[460, 440], [460, 468]]} noHead />

      <Arrow pts={[[328, 290], [288, 390], [200, 468]]} />
      <Box x={20} y={470} w={230} h={100} tone="mute" title="the map" sub={["health teams + NGOs", "risk · forecast · live dots"]} />

      <Box x={660} y={400} w={260} h={120} title="Python jobs" sub={["load · simulate · forecast", "publish to Tiger", "InfoDengue + Open-Meteo in"]} />

      <Cylinder x={990} y={50} w={190} h={250} tone="tiger" title="Tiger Data" sub="live path · seconds" rows={["detections", "risk_now", "forecasts"]} />
      <Cylinder x={990} y={360} w={190} h={230} tone="snow" title="Snowflake" sub="forecast path · weekly" rows={["RAW", "ML.FORECAST"]} />

      <Arrow pts={[[922, 215], [988, 215]]} both label="SQL" at={[955, 203]} />
      <Arrow pts={[[922, 455], [988, 470]]} label="SQL API" at={[955, 446]} />
      <Arrow pts={[[1085, 360], [1085, 304]]} dashed label="forecasts written back" at={[1072, 338]} anchor="end" />

      <Sticky x={330} y={578} w={560} h={66}>{"the dashboard reads only from Tiger. if Snowflake is\nslow on stage, the live map still works."}</Sticky>
    </SketchFrame>
  );
}

// ---------------------------------------------------------------- 02 · the data

export function DataDiagram() {
  return (
    <SketchFrame w={1200} h={740} label="Data sources: Abuzz and HumBugDB audio cleaned into about 1,000 two-second windows; InfoDengue cases and Open-Meteo weather loaded into Snowflake; Lagos malaria and New York West Nile simulated from real weather and labelled; geoBoundaries outlines for 35 districts.">
      <Heading x={20} y={36} w={80}>sound</Heading>
      <Box x={20} y={66} w={280} h={100} tone="source" title="Abuzz · Stanford" sub={["274 clips · 6 species", "wav, m4a, amr, mp4 · 8–48 kHz"]} />
      <Box x={20} y={190} w={280} h={100} tone="source" title="HumBugDB · Oxford" sub={["4.1 GB, unzipped in Colab", "phone recordings only"]} />
      <Note x={20} y={322} size={14}>{"Dryad blocks scripted downloads (403):\nfetched by hand in a browser"}</Note>

      <Arrow pts={[[302, 116], [360, 150]]} />
      <Arrow pts={[[302, 240], [360, 210]]} />
      <Box
        x={360}
        y={90}
        w={320}
        h={180}
        align="left"
        title="clean it"
        sub={["· resample to 8 kHz mono", "· drop Abuzz Raw (uncut copies)", "· split by recording set, not clip", "· keep 2 s where the buzz is loudest"]}
      />
      <Arrow pts={[[682, 180], [728, 180]]} />
      <Box x={730} y={125} w={160} h={110} tone="ours" title="~1,000" sub={["2 s windows", "→ the ear, 03"]} />

      <Heading x={950} y={36} w={90}>places</Heading>
      <Box x={950} y={66} w={230} h={90} tone="source" title="geoBoundaries" sub="ADM2 outlines" />
      <Note x={950} y={190} size={15} color={INK}>{"35 districts:\n10 São Paulo municipalities\n20 Lagos LGAs\n5 New York boroughs"}</Note>
      <Note x={950} y={305} size={14}>{"a 2nd “Surulere” in Oyo State:\nmatched by name + bounding box,\nand the loader fails unless it\nfinds exactly 10 + 20 + 5"}</Note>

      <Heading x={20} y={410} w={185}>cases + weather</Heading>
      <Box x={20} y={440} w={280} h={100} tone="source" title="InfoDengue" sub={["weekly dengue per municipality", "10 × 353 weeks = 3,530 rows"]} />
      <Box x={20} y={565} w={280} h={100} tone="source" title="Open-Meteo" sub={["daily rain + temperature", "30 districts · 30,330 rows"]} />
      <Arrow pts={[[302, 490], [368, 510]]} />
      <Arrow pts={[[302, 615], [368, 590]]} />
      <Cylinder x={370} y={440} w={280} h={230} tone="snow" title="Snowflake · RAW" rows={["CASES_INFODENGUE", "WEATHER_DAILY"]} />
      <Note x={370} y={703} size={14}>{"bug: dates converted in local time slid every\nweek back a day. fixed: converted in UTC."}</Note>

      <Arrow pts={[[652, 565], [728, 565]]} both label={"real\nweather"} at={[690, 530]} labelSize={13} />
      <Box
        x={730}
        y={440}
        w={450}
        h={230}
        dashed
        tone="sim"
        align="left"
        title="simulated, and labelled"
        sub={[
          "Lagos malaria ← real rain, 3–6 week lag",
          "New York West Nile pools ← real heat, 1–2 wk lag",
          "cases ~ Poisson(expected), fixed seed",
          "source = 'simulated' on every row",
          "!no public weekly series exists for either",
        ]}
      />
    </SketchFrame>
  );
}

// ---------------------------------------------------------------- 03 · the ear

function Waveform() {
  const r = rand(11);
  const bursts = [580, 640, 692, 752, 806, 860];
  const pts: Pt[] = [];
  for (let x = 552; x <= 888; x += 2) {
    const env = 6 + bursts.reduce((s, b) => s + 46 * Math.exp(-(((x - b) / 11) ** 2)), 0);
    pts.push([x, 135 + Math.sin(x * 0.9) * env * (0.55 + 0.45 * r())]);
  }
  return (
    <>
      {bursts.map((b) => (
        <Rect key={b} x={b - 19} y={78} w={38} h={114} tone="ours" gap={4} stroke={ACCENT.orange} />
      ))}
      <Line pts={pts} width={1} roughness={0.2} />
    </>
  );
}

function Bands() {
  const out = [];
  for (let i = 0; i < 24; i++) {
    const h = 14 + 70 * Math.exp(-(((i - 7) / 2.6) ** 2)) + 42 * Math.exp(-(((i - 14) / 2.2) ** 2)) + 18 * Math.exp(-(((i - 20) / 2) ** 2));
    out.push(<Rect key={i} x={955 + i * 9.4} y={190 - h} w={6.5} h={h} tone="input" fillStyle="solid" roughness={0.4} />);
  }
  return <>{out}</>;
}

export function EarDiagram() {
  return (
    <SketchFrame w={1200} h={640} label="Audio pipeline: an on-phone wake gate records 3 seconds after a buzz; ffmpeg decodes to 8 kHz; the six strongest-buzz two-second windows become 52 features; a tonality gate at 0.20 rejects non-mosquitoes; a gradient-boosted genus model and a closest-match species model give the diseases; one row is stored in Tiger.">
      <Box
        x={20}
        y={40}
        w={260}
        h={180}
        tone="input"
        align="left"
        title="wake gate"
        sub={["on the phone, 100× a second", "a loud peak at 300–1,000 Hz", "+ an overtone at twice it", "600 ms of buzz → record 3 s"]}
      />
      <Arrow pts={[[282, 130], [328, 130]]} />
      <Box x={330} y={85} w={170} h={90} title="ffmpeg" sub="any format → 8 kHz" />
      <Arrow pts={[[502, 130], [546, 130]]} />

      <Note x={720} y={52} anchor="middle" size={17} color={INK}>6 strongest-buzz 2 s windows</Note>
      <Waveform />
      <Arrow pts={[[894, 130], [944, 130]]} />

      <Note x={1068} y={52} anchor="middle" size={22} color={INK}>52 numbers</Note>
      <Bands />
      <Note x={1068} y={216} anchor="middle" size={14}>{"24 bands, 100–3,900 Hz × mean + spread\n+ pitch · tonality · flatness"}</Note>

      <Arrow pts={[[1068, 256], [1068, 298]]} />
      <Diamond cx={1068} cy={370} w={230} h={140} title="tonality ≥ 0.20?" />
      <Arrow pts={[[1068, 442], [1068, 498]]} label="no" at={[1082, 476]} anchor="start" />
      <Box x={950} y={500} w={230} h={100} dashed tone="sim" title="not a mosquito" sub={["fan, speech: 0.04–0.13", "nothing is stored"]} />

      <Arrow pts={[[952, 370], [892, 370]]} label="yes" at={[922, 357]} />
      <Box x={640} y={310} w={250} h={120} tone="ours" title="genus model" sub={["gradient-boosted trees", "6 windows, averaged"]} />
      <Arrow pts={[[638, 370], [592, 370]]} />
      <Box x={370} y={310} w={220} h={120} title="species" sub={["closest match, top 3", "within the called genus"]} />
      <Arrow pts={[[368, 370], [322, 370]]} />
      <Box
        x={20}
        y={290}
        w={300}
        h={160}
        align="left"
        title="diseases"
        sub={["anopheles → malaria", "aedes → dengue, zika,", "    chikungunya, yellow fever", "culex → west nile, filariasis"]}
      />
      <Arrow pts={[[170, 452], [170, 498]]} />
      <Box x={20} y={500} w={300} h={100} tone="tiger" title="one row in Tiger" subSize={13} sub="gate-harm0.20+genus-hgb-bands24-v1" />

      <Sticky x={380} y={508} w={520} h={78}>{"one features.py runs in Colab, in training and\nin the live service, so features can't drift"}</Sticky>
    </SketchFrame>
  );
}

// ---------------------------------------------------------------- 04 · training

const CONFUSION = [
  [18, 11, 0],
  [8, 145, 0],
  [0, 13, 0],
];
const GENERA = ["aedes", "anopheles", "culex"];

export function TrainingDiagram() {
  const y0 = 640; // chart baseline
  const k = 280; // px per 1.0 balanced accuracy
  const bars = [
    { x: 110, v: 0.73, chance: 0.5, label: "Anopheles\nvs Aedes", tone: "ours" as const },
    { x: 250, v: 0.52, chance: 1 / 3, label: "3 genera", tone: "input" as const },
    { x: 390, v: 0.19, chance: 1 / 6, label: "6 species", tone: "sim" as const },
  ];
  return (
    <SketchFrame w={1200} h={820} label="Model attempts: a pitch rule (0.49 balanced accuracy) and a trained detector (caught 19% of Abuzz clips) were rejected; a tonality gate (79% caught, 12% false alarms) and gradient-boosted genus trees (0.73 balanced accuracy, Anopheles vs Aedes) were kept. Held-out balanced accuracy: 0.73 for two genera, 0.52 for three, 0.19 for six species.">
      <Heading x={20} y={36} w={250}>what we tried, in order</Heading>
      <Box x={20} y={70} w={250} h={150} subSize={14} title="pitch rule" sub={["wingbeat pitch → genus", "!0.49 balanced (chance 0.33)", "the bands overlap"]} />
      <Mark x={248} y={92} ok={false} />
      <Arrow pts={[[272, 145], [318, 145]]} />
      <Box x={320} y={70} w={250} h={150} subSize={14} title="trained detector" sub={["HumBugDB phones only", "!caught 19% of Abuzz clips", "it learned the phone"]} />
      <Mark x={548} y={92} ok={false} />
      <Arrow pts={[[572, 145], [618, 145]]} />
      <Box x={620} y={70} w={250} h={150} subSize={14} tone="ours" title="tonality gate" sub={["energy on pitch + overtones", "!79% caught · 12% false alarms", "kept: the front door"]} />
      <Mark x={848} y={92} ok />
      <Arrow pts={[[872, 145], [918, 145]]} />
      <Box x={920} y={70} w={250} h={150} subSize={14} tone="ours" title="genus trees" sub={["52 features per 2 s window", "!0.73 balanced accuracy", "kept: the slide number"]} />
      <Mark x={1148} y={92} ok />

      <Heading x={20} y={300} w={320} size={22}>held-out balanced accuracy</Heading>
      <Line pts={[[70, 350], [70, y0], [520, y0]]} width={1.4} />
      <T x={60} y={y0 - k + 5} size={14} color={DIM} anchor="end">1.0</T>
      <T x={60} y={y0 - k / 2 + 5} size={14} color={DIM} anchor="end">0.5</T>
      <T x={60} y={y0 + 5} size={14} color={DIM} anchor="end">0</T>
      {bars.map((b) => (
        <g key={b.x}>
          <Rect x={b.x} y={y0 - b.v * k} w={90} h={b.v * k} tone={b.tone} gap={5} />
          <Line pts={[[b.x - 10, y0 - b.chance * k], [b.x + 100, y0 - b.chance * k]]} dashed color={FAINT} />
          <Note x={b.x + 45} y={y0 - b.v * k - 12} anchor="middle" size={22} color={INK}>{b.v.toFixed(2)}</Note>
          <Note x={b.x + 45} y={y0 + 26} anchor="middle" size={15}>{b.label}</Note>
        </g>
      ))}
      <Note x={515} y={395} anchor="end" size={14}>{"dashed = chance\nsplit by recording set,\nnever seen in training"}</Note>

      <Heading x={600} y={300} w={300} size={22}>genus, 195 unseen clips</Heading>
      {["aedes", "anoph.", "culex"].map((g, j) => (
        <T key={g} x={735 + j * 70} y={352} size={14} color={DIM} anchor="middle">{g}</T>
      ))}
      {CONFUSION.map((row, i) => (
        <g key={i}>
          <Note x={690} y={405 + i * 70} anchor="end" size={15} color={INK}>{GENERA[i]}</Note>
          {row.map((v, j) => (
            <g key={j}>
              <Rect
                x={700 + j * 70}
                y={370 + i * 70}
                w={70}
                h={70}
                tone={v === 0 ? undefined : i === j ? "ours" : "sim"}
                gap={v > 100 ? 2.6 : v > 10 ? 5 : 9}
              />
              <Note x={735 + j * 70} y={412 + i * 70} anchor="middle" size={20} color={INK}>{String(v)}</Note>
            </g>
          ))}
        </g>
      ))}
      <Note x={700} y={608} size={14}>{"rows: true genus · columns: the call"}</Note>
      <Note x={600} y={648} size={14}>{"culex: 13 clips from 2 recording sets,\nnever recognised. so the app leads with\nthe genus and calls species a “closest match”"}</Note>

      <Box
        x={950}
        y={280}
        w={230}
        h={350}
        align="left"
        subSize={14}
        title="leaks we closed"
        sub={[
          "· Abuzz Raw folders are",
          "  uncut copies: dropped",
          "· split by recording set,",
          "  never by clip",
          "· 788 of 800 background",
          "  windows came from one",
          "  Alcatel phone: trained",
          "  on that phone only",
          "· demo clips are training",
          "  data: they show the app,",
          "  not the accuracy",
        ]}
      />

      <Sticky x={20} y={728} w={620} h={74}>{"why trees, not a neural net: ~1,000 windows, no GPU,\ntrains in seconds, nothing heavy to ship to Railway"}</Sticky>
    </SketchFrame>
  );
}

// ---------------------------------------------------------------- 05 · forecast

const WAPE = {
  dengue: [0.12, 0.26, 0.28, 0.29, 0.21, 0.18],
  malaria: [0.12, 0.16, 0.19, 0.22],
  westNile: [0.41, 0.43, 0.53, 0.79],
};

function FanChart() {
  const r = rand(5);
  const hist: Pt[] = [];
  for (let i = 0; i <= 16; i++) {
    const x = 50 + i * 20;
    const level = 470 - 120 * Math.exp(-(((i - 9) / 4.5) ** 2)) - 40 * Math.sin(i / 2.5);
    hist.push([x, level + (r() - 0.5) * 34]);
  }
  const cut = hist[14][0]; // the last 2 weeks are dropped
  const last = hist[14];
  const mid: Pt[] = [last, [cut + 45, last[1] + 6], [cut + 90, last[1] + 16], [cut + 135, last[1] + 22], [cut + 180, last[1] + 30]];
  const hi = mid.map(([x, y], i): Pt => [x, y - i * 26]);
  const lo = mid.map(([x, y], i): Pt => [x, y + i * 17]);
  return (
    <>
      <Line pts={[[40, 300], [40, 600], [560, 600]]} width={1.4} />
      <Poly pts={[...hi, ...lo.slice().reverse()]} tone="snow" gap={6} noStroke />
      <Line pts={hist.slice(0, 15)} width={1.6} />
      <Line pts={hist.slice(14)} dashed color={FAINT} />
      <Note x={hist[15][0]} y={Math.max(hist[15][1], hist[16][1]) + 44} size={13} anchor="middle">dropped</Note>
      <Line pts={[[cut, 290], [cut, 600]]} dashed color={FAINT} />
      <Note x={cut + 6} y={302} size={14}>cutoff</Note>
      <Line pts={mid} color={ACCENT.blue} width={2} />
      <Note x={mid[4][0] + 8} y={hi[4][1] + 4} size={14}>high</Note>
      <Note x={mid[4][0] + 8} y={mid[4][1] + 5} size={14} color={ACCENT.blue}>mid</Note>
      <Note x={mid[4][0] + 8} y={lo[4][1] + 6} size={14}>low</Note>
      <Note x={150} y={624} size={14} anchor="middle">past weeks</Note>
      <Note x={cut + 90} y={624} size={14} anchor="middle">weeks 1–4</Note>
    </>
  );
}

export function ForecastDiagram() {
  const ox = 690;
  const oy = 600;
  const xs = (w: number) => ox + (w - 0.5) * 75;
  const ys = (v: number) => oy - v * 375;
  const series = (vals: number[]): Pt[] => vals.map((v, i) => [xs(i + 1), ys(v)]);
  const steps: { x: number; title: string; sub: string[]; tone?: "source" | "snow" | "tiger" }[] = [
    { x: 20, title: "nowcast", sub: ["InfoDengue's", "casos_est"], tone: "source" },
    { x: 220, title: "ln(1 + x)", sub: ["keeps forecasts", "positive"] },
    { x: 420, title: "drop 2 weeks", sub: ["they're still", "filling in"] },
    { x: 620, title: "ML.FORECAST", sub: ["one model,", "a series per place"], tone: "snow" },
    { x: 820, title: "80% band", sub: ["back with eˣ − 1,", "clipped at 0"] },
    { x: 1020, title: "weeks 1–4", sub: ["low · mid · high", "into Tiger"], tone: "tiger" },
  ];
  return (
    <SketchFrame w={1200} h={730} label="Forecast pipeline: InfoDengue nowcast, log transform, drop the last two weeks, Snowflake ML.FORECAST with one series per municipality, 80% prediction band, weeks 1 to 4 written to Tiger. Back-test error one week ahead: dengue 12%, malaria 12% on simulated data, West Nile 41% on simulated data.">
      {steps.map((s, i) => (
        <g key={s.x}>
          <Box x={s.x} y={40} w={168} h={120} tone={s.tone} titleSize={21} title={s.title} sub={s.sub} />
          {i < steps.length - 1 && <Arrow pts={[[s.x + 170, 100], [s.x + 198, 100]]} />}
        </g>
      ))}

      <Heading x={20} y={252} w={300} size={22}>one district, as a range</Heading>
      <FanChart />
      <Note x={20} y={672} size={14}>{"on the raw scale it forecast negative cases for small towns\n(history swings from single digits to 85,000 a week). log scale fixed it."}</Note>

      <Heading x={640} y={252} w={330} size={22}>back-test error, by week ahead</Heading>
      <Line pts={[[ox, 300], [ox, oy], [1150, oy]]} width={1.4} />
      {[0, 0.4, 0.8].map((v) => (
        <T key={v} x={ox - 10} y={ys(v) + 5} size={14} color={DIM} anchor="end">{`${Math.round(v * 100)}%`}</T>
      ))}
      {[1, 2, 3, 4, 5, 6].map((w) => (
        <T key={w} x={xs(w)} y={oy + 24} size={14} color={DIM} anchor="middle">{String(w)}</T>
      ))}
      <Note x={xs(3.5)} y={oy + 50} size={14} anchor="middle">weeks after the cutoff</Note>

      <Line pts={series(WAPE.westNile)} dashed color={ACCENT.red} width={1.6} />
      <Line pts={series(WAPE.malaria)} dashed color={INK} width={1.6} />
      <Line pts={series(WAPE.dengue)} color={ACCENT.orange} width={2.2} />
      {series(WAPE.dengue).map(([x, y]) => (
        <Circle key={x} cx={x} cy={y} r={4} solid={ACCENT.orange} stroke={ACCENT.orange} />
      ))}
      <Note x={xs(1) - 6} y={ys(0.12) + 26} size={15} color={ACCENT.orange} anchor="middle">12%</Note>

      <Line pts={[[990, 300], [1030, 300]]} color={ACCENT.orange} width={2.2} />
      <Note x={1040} y={305} size={14} color={INK}>dengue (real)</Note>
      <Line pts={[[990, 326], [1030, 326]]} dashed color={INK} />
      <Note x={1040} y={331} size={14}>malaria (simulated)</Note>
      <Line pts={[[990, 352], [1030, 352]]} dashed color={ACCENT.red} />
      <Note x={1040} y={357} size={14}>west nile (simulated)</Note>
      <Note x={640} y={672} size={14}>{"error = WAPE vs InfoDengue's nowcast, on weeks the model never saw.\n3 origins, Jun–Aug 2026: low season only, not tested through a peak."}</Note>
    </SketchFrame>
  );
}

// ---------------------------------------------------------------- 06 · Tiger, the live path

export function TigerDiagram() {
  return (
    <SketchFrame w={1200} h={720} label="Tiger Data live path: a classify upload becomes a row in the detections hypertable; a trigger sends NOTIFY for new mosquito rows; one LISTEN connection fans out over Server-Sent Events to the map. Continuous aggregates feed the timeline; the risk_now view combines detections, cases and weather.">
      <Box x={20} y={60} w={250} h={110} tone="input" title="POST /classify" sub={["client_id made on the phone", "district · recorded_at"]} />
      <Arrow pts={[[272, 115], [328, 125]]} />
      <Box
        x={330}
        y={30}
        w={380}
        h={240}
        tone="tiger"
        align="left"
        title="detections · hypertable"
        sub={[
          "1-day chunks, compressed after 7 days",
          "key (detection_id, time)",
          "!unique (client_id, time): a retried",
          "!upload gets the same row back",
          "is_simulated on every row",
        ]}
      />
      <Arrow pts={[[712, 115], [778, 115]]} />
      <Box x={780} y={60} w={180} h={110} title="trigger" sub={["mosquito + last hour", "→ NOTIFY"]} />
      <Arrow pts={[[962, 115], [1018, 115]]} />
      <Box x={1020} y={60} w={160} h={110} tone="ours" title="LISTEN" sub={["one connection,", "not the pooler"]} />
      <Arrow pts={[[1100, 172], [1100, 228]]} />
      <Box x={1020} y={230} w={160} h={90} title="/stream" sub="SSE fan-out" />
      <Arrow pts={[[1100, 322], [1100, 378]]} />
      <Box x={1020} y={380} w={160} h={110} tone="mute" title="the map" sub={["refetches 1.5 s", "after a burst"]} />
      <Note x={960} y={208} size={13} anchor="end">{"reconnects every 3 s,\nand /health says so"}</Note>

      <Arrow pts={[[420, 272], [420, 328]]} />
      <Box x={330} y={330} w={180} h={80} title="daily_counts" sub="real-time on" titleSize={20} />
      <Arrow pts={[[512, 370], [528, 370]]} noHead />
      <Box x={530} y={330} w={180} h={80} title="weekly_counts" sub="built on daily" titleSize={20} />
      <Arrow pts={[[712, 370], [790, 370]]} />
      <Note x={800} y={376} size={18} color={INK}>/timeline</Note>

      <Arrow pts={[[420, 412], [420, 468]]} />
      <Box
        x={330}
        y={470}
        w={380}
        h={150}
        align="left"
        title="risk_now view"
        sub={["0.5 × detections rank", "+ 0.3 × cases rank", "+ 0.2 × weather factor", "ranked within each country"]}
      />
      <Arrow pts={[[712, 545], [790, 545]]} />
      <Note x={800} y={551} size={18} color={INK}>/risk</Note>

      <Box
        x={20}
        y={330}
        w={250}
        h={170}
        dashed
        tone="snow"
        align="left"
        title="from Snowflake"
        sub={["case_history", "forecasts", "weather_daily"]}
      />
      <Arrow pts={[[272, 455], [300, 520], [328, 535]]} />
      <Arrow pts={[[145, 502], [145, 558]]} />
      <Note x={145} y={585} size={18} color={INK} anchor="middle">/forecast</Note>

    </SketchFrame>
  );
}

// ---------------------------------------------------------------- 07 · Snowflake over REST

export function SnowflakeDiagram() {
  return (
    <SketchFrame w={1200} h={630} label="Snowflake over REST: Python jobs call the SQL API with a programmatic access token locked to role BUZZ_APP; an extra-small warehouse runs RAW, ANALYTICS and AI schemas; forecast rows are read back with a plain SELECT and published to Tiger.">
      <Heading x={20} y={40} w={230} size={22}>REST quirks we hit</Heading>
      <Note x={20} y={78} size={14}>{"· 4,000 rows → one JSON binding → FLATTEN in SQL\n· DATE comes back as days since 1970\n· CREATE TABLE AS … FROM model!FORECAST is\n  rejected (391917): SELECT, then write JSON"}</Note>

      <Box
        x={20}
        y={190}
        w={210}
        h={170}
        align="left"
        subSize={14}
        title="Python jobs"
        sub={["load_snowflake.py", "simulate_*.py", "run_forecast.py", "publish_to_tiger.py"]}
      />
      <Arrow pts={[[232, 275], [268, 275]]} />
      <Box
        x={270}
        y={190}
        w={220}
        h={170}
        tone="ours"
        align="left"
        subSize={14}
        title="SQL API"
        sub={["no driver, just HTTPS", "PAT → role BUZZ_APP", "an auth policy waives", "the network rule"]}
      />
      <Arrow pts={[[492, 275], [528, 275]]} />

      <Box x={530} y={30} w={650} h={440} dashed />
      <Note x={552} y={64} size={20} color={INK}>Snowflake account · database BUZZ</Note>
      <Box x={560} y={85} w={590} h={70} tone="snow" titleSize={20} title="BUZZ_WH · XSMALL" sub="suspends after 60 s idle" />
      <Cylinder x={560} y={185} w={190} h={250} tone="snow" titleSize={22} title="RAW" rows={["CASES_INFODENGUE", "WEATHER_DAILY", "~loaded by script"]} />
      <Cylinder x={760} y={185} w={190} h={250} tone="snow" titleSize={22} title="ANALYTICS" rows={["forecast models", "back-tests", "~one per disease"]} />
      <Cylinder x={960} y={185} w={190} h={250} titleSize={22} title="AI" rows={["~Cortex Search:", "~unused, Gemini", "~writes guidance"]} dashed />

      <Arrow pts={[[855, 437], [800, 530], [560, 556], [272, 552]]} label="plain SELECT → JSON → publish_to_tiger.py" at={[560, 540]} labelSize={14} />
      <Box x={20} y={500} w={250} h={100} tone="tiger" title="Tiger · forecasts" sub="weeks 1–4, low · mid · high" />
      <Note x={560} y={600} size={14}>{"one role owns everything (no grant tangles); the warehouse\nsleeps after a minute, so a hackathon weekend costs cents"}</Note>
    </SketchFrame>
  );
}

// ---------------------------------------------------------------- 08 · the map

function Grid() {
  const r = rand(23);
  const cells = [];
  for (let j = 0; j < 5; j++) {
    for (let i = 0; i < 6; i++) {
      const v = Math.max(0, 1 - Math.hypot(i - 1.6, j - 3.2) / 4.2) * 0.75 + Math.max(0, 1 - Math.hypot(i - 4.4, j - 1) / 2.4) * 0.6 + r() * 0.15;
      cells.push(
        <Rect
          key={`${i}-${j}`}
          x={780 + i * 36}
          y={110 + j * 36}
          w={36}
          h={36}
          tone={v > 0.18 ? "sim" : undefined}
          gap={v > 0.7 ? 2.6 : v > 0.45 ? 4.5 : 8}
          roughness={0.5}
          stroke={FAINT}
        />,
      );
    }
  }
  return <>{cells}</>;
}

function Dots() {
  const r = rand(41);
  const spots = [
    { x: 1085, y: 165, n: 30, s: 20 },
    { x: 1150, y: 235, n: 14, s: 13 },
    { x: 1068, y: 262, n: 9, s: 11 },
  ];
  const out = [];
  for (const h of spots) {
    for (let i = 0; i < h.n; i++) {
      const a = r() * Math.PI * 2;
      const d = Math.sqrt(-2 * Math.log(r() || 1e-6)) * h.s * 0.6;
      const near = d < h.s * 0.7;
      out.push(
        <Circle
          key={`${h.x}-${i}`}
          cx={h.x + Math.cos(a) * d}
          cy={h.y + Math.sin(a) * d}
          r={3.2}
          solid={near ? "rgb(150,34,40)" : "rgb(196,128,128)"}
          stroke={near ? "rgb(150,34,40)" : "rgb(196,128,128)"}
        />,
      );
    }
  }
  for (let i = 0; i < 5; i++) {
    out.push(<Circle key={`s${i}`} cx={1050 + r() * 130} cy={110 + r() * 180} r={2.4} solid="rgb(196,128,128)" stroke="rgb(196,128,128)" />);
  }
  return <>{out}</>;
}

export function MapDiagram() {
  const layers = [
    { t: "elevation · OpenTopoData", tone: "source" as const },
    { t: "last year's heat + rain · Open-Meteo", tone: "snow" as const },
    { t: "rivers, lakes, coast · Natural Earth", tone: "input" as const },
    { t: "distance to big cities", tone: "ours" as const },
  ];
  return (
    <SketchFrame w={1200} h={600} label="Simulated detections: elevation, weather, water and city layers make a suitability grid; dots land in clumped hotspots weighted by suitability and urban share; dots cluster about ten to one when zoomed out. About 37,000 country-wide dots plus 6,792 in the 35 districts.">
      <Heading x={20} y={36} w={250} size={22}>four layers per grid cell</Heading>
      {layers.map((l, i) => {
        const y = 62 + i * 72;
        return (
          <Poly
            key={l.t}
            pts={[
              [60, y],
              [370, y],
              [330, y + 52],
              [20, y + 52],
            ]}
            tone={l.tone}
            gap={7}
            title={l.t}
            titleSize={14}
          />
        );
      })}
      <Arrow pts={[[376, 200], [428, 200]]} />
      <Box
        x={430}
        y={110}
        w={300}
        h={180}
        tone="ours"
        align="left"
        title="where a dot lands"
        sub={["(suitability / 100)³", "× (0.25 + urban share)^1.3", "clumped hotspots", "+ 10% thin scatter", "water cells × 0.2"]}
      />
      <Arrow pts={[[732, 200], [776, 200]]} />
      <Note x={888} y={95} anchor="middle" size={14}>{"0.25–0.5° cells"}</Note>
      <Grid />
      <Arrow pts={[[1000, 200], [1040, 200]]} />
      <Dots />
      <Note x={1115} y={318} anchor="middle" size={13}>{"dark where dots crowd,\nlight where sparse"}</Note>

      <Heading x={780} y={400} w={220} size={22}>zoomed out, 10 → 1</Heading>
      <Circle cx={830} cy={480} r={24} solid="rgb(150,34,40)" stroke="rgb(150,34,40)" />
      <T x={830} y={487} size={18} anchor="middle">10</T>
      <Arrow pts={[[866, 480], [950, 480]]} label="click: zoom 1.7" at={[908, 466]} labelSize={13} />
      {Array.from({ length: 10 }, (_, i) => {
        const a = (i / 10) * Math.PI * 2 + 0.3;
        const d = 14 + (i % 3) * 9;
        return <Circle key={i} cx={1010 + Math.cos(a) * d} cy={480 + Math.sin(a) * d} r={3} solid="rgb(196,128,128)" stroke="rgb(196,128,128)" />;
      })}

      <Box
        x={20}
        y={390}
        w={600}
        h={110}
        align="left"
        title="dots inside our 35 districts"
        sub={["Gaussian around the centre, kept inside the real outline,", "seeded by id so a dot never jumps between reloads"]}
      />
      <Sticky x={20} y={520} w={640} h={66} tone="sim">{"~37,000 country-wide + 6,792 in our districts"}</Sticky>
    </SketchFrame>
  );
}
