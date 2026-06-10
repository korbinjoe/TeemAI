#!/usr/bin/env bash
set -euo pipefail
source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/_browser_lib.sh"

COMMAND="${1:-}"
shift || true

URL=""
PLATFORM=""
TAB_INDEX=""
URL_PATTERN=""
TIMEOUT=60

while [[ $# -gt 0 ]]; do
  case "$1" in
    --url) URL="$2"; shift 2 ;;
    --platform) PLATFORM="$2"; shift 2 ;;
    --index) TAB_INDEX="$2"; shift 2 ;;
    --url-pattern) URL_PATTERN="$2"; shift 2 ;;
    --timeout) TIMEOUT="$2"; shift 2 ;;
    *) echo "Unknown argument: $1" >&2; exit 40 ;;
  esac
done

case "$COMMAND" in
  ensure)
    browser_ensure
    ;;
  activate)
    browser_activate
    echo '{"activated":true}'
    ;;
  goto)
    target="$(resolve_target_url "$URL" "$PLATFORM")" || {
      echo "Usage: browser.sh goto --url <url> | --platform reddit|twitter|xiaohongshu" >&2
      exit 40
    }
    browser_goto "$target"
    ;;
  switch-tab)
    browser_switch_tab "$TAB_INDEX" "$URL_PATTERN"
    ;;
  list-tabs)
    browser_list_tabs
    ;;
  wait-ready)
    browser_wait_ready "$TIMEOUT"
    ;;
  "")
    cat >&2 <<'EOF'
Usage: browser.sh <command> [options]

Commands:
  ensure                         Launch Chrome if not running
  activate                       Bring Chrome to foreground
  goto --url URL                 Navigate active tab to URL
  goto --platform NAME           Navigate to platform home (reddit|twitter|xiaohongshu)
  switch-tab --index N           Activate tab by 1-based index (macOS)
  switch-tab --url-pattern PAT   Activate first tab whose URL contains PAT (macOS)
  list-tabs                      List open tabs as JSON (macOS)
  wait-ready [--timeout SEC]     Wait for Chrome + extension daemon connection

Typical autonomous flow:
  browser.sh ensure
  browser.sh goto --url "https://reddit.com/r/SaaS"
  browser.sh wait-ready
  send.sh monitor --platform reddit --subreddit SaaS
EOF
    exit 40
    ;;
  *)
    echo "Unknown command: $COMMAND" >&2
    exit 40
    ;;
esac
