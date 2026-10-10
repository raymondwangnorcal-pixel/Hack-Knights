-- Buzz Check: Snowflake setup. Paste into a Snowsight SQL worksheet and run ALL (top to bottom).
-- Before running: replace <YOUR_USER> (3 places) with your Snowflake username
-- (Snowsight: click your name bottom-left, the username is shown under it).

USE ROLE ACCOUNTADMIN;
ALTER ACCOUNT SET CORTEX_ENABLED_CROSS_REGION = 'ANY_REGION';

CREATE WAREHOUSE IF NOT EXISTS BUZZ_WH WAREHOUSE_SIZE = XSMALL
  AUTO_SUSPEND = 60 AUTO_RESUME = TRUE INITIALLY_SUSPENDED = TRUE;

CREATE ROLE IF NOT EXISTS BUZZ_APP;
GRANT USAGE, OPERATE ON WAREHOUSE BUZZ_WH TO ROLE BUZZ_APP;
GRANT CREATE DATABASE ON ACCOUNT TO ROLE BUZZ_APP;
GRANT DATABASE ROLE SNOWFLAKE.CORTEX_USER TO ROLE BUZZ_APP;
GRANT ROLE BUZZ_APP TO USER <YOUR_USER>;

USE ROLE BUZZ_APP;                  -- BUZZ_APP owns everything below
CREATE DATABASE IF NOT EXISTS BUZZ;
CREATE SCHEMA IF NOT EXISTS BUZZ.RAW;        -- landed as-is: cases, weather, synced detections, guidance docs
CREATE SCHEMA IF NOT EXISTS BUZZ.ANALYTICS;  -- weekly features, forecast models and outputs
CREATE SCHEMA IF NOT EXISTS BUZZ.AI;         -- guidance chunks + Cortex Search service

-- REST token (PAT). Snowflake requires a network policy for PAT logins unless an
-- authentication policy relaxes it. This relaxes it for our user only.
-- BUZZ_APP owns schema BUZZ.AI, so it must let ACCOUNTADMIN create the policy there.
GRANT CREATE AUTHENTICATION POLICY ON SCHEMA BUZZ.AI TO ROLE ACCOUNTADMIN;
USE ROLE ACCOUNTADMIN;
CREATE AUTHENTICATION POLICY IF NOT EXISTS BUZZ.AI.PAT_POLICY
  PAT_POLICY = (NETWORK_POLICY_EVALUATION = ENFORCED_NOT_REQUIRED);
ALTER USER <YOUR_USER> SET AUTHENTICATION POLICY BUZZ.AI.PAT_POLICY;

-- Creates the token and SHOWS IT ONCE in the result grid. Copy token_secret into .env as SNOWFLAKE_PAT.
ALTER USER <YOUR_USER> ADD PROGRAMMATIC ACCESS TOKEN BUZZ_BACKEND
  ROLE_RESTRICTION = 'BUZZ_APP' DAYS_TO_EXPIRY = 30;
