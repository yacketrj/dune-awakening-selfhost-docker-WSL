#!/usr/bin/env bash

ensure_runtime_secrets_dir() {
  local secret_dir="$1"

  if [ -e "$secret_dir" ] && [ ! -d "$secret_dir" ]; then
    echo "Runtime secret path exists but is not a directory: $secret_dir" >&2
    return 1
  fi

  if [ ! -d "$secret_dir" ]; then
    umask 077
    if ! mkdir -p "$secret_dir"; then
      echo "Could not create runtime secret directory: $secret_dir" >&2
      return 1
    fi
    chmod 700 "$secret_dir" 2>/dev/null || true
  fi

  if [ ! -w "$secret_dir" ]; then
    echo "Runtime secret directory is not writable: $secret_dir" >&2
    echo "Repair ownership or permissions before starting the Dune stack." >&2
    return 1
  fi
}

ensure_runtime_secret_file() {
  local secret_file="$1"
  shift

  if [ "$#" -eq 0 ]; then
    echo "Missing generator command for runtime secret: $secret_file" >&2
    return 2
  fi

  if [ -s "$secret_file" ]; then
    if [ ! -r "$secret_file" ]; then
      echo "Runtime secret file is not readable: $secret_file" >&2
      return 1
    fi
    return 0
  fi

  local secret_dir secret_name tmp_file
  secret_dir="$(dirname "$secret_file")"
  secret_name="$(basename "$secret_file")"

  ensure_runtime_secrets_dir "$secret_dir" || return 1

  if [ -e "$secret_file" ] && [ ! -w "$secret_file" ]; then
    echo "Runtime secret file exists but is not writable: $secret_file" >&2
    echo "Repair ownership or permissions before starting the Dune stack." >&2
    return 1
  fi

  umask 077
  tmp_file="$(mktemp "$secret_dir/.${secret_name}.XXXXXX")"
  if ! "$@" > "$tmp_file"; then
    rm -f "$tmp_file"
    echo "Could not generate runtime secret: $secret_file" >&2
    return 1
  fi

  if [ ! -s "$tmp_file" ]; then
    rm -f "$tmp_file"
    echo "Generated runtime secret was empty: $secret_file" >&2
    return 1
  fi

  chmod 600 "$tmp_file" 2>/dev/null || true

  if [ -s "$secret_file" ]; then
    rm -f "$tmp_file"
    return 0
  fi

  if [ -e "$secret_file" ] && [ ! -w "$secret_file" ]; then
    rm -f "$tmp_file"
    echo "Runtime secret file exists but is not writable: $secret_file" >&2
    return 1
  fi

  if ! mv -f "$tmp_file" "$secret_file"; then
    rm -f "$tmp_file"
    echo "Could not write runtime secret: $secret_file" >&2
    return 1
  fi

  chmod 600 "$secret_file" 2>/dev/null || true
}

read_runtime_secret_file() {
  local secret_file="$1"

  if [ ! -r "$secret_file" ] || [ ! -s "$secret_file" ]; then
    echo "Runtime secret file is missing, empty, or not readable: $secret_file" >&2
    return 1
  fi

  tr -d '\r\n' < "$secret_file"
}
