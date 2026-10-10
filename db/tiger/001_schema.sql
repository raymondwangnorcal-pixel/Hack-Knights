-- Buzz Check: Tiger Data schema. Run top to bottom ONCE on an empty database.
-- psql -v ON_ERROR_STOP=1 -f db/tiger/001_schema.sql
-- Not wrapped in a transaction: continuous aggregates cannot be created inside one.

CREATE EXTENSION IF NOT EXISTS timescaledb;

CREATE TABLE districts (
  district_id  text PRIMARY KEY,             -- 'BR-3550308', 'NG-LA-IKEJA'
  country      text NOT NULL CHECK (country IN ('BR','NG','US')),
  city         text NOT NULL,                -- 'Sao Paulo' | 'Lagos' | 'New York'
  name         text NOT NULL,
  centroid_lat double precision NOT NULL,
  centroid_lon double precision NOT NULL,
  population   integer,
  geojson      jsonb
);

CREATE TABLE detections (
  time          timestamptz NOT NULL,
  detection_id  uuid NOT NULL DEFAULT gen_random_uuid(),
  client_id     uuid NOT NULL,
  country       text NOT NULL,
  district_id   text NOT NULL REFERENCES districts,
  source        text NOT NULL DEFAULT 'phone',
  is_mosquito   boolean NOT NULL,
  species       text,
  genus         text,                         -- anopheles | aedes | culex | other
  confidence    real,
  diseases      text[] NOT NULL DEFAULT '{}',
  model_version text NOT NULL,
  audio_url     text,
  device        text,
  is_simulated  boolean NOT NULL DEFAULT false,
  PRIMARY KEY (detection_id, time),           -- unique keys must include the time column
  UNIQUE (client_id, time)                    -- makes phone retries idempotent
);
SELECT create_hypertable('detections', by_range('time', INTERVAL '1 day'));

-- Compress anything older than 7 days (columnar storage)
ALTER TABLE detections SET (
  timescaledb.compress,
  timescaledb.compress_segmentby = 'district_id',
  timescaledb.compress_orderby   = 'time DESC'
);
SELECT add_compression_policy('detections', INTERVAL '7 days');

-- Daily rollup, real-time on so today's rows count before the next refresh
CREATE MATERIALIZED VIEW daily_counts
WITH (timescaledb.continuous, timescaledb.materialized_only = false) AS
SELECT time_bucket('1 day', time) AS day, country, district_id, genus,
       count(*)                                      AS detections,
       avg(confidence)                               AS avg_confidence,
       sum(CASE WHEN is_simulated THEN 1 ELSE 0 END) AS simulated
FROM detections
WHERE is_mosquito
GROUP BY day, country, district_id, genus
WITH NO DATA;
SELECT add_continuous_aggregate_policy('daily_counts',
  start_offset => INTERVAL '3 days', end_offset => INTERVAL '1 hour',
  schedule_interval => INTERVAL '5 minutes');

-- Weekly rollup built on the daily one (hierarchical continuous aggregate)
CREATE MATERIALIZED VIEW weekly_counts
WITH (timescaledb.continuous, timescaledb.materialized_only = false) AS
SELECT time_bucket('7 days', day) AS week, country, district_id, genus,
       sum(detections) AS detections
FROM daily_counts
GROUP BY week, country, district_id, genus
WITH NO DATA;
SELECT add_continuous_aggregate_policy('weekly_counts',
  start_offset => INTERVAL '21 days', end_offset => INTERVAL '1 day',
  schedule_interval => INTERVAL '30 minutes');

-- Written by the Snowflake jobs
CREATE TABLE case_history (
  week        date NOT NULL,
  district_id text NOT NULL REFERENCES districts,
  disease     text NOT NULL,
  cases       integer NOT NULL,
  source      text NOT NULL,                  -- 'infodengue' | 'map' | 'simulated'
  PRIMARY KEY (district_id, disease, week)
);
SELECT create_hypertable('case_history', by_range('week', INTERVAL '1 year'));

CREATE TABLE weather_daily (
  day         date NOT NULL,
  district_id text NOT NULL REFERENCES districts,
  rain_mm     real,
  temp_mean_c real,
  PRIMARY KEY (district_id, day)
);
SELECT create_hypertable('weather_daily', by_range('day'));

CREATE TABLE forecasts (
  generated_at timestamptz NOT NULL DEFAULT now(),
  district_id  text NOT NULL REFERENCES districts,
  disease      text NOT NULL,
  week_start   date NOT NULL,
  weeks_ahead  smallint NOT NULL CHECK (weeks_ahead BETWEEN 1 AND 4),
  low real NOT NULL, mid real NOT NULL, high real NOT NULL,
  model        text NOT NULL,                 -- 'snowflake-ml-forecast-v1'
  PRIMARY KEY (district_id, disease, week_start, generated_at)
);

-- Live stream: every new real-time detection fires a notify the API relays as SSE.
-- The time guard stops an 8-week backfill from flooding the stream.
CREATE OR REPLACE FUNCTION notify_detection() RETURNS trigger AS $$
BEGIN
  PERFORM pg_notify('detections', json_build_object(
    'detection_id', NEW.detection_id, 'time', NEW.time,
    'country', NEW.country, 'district_id', NEW.district_id,
    'genus', NEW.genus, 'species', NEW.species,
    'confidence', NEW.confidence, 'is_simulated', NEW.is_simulated)::text);
  RETURN NEW;
END $$ LANGUAGE plpgsql;

CREATE TRIGGER detections_notify AFTER INSERT ON detections
FOR EACH ROW WHEN (NEW.is_mosquito AND NEW.time > now() - INTERVAL '1 hour')
EXECUTE FUNCTION notify_detection();
