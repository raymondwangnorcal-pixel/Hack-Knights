# Buzz Check / Mozzy: build decisions

A running record of what we decided while building the backend, ML pipeline and data layer, and **why**. Newest work is at the bottom of each section; the change log at the end is dated. Numbers quoted here were measured, not estimated, unless marked otherwise.

---

## 1. Architecture

| Decision | Why |
| --- | --- |
| **Two paths: Tiger Data runs the live path, Snowflake runs the forecast path.** | The live map needs second-level latency (Tiger: Postgres + time-series). Forecasting and retrieval need history and built-in ML (Snowflake). Each sponsor tech does the job it is best at, which is also how we pitch it. |
| **The dashboard reads only from Tiger.** Snowflake writes its forecasts *back* into Tiger. | One fast read path for the demo. If Snowflake is slow on stage, the live map still works. |
| **FastAPI model service on Railway, not Vercel.** | The service needs ffmpeg (decoding phone audio), a long-lived database connection (the live stream), and later scikit-learn models. Vercel functions are short-lived, have no ffmpeg, and cap function size. Raymond's Next.js site stays on Vercel and proxies to us. |
| **Live updates via Postgres `LISTEN/NOTIFY`, relayed as Server-Sent Events.** | A trigger on `detections` fires on every insert, so anything that writes a row (phone, trap, seed script) reaches the map without extra code. Verified: notifies arrive ~2 s apart at the rate the mock phone posted. |
| **Use Tiger's direct connection, not the pooler.** | `LISTEN` needs a session connection; a transaction pooler silently breaks it. |
| **Tiger Free plan, not the 30-day trial.** | Our data is tiny (well under the 750 MiB cap) and every feature the pitch needs worked on Free: hypertables, continuous aggregates, compression, triggers. |

## 2. Network gotcha

- **The venue Wi-Fi swallows Postgres traffic.** TCP connects in 0.03 s (too fast for AWS: a local middlebox answers) and then nothing comes back. On a phone hotspot the same connection works. **Rule: anything on a laptop that talks to Tiger runs on the hotspot.** Railway is unaffected (it connects from the cloud).

## 3. Districts (the unit everything is keyed on)

| Decision | Why |
| --- | --- |
| **Brazil = 10 Greater São Paulo municipalities**, id `BR-<IBGE code>` (São Paulo, Guarulhos, Osasco, Santo André, São Bernardo do Campo, São Caetano do Sul, Diadema, Mauá, Barueri, Taboão da Serra). | InfoDengue publishes weekly dengue cases **per municipality**, not per city sub-district, so municipalities are the finest level with real case data. All 10 IBGE codes were checked against the live InfoDengue API (each returned the right name and population). |
| **Nigeria = the 20 Lagos State LGAs**, id `NG-LA-<NAME>`. | LGAs are Lagos's admin level 2 and match geoBoundaries ADM2. |
| **Shapes from geoBoundaries ADM2 (simplified), centroid = area-weighted centroid of the largest polygon.** | Free, consistent across both countries. geoBoundaries has no IBGE codes, so Brazil is matched by name *and* a Greater-São-Paulo bounding box (Brazil has duplicate municipality names); Lagos by an LGA name list *and* a Lagos bounding box (there is a second "Surulere" in Oyo State). The loader fails loudly unless it finds exactly 10 + 20. |

## 4. Tiger Data schema (`db/tiger/001_schema.sql`, `002_risk.sql`)

| Decision | Why |
| --- | --- |
| `detections` is a **hypertable** partitioned on `time` (1-day chunks). | It is the time-series of every report; Tiger's core use case. |
| Primary key `(detection_id, time)` and **unique `(client_id, time)`**. | Hypertable unique keys must include the time column. `client_id` is generated on the phone per clip, so a retry after a dropped connection returns the original row instead of creating a duplicate. Verified. |
| **Compression** after 7 days, segmented by district. | Columnar storage for old data; pitch point. |
| `daily_counts` and `weekly_counts` **continuous aggregates**, real-time on (`materialized_only = false`), weekly built on daily (hierarchical). | Real-time aggregation is off by default since TimescaleDB 2.13; without it new detections take up to 5 min to count. Backfilled history needs a manual `refresh_continuous_aggregate` over the full range (the policy only covers the last 3 days). |
| Notify trigger only for mosquito rows from the **last hour**. | An 8-week backfill would otherwise flood the live stream. |
| `is_simulated` on every detection; mock-phone uploads are flagged automatically. | Seeded or mock data must never be presented as real; the UI labels it. |
| `risk_now` view = 0.5 × detections rank + 0.3 × cases rank + 0.2 × weather factor, per country. | The spec asks for a transparent score. Weights and the weather thresholds are starting values, not findings. |
| `forecasts`, `case_history`, `weather_daily` are written by the Snowflake jobs. | Keeps the dashboard's read path in one database. |

## 5. Snowflake (forecast path)

