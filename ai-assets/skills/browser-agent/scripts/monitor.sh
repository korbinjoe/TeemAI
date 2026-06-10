#!/usr/bin/env bash
set -euo pipefail
source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/_lib.sh"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PLATFORM=""
SUBREDDIT=""
LIMIT=10
SKIP_NAV=false

while [[ $# -gt 0 ]]; do
  case "$1" in
    --platform) PLATFORM="$2"; shift 2 ;;
    --subreddit) SUBREDDIT="$2"; shift 2 ;;
    --limit) LIMIT="$2"; shift 2 ;;
    --skip-nav) SKIP_NAV=true; shift ;;
    *) shift ;;
  esac
done

if [[ "$SKIP_NAV" == "false" && -n "$SUBREDDIT" && "$PLATFORM" == "reddit" ]]; then
  "${SCRIPT_DIR}/browser.sh" ensure >/dev/null
  "${SCRIPT_DIR}/browser.sh" goto --url "https://reddit.com/r/${SUBREDDIT}"
  "${SCRIPT_DIR}/browser.sh" wait-ready --timeout 60
  PAGE_DELAY_MS="$(node -e "
    const fs = require('fs');
    const f = '${HOME}/.teemai/browser-agent/config.json';
    let ms = 3000;
    try { ms = JSON.parse(fs.readFileSync(f, 'utf8')).pageLoadDelayMs ?? ms; } catch {}
    console.log(ms);
  ")"
  sleep "$(node -e "console.log(Math.max(1, Math.ceil(Number(process.argv[1]) / 1000)))" "$PAGE_DELAY_MS")"
fi

PORT="$(ensure_daemon)"
curl -sf -X POST "http://127.0.0.1:${PORT}/api/command" \
  -H 'Content-Type: application/json' \
  -d "{\"type\":\"monitor\",\"payload\":{\"platform\":\"${PLATFORM}\",\"subreddit\":\"${SUBREDDIT}\",\"limit\":${LIMIT}}}"
