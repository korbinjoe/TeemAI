#!/usr/bin/env bash
set -euo pipefail

PORT_FILE="${HOME}/.teemai/browser-agent/daemon.port"
CONFIG_FILE="${HOME}/.teemai/browser-agent/config.json"
WAIT_ATTEMPTS=30
WAIT_INTERVAL=0.2
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

parse_port() {
  node -e "const f=require('fs').readFileSync(process.argv[1],'utf8'); console.log(JSON.parse(f).port)" "$PORT_FILE"
}

health_ok() {
  local port="$1"
  curl -sf "http://127.0.0.1:${port}/api/health" >/dev/null 2>&1
}

wait_for_healthy_port() {
  local attempt=0
  while [[ $attempt -lt $WAIT_ATTEMPTS ]]; do
    if [[ -f "$PORT_FILE" ]]; then
      local port
      port="$(parse_port)"
      if health_ok "$port"; then
        echo "$port"
        return 0
      fi
    fi
    sleep "$WAIT_INTERVAL"
    attempt=$((attempt + 1))
  done
  return 1
}

auto_confirm_enabled() {
  [[ -f "$CONFIG_FILE" ]] && node -e "
    const fs = require('fs');
    const cfg = JSON.parse(fs.readFileSync(process.argv[1], 'utf8'));
    process.exit(cfg.autoConfirm === true ? 0 : 1);
  " "$CONFIG_FILE"
}

ensure_daemon() {
  if [[ -f "$PORT_FILE" ]]; then
    local port
    port="$(parse_port)"
    if health_ok "$port"; then
      echo "$port"
      return 0
    fi
  fi

  # Try launching Chrome so the extension can connect to the daemon.
  if [[ -f "${SCRIPT_DIR}/browser.sh" ]]; then
    "${SCRIPT_DIR}/browser.sh" ensure >/dev/null 2>&1 || true
  fi

  if port="$(wait_for_healthy_port)"; then
    echo "$port"
    return 0
  fi

  echo "Extension/daemon not running. Install Browser Agent Helper from extension settings, then reload Chrome." >&2
  exit 10
}

wait_for_extension() {
  local timeout="${1:-60}"
  local elapsed=0
  while [[ $elapsed -lt $timeout ]]; do
    if [[ -f "$PORT_FILE" ]]; then
      local port status_json
      port="$(parse_port 2>/dev/null || true)"
      if [[ -n "${port:-}" ]]; then
        status_json="$(curl -sf "http://127.0.0.1:${port}/api/status" 2>/dev/null || true)"
        if [[ -n "$status_json" ]] && echo "$status_json" | node -e "
          const s = JSON.parse(require('fs').readFileSync(0, 'utf8'));
          process.exit(s.connected ? 0 : 1);
        " 2>/dev/null; then
          echo "$status_json"
          return 0
        fi
      fi
    fi
    sleep 1
    elapsed=$((elapsed + 1))
  done
  return 1
}
