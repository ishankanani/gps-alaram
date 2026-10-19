#!/usr/bin/env bash
# Checks the migrations, the seed and the RLS tests in a throwaway local Postgres database:
#   sudo -u postgres supabase/tests/run-local.sh      (needs psql and a running Postgres 15+)
set -euo pipefail
cd "$(dirname "$0")/.."
DB=${DB:-stopwake_supabase_check}
psql -v ON_ERROR_STOP=1 -q -c "drop database if exists $DB" -c "create database $DB"
run() { echo "-- $1"; psql -v ON_ERROR_STOP=1 -q -d "$DB" -f "$1"; }
run tests/local-stub.sql
for f in migrations/*.sql; do run "$f"; done
run seed.sql
run tests/rls-test.sql
echo "OK"