| Decision | Why |
| --- | --- |
| **Everything goes through Snowflake's REST APIs** (SQL API, Cortex Search). | The Snowflake track asks for AI features via the REST API. |
| Auth = **programmatic access token (PAT)** restricted to role `BUZZ_APP`, plus an authentication policy that waives the network-policy requirement for our user. | PATs need a network policy unless relaxed; the policy is the least-effort safe option for a hackathon. |
| Names: warehouse `BUZZ_WH` (XSMALL, suspends after 60 s), role `BUZZ_APP` (owns everything), database `BUZZ` with schemas `RAW`, `ANALYTICS`, `AI`. | Small and cheap; one owner role avoids grant tangles. ("Mozzy" was the Snowflake *company* name at signup, not the database.) |
| Setup gotchas hit: `<YOUR_USER>` placeholders need the `<>` removed; `BUZZ_APP` owns schema `AI`, so it must grant `CREATE AUTHENTICATION POLICY` to `ACCOUNTADMIN`; "Run all" shows only the last result, so the PAT secret is easy to miss. | Fixed in `db/snowflake/001_setup.sql`. |
| Bulk loads send rows as **one JSON text binding per 4,000 rows** and `FLATTEN` them in SQL. | Keeps every load on the REST path without a driver. |
| REST quirks we handle: `DATE` comes back as days since 1970; `{...}` object literals and `CREATE TABLE AS … FROM model!FORECAST` are rejected (error 391917), so forecasts are fetched with a plain `SELECT` and written back as JSON; `OBJECT_CONSTRUCT` replaces `{}` literals. | Discovered by testing. |

### Loaded data
- `RAW.CASES_INFODENGUE`: 3,530 rows = 10 municipalities × 353 weeks (2019-12-29 to 2026-09-27), weekly dengue `casos` and the nowcast `casos_est`.
- `RAW.WEATHER_DAILY`: 30,330 rows = 30 districts × daily rain and mean temperature from Open-Meteo, 2024-01-01 on. Weather starts in 2024 (not 2020) because Open-Meteo's free tier rate-limited the long requests; the forecast does not use weather yet.
- **Bug found and fixed:** the first load converted InfoDengue's millisecond timestamps in the laptop's local time zone, shifting every week back a day (Saturday instead of Sunday). Now converted in UTC; weeks start on Sundays, matching InfoDengue.

### Dengue forecast (`scripts/run_forecast.py`)
| Decision | Why |
| --- | --- |
| `SNOWFLAKE.ML.FORECAST`, one multi-series model, one series per municipality. | Built into Snowflake, gives prediction intervals, trains in seconds. |
| **Target = ln(1 + InfoDengue nowcast `casos_est`)**, converted back with exp(x) − 1. | On the raw scale the model forecast *negative* cases for small municipalities with ±100–190 intervals, because history swings from single digits to 85,000/week (São Paulo, 2024). Log scale keeps forecasts positive and intervals proportional. The nowcast is used because reported counts for recent weeks are incomplete (latest São Paulo week: 380 reported vs 1,152 estimated). |
| **Drop the last 2 weeks** from training; forecast 6 weeks; publish only weeks 1–4 after the last observed week. | Recent weeks are still filling in. Forecast weeks 1–2 after the cutoff are already in the past. |
| 80% prediction interval → Tiger `low / mid / high`, clipped at 0. | The spec requires a range, never a single number. |

