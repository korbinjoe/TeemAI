#!/usr/bin/env bash
# Layer 1: terminal browser orchestration (Chrome launch, navigation, tab control).
set -euo pipefail

CONFIG_DIR="${HOME}/.teemai/browser-agent"
CONFIG_FILE="${CONFIG_DIR}/config.json"
SKILL_LIB_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

browser_config() {
  local key="$1"
  local default="${2:-}"
  node -e "
    const fs = require('fs');
    const f = process.argv[1];
    const key = process.argv[2];
    const def = process.argv[3];
    let cfg = {};
    try { cfg = JSON.parse(fs.readFileSync(f, 'utf8')); } catch {}
    const v = cfg[key];
    if (v === undefined || v === null || v === '') process.stdout.write(def);
    else process.stdout.write(String(v));
  " "$CONFIG_FILE" "$key" "$default"
}

chrome_app_name() {
  local configured
  configured="$(browser_config chromeAppName "")"
  if [[ -n "$configured" ]]; then
    echo "$configured"
    return
  fi
  case "$(uname -s)" in
    Darwin) echo "Google Chrome" ;;
    Linux) echo "google-chrome" ;;
    *) echo "Google Chrome" ;;
  esac
}

platform_url() {
  case "$1" in
    reddit) echo "https://reddit.com" ;;
    twitter | x) echo "https://twitter.com" ;;
    xiaohongshu) echo "https://www.xiaohongshu.com" ;;
    *) return 1 ;;
  esac
}

resolve_target_url() {
  local url="${1:-}"
  local platform="${2:-}"
  if [[ -n "$url" ]]; then
    echo "$url"
    return 0
  fi
  if [[ -n "$platform" ]]; then
    platform_url "$platform"
    return 0
  fi
  return 1
}

chrome_is_running() {
  local app
  app="$(chrome_app_name)"
  case "$(uname -s)" in
    Darwin)
      osascript -e "tell application \"System Events\" to (name of processes) contains \"${app}\"" 2>/dev/null | grep -q true
      ;;
    Linux)
      pgrep -f "${app}|chromium" >/dev/null 2>&1
      ;;
    *)
      return 1
      ;;
  esac
}

browser_ensure() {
  local app
  app="$(chrome_app_name)"
  if chrome_is_running; then
    echo "{\"running\":true,\"app\":\"${app}\"}"
    return 0
  fi

  case "$(uname -s)" in
    Darwin)
      open -na "${app}" >/dev/null 2>&1 || open -a "${app}" >/dev/null 2>&1
      ;;
    Linux)
      if command -v "${app}" >/dev/null 2>&1; then
        "${app}" --new-window about:blank >/dev/null 2>&1 &
      elif command -v google-chrome-stable >/dev/null 2>&1; then
        google-chrome-stable --new-window about:blank >/dev/null 2>&1 &
      elif command -v chromium-browser >/dev/null 2>&1; then
        chromium-browser --new-window about:blank >/dev/null 2>&1 &
      else
        echo "Chrome not found. Install Google Chrome or set chromeAppName in ${CONFIG_FILE}." >&2
        return 1
      fi
      ;;
    *)
      echo "Unsupported platform for browser_ensure: $(uname -s)" >&2
      return 1
      ;;
  esac

  local attempt=0
  while [[ $attempt -lt 20 ]]; do
    if chrome_is_running; then
      echo "{\"running\":true,\"app\":\"${app}\",\"launched\":true}"
      return 0
    fi
    sleep 0.25
    attempt=$((attempt + 1))
  done

  echo "Failed to launch ${app}" >&2
  return 1
}

browser_activate() {
  local app
  app="$(chrome_app_name)"
  case "$(uname -s)" in
    Darwin)
      osascript -e "tell application \"${app}\" to activate" >/dev/null 2>&1
      ;;
    Linux)
      if command -v wmctrl >/dev/null 2>&1; then
        wmctrl -a "Chrome" >/dev/null 2>&1 || wmctrl -a "Chromium" >/dev/null 2>&1 || true
      fi
      ;;
  esac
}

browser_goto() {
  local url="$1"
  browser_ensure >/dev/null
  browser_activate

  case "$(uname -s)" in
    Darwin)
      osascript <<EOF >/dev/null 2>&1
tell application "$(chrome_app_name)"
  activate
  if (count of windows) = 0 then
    make new window
  end if
  set URL of active tab of front window to "${url}"
