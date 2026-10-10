-- Add New York (country 'US') as a third launch location. Run once on an existing database.
ALTER TABLE districts DROP CONSTRAINT districts_country_check;
ALTER TABLE districts ADD CONSTRAINT districts_country_check CHECK (country IN ('BR','NG','US'));
