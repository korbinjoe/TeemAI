#!/bin/bash
# wb-cursor-diff.sh — PostToolUse hook: push war-room incremental diff since last read
#
# On-demand context delivery. The SessionStart hook injects the initial snapshot,
# then after each tool call this script checks the server's latestSeq vs lastReadSeq:
#   - No diff -> silent (empty stdout, doesn't pollute tool result)
#   - Has diff -> outputs <system-reminder> block with diff summary; >5 entries collapsed as "+N more"
#
# Protocol:
#   - Reads TEEMAI_CHAT_ID / TEEMAI_INSTANCE_ID / EXPERT_API_BASE from env
#   - Server GET /diff automatically advances cursor = latestSeq (idempotent)
#   - All errors fail-open: log to stderr, stdout silent, never blocks agent
#   - Feature flag WHITEBOARD_ON_DEMAND_CONTEXT=0 -> exit 0 immediately (silent degradation)
#
# Returns: exit 0 (regardless of whether diff exists).

set -u

# Feature flag: explicit disable = complete no-op
if [ "${WHITEBOARD_ON_DEMAND_CONTEXT:-1}" = "0" ]; then
  exit 0
fi

# Required env: if any missing, fail-open (no output -> no impact on tool result)
: "${EXPERT_API_BASE:=${AGENT_API_BASE:-}}"
: "${TEEMAI_CHAT_ID:=}"
: "${TEEMAI_INSTANCE_ID:=}"
if [ -z "$EXPERT_API_BASE" ] || [ -z "$TEEMAI_CHAT_ID" ] || [ -z "$TEEMAI_INSTANCE_ID" ]; then
  exit 0
fi

# Required commands: curl + jq. If missing, fail-open
command -v curl >/dev/null 2>&1 || exit 0
command -v jq   >/dev/null 2>&1 || exit 0

# Read current cursor (failure treated as 0, triggers server-side fallback = push full list)
CURSOR_URL="${EXPERT_API_BASE}/api/chats/${TEEMAI_CHAT_ID}/whiteboard/cursor?instanceId=${TEEMAI_INSTANCE_ID}"
CURSOR_BODY=$(curl -sS --max-time 3 "$CURSOR_URL" 2>/dev/null || echo "")
SINCE=$(echo "$CURSOR_BODY" | jq -r '.cursor.lastReadSeq // 0' 2>/dev/null)
case "$SINCE" in
  ''|*[!0-9]* ) SINCE=0 ;;
esac

# Pull diff (server also advances cursor = latestSeq)
DIFF_URL="${EXPERT_API_BASE}/api/chats/${TEEMAI_CHAT_ID}/whiteboard/diff?since=${SINCE}&instanceId=${TEEMAI_INSTANCE_ID}"
DIFF_BODY=$(curl -sS --max-time 3 "$DIFF_URL" 2>/dev/null || echo "")
if [ -z "$DIFF_BODY" ]; then
  exit 0
fi

COUNT=$(echo "$DIFF_BODY" | jq -r '.entries | length' 2>/dev/null)
case "$COUNT" in
  ''|*[!0-9]* ) exit 0 ;;
esac
if [ "$COUNT" -eq 0 ]; then
  exit 0
fi

MAX_LINES=5
SHOWN=$COUNT
EXTRA=0
if [ "$COUNT" -gt "$MAX_LINES" ]; then
  SHOWN=$MAX_LINES
  EXTRA=$((COUNT - MAX_LINES))
fi

# Format first N entries: `- [{type} by {by}] {summary}`
LINES=$(echo "$DIFF_BODY" | jq -r --argjson n "$SHOWN" '
  .entries[0:$n]
  | map("- [\(.type) by \(.by)] \(.summary)")
  | join("\n")
' 2>/dev/null)
[ -z "$LINES" ] && exit 0

printf '<system-reminder>\n[War-room diff since seq=%s] %s new entries:\n%s\n' "$SINCE" "$COUNT" "$LINES"
if [ "$EXTRA" -gt 0 ]; then
  printf '+%s more, run wb-snapshot.sh for full\n' "$EXTRA"
fi
printf '</system-reminder>\n'

exit 0
