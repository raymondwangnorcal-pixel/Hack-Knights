-- Raw landing tables. Run after 001_setup.sql, as BUZZ_APP. Loaded by scripts/load_snowflake.py.
USE ROLE BUZZ_APP; USE WAREHOUSE BUZZ_WH; USE DATABASE BUZZ;

CREATE TABLE IF NOT EXISTS RAW.CASES_INFODENGUE (
  district_id STRING NOT NULL,      -- 'BR-3550308', matches Tiger districts
  week_start  DATE   NOT NULL,      -- InfoDengue data_iniSE (epidemiological week start)
  disease     STRING NOT NULL,      -- 'dengue'
  cases       NUMBER NOT NULL,      -- casos (reported)
  cases_est   FLOAT,                -- casos_est (nowcast-adjusted)
  incidence_100k FLOAT,
  loaded_at   TIMESTAMP_NTZ DEFAULT CURRENT_TIMESTAMP()
);

CREATE TABLE IF NOT EXISTS RAW.WEATHER_DAILY (
  district_id STRING NOT NULL,
  day         DATE   NOT NULL,
  rain_mm     FLOAT,
  temp_mean_c FLOAT,
  loaded_at   TIMESTAMP_NTZ DEFAULT CURRENT_TIMESTAMP()
);

CREATE TABLE IF NOT EXISTS RAW.DETECTIONS (        -- copy of Tiger detections, synced every 10 min
  detection_id STRING NOT NULL,
  time         TIMESTAMP_TZ NOT NULL,
  country      STRING, district_id STRING, genus STRING, species STRING,
  confidence   FLOAT, is_simulated BOOLEAN
);

CREATE TABLE IF NOT EXISTS RAW.GUIDANCE_DOCS (     -- WHO / national prevention guidance, one row per document
  doc_title STRING NOT NULL, source_url STRING NOT NULL,
  disease   STRING, country STRING, body STRING NOT NULL
);

-- One row per district per week, the shape SNOWFLAKE.ML.FORECAST wants
CREATE OR REPLACE VIEW ANALYTICS.WEEKLY_CASES AS
SELECT district_id, week_start, disease, MAX(cases) AS cases
FROM RAW.CASES_INFODENGUE
GROUP BY district_id, week_start, disease;
