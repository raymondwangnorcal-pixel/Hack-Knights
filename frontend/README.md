# Culicid frontend

Next.js app for the citizen listening app (`/listen`) and the health dashboard (`/dashboard`).

## Run it

```bash
cd frontend
npm install
cp .env.example .env.local   # optional: everything works on mocks with no env vars
npm run dev
```

Open http://localhost:3000. Phones only allow microphone access over HTTPS, so test on a phone through the Vercel deploy or a tunnel (`npx cloudflared tunnel --url http://localhost:3000`).

## What's here

| Path | What it does |
| --- | --- |
| `src/app/listen` | Listening mode: on-device wake gate, 10 s capture, result screen, spoken advice |
| `src/app/dashboard` | Ranked districts, 2D risk map (three.js 3D goes here next), forecast, Gemini plan |
| `src/app/api/*` | Routes from the API contract; serve mocks until `BUZZ_API_URL` is set |
| `src/app/api/prevention` | Three household actions from recent rain, reliable mosquito detections, and a safe Gemini choice |
| `src/lib/wakeGate.ts` | ~100 checks/s for sustained energy in the 300–1000 Hz wingbeat band; browser noise suppression off |
| `src/lib/types.ts` | The API contract as TypeScript types |
| `src/mocks/` | Mock payloads for Lagos and São Paulo (all flagged `is_simulated`) |
| `API_CONTRACT.md` | Contract for the Data/ML FastAPI service |

## Switching from mocks to the real backend

Set `BUZZ_API_URL` to the FastAPI service URL. `classify`, `risk`, `detections` and `forecast` then forward there. Set `GEMINI_API_KEY` and the `ELEVENLABS_*` variables to turn on live advice and voice.

## Gemini key for Prevention

Create `frontend/.env.local` (beside `package.json`), using `.env.example` as the template:

```dotenv
GEMINI_API_KEY=your_key_here
GEMINI_MODEL=gemini-3.8-flash
```

Restart `npm run dev` after adding the key. `.env.local` is git-ignored. Do not put the key in a `NEXT_PUBLIC_` variable or browser code. On Vercel, add `GEMINI_API_KEY` under the frontend project's Settings → Environment Variables and redeploy. The server route reads the key; the browser only calls `/api/prevention`.

Open-Meteo rainfall needs no separate key in this integration. To compare a recording with recent real district detections, also set `BUZZ_API_URL` to the Data/ML service. A confident real recording can still drive genus-specific actions when district detections are unavailable; without either signal, the panel marks its actions as general guidance. See [API_CONTRACT.md](API_CONTRACT.md#household-prevention-panel) for the exact conditions and regulatory links.
