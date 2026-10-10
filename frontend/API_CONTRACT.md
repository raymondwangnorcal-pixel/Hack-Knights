# Mozzy API contract

The frontend calls only the Next.js routes below. When `BUZZ_API_URL` is set, `classify`, `risk`, `detections` and `forecast` forward to the Data/ML FastAPI service at the same path (without `/api`), so **the FastAPI service must return these exact shapes**. TypeScript definitions: `src/lib/types.ts`. Example payloads: `src/mocks/`.

| Next.js route | FastAPI route | Request | Response |
| --- | --- | --- | --- |
| `POST /api/classify` | `POST /classify` | multipart: `audio` (file), `country` (`NG`/`BR`), `district` | `ClassifyResponse` |
| `GET /api/risk?country=NG` | `GET /risk?country=NG` | | `RiskResponse` |
| `GET /api/detections?country=NG&since=ISO` | `GET /detections?...` | | `DetectionsResponse` |
| `GET /api/forecast?district=Alimosho` | `GET /forecast?district=...` | | `ForecastResponse` |
| `POST /api/recommend` | (Gemini, called from Next.js) | JSON `RecommendRequest` (with `language`) | `{ text, source }` |
| `POST /api/voice` | (ElevenLabs, called from Next.js) | JSON `{ text, language }` | `audio/mpeg` |
| `GET /api/voice` | (reads env) | | `{ languages: [] }`: languages with a voice configured |

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
- `genus` is one of `anopheles`, `aedes`, `culex`, `other`.
- `diseases` uses: `malaria`, `dengue`, `zika`, `chikungunya`, `yellow_fever`, `lymphatic_filariasis`, `west_nile`.
- Audio arrives as WebM/Opus from Chrome or MP4/AAC from Safari; decode with ffmpeg or librosa.

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

## Districts

Mock districts (rename freely, but keep `district` strings identical across `risk`, `detections` and `forecast`):

- **Lagos (NG):** Alimosho, Ikorodu, Kosofe, Mushin, Oshodi-Isolo, Surulere, Ikeja, Eti-Osa
- **São Paulo (BR):** Itaquera, Campo Limpo, Penha, Santo Amaro, Mooca, Butantã, Sé, Pinheiros
