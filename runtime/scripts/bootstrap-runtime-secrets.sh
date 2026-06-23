#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/../.."

source runtime/scripts/secrets-bootstrap.sh

usage() {
  cat <<'USAGE'
Usage:
  runtime/scripts/bootstrap-runtime-secrets.sh [common]

Creates missing generated runtime secret files without replacing existing non-empty secrets.
This intentionally does not create database password files; start-postgres.sh owns the
legacy-upgrade decision for those files.
USAGE
}

mode="${1:-common}"
case "$mode" in
  common)
    ensure_runtime_secret_file runtime/secrets/rmq-http-token-auth-secret.txt openssl rand -hex 32
    ensure_runtime_secret_file runtime/secrets/fls-apikey.txt openssl rand -hex 16
    ;;
  -h|--help|help)
    usage
    ;;
  *)
    usage >&2
    exit 2
    ;;
esac
