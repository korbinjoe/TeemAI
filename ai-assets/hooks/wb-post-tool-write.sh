#!/bin/bash
# wb-post-tool-write.sh — PostToolUse hook: real-time extraction of artifact / handoff
#
# Trigger: PostToolUse, matcher = Edit|Write|write_to_file|Task
# stdin: { hook_event_name, session_id, cwd, tool_name, tool_input }
#
# Claude/Qoder triggers in real-time; Codex does not (PostToolUse is Bash-only), no side effects.
# All errors are silent (exit 0), never blocks the Agent main flow.

set -uo pipefail

# -- Environment check --
API_BASE="${AGENT_API_BASE:-${EXPERT_API_BASE:-}}"
CHAT_ID="${TEEMAI_CHAT_ID:-}"
INSTANCE_ID="${TEEMAI_INSTANCE_ID:-}"

if [ -z "$API_BASE" ] || [ -z "$CHAT_ID" ] || [ -z "$INSTANCE_ID" ]; then
  exit 0
fi

# -- Read stdin --
INPUT=$(cat 2>/dev/null || echo "{}")
TOOL_NAME=$(echo "$INPUT" | jq -r '.tool_name // empty' 2>/dev/null || echo "")
[ -z "$TOOL_NAME" ] && exit 0

# -- Fingerprint directory --
FP_DIR="${HOME}/.teemai/whiteboard/${CHAT_ID}"
mkdir -p "$FP_DIR" 2>/dev/null || exit 0
FP_FILE="${FP_DIR}/.auto-fp.txt"
touch "$FP_FILE" 2>/dev/null || exit 0

# -- Normalize instance id (strip :auto suffix) --
INSTANCE_BASE="${INSTANCE_ID%:auto}"

# -- Three-level fallback causal lookup --
find_cause_id() {
  local for_type="$1"
  local cause_id=""

  # Level 1: find own recent behavioral entries (decision/progress)
  cause_id=$(curl -sS --max-time 2 \
    "${API_BASE}/api/chats/${CHAT_ID}/whiteboard/entries?byAgent=${INSTANCE_BASE}&types=decision,progress&status=active&limit=1" \
    2>/dev/null | jq -r '.entries[-1].id // empty' 2>/dev/null || echo "")

  # Level 2: find most recent handoff targeting this agent in the chat
  if [ -z "$cause_id" ]; then
    cause_id=$(curl -sS --max-time 2 \
      "${API_BASE}/api/chats/${CHAT_ID}/whiteboard/entries?types=handoff&status=active&limit=5" \
      2>/dev/null | jq -r --arg agent "$INSTANCE_BASE" \
      '[.entries[] | select(.summary | test("→\\s*" + $agent; "x"))] | last | .id // empty' \
      2>/dev/null || echo "")
  fi

  # Level 3: find active goal for the chat
  if [ -z "$cause_id" ]; then
    cause_id=$(curl -sS --max-time 2 \
      "${API_BASE}/api/chats/${CHAT_ID}/whiteboard/entries?types=goal&status=active&limit=1" \
      2>/dev/null | jq -r '.entries[-1].id // empty' 2>/dev/null || echo "")
  fi

  # Handoff should not chain to upstream handoff (avoid overly long handoff chains)
  if [ "$for_type" = "handoff" ] && [ -n "$cause_id" ]; then
    local cause_type
    cause_type=$(curl -sS --max-time 2 \
      "${API_BASE}/api/chats/${CHAT_ID}/whiteboard/entries?status=active&limit=50" \
      2>/dev/null | jq -r --arg id "$cause_id" '.entries[] | select(.id == $id) | .type // empty' 2>/dev/null || echo "")
    if [ "$cause_type" = "handoff" ]; then
      cause_id=""
    fi
  fi

  printf "%s" "$cause_id"
}

