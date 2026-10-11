# Culicid API contract

The frontend calls only the Next.js routes below. When `BUZZ_API_URL` is set, `classify`, `risk`, `detections` and `forecast` forward to the Data/ML FastAPI service at the same path (without `/api`), so **the FastAPI service must return these exact shapes**. TypeScript definitions: `src/lib/types.ts`. Example payloads: `src/mocks/`.

| Next.js route | FastAPI route | Request | Response |
| --- | --- | --- | --- |
| `POST /api/classify` | `POST /classify` | multipart: `audio` (file), `country` (`NG`/`BR`), `district` | `ClassifyResponse` |
| `GET /api/risk?country=NG` | `GET /risk?country=NG` | | `RiskResponse` |
| `GET /api/detections?country=NG&since=ISO` | `GET /detections?...` | | `DetectionsResponse` |
| `GET /api/forecast?district=Alimosho` | `GET /forecast?district=...` | | `ForecastResponse` |
| `POST /api/recommend` | (Gemini, called from Next.js) | JSON `RecommendRequest` (with `language`) | `{ text, source }` |
| `POST /api/prevention` | (Next.js + weather + detections + Gemini) | JSON `{ country, district, language?, detection? }` | Three household actions with reasons, source links, and general/local status |
| `POST /api/prevention` with `audience: "health_team"` | (Next.js + risk + forecast + weather + detections + Gemini) | JSON `{ country, district, language?, audience }` | Three health-team actions for the For prevention side, same response shape plus `is_simulated` |
| `GET /api/voice?lang=ha&text=…` | (ElevenLabs, called from Next.js) | query `lang`, `text` (≤ 600 chars) | `audio/mpeg`, cached by the CDN and the phone |
| `POST /api/voice` | (ElevenLabs, called from Next.js) | JSON `{ text, language }` | `audio/mpeg`, uncached |
| `GET /api/voice` | (reads env) | | `{ languages: [] }`: languages with a voice configured |

## What the Next.js classify route sends to FastAPI `POST /classify`

Multipart fields, matching `backend/app/main.py`:

| Field | Value |
| --- | --- |
| `audio` | the clip, original filename kept (`clip.webm`, `clip.m4a`, `anopheles-gambiae.wav`) |
| `client_id` | a UUID per clip, made on the phone, so retries are de-duplicated |
| `recorded_at` | ISO time the recording started, with timezone (`2026-10-10T19:03:22.000Z`) |
| `country` | `NG` or `BR` |
| `district_id` | resolved from the district's display name by `resolveDistrictId()` in `src/lib/backend.ts`, against the service's `/districts` list (e.g. `Shomolu` → `NG-LA-SHOMOLU`); an unknown name is a 422 |
| `source` | `phone` |
| `device` | `web` for a recording; `sample` for the Sample button (the service stores those with `is_simulated = true`) |
| `mime` | the clip's MIME type when known |

**Fallbacks.** If the model can't answer (no `BUZZ_API_URL`, any non-2xx, 20 s timeout, unreachable), the route returns the mock result with `is_simulated: true` and `fallback_reason` (e.g. `"Model service returned 422"`); the screen labels it as a demo result. If the site's own route can't be reached, the screen does the same on the phone. `risk`, `detections` and `forecast` also serve mock data whenever FastAPI doesn't answer, so setting `BUZZ_API_URL` for classify never blanks the district list or the dashboard.

## `POST /classify` response

```json
{
  "detection_id": "uuid",
  "is_mosquito": true,
  "species": "Anopheles gambiae",
  "genus": "anopheles",
  "confidence": 0.81,
  "top3": [{ "species": "Anopheles gambiae", "probability": 0.81 }],
  "diseases": ["malaria"],
  "is_simulated": false
}
```

- `species` is `null` when only the genus clears the threshold.
- `confidence` may be `null` when `is_mosquito` is false; `top3` items may use `{genus, p}`. The Next.js route normalizes both, and passes `model_version` through (e.g. `pitch-rule-v1`).
- Next.js adds `fallback_reason` (string) only on demo results.
- `genus` is one of `anopheles`, `aedes`, `culex`, `other`.
- `diseases` uses: `malaria`, `dengue`, `zika`, `chikungunya`, `yellow_fever`, `lymphatic_filariasis`, `west_nile`.
- Audio arrives as WebM/Opus from Chrome or MP4/AAC from Safari, or WAV from the listening screen's Sample button; decode with ffmpeg or librosa. The upload keeps its original filename and extension.

