#!/usr/bin/env bash
set -euo pipefail

# reject-task.sh — Reject a completed task and send it back with feedback
# Usage: reject-task.sh '<workflowId>' '<taskId>' '<feedback>'
# Called by Lead when deliverables are unsatisfactory.

# shellcheck disable=SC1091
source "$(dirname "$0")/_env.sh"

WORKFLOW_ID="${1:?Usage: reject-task.sh '<workflowId>' '<taskId>' '<feedback>'}"
TASK_ID="${2:?Usage: reject-task.sh '<workflowId>' '<taskId>' '<feedback>'}"
FEEDBACK="${3:?Usage: reject-task.sh '<workflowId>' '<taskId>' '<feedback>'}"

RESPONSE=$(curl -s -w "\n%{http_code}" \
  -X POST "${EXPERT_API_BASE}/api/workflow/${WORKFLOW_ID}/tasks/${TASK_ID}/reject" \
  -H "Content-Type: application/json" \
  -d "$(jq -n --arg f "$FEEDBACK" '{feedback: $f}')")

HTTP_CODE=$(echo "$RESPONSE" | tail -1)
BODY=$(echo "$RESPONSE" | sed '$d')

if [ "$HTTP_CODE" -ge 400 ]; then
  ERROR=$(echo "$BODY" | jq -r '.error // "unknown"')
  if [ "$ERROR" = "reject_cap_reached" ]; then
    REJECT_COUNT=$(echo "$BODY" | jq -r '.rejectCount // "?"')
    echo "Rejection cap reached for task ${TASK_ID} (rejected ${REJECT_COUNT}x). You must either advance or escalate to the user."
  else
    echo "Reject failed: ${ERROR}"
  fi
  exit 1
fi

REJECT_COUNT=$(echo "$BODY" | jq -r '.rejectCount')
MAX_REJECTS=$(echo "$BODY" | jq -r '.maxRejects')
echo "Task ${TASK_ID} rejected (${REJECT_COUNT}/${MAX_REJECTS}). It will restart with your feedback."
