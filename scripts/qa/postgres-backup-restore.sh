#!/usr/bin/env bash
set -euo pipefail
: "${BOOTSTRAP_DATABASE_URL:?BOOTSTRAP_DATABASE_URL is required}"
: "${MIGRATION_DATABASE_URL:?MIGRATION_DATABASE_URL is required}"

artifact_dir="${QA_ARTIFACT_DIR:-qa-artifacts/backup-restore}"
mkdir -p "$artifact_dir"
backup="$artifact_dir/veza.dump"
restore_db="veza_restore_${GITHUB_RUN_ID:-local}_$RANDOM"
admin_url="${BOOTSTRAP_DATABASE_URL%/*}/postgres"
restore_bootstrap_url="${BOOTSTRAP_DATABASE_URL%/*}/$restore_db"
restore_migration_url="${MIGRATION_DATABASE_URL%/*}/$restore_db"
sentinel="qe-backup-${GITHUB_RUN_ID:-local}-$RANDOM"

cleanup() {
  psql "$admin_url" -v ON_ERROR_STOP=1 -c "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = '$restore_db' AND pid <> pg_backend_pid();" >/dev/null 2>&1 || true
  psql "$admin_url" -v ON_ERROR_STOP=1 -c "DROP DATABASE IF EXISTS \"$restore_db\";" >/dev/null 2>&1 || true
}
trap cleanup EXIT

psql "$BOOTSTRAP_DATABASE_URL" -v ON_ERROR_STOP=1 <<SQL
CREATE TABLE IF NOT EXISTS qe_backup_sentinels (
  key text PRIMARY KEY,
  created_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO qe_backup_sentinels(key) VALUES ('$sentinel') ON CONFLICT DO NOTHING;
SQL

pg_dump "$BOOTSTRAP_DATABASE_URL" --format=custom --no-owner --no-privileges --file="$backup"
psql "$admin_url" -v ON_ERROR_STOP=1 -c "CREATE DATABASE \"$restore_db\";"
pg_restore --dbname="$restore_bootstrap_url" --no-owner --no-privileges "$backup"

psql "$restore_bootstrap_url" -v ON_ERROR_STOP=1 -Atc "SELECT key FROM qe_backup_sentinels WHERE key = '$sentinel'" | grep -Fx "$sentinel"
source_count="$(psql "$BOOTSTRAP_DATABASE_URL" -Atc "SELECT count(*) FROM schema_migrations")"
restore_count="$(psql "$restore_bootstrap_url" -Atc "SELECT count(*) FROM schema_migrations")"
test "$source_count" = "$restore_count"
MIGRATION_DATABASE_URL="$restore_migration_url" node apps/api/scripts/migrate.mjs | tee "$artifact_dir/forward-remediation.log"
psql "$restore_bootstrap_url" -v ON_ERROR_STOP=1 -Atc "SELECT count(*) FROM schema_migrations" | grep -Fx "$source_count"

echo "Backup and restore validation passed with $source_count migrations."