**Back-test** (3 origins in Jun–Aug 2026 × 10 municipalities; error vs InfoDengue's nowcast on weeks the model never saw):

| Weeks after cutoff | WAPE | Share of actuals inside the 80% band |
| --- | --- | --- |
| 1 | 0.12 | 0.77 |
| 2 | 0.26 | 0.80 |
| 3 | 0.28 | 0.87 |
| 4 | 0.29 | 0.87 |
| 5 | 0.21 | 0.87 |
| 6 | 0.18 | 0.97 |

Caveat: all three origins are in the low season, so this was not tested through an epidemic peak. Claim "back-tested on recent weeks", not more.

## 6. Audio ML

### Data
- **Abuzz (Stanford, Dryad):** 6 species downloaded (Anopheles gambiae, stephensi, arabiensis; Aedes aegypti, albopictus; Culex quinquefasciatus), 274 clips, mixed formats (wav/m4a/amr/mp4) and rates (8/44.1/48 kHz). Only these 6 because they are the malaria/dengue vectors for the pitch, and the full 1.23 GB was slow to download. Dryad blocks scripted downloads (403), so files were downloaded in a browser.
- **HumBugDB (Oxford, Zenodo):** 4 zips (~4.1 GB) downloaded inside Colab (datacenter bandwidth); only a sample is used. Some zip parts list files Python's `zipfile` cannot read, so the Colab cell probes each zip and falls back to the `unzip` tool.

### Decisions
| Decision | Why |
| --- | --- |
| **Everything resampled to 8 kHz mono.** | The lowest rate in the data; the wingbeat band (a few hundred Hz plus harmonics) sits far below the 4 kHz limit; matches phone uploads. |
| **Features = spectral shape over 24 log-spaced bands (100–3,900 Hz), mean and spread over time, plus wingbeat pitch, tonality and flatness; 52 numbers per 2 s window** (`backend/app/features.py`). Pure NumPy. | Gain-invariant (phone volume doesn't matter), fast, and the *same file* runs in Colab, in training and in the live service, so features can never drift between training and serving. |
| **Gradient-boosted trees** (scikit-learn `HistGradientBoostingClassifier`, balanced class weights). | Trains in seconds on ~1,000 windows, no GPU, no deep-learning dependency on Railway. A neural net would not fit the 5-minute training budget. |
| **Windows are chosen where the buzz is strongest** (highest 300–1,000 Hz energy share). | A mosquito is audible for only part of a long recording; random windows would mostly be background labelled "mosquito". |
| **Drop Abuzz `Raw` folders; split train/test by recording set** (species × site/device folder), never by clip. | `Raw` holds uncut copies of the clipped recordings; including both, or splitting by clip, puts near-identical audio on both sides and inflates accuracy. |
| **Report per-clip results** (window probabilities averaged per clip). | That is what the app reports for a 10 s upload. |

### First fallback (superseded)
A pitch rule (dominant wingbeat frequency → genus band). Calibration showed the bands overlap almost completely: best possible balanced accuracy 0.49 vs 0.33 chance, in-sample. Many Abuzz clips are dominated by a 116 Hz hum and 180–230 Hz handling noise, so the pitch search was restricted to 300–1,000 Hz and the loudest 25% of frames.

### Genus / species classifier (held-out recording sets)
| Model | Balanced accuracy | Accuracy | Notes |
| --- | --- | --- | --- |
| **Anopheles vs Aedes** (malaria vs dengue vectors) | **0.73** | 0.88 | Anopheles recall 0.95, Aedes 0.52. **This is the slide number.** |
| 3 genera incl. Culex | 0.52 | 0.84 | Culex never recognized: only 2 recording sets, 13 clips. |
| 6 species | 0.19 | 0.30 | Not usable. Species is shown only as the "closest match". |

**Why species is low:** too little data per species (Aedes albopictus 7 clips, Culex 13), the three Anopheles species have overlapping wingbeats, and the test is strict (unseen recording sets). Training longer would only memorize. **Decision:** lead with genus, show species as closest match; no species accuracy on slides. Options considered and declined as not worth the time: more species audio from HumBugDB lab recordings, pretrained audio embeddings.

### Mosquito detector: tried a model, chose a rule
- **Trained detector (rejected).** HumBugDB phone recordings only (lab microphones would let the model learn "microphone type" instead of "mosquito"). Within phones there is a second trap: 788 of 800 background windows come from an Alcatel 4015X and most mosquito audio from an itel A16. So it was trained on the Alcatel only. Result: catches 36% of mosquitoes on held-out Alcatel files (AUC 0.82, zero false alarms), 16% on the unseen itel phone, **19% of Abuzz clips**. Lowering the cutoff reached at most 43% of Abuzz clips at 29% false alarms. It does not transfer, so it is not used.
- **Gate rule (used).** "Wingbeat tonality": in the clip's clearest 2 s window, the share of sound energy sitting on the wingbeat pitch (300–1,000 Hz) and its 2× and 3× overtones. Mosquito if ≥ **0.20**. Measured on every clip: catches **79% of Abuzz** and 60% of HumBugDB mosquito clips, **12% false alarms** on HumBugDB background. Synthetic silence, white noise, a 120 Hz fan hum and speech-like babble all score 0.04–0.13 (rejected).
- **Why a gate at all:** the genus model has only heard mosquitoes and has no "not a mosquito" answer; without the gate a ceiling fan would be reported as "Anopheles, malaria risk".

### Live `/classify` pipeline (wired in)
clip → ffmpeg decode to 8 kHz → 6 strongest-buzz 2 s windows → features → gate (≥ 0.20) → genus model (probabilities averaged) → species model (closest match, top 3) → diseases from genus → row stored in Tiger → response. Model version `gate-harm0.20+genus-hgb-bands24-v1`. Verified end to end against the live database; test rows deleted.

### Demo clips
`data/demo_clips/` holds three 10 s Anopheles gambiae clips (gate 0.89–0.95) and three Aedes aegypti clips (0.61–0.68), each classified correctly at confidence 1.00. They are from the training data, so they demonstrate the app, not its accuracy; the slide number stays 0.73.

### Deployment consequences
`scikit-learn==1.9.1` is pinned and the Docker base image is Python 3.13, because saved models must load with the exact versions that trained them.

---

## 7. Nigeria (Lagos)

| Decision | Why |
| --- | --- |
| **Lagos malaria case history is SIMULATED**, labelled `source = 'simulated'` in Tiger's `case_history` and `-on-simulated` in the forecast model name. | No public weekly malaria counts exist per Lagos LGA; the Malaria Atlas Project publishes annual, modeled estimates, and turning those rasters into LGA weekly series would take hours for no demo gain. The goal is a dashboard that shows how the system works for both launch countries, honestly labelled. |
| **The simulation is driven by REAL Lagos rainfall** (Open-Meteo, per LGA centroid), lagged 3–6 weeks. | Rain creates breeding sites and mosquitoes take weeks to breed and transmit, so lagged rain is the textbook malaria driver. This makes the seasonal shape realistic instead of random. |
| Generator: `expected = base × (0.5 + 0.9 × r)`, `cases ~ Poisson(expected)`, where `r` = mean weekly rain over weeks t−6…t−3 divided by its 90th percentile (clipped 0–1.5), and `base` per LGA ~ lognormal around 120/week; fixed seed 42. | Simple, deterministic and explainable. The base level is **illustrative, not a sourced rate**; never quote these as real case counts. |
| Same forecast pipeline as dengue (`SNOWFLAKE.ML.FORECAST`, log scale, 80% interval), 4 weeks ahead, no dropped weeks. | Simulated data has no reporting lag. One code path for both diseases (`scripts/run_forecast.py <disease>`). |
| **Malaria back-test run anyway, quoted as "on simulated data".** | The team needs a number for both launch countries. It measures how well the forecast recovers the rain-driven pattern we simulated, not real-world skill, so it is always labelled. |

**Malaria back-test (simulated Lagos data):** 3 origins (2026-07-05, 08-02, 08-30) × 20 LGAs, weeks the model never saw.

| Weeks ahead | WAPE | Share inside the 80% band |
| --- | --- | --- |
| 1 | 0.12 | 0.67 |
| 2 | 0.16 | 0.63 |
| 3 | 0.19 | 0.63 |
| 4 | 0.22 | 0.65 |

The bands are too narrow here (63–67% instead of 80%): the simulation's week-to-week Poisson noise is unpredictable by design. Dengue's bands were better calibrated (77–97%), so dengue leads on forecast accuracy in the pitch. Slide wording: "Malaria forecast, back-tested on simulated Lagos data: 12% average error 1 week ahead, 22% at 4 weeks."
| Risk score for Lagos uses the same `risk_now` view (ranked within Nigeria). | Same transparent formula in both countries; detections will feed it once seeded or reported. |

**Result:** 2,740 simulated rows = 20 LGAs × 137 weeks (2024-02-18 to 2026-09-27); median 125 cases per LGA per week (10th–90th percentile 54–261). The 2025 monthly average per LGA rises from 82 (Jan) to peaks of 229 (Jul) and 204 (Oct), following the two Lagos rainy seasons with a lag. Forecast: 80 rows (20 LGAs × 4 weeks, Oct 4 – Oct 25), none negative, Lagos total rising from about 3,500 to 4,800 per week. Published to Tiger alongside dengue: `case_history` 6,270 rows, `forecasts` with both diseases; Lagos LGAs now have risk scores (e.g. Shomolu 0.50, Alimosho 0.48).

**What the dashboard must do:** label Lagos case history and malaria forecasts as simulated (read `case_history.source`, or a forecast `model` ending in `-on-simulated`).

---

## 8. New York (West Nile)

| Decision | Why |
| --- | --- |
| **Third launch location: New York City, disease West Nile**, country code `US`, 5 districts = the boroughs (`US-NY-BRONX`, `-BROOKLYN`, `-MANHATTAN`, `-QUEENS`, `-STATENISLAND`). | Team decision to show a third disease and a familiar city. Boroughs = geoBoundaries USA ADM2 counties (Bronx, Kings, New York, Queens, Richmond); no new download, same loader. "Kings" and "Richmond" exist in other states, so a NYC bounding box picks the right ones. A 5-column map is sparse; 59 community districts would look richer but need an NYC Open Data file (not worth the time). |
| Schema: `districts.country` now allows `'US'` (`db/tiger/003_add_us.sql`, applied to the live database; `001_schema.sql` updated for fresh installs). | The original check only allowed BR and NG. |
| **West Nile history is SIMULATED**, unit = **weekly positive mosquito pools** (stored in `cases`, labelled `source='simulated'`; API reports `unit`). | Positive pools are what NYC's health department reports; human West Nile cases are a handful per borough per year, too few to forecast. No public weekly per-borough series was loaded. |
| **Driven by REAL New York temperature** (Open-Meteo, 5,055 borough-days from 2024), lagged 1–2 weeks: `heat = max(0, T − 18 °C) / 8`, `amp = min(1, warm weeks so far this year / 10)`, `pools ~ Poisson(base × heat^1.5 × amp)`, base ~ lognormal around 6/week, seed 7. | Culex activity and virus amplification need warmth, and the virus builds up in birds over the summer, so the season starts late and peaks in late summer. The base level is illustrative, not a sourced rate. |
| Same forecast pipeline (log scale, 80% interval, 4 weeks) and a back-test quoted as "on simulated data". | One code path for all three diseases; the team wants a number per location. |

**Result:** 705 rows = 5 boroughs × 141 weeks (2024-01-21 to 2026-09-27). 2025 average pools per borough-week: 0 Jan–May, 1.2 Jun, 6.6 Jul, 5.3 Aug, 1.6 Sep, 0.1 Oct. Forecast: 20 rows, all near zero for October (season ending), e.g. Brooklyn 1.4 → 0.6 pools/week. Consequence for the demo: New York's map and forecast look quiet in October; that is the realistic off-season, not a bug.

**West Nile back-test (simulated NYC data):** 3 origins (2026-07-05, 08-02, 08-30) × 5 boroughs = 15 forecasts per horizon, weeks the model never saw.

| Weeks ahead | WAPE | Share inside the 80% band |
| --- | --- | --- |
| 1 | 0.41 | 0.73 |
| 2 | 0.43 | 0.53 |
| 3 | 0.53 | 0.67 |
| 4 | 0.79 | 0.47 |

Much weaker than dengue and malaria, for three reasons: counts are tiny (a few pools per borough-week, so a miss of 1–2 pools is a large percentage), the origins straddle the season's peak and decline (the hardest stretch to forecast), and only 15 forecasts per horizon make the numbers noisy. Pitch use: quote at most the 1-week figure ("~40% error one week ahead on simulated data"), or leave West Nile accuracy off the slide and lead with dengue.

**Known weakness:** West Nile's vector is Culex, our weakest genus (never recognized on held-out recordings: 13 clips, 2 recording sets). A Culex demo clip from the training data classifies correctly; do not claim New York detection accuracy.

## 9. Dashboard API and live stream

All in `backend/app/main.py`; reads come from Tiger only. CORS is open (`*`) for GET/POST: the endpoints carry no secrets and the dashboard runs on another origin.

| Endpoint | Returns | Backed by |
| --- | --- | --- |
| `POST /classify` | genus + confidence, species (closest match), top 3, gate score, diseases, detection id | gate rule + genus/species models → `detections` |
| `GET /districts?country=&geojson=` | id, name, city, centroid; outlines on request | `districts` |
| `GET /detections?country=&since=&limit=` | mosquito detections with location and `is_simulated` (default last 7 days) | `detections` |
| `GET /risk?country=` | per district: `risk_score`, `rank`, `detections_7d`, `cases_14d`, `weather_factor`, `cases_simulated`, `disease` | `risk_now` view |
| `GET /forecast?district=` or `?country=` | weeks 1–4: `low / mid / high`, `unit`, `simulated`, `model` (latest batch per district and disease) | `forecasts` |
| `GET /timeline?country=&weeks=` | week × district: `detections`, `cases`, `cases_simulated` (Sunday-start weeks) | `daily_counts` + `case_history` |
| `GET /stream?country=` | Server-Sent Events: `event: detection` per new live mosquito detection, with district name and coordinates; ping comment every 15 s | Postgres `NOTIFY` → one `LISTEN` connection → fan-out |
| `GET /health` | DB ok, model version, district count, whether the stream listener is connected | |

Decisions: one background `LISTEN` connection reconnects every 3 s on failure and logs loudly (and `/health` reports it), instead of silently stopping; the dashboard should connect to `/stream` on our service directly (long-lived streams through Vercel functions hit time limits). Verified locally: every endpoint returns data; two accepted mock clips arrived on `/stream` as events with coordinates; clips rejected by the gate sent nothing (correct).

## 10. Seeded detections

| Decision | Why |
| --- | --- |
| `scripts/seed_history.py` writes 8 weeks of **simulated** detections (`is_simulated`, `device='seed'`, `model_version='seed-v1'`); re-running replaces them. | With zero real detections the map, time slider and the detections part of the risk score are empty. |
| Volume per district-day follows that district's case curve **on a log scale** (0.3 to 6 reports/day). | On a linear scale São Paulo's ~1,000 cases/week left the other municipalities (10–30/week) almost blank. |
| Genus mix follows the local vector: São Paulo 85% Aedes, Lagos 80% Anopheles, New York 90% Culex. | Matches the disease story per city. |
| Rows stop 2 hours before the seed run; aggregates refreshed over the full range afterwards. | The stream trigger only fires for the last hour, so seeding never floods live clients; the refresh policy only covers 3 days. |

**Result:** 6,792 seeded detections (2026-08-15 to 2026-10-10): BR 1,289 across 10 districts, NG 5,425 across 20, US 78 across 5 (West Nile off-season).

## 11. Scope changes

- **Cortex Search / prevention guidance dropped from our side.** Raymond's Next.js route calls the Gemini API, which finds guidance and writes the district plans. Our Snowflake usage stays on the REST API (SQL API + `SNOWFLAKE.ML.FORECAST`); `search_guidance()` in `snowflake_rest.py` is unused.

## 12. Held until the end (need someone else, or a decision)

- Railway deploy and public-URL test (Raymond is troubleshooting the build; the next deploy needs Python 3.13 + `scikit-learn==1.9.1`, already in the repo).
- Tighten CORS to the real Vercel domain once known.
- Commit and push the current work (waiting for the go-ahead).

## 13. Frontend ↔ backend wiring

| Decision | Why |
| --- | --- |
| **One adapter layer in Next.js (`frontend/src/lib/backend.ts`); every `/api/*` route goes through it.** FastAPI shapes are unchanged. | The FastAPI service returns its own shapes (`district_id`, `lon`, risk 0–1, `"west nile"`, `top3[].p`); the components read the contract in `types.ts` (`district`, `lng`, risk 0–100, `west_nile`, `top3[].probability`). Converting in one place left component props untouched, so the uncommitted frontend work merges cleanly. |
| **Detections are placed inside their district's real outline** (Gaussian around the centroid, rejection-sampled against the geoBoundaries polygon, seeded by `detection_id` so dots don't move between reloads). | The service stores the district, never GPS, so every detection carries the same centroid; drawn as-is, each district would be one stacked dot. Polygons come from `GET /districts?geojson=true`, cached per server process. |
| UI district names are resolved to service ids server-side (`resolveDistrictId`). | The dashboard and listen page key districts by display name; `/forecast` and `/classify` need ids. Unknown or ambiguous names fail with a 422 instead of returning an empty result. |
| `/classify` adapter adds `client_id` (fresh UUID), `recorded_at` (now), `district_id`, `device='web'`, `mime`. | Required by the service (`client_id` makes retries idempotent). |
| Errors fail loudly: the upstream status and body are passed through as JSON with a 4xx/5xx status. No silent fallback to mocks once `BUZZ_API_URL` is set. | A silent mock fallback would make a broken backend look like working data. |
| `is_simulated` on `/api/risk` = any simulated case history **or** any seeded detection. | All three maps currently use seeded detections; the "Simulated data" badge must show. |
| New routes: `/api/timeline` (time slider), `/api/districts` (outlines), `/api/stream` (SSE relay). The dashboard listens on `/api/stream` and refetches the last 7 days of dots 1.5 s after a burst of live detections. | Exposes the remaining pipelines for the uncommitted UI work. The relay works locally; on Vercel the function time limit cuts it and `EventSource` reconnects on its own. |
| Gemini district plans are grounded in live numbers (risk score, rank, 7-day detections, 14-day cases, 4-week forecast). | Plans reference the district's actual situation instead of generic text. Falls back to the grounded table without `GEMINI_API_KEY`. |
| West Nile forecast labelled "positive pools", not "cases". | Matches the forecast's `unit`. |

**Local run:** backend `.venv/bin/uvicorn app.main:app --app-dir backend --port 8001`; frontend `frontend/.env.local` with `BUZZ_API_URL=http://localhost:8001`, then `npx next dev --port 3001`.

**Data seen on 2026-10-10 (last 7 days):** NG 702 detections, BR 151, US 7. Note: Tiger's West Nile data was re-run after §8 was written (case history now ~50–130 pools per Brooklyn week; latest forecast batch 2026-10-10 21:36 UTC: Brooklyn 22.4 → 1.6 → 0.8 → 0), so §8's numbers are out of date.

**Follow-up after merging the full frontend (PR #4), 2026-10-10:**

| Decision | Why |
| --- | --- |
| `/api/prevention` validates districts against the service's district list (via `districtsById()`), not the mock list; mock only when `BUZZ_API_URL` is unset or the lookup fails. | The listening screen's dropdown comes from `/api/risk`, i.e. real Tiger names. Against the mock list, every São Paulo municipality and 12 of 20 Lagos LGAs (including the default, Shomolu) returned "Choose a supported district". |
| Sample-button uploads are sent with `device='sample'` and stored with `is_simulated = true` (`SIMULATED_DEVICES` in `backend/app/main.py`). | They were stored as real detections. Three taps in a district would have made the prevention panel report "recent district detections" from a canned clip. **Needs a backend redeploy to take effect on Railway.** |
| The prevention panel shows "Regional prevalence unavailable" for now. | Intended: it counts only real, confident detections, and every detection in Tiger is seeded. It switches on once real phone recordings arrive. |

## 14. Dashboard map redesign (2026-10-10)

| Decision | Why |
| --- | --- |
| The map fills the screen (full width, 92% of the viewport height); the title, country switch and legend float on it. The side city list and the "Simulated data" box are gone. | The map is the product; a boxed component with a sidebar made it feel tacked on. Cities are picked on the map. |
| Simulated status moved into the legend line ("... · simulated data"), shown whenever the risk response says any input is simulated. | Seeded detections must stay labelled on screen (spec), but not as a box over the map. |
| State / province lines when zoomed out; district / county / municipality lines fade in from about 1 zoom level past "whole country"; street tiles (already present) take over from zoom 10. | More detail as you zoom, as asked. Lines are geoBoundaries ADM1 / ADM2, simplified by `scripts/build_map_lines.py` into `frontend/public/geo/<CC>-adm1.json` and `-adm2.json`. District files are fetched lazily (Brazil's is 2.4 MB). |
| Topography = Esri hillshade tiles, converted to a transparent-black shading layer and drawn on the map canvas, clipped to the country shape. It fades by about 65% toward city zoom and disappears under the street tiles. | The tiles are near-white (mean brightness 251), so blending them in did nothing; mapping slope shadow to alpha gives subtle relief. Own canvas so it stays under the dots and lines. |
| District selection moved onto the map: once zoomed in (zoom >= 9.5), each district gets a label with its risk score; click to select (forecast and plan below the map follow). City labels hide at that zoom. Cities with data have their own click zoom (Lagos 11.1, São Paulo 9.8, New York 11.1) so all districts are in frame. | Replaces the removed list; São Paulo at the old zoom 13 showed only 3 dots. |
| Zoom buttons moved to bottom-right; the country fit leaves 70 px clear at the top. | They overlapped the title, and the country shape ran under it. |

**Needs a dev-server restart** if the new `.risk-map` styles don't show (the CSS cache went stale once). Regenerate lines with `python3 scripts/build_map_lines.py` (downloads ADM1 with curl if missing).

**Map interaction pass (2026-10-10):**

| Decision | Why |
| --- | --- |
| The map's wrapper has `data-lenis-prevent`. | Lenis (the site's smooth page scroll) listens on the whole window and scrolled the page even though the map handled the wheel. The attribute makes Lenis ignore anything over the map; wheel there only zooms, wheel elsewhere scrolls the page. |
| Zoom gain depends on the input: mouse wheel 1/150 per px (unchanged), trackpad scroll 1/70, pinch (ctrl+wheel) about 1/61. Eased at 0.3 per frame. | Pinch and trackpad send many small deltas; one gain tuned for a mouse wheel made them feel heavy. The pinch gain is about Mapbox's. |
| Colour key moved to the bottom right (beside the zoom buttons) as a fixed overlay; the "1 dot = ..." sentence stays bottom left. | They were close enough to read as one sentence. As a page overlay (not inside the map), the key stays still while maps slide. |
| Switching country slides horizontally (`SlideStage`, 900 ms, `cubic-bezier(0.76, 0, 0.18, 1)`): the old map glides out as the new one glides in. Arrows at the left and right edges step through Nigeria, Brazil and USA and wrap around; the buttons slide the matching direction. Clicks are ignored mid-slide. | The requested swish. All three countries' data is fetched at page load so a switch never waits on the network. |
| The selected district is derived (picked district if it belongs to the shown country, else the top-ranked one) instead of being set in an effect. | Avoids a flash of the old country's district during the slide. |

**Full-page map pass (2026-10-10):**

| Decision | Why |
| --- | --- |
| The dashboard is one full-screen map (no page scroll). The forecast chart and recommended actions live in a card docked bottom-left: a pill ("district · forecast & actions") that opens into a two-column card (chart, actions) with a close button. Clicking a district on the map opens it. | Map as the whole page, with the detail inside the UI instead of under it. Closed by default so the map stays clear. |
| Leaflet's attribution box is replaced by a static credit line (white mono text, no background, flag removed) at the bottom right; zoom +/- are page-level buttons that send the map the same eased wheel zoom (1 click = 1 level). | They stay still while maps slide, and match the other text. The Leaflet / Esri / OpenStreetMap credit wording is kept (licence requirement). |
| `SlideStage` keeps all three maps mounted, parked off-screen, and slides them with `transform` only (1500 ms, easeInOutSine). Before it creates a map mid-slide, so Leaflet setup, tile loading and layout were fighting the animation. Maps left zoomed on a city reset to the country view after the slide. | Measured in headless Chrome: 132 frames over the slide, 16.8 ms average, one frame at 33 ms. |

**Dots and zoom-out (2026-10-10):**

| Decision | Why |
| --- | --- |
| Clicking a dot picks it: a ring on the dot and a small card (species, genus and "% sure", how long ago and in which district, which diseases that genus can carry, phone recording vs smart trap, and a "simulated demo data" line for seeded rows). The card follows the dot while panning and zooming; Escape, ×, or clicking elsewhere closes it. Hovering a dot shows a pointer cursor. | Makes each dot a real, individual report instead of texture. Hit-testing is done on the map canvas (nearest dot within its radius + 5 px), so no per-dot DOM elements. The card says the species is the closest match, since only the genus is reliable (see section 6). |
| Clicking the button of the country you are already on zooms the map back out to the whole-country view and clears the city selection. | Quick way out of a city, without hunting for "all cities". |

## 13. Country-wide simulated detections (more dots across each map)

| Decision | Why |
| --- | --- |
| **~37,000 simulated detections scattered across all of Brazil, Nigeria and the contiguous US** (`scripts/seed_wide_detections.py`), about 3,650 / 3,500 / 1,200 per country in the 7 days the map shows (US lower: West Nile is off-season), with older weeks tapering for the time slider. Same dot style as the existing ones. | The dots only covered our 35 districts, so most of each country looked empty. (A first attempt shaded the whole country with a colour surface instead of adding dots; that was a misreading of the request and was removed.) |
| **Where dots go follows geography:** the chance a dot lands in a grid cell is `(suitability/100)^2.2 × (0.25 + urban)`, with open-water cells × 0.2; the suitability grid (`density_cells`, built by `scripts/build_density.py`) comes from real elevation, last year's temperature and rainfall, distance to rivers, lakes and coast, and distance to big cities. A dot is a random spot inside its cell. | "Realistic and somewhat calculated": more mosquitoes where it is warm, wet, near water and near people; few in deserts, highlands and cold regions. Checked on the live map: Nigeria thickest in the Niger Delta and Lagos and thin in the Sahel, Brazil thick across the Amazon and humid coast, the US heaviest in the Southeast and Gulf and thin in the Rockies and the dry West. |
| **Dots outside our districts carry their own position.** `detections` gained `lat`, `lng`, `region` and `district_id` became nullable; `/detections` returns `coalesce(d.lat, district centre)` and a `near <city>` name. Rows are flagged `is_simulated`, `device = 'seed-wide'`, `model_version = 'seed-wide-v1'`; re-running the script replaces them. | The old schema tied every detection to one of 35 districts, which can't place dots across a country. These dots are not part of any district's risk score or timeline (those join on district). |
| **Dots are clustered when zoomed out:** dots in the same screen-pixel cell merge into one larger dot (the cell size is chosen at the whole-country view so about 10 dots become 1), clusters get darker and bigger the more they hold, clicking one zooms in 1.7 levels and it splits, and a lone dot opens its card as before. Maps with fewer than 60 dots are not clustered. (`RiskHeatMapClient.tsx`) | Thousands of dots per country were unreadable and heavy to draw. Cell size is fixed in screen pixels, so zooming in separates them naturally. |
| **Dot placement is deliberately uneven (clumped):** persistent hotspots (heavy-tailed sizes, each with its own spread, placed by the geography weights `(suitability/100)^3 × (0.25 + urban)^1.3`) plus 10% thin scatter. | The first version drew dots independently per cell, which looked evenly sprinkled; real outbreaks clump. |
| **The red scale was dimmed:** core `rgb(150 34 40)` to edge `rgb(196 128 128)` (was 196/30/38 to 252/165/165) and dot opacity 0.72 (was 0.9). | Full-strength red glared on the dark map once dots covered the country. |
| **Dot colour now shows local density:** dark red where many dots cluster (within ~0.4°, about 45 km), light red where sparse (`dotColors` in `RiskHeatMapClient.tsx`); legend reads "Dense … Sparse". | The old colouring only encoded distance from a district's centre, which means nothing once dots cover the country. |

**Limits.** The geography inputs are coarse (Natural Earth 50 m rivers omit small streams; city populations are rounded approximations; grid cells are 0.25–0.5°); the weights are my starting values, not fitted to mosquito counts. The dots are illustrative simulated data and are labelled as such on the map ("simulated data").

**Operational notes.** Open-Meteo's elevation endpoint counts every coordinate as a request: the first grid build burned the hourly limit and stopped, so elevation moved to OpenTopoData and elevation and climate samples are cached in `data/density/cache/`. Water term scaled by rainfall (Phoenix scored 72 before, 63 after) because dry riverbeds don't breed mosquitoes. A stale-connection bug (Tiger closes idle connections; the pool reused a dead one and `/health` returned a 500) was fixed with a connection check in `backend/app/db.py`. The `/density` endpoint and `density_cells` table remain (the table feeds the seeding); no frontend uses `/density`.

## Change log
- **2026-10-09/10:** Tiger schema and districts loaded; `/classify` service with mock phone; Snowflake set up over REST; dengue history and weather loaded; dengue forecast trained, back-tested and published to Tiger.
- **2026-10-10:** Audio features and genus/species classifier trained; HumBug detector tried and rejected; tonality gate adopted; new pipeline wired into `/classify`; demo clips exported. This document started.
- **2026-10-10:** Lagos malaria history simulated from real rainfall; malaria forecast trained in Snowflake; both diseases published to Tiger (`run_forecast.py` and `publish_to_tiger.py` now handle multiple diseases).
- **2026-10-10:** New York (5 boroughs, `US`) added; West Nile positive pools simulated from real NYC temperature and forecast; all three diseases published to Tiger; 8 weeks of detections seeded; dashboard read endpoints and the live `/stream` added and verified; Cortex Search dropped (Gemini handles guidance).
- **2026-10-10:** Frontend wired to the live backend through one Next.js adapter (`frontend/src/lib/backend.ts`); detections scattered inside real district outlines; timeline, districts and stream routes added; dashboard updates live; verified on all three maps.
- **2026-10-10:** After PR #4: prevention district lookup fixed for real districts; Sample-button uploads flagged simulated; contract doc corrected.
- **2026-10-10:** Dashboard map redesigned: full-bleed, state and district lines by zoom, hillshade topography, on-map district labels; city list and simulated box removed.
- **2026-10-10:** Map: wheel locked to zoom over the map, lighter pinch zoom, colour key moved right, horizontal slide between countries with edge arrows.
- **2026-10-10:** Dashboard is now a full-screen map; forecast and actions in a docked card; Leaflet credit and zoom restyled; smoother slide.
- **2026-10-10:** Dots are clickable (info card); the current country's button zooms back out.
- **2026-10-10:** Frontend from `main` run locally against our backend; connection-pool fix; country-wide geography grid built; ~37,000 simulated detections scattered across BR, NG, US by that grid, dots coloured by local density.
- **2026-10-10:** Water term made rainfall-dependent (desert correction); country-wide dots verified in a real browser for all three countries.
- **2026-10-11:** Wide dots re-placed in clumps; dots cluster (about 10:1) when zoomed out and expand on zoom; red scale dimmed.
