-- Transparent weighted risk score per district. Weights and weather thresholds are
-- starting values to tune, not findings. Run after 001_schema.sql.
CREATE OR REPLACE VIEW risk_now AS
WITH det AS (
  SELECT district_id, sum(detections) AS detections_7d
  FROM daily_counts WHERE day > now() - INTERVAL '7 days' GROUP BY 1),
cas AS (
  SELECT district_id, sum(cases) AS cases_14d
  FROM case_history WHERE week > current_date - 14 GROUP BY 1),
wx AS (  -- weather 2 to 4 weeks ago: mosquitoes need time to breed
  SELECT district_id, sum(rain_mm) AS rain, avg(temp_mean_c) AS temp
  FROM weather_daily WHERE day BETWEEN current_date - 28 AND current_date - 14 GROUP BY 1),
base AS (
  SELECT d.district_id, d.country,
         coalesce(det.detections_7d, 0) AS detections_7d,
         coalesce(cas.cases_14d, 0)     AS cases_14d,
         least(1.0, coalesce(wx.rain, 0) / 100.0)
           * CASE WHEN wx.temp BETWEEN 20 AND 32 THEN 1.0 ELSE 0.5 END AS weather_factor
  FROM districts d
  LEFT JOIN det USING (district_id) LEFT JOIN cas USING (district_id) LEFT JOIN wx USING (district_id))
SELECT *,
  0.5 * percent_rank() OVER (PARTITION BY country ORDER BY detections_7d)
+ 0.3 * percent_rank() OVER (PARTITION BY country ORDER BY cases_14d)
+ 0.2 * weather_factor AS risk_score
FROM base;
