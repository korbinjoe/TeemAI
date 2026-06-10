#!/usr/bin/env bash
set -euo pipefail
source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/_lib.sh"

PERIOD="daily"
while [[ $# -gt 0 ]]; do
  case "$1" in
    --period) PERIOD="$2"; shift 2 ;;
    *) shift ;;
  esac
done

PORT="$(ensure_daemon)"
curl -sf -X POST "http://127.0.0.1:${PORT}/api/command" \
  -H 'Content-Type: application/json' \
  -d "{\"type\":\"analytics\",\"payload\":{\"period\":\"${PERIOD}\"}}"
