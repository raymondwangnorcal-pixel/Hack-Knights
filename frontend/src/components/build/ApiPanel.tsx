"use client";

import { useState, useSyncExternalStore, type ReactNode } from "react";

// The Model API card on the "How it's built" page: the organisation's key, copy-paste examples in
// three languages, the endpoint list, and a live "run it" that calls the real API from the browser.

const INK = "#1A1714";
const ORANGE = "#C94F17";
const SAGE = "#4F7A3F";
const DISPLAY = { fontFamily: "'Bebas Neue', var(--font-geist-sans), sans-serif" };
const TYPE = { fontFamily: "'IBM Plex Mono', var(--font-geist-mono), monospace" };
const CODE = { fontFamily: "var(--font-geist-mono), 'IBM Plex Mono', monospace" };
const BODY = { fontFamily: "'Roboto Condensed', var(--font-geist-sans), sans-serif" };

type Lang = "curl" | "python" | "javascript";

const noop = () => () => {};

function snippet(lang: Lang, host: string, key: string): string {
  if (lang === "curl") {
    return `curl -X POST ${host}/api/v1/identify \\
  -H "Authorization: Bearer ${key}" \\
  -F audio=@buzz.wav \\
  -F country=NG \\
  -F district=Alimosho`;
  }
  if (lang === "python") {
    return `import requests

HOST = "${host}"
KEY = "${key}"

r = requests.post(f"{HOST}/api/v1/identify",
    headers={"Authorization": f"Bearer {KEY}"},
    files={"audio": open("buzz.wav", "rb")},
    data={"country": "NG", "district": "Alimosho"})

print(r.json()["genus"], r.json()["diseases"])  # anopheles ['malaria']`;
  }
  return `const form = new FormData();
form.append("audio", clip);  // 3–10 s, any format
form.append("country", "NG");
form.append("district", "Alimosho");

const res = await fetch("${host}/api/v1/identify", {
  method: "POST",
  headers: { Authorization: "Bearer ${key}" },
  body: form,
});
const { genus, confidence, diseases } = await res.json();`;
}

/** Tiny highlighter: comments dim, strings sage, keywords orange. */
function highlight(code: string): ReactNode[] {
  const re = /(#[^\n]*|(?<=\s)\/\/[^\n]*)|(f?"(?:[^"\\\n]|\\.)*"|'[^'\n]*')|\b(import|from|const|await|new|print|curl)\b/g;
  const out: ReactNode[] = [];
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(code))) {
    if (m.index > last) out.push(code.slice(last, m.index));
    const color = m[1] ? "rgba(26,23,20,0.45)" : m[2] ? SAGE : ORANGE;
    out.push(
      <span key={m.index} style={{ color }}>
        {m[0]}
      </span>,
    );
    last = m.index + m[0].length;
  }
  out.push(code.slice(last));
  return out;
}

const CALLS = [
  { id: "risk", label: "GET /api/v1/risk", path: (c: string) => `/api/v1/risk?country=${c}` },
  { id: "forecast", label: "GET /api/v1/forecast", path: (c: string) => `/api/v1/forecast?district=${{ NG: "Alimosho", BR: "Guarulhos", US: "Brooklyn" }[c]}` },
  { id: "index", label: "GET /api/v1", path: () => "/api/v1" },
] as const;

const ENDPOINTS = [
  { m: "POST", p: "/api/v1/identify", in: "audio, country, district (multipart)", out: "genus + confidence, closest species, top 3, diseases, gate score" },
  { m: "GET", p: "/api/v1/risk?country=NG", in: "country: NG, BR or US", out: "risk score 0–100 per district, with detections, cases and weather behind it" },
  { m: "GET", p: "/api/v1/forecast?district=Alimosho", in: "district name or id", out: "weeks 1–4 as low / mid / high, the unit, and whether it's simulated" },
  { m: "GET", p: "/api/v1", in: "nothing", out: "your organisation, rate limit and the endpoint list" },
];

