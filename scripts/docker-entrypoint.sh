#!/bin/sh
# Docker entrypoint: najprv migrácie databázy, potom Next.js server.
set -e
if [ "${SKIP_MIGRATIONS:-false}" != "true" ]; then
  node /app/scripts/migrate.mjs
fi
exec node /app/server.js
