-- Simulated mosquito-suitability grid for the whole-country map layer (scripts/build_density.py).
CREATE TABLE IF NOT EXISTS density_cells (
  country      text NOT NULL CHECK (country IN ('BR','NG','US')),
  lat          real NOT NULL,
  lng          real NOT NULL,
  cell_deg     real NOT NULL,
  value        real NOT NULL,        -- 0-100 suitability index (illustrative, not measured abundance)
  temp_warm_c  real, temp_mean_c real, rain_mm_yr real, water_km real, coast_km real,
  elev_m       real, urban real, in_lake boolean,
  PRIMARY KEY (country, lat, lng)
);
