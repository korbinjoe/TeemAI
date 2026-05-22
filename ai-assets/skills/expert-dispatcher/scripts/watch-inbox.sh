#!/bin/bash
# watch-inbox.sh — Monitor tool: watch inbox for changes, output to stdout on new messages
#
# Usage: Start via Claude Code's Monitor tool
#   Monitor(command: "bash {SKILL_DIR}/scripts/watch-inbox.sh", description: "expert inbox watcher", persistent: true)
#
# How it works:
#   Node fs.watch monitors mailbox directory -> file changes trigger check-inbox.sh -> output on new messages
#   Saves ~80% tokens compared to polling (only produces output when messages arrive)

set -uo pipefail

API_BASE="${EXPERT_API_BASE:?Environment variable EXPERT_API_BASE is not set}"
INSTANCE_ID="${OPENTEAM_INSTANCE_ID:?Environment variable OPENTEAM_INSTANCE_ID is not set}"
CHAT_ID="${OPENTEAM_CHAT_ID:?Environment variable OPENTEAM_CHAT_ID is not set}"

MAILBOX_DIR="$HOME/.openteam/mailbox/${CHAT_ID}"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

mkdir -p "$MAILBOX_DIR"

# Node.js fs.watch — node is bundled with the project, macOS kqueue is reliable
# 500ms debounce merges rapid writes, outputs "changed" on change to trigger check-inbox
exec node -e "
const fs = require('fs'), path = require('path')
const dir = '${MAILBOX_DIR}'
let timer = null
fs.watch(dir, (ev, fn) => {
  if (!fn || !fn.endsWith('.jsonl')) return
  if (timer) clearTimeout(timer)
  timer = setTimeout(() => { console.log('changed'); timer = null }, 500)
})
// 60s fallback poll (macOS kqueue occasionally stops firing)
setInterval(() => console.log('changed'), 60000)
" 2>/dev/null | while IFS= read -r _line; do
  output=$(bash "$SCRIPT_DIR/check-inbox.sh" 2>/dev/null) || continue
  if ! echo "$output" | grep -q "no_messages"; then
    echo "$output"
  fi
done