## `POST /api/recommend` with `format: "steps"`

For `kind: "species_advice"`, `format: "steps"` returns `text` as exactly three short lines (one step per line, no numbering), translated from the `steps` list in `src/lib/species.ts`. The listening screen's Prevention panel uses this; omitting `format` keeps the original 3-sentence paragraph.

## Demo decisions

- **Clip length:** 10 s.
- **Location:** the phone sends only `country` and `district`, never GPS. `lat`/`lng` on a detection are the district's centre point plus a small random offset, attached server-side so the map has points to draw.
- **Map level:** Lagos local government areas and São Paulo subprefectures, each drawn as one column at its centre point (no boundary files).
- **Simulated data:** case numbers below city level are simulated for São Paulo; anything seeded carries `is_simulated: true`.

## Languages

`language` on `recommend` and `voice` is one of the codes below and defaults to `en`.

| Code | Language |
| --- | --- |
| `en` | English |
| `pt` | Portuguese (Brazil) |
| `es` | Spanish |
| `fr` | French |
| `zh` | Mandarin (Simplified Chinese text) |
| `yue` | Cantonese (Traditional Chinese text) |
| `yo` | Yoruba |
| `ha` | Hausa |

Advice text is available in all eight. Speech is per language: the play button appears only for languages with `ELEVENLABS_VOICE_<CODE>` set, so a language stays text-only until its voice has been tested.

## Household prevention panel

`POST /api/prevention` accepts `country` (`NG` or `BR`), one of the listed `district` values, optional `language`, and optional `{ genus, confidence, is_simulated }` from a classification. The server reads rainfall over the prior 72 hours from Open-Meteo and non-simulated detections over the prior seven days from `BUZZ_API_URL`. A recording affects the plan only when it is real and its confidence is at least 0.7. The district lookup still runs when there is a confident recording. A regional signal needs at least three reliable detections and a unique leading genus. These opportunistic detections are labeled as recent district detections, not a population prevalence estimate. If the signal is unavailable, the panel uses the recording alone and says so; seeded demo detections never count. When a real recording and the district's leading detected genus differ, the three-row plan covers both.

The server assembles an approved set of household actions. Gemini chooses three action IDs and may translate nonchemical copy; the first two IDs are mandatory, so a mixed plan retains an action for each genus. The server fixes the action IDs, links, and chemical copy. Genus names appear in a context line above the actions; the short actions and expanded reasons describe breeding sites or biting times without repeating the names. Translations are checked for shape, length, and unintended genus names but have not been clinically reviewed. Genus alone never establishes pesticide susceptibility. The Bti action is conditional on non-removable water and links to the appropriate regulator's product search; it is not a claim that a particular product is registered. Exact product or label recommendations require a separately verified local product catalogue.

## Health-team prevention panel

`POST /api/prevention` with `audience: "health_team"` accepts `country` (`NG`, `BR` or `US`), a `district` from `/api/risk`, and optional `language`. The server grounds the plan on that district's risk score, rank, detections over 7 days, cases over 14 days, the 4-week forecast (`/api/forecast`), rainfall over the prior 72 hours and the district's leading detected genus, using the same sources as `/api/risk` and `/api/forecast` (sample data when the service is down). `src/lib/healthTeam.ts` builds five candidate actions per disease (malaria, dengue, West Nile) in rules order; the first, the main vector-control action, is mandatory, and clinic readiness moves to second when risk is 70+ or the forecast is rising. Gemini picks three (prompt in `src/lib/healthTeamPrompt.ts`, a placeholder until the final prompt lands) and may translate them; every number in a reason must survive translation, and actions with a regulator link stay in curated English. Without Gemini, or when its reply fails validation, the first three rules actions are returned with `source: "rules"`. Gemini answers share the household panel's 6-hour cache and 10-minute pause after a quota error.

## Districts

Mock districts (rename freely, but keep `district` strings identical across `risk`, `detections` and `forecast`):

- **Lagos (NG):** Alimosho, Ikorodu, Kosofe, Mushin, Oshodi-Isolo, Surulere, Ikeja, Eti-Osa
- **São Paulo (BR):** Itaquera, Campo Limpo, Penha, Santo Amaro, Mooca, Butantã, Sé, Pinheiros
