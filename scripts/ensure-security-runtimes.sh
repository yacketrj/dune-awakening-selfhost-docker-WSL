#!/usr/bin/env bash
set -euo pipefail

LOCAL_BIN="${HOME}/.local/bin"
mkdir -p "${LOCAL_BIN}"

if [[ ":${PATH}:" != *":${LOCAL_BIN}:"* ]]; then
  export PATH="${LOCAL_BIN}:${PATH}"
fi

log() { printf '[security-runtime] %s\n' "$*"; }
warn() { printf '[security-runtime][warn] %s\n' "$*" >&2; }
fatal() { printf '[security-runtime][error] %s\n' "$*" >&2; exit 1; }
have() { command -v "$1" >/dev/null 2>&1; }

require_runtime() {
  local name="$1"
  if have "$name"; then
    log "$name found: $(command -v "$name")"
    return 0
  fi
  fatal "$name is required but was not found. Install it first, then rerun this script."
}

ensure_semgrep() {
  if have semgrep; then
    log "semgrep found: $(semgrep --version 2>/dev/null || command -v semgrep)"
    return 0
  fi

  log "semgrep not found; attempting install."

  if have pipx; then
    pipx install semgrep
  elif have uv; then
    uv tool install semgrep
  elif have python3 && python3 -m pip --version >/dev/null 2>&1; then
    python3 -m pip install --user pipx
    "${LOCAL_BIN}/pipx" ensurepath || true
    "${LOCAL_BIN}/pipx" install semgrep
  elif have docker; then
    log "pipx/uv unavailable; installing semgrep Docker wrapper in ${LOCAL_BIN}/semgrep."
    cat > "${LOCAL_BIN}/semgrep" <<'WRAPPER'
#!/usr/bin/env bash
set -euo pipefail
exec docker run --rm -v "${PWD}:/src" -w /src semgrep/semgrep semgrep "$@"
WRAPPER
    chmod +x "${LOCAL_BIN}/semgrep"
    docker pull semgrep/semgrep
  else
    fatal "Unable to install semgrep. Install pipx, uv, Python pip, or Docker, then rerun."
  fi

  have semgrep || fatal "semgrep install attempted but semgrep is still not on PATH. Add ${LOCAL_BIN} to PATH and rerun."
  log "semgrep ready: $(semgrep --version 2>/dev/null || command -v semgrep)"
}

ensure_trivy() {
  if have trivy; then
    log "trivy found: $(trivy --version 2>/dev/null | head -n 1 || command -v trivy)"
    return 0
  fi

  log "trivy not found; attempting install."

  if have brew; then
    brew install trivy
  elif [[ "$(uname -s)" == "Linux" ]]; then
    install_trivy_linux
  elif [[ "$(uname -s)" == "Darwin" ]]; then
    install_trivy_darwin
  else
    fatal "Unsupported OS for automatic trivy install: $(uname -s). Install trivy manually."
  fi

  have trivy || fatal "trivy install attempted but trivy is still not on PATH. Add ${LOCAL_BIN} to PATH and rerun."
  log "trivy ready: $(trivy --version 2>/dev/null | head -n 1 || command -v trivy)"
}

install_trivy_linux() {
  require_runtime curl
  require_runtime tar

  local arch asset tmp latest_url version
  case "$(uname -m)" in
    x86_64|amd64) arch="64bit" ;;
    aarch64|arm64) arch="ARM64" ;;
    armv7l) arch="ARM" ;;
    *) fatal "Unsupported Linux architecture for trivy install: $(uname -m)" ;;
  esac

  latest_url="$(curl -fsSLI -o /dev/null -w '%{url_effective}' https://github.com/aquasecurity/trivy/releases/latest)"
  version="${latest_url##*/v}"
  [[ -n "${version}" && "${version}" != "${latest_url}" ]] || fatal "Unable to resolve latest trivy version."

  asset="https://github.com/aquasecurity/trivy/releases/latest/download/trivy_${version}_Linux-${arch}.tar.gz"
  tmp="$(mktemp -d)"
  log "downloading trivy ${version} for Linux-${arch}"
  curl -fsSL "${asset}" -o "${tmp}/trivy.tar.gz"
  tar -xzf "${tmp}/trivy.tar.gz" -C "${tmp}" trivy
  install -m 0755 "${tmp}/trivy" "${LOCAL_BIN}/trivy"
  rm -rf "${tmp}"
}

install_trivy_darwin() {
  require_runtime curl
  require_runtime tar

  local arch asset tmp latest_url version
  case "$(uname -m)" in
    x86_64|amd64) arch="64bit" ;;
    aarch64|arm64) arch="ARM64" ;;
    *) fatal "Unsupported Darwin architecture for trivy install: $(uname -m)" ;;
  esac

  latest_url="$(curl -fsSLI -o /dev/null -w '%{url_effective}' https://github.com/aquasecurity/trivy/releases/latest)"
  version="${latest_url##*/v}"
  [[ -n "${version}" && "${version}" != "${latest_url}" ]] || fatal "Unable to resolve latest trivy version."

  asset="https://github.com/aquasecurity/trivy/releases/latest/download/trivy_${version}_macOS-${arch}.tar.gz"
  tmp="$(mktemp -d)"
  log "downloading trivy ${version} for macOS-${arch}"
  curl -fsSL "${asset}" -o "${tmp}/trivy.tar.gz"
  tar -xzf "${tmp}/trivy.tar.gz" -C "${tmp}" trivy
  install -m 0755 "${tmp}/trivy" "${LOCAL_BIN}/trivy"
  rm -rf "${tmp}"
}

main() {
  log "checking required local security runtimes"
  require_runtime node
  require_runtime npm
  require_runtime curl
  require_runtime tar
  if have docker; then
    log "docker found: $(docker --version 2>/dev/null || command -v docker)"
  else
    warn "docker not found. Trivy filesystem scans can still run, but image build/scan smoke tests require Docker."
  fi
  ensure_semgrep
  ensure_trivy
  log "all available security runtimes are ready"
  log "PATH reminder: add ${LOCAL_BIN} to PATH if your shell does not already include it."
}

main "$@"
