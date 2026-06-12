#!/bin/bash
# backfill-satisfaction.sh — Re-score all existing JSONL transcripts with the fixed MSS logic
#
# Reads the chats table to map chatId → agentId → cliSessionId,
# finds the JSONL transcripts, re-runs the scoring logic,
# and rewrites each agent's satisfaction.md with correct data.
#
# Usage: bash scripts/backfill-satisfaction.sh

set -uo pipefail

DB_PATH="${HOME}/.teemai/teemai.db"
AGENTS_DIR="${HOME}/.teemai/agents"
CLAUDE_PROJECTS="${HOME}/.claude/projects"
TMPDIR_BF=$(mktemp -d)

trap 'rm -rf "$TMPDIR_BF"' EXIT

if [ ! -f "$DB_PATH" ]; then
  echo "ERROR: Database not found at $DB_PATH"
  exit 1
fi

count_matches() {
  local count
  count=$(echo "$1" | grep -cE "$2" 2>/dev/null) || true
  printf "%d" "${count:-0}"
}

score_transcript() {
  local transcript="$1"
  local agent_id="$2"

  local USER_TEXTS
  USER_TEXTS=$(jq -r '
    select(.type=="user") |
    (.message.content |
      if type=="string" then .
      else (map(select(.type=="text")) | .[0].text // "")
      end) // empty
  ' "$transcript" 2>/dev/null)

  [ -z "$USER_TEXTS" ] && return 1

  local TOTAL_TURNS
  TOTAL_TURNS=$(count_matches "$USER_TEXTS" '.')
  [ "$TOTAL_TURNS" -eq 0 ] && return 1

  local ESCALATIONS CORRECTIONS AESTHETIC_REJ ITERATIONS CONTINUES ACCEPTANCES COMMITS
  ESCALATIONS=$(count_matches "$USER_TEXTS" '为啥还|怎么还|一通.*后|恶心|反复修.*修不好')
  CORRECTIONS=$(count_matches "$USER_TEXTS" '不对|错了|重新|没有实现|还是没|没得到解决|你这也没')
  AESTHETIC_REJ=$(count_matches "$USER_TEXTS" '太丑|不好看|AI味|不合理|不太直观|浪费空间')
  ITERATIONS=$(count_matches "$USER_TEXTS" '改大|改小|改为|太大了|太小了|[0-9]+px')
  CONTINUES=$(count_matches "$USER_TEXTS" '继续|开干|实现$|落地$|直接')
  ACCEPTANCES=$(count_matches "$USER_TEXTS" '好的|可以|没问题|不错|perfect|great')
  COMMITS=$(count_matches "$USER_TEXTS" '(?i)^commit|^提交')

  local ITER_WEIGHT="-0.5"
  if echo "$agent_id" | grep -q "ui-designer"; then
    ITER_WEIGHT="-0.2"
  fi

  local MSS
  MSS=$(awk "BEGIN {
    score = ($ESCALATIONS * -3.0) + ($CORRECTIONS * -1.5) + ($AESTHETIC_REJ * -1.0) + ($ITERATIONS * $ITER_WEIGHT) + ($CONTINUES * 0.5) + ($ACCEPTANCES * 1.0) + ($COMMITS * 2.0)
    mss = (score / $TOTAL_TURNS) * 100
    printf \"%.1f\", mss
  }")

  local RATING="MEDIUM"
  if awk "BEGIN { exit ($MSS >= 60) ? 0 : 1 }" 2>/dev/null; then
    RATING="HIGH"
  elif awk "BEGIN { exit ($MSS >= 30) ? 0 : 1 }" 2>/dev/null; then
    RATING="MEDIUM-HIGH"
  elif awk "BEGIN { exit ($MSS < 0) ? 0 : 1 }" 2>/dev/null; then
    RATING="LOW"
  fi

  echo "${TOTAL_TURNS}|${CORRECTIONS}|${ESCALATIONS}|${ITERATIONS}|${ACCEPTANCES}|${COMMITS}|${MSS}|${RATING}"
}

find_transcript() {
  local session_id="$1"
  for dir in "$CLAUDE_PROJECTS"/*/; do
    local jsonl_file="${dir}${session_id}.jsonl"
    if [ -f "$jsonl_file" ]; then
      echo "$jsonl_file"
      return 0
    fi
  done
  return 1
}

echo "=== TeemAI Satisfaction Backfill ==="
echo "Database: $DB_PATH"
echo ""

TOTAL=0
SCORED=0
SKIPPED=0

# Query all chats with expert_sessions, output as chatId|expert_sessions_json|created_at
sqlite3 "$DB_PATH" "SELECT id, expert_sessions, created_at FROM chats WHERE expert_sessions IS NOT NULL ORDER BY created_at" 2>/dev/null | \
while IFS='|' read -r chat_id expert_sessions created_at; do
  [ -z "$chat_id" ] && continue

  echo "$expert_sessions" | jq -r 'to_entries[] | "\(.key)|\(.value.cliSessionId // empty)"' 2>/dev/null | \
  while IFS='|' read -r agent_id session_id; do
    [ -z "$agent_id" ] || [ -z "$session_id" ] && continue

    agent_id="${agent_id%:auto}"

    TRANSCRIPT=$(find_transcript "$session_id" || echo "")
    if [ -z "$TRANSCRIPT" ]; then
      continue
    fi

    RESULT=$(score_transcript "$TRANSCRIPT" "$agent_id" || echo "")
    if [ -z "$RESULT" ]; then
      continue
    fi

    IFS='|' read -r turns corrections escalations iterations acceptances commits mss rating <<< "$RESULT"
    DATE=$(echo "$created_at" | cut -c1-16 | tr 'T' ' ')

    # Append to per-agent temp file
    AGENT_FILE="${TMPDIR_BF}/${agent_id}.txt"
    printf "## %s — %s\nMSS: %s | Turns: %s | Corrections: %s | Escalations: %s | Iterations: %s | Acceptances: %s | Commits: %s | Rating: %s\n\n" \
      "$chat_id" "$DATE" "$mss" "$turns" "$corrections" "$escalations" "$iterations" "$acceptances" "$commits" "$rating" \
      >> "$AGENT_FILE"
  done
done

echo "Scoring complete. Writing satisfaction files..."
echo ""

AGENTS_WRITTEN=0
for agent_file in "$TMPDIR_BF"/*.txt; do
  [ -f "$agent_file" ] || continue

  agent_id=$(basename "$agent_file" .txt)
  MEMORY_DIR="${AGENTS_DIR}/${agent_id}/memory"
  mkdir -p "$MEMORY_DIR" 2>/dev/null || continue

  SAT_FILE="${MEMORY_DIR}/satisfaction.md"
  printf "# Satisfaction Scores\n\n" > "$SAT_FILE"
  cat "$agent_file" >> "$SAT_FILE"

  RECORD_COUNT=$(grep -c "^## " "$agent_file" 2>/dev/null || true)
  echo "  ${agent_id}: ${RECORD_COUNT} records → ${SAT_FILE}"
  AGENTS_WRITTEN=$((AGENTS_WRITTEN + 1))
done

echo ""
echo "Done. Wrote satisfaction data for $AGENTS_WRITTEN agents."
