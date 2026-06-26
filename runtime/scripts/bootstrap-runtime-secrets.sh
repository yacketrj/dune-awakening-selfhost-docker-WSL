#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/../.."

[ -f .env ] && . ./.env
[ -r runtime/generated/battlegroup.env ] && . runtime/generated/battlegroup.env

source runtime/scripts/secrets-bootstrap.sh
source runtime/scripts/db-passwords.sh

usage() {
  cat <<'USAGE'
Usage:
  runtime/scripts/bootstrap-runtime-secrets.sh [all|common|database]

Creates missing generated runtime secret files without replacing existing non-empty secrets.
Use this during upgrade/startup before any service reads runtime/secrets.
USAGE
}

generate_hex_secret() {
  local bytes="${1:-32}"
  openssl rand -hex "$bytes"
}

generate_env_or_hex_secret() {
  local env_name="$1"
  local bytes="${2:-32}"
  local value="${!env_name:-}"

  if [ -n "$value" ]; then
    printf '%s\n' "$value"
  else
    generate_hex_secret "$bytes"
  fi
}

maybe_enable_legacy_database_defaults() {
  if docker volume inspect dune-postgres-data >/dev/null 2>&1 &&
    [ -z "${DUNE_DB_PASSWORD:-}" ] &&
    [ -z "${POSTGRES_PASSWORD:-}" ] &&
    [ ! -s runtime/secrets/dune-db-password.txt ] &&
    [ ! -s runtime/secrets/postgres-password.txt ]; then
    export DUNE_DB_SECRET_LEGACY_DEFAULTS=1
    echo "Existing Postgres volume found without generated DB secrets; preserving legacy credentials."
    echo "Use the web Database password workflow to rotate the dune role when ready."
  fi
}

bootstrap_database_secrets() {
  maybe_enable_legacy_database_defaults
  resolve_dune_db_password >/dev/null
  resolve_postgres_password >/dev/null
}

bootstrap_common_secrets() {
  ensure_runtime_secret_file runtime/secrets/rmq-http-token-auth-secret.txt generate_hex_secret 32
  ensure_runtime_secret_file runtime/secrets/fls-apikey.txt generate_hex_secret 16
  ensure_runtime_secret_file runtime/secrets/command-auth-token.txt generate_env_or_hex_secret DUNE_COMMAND_AUTH_TOKEN 32
  ensure_runtime_secret_file runtime/secrets/server-login-password-secret.txt generate_hex_secret 32
  ensure_runtime_secret_file runtime/secrets/username-server-login-secret.txt generate_hex_secret 32
  ensure_runtime_secret_file runtime/secrets/admin-web-session-secret.txt generate_hex_secret 48
  ensure_runtime_secret_file runtime/secrets/admin-web-password.txt generate_env_or_hex_secret ADMIN_PASSWORD 18

  if [ -f runtime/secrets/funcom-token.txt ]; then
    chmod 600 runtime/secrets/funcom-token.txt 2>/dev/null || true
  fi
}

mode="${1:-all}"
case "$mode" in
  all)
    bootstrap_database_secrets
    bootstrap_common_secrets
    ;;
  database)
    bootstrap_database_secrets
    ;;
  common)
    bootstrap_common_secrets
    ;;
  -h|--help|help)
    usage
    ;;
  *)
    usage >&2
    exit 2
    ;;
esac

echo "runtime secret bootstrap complete: $mode"
