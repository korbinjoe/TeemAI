#!/usr/bin/env bash
set -euo pipefail

# fallback-workflow.sh — Merge remaining tasks into a single handoff agent
# Usage: fallback-workflow.sh '<workflowId>'
# Called by Lead when individual task retries are exhausted or impractical.

# shellcheck disable=SC1091
source "$(dirname "$0")/_env.sh"

WORKFLOW_ID="${1:?Usage: fallback-workflow.sh '<workflowId>'}"

RESPONSE=$(curl -s -X POST "${EXPERT_API_BASE}/api/workflow/${WORKFLOW_ID}/fallback" \
  -H "Content-Type: application/json")

SUCCESS=$(echo "$RESPONSE" | jq -r '.success // false')
AGENT_ID=$(echo "$RESPONSE" | jq -r '.agentId // empty')
TASK_COUNT=$(echo "$RESPONSE" | jq -r '.taskCount // 0')
ERROR=$(echo "$RESPONSE" | jq -r '.error // empty')

if [ "$SUCCESS" = "true" ]; then
  echo "Fallback dispatched for workflow ${WORKFLOW_ID}"
  echo "  Agent: ${AGENT_ID}"
  echo "  Merged tasks: ${TASK_COUNT}"
else
  echo "Fallback failed: ${ERROR:-unknown error}"
  exit 1
fi
