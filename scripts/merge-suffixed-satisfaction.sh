#!/bin/bash
# Merge satisfaction records from suffixed runtime agent directories into
# canonical ~/.teemai/agents/<agent>/memory/satisfaction.md.
#
# Usage: bash scripts/merge-suffixed-satisfaction.sh

set -uo pipefail

TEEMAI_HOME_DIR="${TEEMAI_HOME:-${HOME}/.teemai}"
AGENTS_DIR="${TEEMAI_HOME_DIR}/agents"

canonical_agent_id() {
  local id="$1"
  id="${id%:auto}"
  if [[ "$id" =~ ^(.+):[0-9]+$ ]]; then
    id="${BASH_REMATCH[1]}"
  fi
  printf "%s" "$id"
}

ensure_satisfaction_file() {
  local file="$1"
  if [ ! -f "$file" ]; then
    printf "# Satisfaction Scores\n\n" > "$file"
  fi
}

has_chat_record() {
  local file="$1"
  local chat_id="$2"
  [ -f "$file" ] && grep -qE "^##[[:space:]]+${chat_id}([[:space:]]|$)" "$file" 2>/dev/null
}

append_unique_records() {
  local source_file="$1"
  local target_file="$2"
  local current_block=""
  local current_chat=""
  local added=0

  flush_block() {
    if [ -z "$current_block" ] || [ -z "$current_chat" ]; then
      return
    fi
    if ! has_chat_record "$target_file" "$current_chat"; then
      printf "%s\n" "$current_block" >> "$target_file"
      added=$((added + 1))
    fi
  }

  while IFS= read -r line || [ -n "$line" ]; do
    if [[ "$line" =~ ^##[[:space:]]+([^[:space:]]+) ]]; then
      flush_block
      current_chat="${BASH_REMATCH[1]}"
      current_block="$line"
    elif [ -n "$current_block" ]; then
      current_block="${current_block}"$'\n'"${line}"
    fi
  done < "$source_file"
  flush_block

  printf "%d" "$added"
}

if [ ! -d "$AGENTS_DIR" ]; then
  echo "No agents directory found: $AGENTS_DIR"
  exit 0
fi

total_added=0
dirs_merged=0

for dir in "$AGENTS_DIR"/*; do
  [ -d "$dir" ] || continue
  name="$(basename "$dir")"
  canonical="$(canonical_agent_id "$name")"
  [ "$canonical" != "$name" ] || continue

  source_file="${dir}/memory/satisfaction.md"
  [ -f "$source_file" ] || continue

  target_memory_dir="${AGENTS_DIR}/${canonical}/memory"
  mkdir -p "$target_memory_dir" 2>/dev/null || continue
  target_file="${target_memory_dir}/satisfaction.md"
  ensure_satisfaction_file "$target_file"

  added="$(append_unique_records "$source_file" "$target_file")"
  if [ "$added" -gt 0 ]; then
    dirs_merged=$((dirs_merged + 1))
    total_added=$((total_added + added))
    echo "Merged ${added} records: ${name} -> ${canonical}"
  fi
done

echo "Done. Merged ${total_added} records from ${dirs_merged} suffixed directories."
