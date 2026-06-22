#!/usr/bin/env bash

db_password_secret_value() {
  local env_name="$1"
  local secret_file="$2"
  local legacy_value="$3"
  local env_value="${!env_name:-}"

  if [ -n "$env_value" ]; then
    printf '%s' "$env_value"
    return 0
  fi

  if [ ! -s "$secret_file" ]; then
    mkdir -p "$(dirname "$secret_file")"
    if [ "${DUNE_DB_SECRET_LEGACY_DEFAULTS:-0}" = "1" ]; then
      printf '%s\n' "$legacy_value" > "$secret_file"
    else
      openssl rand -hex 32 > "$secret_file"
    fi
    chmod 600 "$secret_file" 2>/dev/null || true
  fi

  tr -d '\r\n' < "$secret_file"
}

resolve_dune_db_password() {
  db_password_secret_value DUNE_DB_PASSWORD runtime/secrets/dune-db-password.txt dune
}

resolve_postgres_password() {
  db_password_secret_value POSTGRES_PASSWORD runtime/secrets/postgres-password.txt postgres
}