end tell
EOF
      ;;
    Linux)
      local app
      app="$(chrome_app_name)"
      if command -v "${app}" >/dev/null 2>&1; then
        "${app}" "${url}" >/dev/null 2>&1 &
      elif command -v google-chrome-stable >/dev/null 2>&1; then
        google-chrome-stable "${url}" >/dev/null 2>&1 &
      elif command -v xdg-open >/dev/null 2>&1; then
        xdg-open "${url}" >/dev/null 2>&1 &
      else
        echo "Cannot open URL: no Chrome binary found" >&2
        return 1
      fi
      ;;
    *)
      echo "Unsupported platform for browser_goto" >&2
      return 1
      ;;
  esac

  echo "{\"url\":\"${url}\",\"active\":true}"
}

browser_switch_tab() {
  local index="${1:-}"
  local url_pattern="${2:-}"

  case "$(uname -s)" in
    Darwin)
      if [[ -n "$index" ]]; then
        osascript -e "tell application \"$(chrome_app_name)\" to set active tab index of front window to ${index}" >/dev/null
        echo "{\"activeTabIndex\":${index}}"
        return 0
      fi
      if [[ -n "$url_pattern" ]]; then
        local matched_url
        matched_url="$(osascript <<EOF
tell application "$(chrome_app_name)"
  repeat with w from 1 to count of windows
    repeat with t from 1 to count of tabs of window w
      set tabUrl to URL of tab t of window w
      if tabUrl contains "${url_pattern}" then
        set index of window w to 1
        set active tab index of window w to t
        return tabUrl
      end if
    end repeat
  end repeat
end tell
EOF
)"
        if [[ -z "$matched_url" ]]; then
          echo "No tab matching pattern: ${url_pattern}" >&2
          return 1
        fi
        echo "{\"url\":\"${matched_url}\",\"matched\":\"${url_pattern}\"}"
        return 0
      fi
      ;;
    Linux)
      echo "switch-tab on Linux requires wmctrl; use browser_goto with a URL instead." >&2
      return 1
      ;;
  esac

  echo "Usage: switch-tab requires --index or --url-pattern" >&2
  return 1
}

browser_list_tabs() {
  local app
  app="$(chrome_app_name)"
  case "$(uname -s)" in
    Darwin)
      osascript <<APPLESCRIPT
tell application "${app}"
  set output to "["
  set firstEntry to true
  repeat with w from 1 to count of windows
    set winActive to (w = 1)
    repeat with t from 1 to count of tabs of window w
      set theTab to tab t of window w
      if not firstEntry then set output to output & ","
      set firstEntry to false
      set tabActive to (winActive and (active tab index of window w = t))
      set output to output & "{\"window\":" & w & ",\"index\":" & t & ",\"active\":" & tabActive & ",\"url\":\"" & (URL of theTab as text) & "\",\"title\":\"" & (my escapeJson(title of theTab as text)) & "\"}"
    end repeat
  end repeat
  return output & "]"
end tell

on escapeJson(t)
  set t to my replaceText(t, "\\", "\\\\")
  set t to my replaceText(t, "\"", "\\\"")
  return t
end escapeJson

on replaceText(sourceText, findText, replaceText)
  set AppleScript's text item delimiters to findText
  set parts to text items of sourceText
  set AppleScript's text item delimiters to replaceText
  set resultText to parts as text
  set AppleScript's text item delimiters to ""
  return resultText
end replaceText
APPLESCRIPT
      ;;
    *)
      echo "[]"
      return 1
      ;;
  esac
}

browser_wait_ready() {
  local timeout="${1:-60}"
  # shellcheck source=_lib.sh
  source "${SKILL_LIB_DIR}/_lib.sh"

  browser_ensure >/dev/null || true

  local elapsed=0
  while [[ $elapsed -lt $timeout ]]; do
    if [[ -f "$PORT_FILE" ]]; then
      local port status_json
      port="$(parse_port 2>/dev/null || true)"
      if [[ -n "${port:-}" ]] && status_json="$(curl -sf "http://127.0.0.1:${port}/api/status" 2>/dev/null || true)"; then
        if echo "$status_json" | node -e "
          const s = JSON.parse(require('fs').readFileSync(0, 'utf8'));
          if (s.connected) {
            console.log(JSON.stringify({ ready: true, connected: true, riskLevel: s.riskLevel ?? 'safe' }));
            process.exit(0);
          }
          process.exit(1);
        " 2>/dev/null; then
          return 0
        fi
      fi
    fi
    sleep 1
    elapsed=$((elapsed + 1))
  done

  echo "Extension/daemon not ready within ${timeout}s. Install Browser Agent Helper from extension settings, then reload Chrome." >&2
  return 10
}
