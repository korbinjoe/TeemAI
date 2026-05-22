#!/bin/bash
# check-inbox.sh — Check the current Agent's inbox (incremental, compact format)
# Output format: one line per message [type_short] from=<from> <key>="<content>"

set -euo pipefail

API_BASE="${EXPERT_API_BASE:?Environment variable EXPERT_API_BASE is not set}"
INSTANCE_ID="${OPENTEAM_INSTANCE_ID:?Environment variable OPENTEAM_INSTANCE_ID is not set}"
CHAT_ID="${OPENTEAM_CHAT_ID:?Environment variable OPENTEAM_CHAT_ID is not set}"
CONNECTION_ID="${EXPERT_CONNECTION_ID:-}"

ENCODED_INSTANCE=$(python3 -c "import urllib.parse; print(urllib.parse.quote('${INSTANCE_ID}'))")
ENCODED_CHAT=$(python3 -c "import urllib.parse; print(urllib.parse.quote('${CHAT_ID}'))")

RESPONSE=$(curl -s "${API_BASE}/api/expert/inbox/${ENCODED_INSTANCE}?chatId=${ENCODED_CHAT}&connectionId=${CONNECTION_ID}")

MESSAGES=$(echo "$RESPONSE" | jq -r '.messages // []')
COUNT=$(echo "$MESSAGES" | jq 'length')

if [ "$COUNT" = "0" ] || [ "$MESSAGES" = "null" ]; then
  echo "no_messages"
  exit 0
fi

echo "$MESSAGES" | jq -r '.[] |
  (if .type == "task:completed" then "[completed]"
   elif .type == "task:failed" then "[failed]"
   elif .type == "task:input_required" then "[input_required]"
   elif .type == "task:progress" then "[progress]"
   elif .type == "task:idle" then "[idle]"
   elif .type == "task:assign" then "[assign]"
   elif .type == "query" then "[query]"
   elif .type == "response" then "[response]"
   else "[" + (.type // "unknown") + "]"
   end) + " from=" + (.from // "unknown") +
  (if .type == "task:input_required" then " q=\"" + ((.payload.question // "") | .[0:100] | gsub("\n"; " ")) + "\""
   elif .type == "task:completed" then " summary=\"" + ((.payload.summary // "done") | .[0:80] | gsub("\n"; " ")) + "\""
   elif .type == "task:failed" then " error=\"" + ((.payload.failureReason // .payload.summary // "unknown") | .[0:80] | gsub("\n"; " ")) + "\""
   elif .type == "task:progress" then " phase=\"" + ((.payload.phase // "") | .[0:40] | gsub("\n"; " ")) + "\""
   elif .type == "task:idle" then " summary=\"" + ((.payload.summary // "") | .[0:60] | gsub("\n"; " ")) + "\""
   elif .type == "query" then " q=\"" + ((.payload.question // "") | .[0:100] | gsub("\n"; " ")) + "\""
   elif .type == "response" then " a=\"" + ((.payload.answer // "") | .[0:100] | gsub("\n"; " ")) + "\""
   elif .type == "task:assign" then " task=\"" + ((.payload.description // "") | .[0:80] | gsub("\n"; " ")) + "\""
   else ""
   end)'
