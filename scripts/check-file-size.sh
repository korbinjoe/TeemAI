#!/usr/bin/env bash
# File size limit check
# Rules:
#   - New files (.ts/.tsx) > 500 lines → fail
#   - Legacy files (in .file-size-allowlist) lines ≤ allowlist value → pass; exceeds → fail
# Usage: bash scripts/check-file-size.sh
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
ALLOWLIST="$REPO_ROOT/.file-size-allowlist"
LIMIT=500

if [[ ! -f "$ALLOWLIST" ]]; then
  echo "ERROR: allowlist missing: $ALLOWLIST"
  exit 1
fi

# Collect .ts / .tsx files + line counts (path<TAB>lines)
FILE_SIZES=$(find "$REPO_ROOT/server" "$REPO_ROOT/web" "$REPO_ROOT/shared" "$REPO_ROOT/cli" "$REPO_ROOT/electron" \
  -type f \( -name "*.ts" -o -name "*.tsx" \) \
  -not -path "*/node_modules/*" -not -path "*/dist/*" -not -path "*/.openteam/*" 2>/dev/null \
  | xargs wc -l 2>/dev/null \
  | awk -v root="$REPO_ROOT/" '$2 != "total" { sub(root, "", $2); print $2"\t"$1 }')

# Use awk for combined check
RESULT=$(echo "$FILE_SIZES" | awk -v limit="$LIMIT" -v allowlist="$ALLOWLIST" '
BEGIN {
  while ((getline line < allowlist) > 0) {
    if (line ~ /^[[:space:]]*#/ || line ~ /^[[:space:]]*$/) continue
    n = split(line, parts, "|")
    if (n != 2) continue
    gsub(/^[[:space:]]+|[[:space:]]+$/, "", parts[1])
    gsub(/^[[:space:]]+|[[:space:]]+$/, "", parts[2])
    allowed[parts[1]] = parts[2]
  }
  close(allowlist)
  new_count = 0
  grown_count = 0
}
{
  path = $1
  lines = $2
  if (lines <= limit) next
  if (path in allowed) {
    if (lines > allowed[path]) {
      grown[++grown_count] = path " (" lines " > allowlist " allowed[path] ")"
    }
  } else {
    newv[++new_count] = path " (" lines " lines)"
  }
}
END {
  total = new_count + grown_count
  if (total == 0) {
    print "OK"
    exit 0
  }
  print "FAIL " total
  if (new_count > 0) {
    print "NEW"
    for (i = 1; i <= new_count; i++) print "  - " newv[i]
  }
  if (grown_count > 0) {
    print "GROWN"
    for (i = 1; i <= grown_count; i++) print "  - " grown[i]
  }
}
')

if [[ "${RESULT%% *}" == "OK" ]]; then
  echo "PASS: file size check passed (500 line limit + allowlist for legacy files)"
  exit 0
fi

# Parse failure results
mode=""
new_lines=""
grown_lines=""
total=$(echo "$RESULT" | awk 'NR==1{print $2}')
while IFS= read -r line; do
  if [[ "$line" == "NEW" ]]; then mode="new"; continue; fi
  if [[ "$line" == "GROWN" ]]; then mode="grown"; continue; fi
  if [[ "$line" == FAIL* ]]; then continue; fi
  if [[ "$mode" == "new" ]]; then new_lines+="$line"$'\n'; fi
  if [[ "$mode" == "grown" ]]; then grown_lines+="$line"$'\n'; fi
done <<< "$RESULT"

echo "FAIL: file size check found $total violations:"
echo
if [[ -n "$new_lines" ]]; then
  echo "NEW files exceeding 500 lines (must split or add to allowlist):"
  echo -n "$new_lines"
  echo
fi
if [[ -n "$grown_lines" ]]; then
  echo "LEGACY files grew beyond allowlist limit (split or update allowlist):"
  echo -n "$grown_lines"
  echo
fi
echo "Goal: remove entries from .file-size-allowlist as refactoring progresses, eventually reaching zero."
exit 1