export function ApiPanel({ apiKey, org, limit }: { apiKey: string; org: string; limit: number }) {
  const origin = useSyncExternalStore(noop, () => window.location.origin, () => "");
  const host = origin || "https://your-mozzy-host";
  const [lang, setLang] = useState<Lang>("curl");
  const [copied, setCopied] = useState<"key" | "code" | null>(null);
  const [call, setCall] = useState<(typeof CALLS)[number]["id"]>("risk");
  const [country, setCountry] = useState("NG");
  const [withKey, setWithKey] = useState(true);
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<{ status: number; ms: number; body: string } | null>(null);

  const copy = async (what: "key" | "code", text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(what);
      setTimeout(() => setCopied(null), 1400);
    } catch {
      setCopied(null);
    }
  };

  const run = async () => {
    const c = CALLS.find((x) => x.id === call)!;
    setRunning(true);
    const t0 = performance.now();
    try {
      const res = await fetch(c.path(country), { headers: withKey ? { Authorization: `Bearer ${apiKey}` } : {} });
      const text = await res.text();
      let body = text;
      try {
        body = JSON.stringify(JSON.parse(text), null, 2);
      } catch {
        // not JSON: show as-is
      }
      const lines = body.split("\n");
      if (lines.length > 80) body = [...lines.slice(0, 80), `  … ${lines.length - 80} more lines`].join("\n");
      setResult({ status: res.status, ms: Math.round(performance.now() - t0), body });
    } catch (err) {
      setResult({ status: 0, ms: Math.round(performance.now() - t0), body: `Network error: ${String(err)}` });
    } finally {
      setRunning(false);
    }
  };

  const code = snippet(lang, host, apiKey);
  const selected = CALLS.find((x) => x.id === call)!;

  return (
    <div className="flex flex-col gap-6" style={{ color: INK }}>
      {/* The card */}
      <div className="grid grid-cols-1 gap-8 rounded-[3px] border border-[#1A1714]/25 p-5 sm:p-8 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:gap-10">
        <div className="flex min-w-0 flex-col gap-5">
          <h3 className="m-0 text-[clamp(44px,5vw,64px)] leading-[0.9] tracking-wide uppercase" style={DISPLAY}>
            Model API
          </h3>
          <p className="m-0 max-w-[46ch] text-[19px] leading-[1.55] font-light text-[#1A1714]/85" style={BODY}>
            Send a clip, get back the genus, its diseases and how sure the model is. Pull the risk scores and four-week forecasts behind the map. Same model, same database as the app; nothing to train on your side.
          </p>

          <div className="flex flex-col gap-2">
            <span className="text-[11px] tracking-[0.18em] text-[#1A1714]/55 uppercase" style={TYPE}>
              Your key · {org}
            </span>
            <div className="flex items-stretch gap-2">
              <code
                className="min-w-0 flex-1 truncate rounded-[3px] border border-[#1A1714]/20 bg-[#E7DDC8] px-3 py-2.5 text-[13.5px]"
                style={CODE}
                title={apiKey}
              >
                {apiKey}
              </code>
              <button
                type="button"
                onClick={() => copy("key", apiKey)}
                className="shrink-0 rounded-[3px] border border-[#1A1714]/25 px-3 text-[12px] tracking-[0.14em] uppercase transition-colors hover:border-[#1A1714]/70"
                style={TYPE}
              >
                {copied === "key" ? "Copied" : "Copy"}
              </button>
            </div>
            <span className="text-[12px] tracking-[0.06em] text-[#1A1714]/55" style={TYPE}>
              Bearer token · {limit} requests a minute · JSON in, JSON out
            </span>
          </div>
        </div>

        <div className="flex min-w-0 flex-col overflow-hidden rounded-[3px] bg-[#E7DDC8]">
          <div className="flex items-center justify-between border-b border-[#1A1714]/10 px-4">
            <div className="flex gap-4" role="tablist" aria-label="Example language">
              {(["curl", "python", "javascript"] as Lang[]).map((l) => (
                <button
                  key={l}
                  role="tab"
                  aria-selected={lang === l}
                  onClick={() => setLang(l)}
                  className={`border-b py-2.5 text-[12px] tracking-[0.14em] uppercase transition-colors ${
                    lang === l ? "border-[#C94F17] text-[#1A1714]" : "border-transparent text-[#1A1714]/50 hover:text-[#1A1714]/80"
                  }`}
                  style={TYPE}
                >
                  {l}
                </button>
              ))}
            </div>
            <button
              type="button"
              onClick={() => copy("code", code)}
              className="text-[12px] tracking-[0.14em] text-[#1A1714]/60 uppercase hover:text-[#1A1714]"
              style={TYPE}
            >
              {copied === "code" ? "Copied" : "Copy"}
            </button>
          </div>
          <pre className="m-0 overflow-x-auto p-5 text-[13.5px] leading-[1.7]" style={CODE} data-lenis-prevent>
            <code>{highlight(code)}</code>
          </pre>
        </div>
      </div>

      {/* Endpoints */}
      <div className="overflow-x-auto" data-lenis-prevent>
        <table className="w-full min-w-[720px] border-collapse text-left">
          <thead>
            <tr className="text-[11px] tracking-[0.18em] text-[#1A1714]/50 uppercase" style={TYPE}>
              <th className="border-b border-[#1A1714]/15 py-2 pr-4 font-normal">Endpoint</th>
              <th className="border-b border-[#1A1714]/15 py-2 pr-4 font-normal">Send</th>
              <th className="border-b border-[#1A1714]/15 py-2 font-normal">Get back</th>
            </tr>
          </thead>
          <tbody>
            {ENDPOINTS.map((e) => (
              <tr key={e.p} className="align-top">
                <td className="border-b border-[#1A1714]/10 py-3 pr-4 text-[13.5px] whitespace-nowrap" style={CODE}>
                  <span style={{ color: e.m === "POST" ? ORANGE : SAGE }}>{e.m}</span> {e.p}
                </td>
                <td className="border-b border-[#1A1714]/10 py-3 pr-4 text-[16px] font-light text-[#1A1714]/80" style={BODY}>
                  {e.in}
                </td>
                <td className="border-b border-[#1A1714]/10 py-3 text-[16px] font-light text-[#1A1714]/80" style={BODY}>
                  {e.out}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Run it */}
      <div className="flex flex-col gap-3 rounded-[3px] border border-[#1A1714]/15 p-4 sm:p-5">
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-[11px] tracking-[0.18em] text-[#1A1714]/55 uppercase" style={TYPE}>
            Run it live
          </span>
          <select
            value={call}
            onChange={(e) => setCall(e.target.value as typeof call)}
            aria-label="Endpoint"
            className="cursor-pointer rounded-[3px] border border-[#1A1714]/20 bg-[#F3ECDD] px-3 py-1.5 text-[13px] text-[#1A1714] hover:border-[#1A1714]/60"
            style={CODE}
          >
            {CALLS.map((c) => (
              <option key={c.id} value={c.id}>
                {c.label}
              </option>
            ))}
          </select>
          {call !== "index" && (
            <div className="flex rounded-full border border-[#1A1714]/20 p-[2px]" role="radiogroup" aria-label="Country">
              {["NG", "BR", "US"].map((c) => (
                <button
                  key={c}
                  role="radio"
                  aria-checked={country === c}
                  onClick={() => setCountry(c)}
                  className={`rounded-full px-3 py-0.5 text-[12px] tracking-[0.12em] transition-colors ${
                    country === c ? "bg-[#1A1714] text-[#F3ECDD]" : "text-[#1A1714]/70 hover:text-[#1A1714]"
                  }`}
                  style={TYPE}
                >
                  {c}
                </button>
              ))}
            </div>
          )}
          <label className="flex cursor-pointer items-center gap-2 text-[12px] tracking-[0.08em] text-[#1A1714]/70" style={TYPE}>
            <input type="checkbox" checked={withKey} onChange={(e) => setWithKey(e.target.checked)} className="accent-[#C94F17]" />
            send key
          </label>
          <button
            type="button"
            onClick={run}
            disabled={running}
            className="ml-auto rounded-sm px-4 py-1.5 text-base tracking-wider text-[#F3ECDD] transition-opacity hover:opacity-85 disabled:opacity-50"
            style={{ ...DISPLAY, backgroundColor: INK }}
          >
            {running ? "Running…" : "Run"}
          </button>
        </div>
        <code className="text-[12.5px] text-[#1A1714]/50" style={CODE}>
          {host}
          {selected.path(country)}
        </code>
        {result && (
          <div className="flex flex-col gap-2">
            <span className="text-[12px] tracking-[0.1em]" style={{ ...TYPE, color: result.status >= 200 && result.status < 300 ? SAGE : ORANGE }}>
              {result.status ? `HTTP ${result.status}` : "No response"} · {result.ms} ms
            </span>
            <pre
              className="m-0 max-h-[360px] overflow-auto rounded-[3px] bg-[#E7DDC8] p-4 text-[12.5px] leading-[1.6] text-[#1A1714]/85"
              style={CODE}
              data-lenis-prevent
            >
              {result.body}
            </pre>
          </div>
        )}
      </div>
    </div>
  );
}
