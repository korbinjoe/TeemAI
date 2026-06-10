#!/usr/bin/env bash
set -euo pipefail
source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/_lib.sh"

CONFIRM=false
COMMAND=""
PAYLOAD="{}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --confirm) CONFIRM=true; shift ;;
    --wait) shift ;; # task id polling — simplified in v0.1
    --timeout) shift 2 ;;
    generate|post|reply|upvote|pause|resume|feedback|navigate)
      COMMAND="$1"
      shift
      ;;
    --targetId) PAYLOAD=$(node -e "const p=JSON.parse(process.argv[1]); p.targetId=process.argv[2]; console.log(JSON.stringify(p))" "$PAYLOAD" "$2"); shift 2 ;;
    --content) PAYLOAD=$(node -e "const p=JSON.parse(process.argv[1]); p.content=process.argv[2]; console.log(JSON.stringify(p))" "$PAYLOAD" "$2"); shift 2 ;;
    --subreddit) PAYLOAD=$(node -e "const p=JSON.parse(process.argv[1]); p.subreddit=process.argv[2]; console.log(JSON.stringify(p))" "$PAYLOAD" "$2"); shift 2 ;;
    --title) PAYLOAD=$(node -e "const p=JSON.parse(process.argv[1]); p.title=process.argv[2]; console.log(JSON.stringify(p))" "$PAYLOAD" "$2"); shift 2 ;;
    --url) PAYLOAD=$(node -e "const p=JSON.parse(process.argv[1]); p.url=process.argv[2]; console.log(JSON.stringify(p))" "$PAYLOAD" "$2"); shift 2 ;;
    --platform) PAYLOAD=$(node -e "const p=JSON.parse(process.argv[1]); p.platform=process.argv[2]; console.log(JSON.stringify(p))" "$PAYLOAD" "$2"); shift 2 ;;
    *) shift ;;
  esac
done

if [[ -z "$COMMAND" ]]; then
  echo "Usage: send.sh <command> [args...]" >&2
  exit 40
fi

# Layer 1: terminal browser control for navigation.
if [[ "$COMMAND" == "navigate" ]]; then
  NAV_ARGS=()
  URL_VAL="$(node -e "const p=JSON.parse(process.argv[1]); process.stdout.write(p.url||'')" "$PAYLOAD")"
  PLATFORM_VAL="$(node -e "const p=JSON.parse(process.argv[1]); process.stdout.write(p.platform||'')" "$PAYLOAD")"
  if [[ -n "$URL_VAL" ]]; then
    NAV_ARGS=(goto --url "$URL_VAL")
  elif [[ -n "$PLATFORM_VAL" ]]; then
    NAV_ARGS=(goto --platform "$PLATFORM_VAL")
  else
    echo "navigate requires --url or --platform" >&2
    exit 40
  fi
  "${SCRIPT_DIR}/browser.sh" ensure >/dev/null
  "${SCRIPT_DIR}/browser.sh" "${NAV_ARGS[@]}"
  "${SCRIPT_DIR}/browser.sh" wait-ready --timeout 60
  exit 0
fi

if [[ "$COMMAND" == "post" || "$COMMAND" == "reply" ]] && [[ "$CONFIRM" == "false" ]] && auto_confirm_enabled; then
  CONFIRM=true
fi

if [[ "$COMMAND" == "post" || "$COMMAND" == "reply" ]] && [[ "$CONFIRM" == "false" ]]; then
  echo "{\"dryRun\":true,\"command\":\"${COMMAND}\",\"payload\":${PAYLOAD}}" 
  exit 11
fi

PORT="$(ensure_daemon)"
CONFIRM_JSON=$([[ "$CONFIRM" == "true" ]] && echo "true" || echo "false")
RESP=$(curl -sf -X POST "http://127.0.0.1:${PORT}/api/command" \
  -H 'Content-Type: application/json' \
  -d "{\"type\":\"${COMMAND}\",\"payload\":${PAYLOAD},\"confirm\":${CONFIRM_JSON}}") || exit 20

echo "$RESP"