# -- Write to war-room helper --
write_wb() {
  local type="$1"
  local summary="$2"
  # Normalize + truncate to 80 *characters* (perl -CSD for UTF-8, avoids byte-slice breaking multibyte chars)
  summary=$(printf "%s" "$summary" | tr '\n' ' ' | awk '{gsub(/[[:space:]]+/," "); gsub(/^ +| +$/,""); print}')
  summary=$(printf "%s" "$summary" | perl -CSD -ne 'print substr($_, 0, 80)' 2>/dev/null || printf "%s" "$summary")
  [ -z "$summary" ] && return 0

  local fp
  fp=$(printf "%s" "${type}::${summary}" | shasum 2>/dev/null | awk '{print $1}')
  [ -z "$fp" ] && return 0
  if grep -Fxq "$fp" "$FP_FILE" 2>/dev/null; then
    return 0
  fi

  # Find causal upstream, inject refs
  local cause_id
  cause_id=$(find_cause_id "$type")

  local payload
  if [ -n "$cause_id" ]; then
    payload=$(jq -cn --arg type "$type" --arg by "${INSTANCE_ID}:auto" --arg summary "$summary" --arg ref "$cause_id" \
      '{type:$type, by:$by, summary:$summary, refs:{entries:[$ref]}}' 2>/dev/null) || return 0
  else
    payload=$(jq -cn --arg type "$type" --arg by "${INSTANCE_ID}:auto" --arg summary "$summary" \
      '{type:$type, by:$by, summary:$summary}' 2>/dev/null) || return 0
  fi

  local code
  code=$(curl -s -o /dev/null -w "%{http_code}" \
    --max-time 3 \
    -X POST "${API_BASE}/api/chats/${CHAT_ID}/whiteboard/entries" \
    -H "Content-Type: application/json" \
    -d "$payload" 2>/dev/null || echo "000")

  if [ "$code" = "201" ] || [ "$code" = "422" ]; then
    printf "%s\n" "$fp" >> "$FP_FILE"
  fi
}

# -- Path filter: exclude temp directories, only keep code/doc extensions --
is_valid_path() {
  local p="$1"
  [ -z "$p" ] && return 1
  echo "$p" | grep -qE '/(tmp|\.cache|node_modules|\.r2c|\.teemai/whiteboard)/' && return 1
  echo "$p" | grep -qE '\.(ts|tsx|js|jsx|go|py|java|md|json|yaml|yml|css|scss|sh|sql|html|vue|svelte)$' || return 1
  return 0
}

# -- Artifact accumulator file (flushed by wb-auto-extract.sh at turn end) --
ACC_FILE="${FP_DIR}/.artifact-acc-${INSTANCE_ID}.txt"

# -- Dispatch by tool_name --
case "$TOOL_NAME" in
  Write|write_to_file)
    FILE_PATH=$(echo "$INPUT" | jq -r '.tool_input.file_path // .tool_input.path // empty' 2>/dev/null || echo "")
    if is_valid_path "$FILE_PATH"; then
      BASENAME=$(printf "%s" "$FILE_PATH" | awk -F/ '{print $NF}')
      echo "$BASENAME" >> "$ACC_FILE"
    fi
    ;;
  Edit)
    FILE_PATH=$(echo "$INPUT" | jq -r '.tool_input.file_path // empty' 2>/dev/null || echo "")
    if is_valid_path "$FILE_PATH"; then
      BASENAME=$(printf "%s" "$FILE_PATH" | awk -F/ '{print $NF}')
      echo "$BASENAME" >> "$ACC_FILE"
    fi
    ;;
  Task|Agent)
    # Internal subagent spawns (Explore, general-purpose, etc.) are not handoffs.
    # Real handoffs go through handoff.sh and are caught by the Bash case below.
    ;;
  Bash)
    CMD=$(echo "$INPUT" | jq -r '.tool_input.command // empty' 2>/dev/null || echo "")
    if echo "$CMD" | grep -qE 'start-expert\.sh|send-to-expert\.sh'; then
      AGENT_ID=$(echo "$CMD" | grep -oE 'start-expert\.sh\s+(\S+)' | awk '{print $2}')
      [ -z "$AGENT_ID" ] && AGENT_ID=$(echo "$CMD" | grep -oE 'send-to-expert\.sh\s+(\S+)' | awk '{print $2}')
      TASK_DESC=$(echo "$CMD" | sed -E 's/.*\.(sh)\s+\S+\s+"?//' | sed 's/".*$//' | perl -CSD -ne 'print substr($_, 0, 60)' 2>/dev/null)
      if [ -n "$AGENT_ID" ]; then
        write_wb "handoff" "→ ${AGENT_ID} ${TASK_DESC:-dispatch}"
      fi
    fi
    ;;
esac

exit 0
