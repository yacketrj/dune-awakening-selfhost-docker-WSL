#!/usr/bin/env bash

source runtime/scripts/secrets-bootstrap.sh

db_password_secret_payload() {
  local legacy_value="$1"

  if [ "${DUNE_DB_SECRET_LEGACY_DEFAULTS:-0}" = "1" ]; then
    printf '%s\n' "$legacy_value"
  else
    openssl rand -hex 32
  fi
}

db_password_secret_value() {
  local env_name="$1"
  local secret_file="$2"
  local legacy_value="$3"
  local env_value="${!env_name:-}"

  if [ -n "$env_value" ]; then
    printf '%s' "$env_value"
    return 0
  fi

  ensure_runtime_secret_file "$secret_file" db_password_secret_payload "$legacy_value"
  read_runtime_secret_file "$secret_file"
}

resolve_dune_db_password() {
  db_password_secret_value DUNE_DB_PASSWORD runtime/secrets/dune-db-password.txt dune
}

resolve_postgres_password() {
  db_password_secret_value POSTGRES_PASSWORD runtime/secrets/postgres-password.txt postgres
}
