#!/usr/bin/env bash
set -euo pipefail
source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/_lib.sh"

CONFIG_DIR="${HOME}/.teemai/browser-agent"
CONFIG_FILE="${CONFIG_DIR}/config.json"

write_local_config() {
  local key="$1"
  local value="$2"
  mkdir -p "$CONFIG_DIR"
  node -e "
    const fs = require('fs');
    const file = process.argv[1];
    const key = process.argv[2];
    const raw = process.argv[3];
    let parsed;
    try { parsed = JSON.parse(raw); } catch { parsed = raw; }
    let cfg = {};
    try { cfg = JSON.parse(fs.readFileSync(file, 'utf8')); } catch {}
    cfg[key] = parsed;
    fs.writeFileSync(file, JSON.stringify(cfg, null, 2) + '\n', { mode: 0o600 });
  " "$CONFIG_FILE" "$key" "$value"
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --set)
      KEY="${2%%=*}"
      VALUE="${2#*=}"
      JSON_VALUE="$(node -e "
        const raw = process.argv[1];
        try { console.log(JSON.stringify(JSON.parse(raw))); }
        catch { console.log(JSON.stringify(raw)); }
      " "$VALUE")"

      # Skill-side settings mirrored locally for scripts that run before extension connects.
      case "$KEY" in
        autoConfirm|chromeAppName|pageLoadDelayMs)
          write_local_config "$KEY" "$JSON_VALUE"
          ;;
      esac

      PORT="$(ensure_daemon)"
      curl -sf -X POST "http://127.0.0.1:${PORT}/api/command" \
        -H 'Content-Type: application/json' \
        -d "{\"type\":\"configure\",\"payload\":{\"settings\":{${KEY}:${JSON_VALUE}}}}"
      exit 0
      ;;
    *) shift ;;
  esac
done

echo "Usage: configure.sh --set key=value" >&2
echo "  Keys: autoConfirm=true|false, chromeAppName, pageLoadDelayMs, activeHours, maxPostsPerDay" >&2
exit 40
