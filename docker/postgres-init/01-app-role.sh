#!/bin/sh
# Spúšťa ho oficiálny obraz postgres IBA pri prvej inicializácii prázdneho volume
# (/docker-entrypoint-initdb.d). Založí rolu `gamejam_app` len s DML právami:
#   - aplikácia beží pod gamejam_app (SELECT/INSERT/UPDATE/DELETE, žiadne DDL, nie superuser),
#   - migrácie bežia pod vlastníkom databázy ($POSTGRES_USER) cez MIGRATION_DATABASE_URL.
# Existujúci volume: spusti ručne (docs/DEPLOY.md → „Postgres role v Dockeri“).
set -eu
: "${APP_DB_PASSWORD:?APP_DB_PASSWORD nie je nastavené}"

psql -v ON_ERROR_STOP=1 \
  --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" \
  -v app_pw="$APP_DB_PASSWORD" -v owner="$POSTGRES_USER" <<'SQL'
SELECT format('CREATE ROLE gamejam_app LOGIN PASSWORD %L', :'app_pw')
 WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'gamejam_app') \gexec
SELECT format('ALTER ROLE gamejam_app PASSWORD %L', :'app_pw') \gexec
ALTER ROLE gamejam_app NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS CONNECTION LIMIT 30;

SELECT format('REVOKE ALL ON DATABASE %I FROM PUBLIC', current_database()) \gexec
SELECT format('GRANT CONNECT ON DATABASE %I TO gamejam_app', current_database()) \gexec

REVOKE CREATE ON SCHEMA public FROM PUBLIC;
GRANT USAGE ON SCHEMA public TO gamejam_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO gamejam_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO gamejam_app;
-- tabuľky z budúcich migrácií (vytvára ich vlastník) dostanú práva automaticky
ALTER DEFAULT PRIVILEGES FOR ROLE :"owner" IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO gamejam_app;
ALTER DEFAULT PRIVILEGES FOR ROLE :"owner" IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO gamejam_app;
SQL
echo "[init] rola gamejam_app pripravená"
