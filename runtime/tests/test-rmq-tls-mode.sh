#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
TMPDIR="$(mktemp -d)"
trap 'rm -rf "$TMPDIR"' EXIT

mkdir -p "$TMPDIR/runtime/scripts" "$TMPDIR/bin"
cp "$ROOT/runtime/scripts/start-rabbitmq.sh" "$TMPDIR/runtime/scripts/start-rabbitmq.sh"

cat > "$TMPDIR/runtime/scripts/host-paths.sh" <<'SH'
host_path() {
  printf '%s' "$1"
}
SH

cat > "$TMPDIR/runtime/scripts/image-tags.sh" <<'SH'
resolve_world_image_tag() {
  printf '%s' "test"
}
SH

cat > "$TMPDIR/bin/docker" <<'SH'
#!/usr/bin/env bash
case "$1" in
  network|rm|run|exec|ps) exit 0 ;;
esac
exit 0
SH
chmod +x "$TMPDIR/bin/docker"

cat > "$TMPDIR/bin/sleep" <<'SH'
#!/usr/bin/env bash
exit 0
SH
chmod +x "$TMPDIR/bin/sleep"

cat > "$TMPDIR/bin/openssl" <<'SH'
#!/usr/bin/env bash
key=""
cert=""
while [ "$#" -gt 0 ]; do
  case "$1" in
    -keyout)
      shift
      key="$1"
      ;;
    -out)
      shift
      cert="$1"
      ;;
  esac
  shift || true
done
[ -n "$key" ] && printf '%s\n' "key" > "$key"
[ -n "$cert" ] && printf '%s\n' "cert" > "$cert"
SH
chmod +x "$TMPDIR/bin/openssl"

cd "$TMPDIR"
PATH="$TMPDIR/bin:$PATH" bash runtime/scripts/start-rabbitmq.sh >/dev/null
grep -q "ssl_options.verify     = verify_peer" runtime/rabbitmq-game/config/rabbitmq.conf
grep -q "ssl_options.fail_if_no_peer_cert = false" runtime/rabbitmq-game/config/rabbitmq.conf

RMQ_GAME_TLS_VERIFY=verify_none RMQ_GAME_TLS_FAIL_IF_NO_PEER_CERT=true PATH="$TMPDIR/bin:$PATH" bash runtime/scripts/start-rabbitmq.sh >/dev/null
grep -q "ssl_options.verify     = verify_none" runtime/rabbitmq-game/config/rabbitmq.conf
grep -q "ssl_options.fail_if_no_peer_cert = true" runtime/rabbitmq-game/config/rabbitmq.conf

if RMQ_GAME_TLS_VERIFY=bogus PATH="$TMPDIR/bin:$PATH" bash runtime/scripts/start-rabbitmq.sh >/tmp/rmq-tls-invalid.out 2>&1; then
  echo "invalid RMQ_GAME_TLS_VERIFY was accepted" >&2
  exit 1
fi
grep -q "Invalid RMQ_GAME_TLS_VERIFY" /tmp/rmq-tls-invalid.out

echo "RabbitMQ TLS mode tests passed"
