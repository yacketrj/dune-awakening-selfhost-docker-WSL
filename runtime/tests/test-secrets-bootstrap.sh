#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/../.."

source runtime/scripts/secrets-bootstrap.sh
source runtime/scripts/db-passwords.sh

assert_file_value() {
  local file="$1"
  local expected="$2"
  local actual
  actual="$(tr -d '\r\n' < "$file")"
  if [ "$actual" != "$expected" ]; then
    echo "Unexpected secret value in $file: expected '$expected', got '$actual'" >&2
    exit 1
  fi
}

assert_equals() {
  local expected="$1"
  local actual="$2"
  local label="$3"
  if [ "$actual" != "$expected" ]; then
    echo "Unexpected value for $label: expected '$expected', got '$actual'" >&2
    exit 1
  fi
}

tmp_dir="$(mktemp -d "${TMPDIR:-/tmp}/dune-secret-bootstrap-test.XXXXXX")"
trap 'rm -rf "$tmp_dir"' EXIT

missing_secret="$tmp_dir/runtime/secrets/missing.txt"
ensure_runtime_secret_file "$missing_secret" printf '%s\n' created-secret
assert_file_value "$missing_secret" created-secret

if command -v stat >/dev/null 2>&1; then
  mode="$(stat -c '%a' "$missing_secret" 2>/dev/null || true)"
  if [ -n "$mode" ] && [ "$mode" != "600" ]; then
    echo "Expected $missing_secret to have mode 600, got $mode" >&2
    exit 1
  fi
fi

existing_secret="$tmp_dir/runtime/secrets/existing.txt"
printf '%s\n' original-secret > "$existing_secret"
ensure_runtime_secret_file "$existing_secret" printf '%s\n' rotated-secret
assert_file_value "$existing_secret" original-secret

empty_secret="$tmp_dir/runtime/secrets/empty.txt"
: > "$empty_secret"
ensure_runtime_secret_file "$empty_secret" printf '%s\n' replacement-secret
assert_file_value "$empty_secret" replacement-secret

read_value="$(read_runtime_secret_file "$missing_secret")"
assert_equals created-secret "$read_value" read_runtime_secret_file

export TEST_DB_PASSWORD=env-db-secret
db_env_file="$tmp_dir/runtime/secrets/db-env.txt"
db_env_value="$(db_password_secret_value TEST_DB_PASSWORD "$db_env_file" legacy-db-secret)"
assert_equals env-db-secret "$db_env_value" db_password_env_override
if [ -e "$db_env_file" ]; then
  echo "DB env override should not create a secret file: $db_env_file" >&2
  exit 1
fi
unset TEST_DB_PASSWORD

existing_db_file="$tmp_dir/runtime/secrets/existing-db.txt"
printf '%s\n' existing-db-secret > "$existing_db_file"
existing_db_value="$(db_password_secret_value TEST_DB_PASSWORD "$existing_db_file" rotated-db-secret)"
assert_equals existing-db-secret "$existing_db_value" db_password_existing_secret
assert_file_value "$existing_db_file" existing-db-secret

legacy_db_file="$tmp_dir/runtime/secrets/legacy-db.txt"
export DUNE_DB_SECRET_LEGACY_DEFAULTS=1
legacy_db_value="$(db_password_secret_value TEST_DB_PASSWORD "$legacy_db_file" legacy-db-secret)"
unset DUNE_DB_SECRET_LEGACY_DEFAULTS
assert_equals legacy-db-secret "$legacy_db_value" db_password_legacy_default
assert_file_value "$legacy_db_file" legacy-db-secret

echo "Runtime secret bootstrap checks passed."
