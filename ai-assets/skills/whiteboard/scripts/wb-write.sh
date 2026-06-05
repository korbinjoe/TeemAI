#!/bin/bash
# wb-write.sh — Write a new entry to the current chat war-room
# Usage: bash wb-write.sh <type> "<summary>" [tags] [refs-json] [--payload='{}'] [--task=<id>] [--resolves=<id>]

set -euo pipefail

# shellcheck disable=SC1091
source "$(dirname "$0")/_env.sh"

# Parse optional flags from all args
PAYLOAD_JSON=""
TASK_ID=""
RESOLVES_ID=""
POSITIONAL=()

for arg in "$@"; do
  case "$arg" in
    --payload=*) PAYLOAD_JSON="${arg#--payload=}" ;;
    --task=*)    TASK_ID="${arg#--task=}" ;;
    --resolves=*) RESOLVES_ID="${arg#--resolves=}" ;;
    *)           POSITIONAL+=("$arg") ;;
  esac
done

TYPE="${POSITIONAL[0]:?Usage: wb-write.sh <type> <summary> [tags] [refs-json] [--payload=...] [--task=...] [--resolves=...]}"
SUMMARY="${POSITIONAL[1]:?Usage: wb-write.sh <type> <summary> [tags] [refs-json]}"
TAGS="${POSITIONAL[2]:-}"
REFS_JSON="${POSITIONAL[3]:-}"

API_BASE="${EXPERT_API_BASE:?Environment variable EXPERT_API_BASE is not set}"
CHAT_ID="${TEEMAI_CHAT_ID:?Environment variable TEEMAI_CHAT_ID is not set}"
BY="${TEEMAI_INSTANCE_ID:?Environment variable TEEMAI_INSTANCE_ID is not set}"

PAYLOAD=$(jq -n \
  --arg type "$TYPE" \
  --arg by "$BY" \
  --arg summary "$SUMMARY" \
  --arg tagsStr "$TAGS" \
  --arg refsJson "$REFS_JSON" \
  --arg payloadJson "$PAYLOAD_JSON" \
  --arg taskId "$TASK_ID" \
  --arg resolvesId "$RESOLVES_ID" \
  '{type: $type, by: $by, summary: $summary}
   + (if $tagsStr != "" then {tags: ($tagsStr | split(","))} else {} end)
   + (if $refsJson != "" then {refs: ($refsJson | fromjson)} else {} end)
   + (if $payloadJson != "" then {payload: ($payloadJson | fromjson)} else {} end)
   + (if $taskId != "" then {taskId: $taskId} else {} end)
   + (if $resolvesId != "" then {resolves: $resolvesId} else {} end)')

RESPONSE=$(curl -s -w "\n%{http_code}" \
  -X POST "${API_BASE}/api/chats/${CHAT_ID}/whiteboard/entries" \
  -H "Content-Type: application/json" \
  -d "$PAYLOAD")

HTTP_CODE=$(echo "$RESPONSE" | tail -1)
BODY=$(echo "$RESPONSE" | sed '$d')

if [ "$HTTP_CODE" -ge 400 ]; then
  echo "War-room write failed: HTTP ${HTTP_CODE}" >&2
  echo "$BODY" >&2
  exit 1
fi

echo "$BODY" | jq -r '"War-room entry written: [\(.entry.type)] \(.entry.summary) (id=\(.entry.id))"'
