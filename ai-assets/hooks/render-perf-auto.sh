#!/bin/bash
# render-perf-auto.sh — run render performance verification after code changes.
#
# Trigger modes:
#   --hook       Agent Stop hook. Runs once per changed-code fingerprint, records
#                result, and exits 0 so hook infrastructure is not bricked.
#   --pre-commit Git pre-commit gate. Reuses the same fingerprint cache and exits
#                nonzero on verification failure.
#
# Disable with TEEMAI_RENDER_PERF_AUTO=0 or TEEMAI_RENDER_PERF_AUTO=false.

set -uo pipefail

MODE="${1:---hook}"

case "$MODE" in
  --hook|--pre-commit|--manual) ;;
  *)
    echo "[perf:auto] unknown mode: $MODE" >&2
    exit 2
    ;;
esac

is_disabled() {
  case "${TEEMAI_RENDER_PERF_AUTO:-1}" in
    0|false|FALSE|off|OFF|no|NO) return 0 ;;
    *) return 1 ;;
  esac
}

if is_disabled; then
  [ "$MODE" = "--pre-commit" ] && echo "[perf:auto] skipped: TEEMAI_RENDER_PERF_AUTO=${TEEMAI_RENDER_PERF_AUTO}"
  exit 0
fi

INPUT="{}"
if [ "$MODE" = "--hook" ]; then
  INPUT="$(cat 2>/dev/null || echo "{}")"
fi
CWD_FROM_INPUT="$(printf "%s" "$INPUT" | jq -r '.cwd // empty' 2>/dev/null || echo "")"
START_DIR="${CWD_FROM_INPUT:-$PWD}"

REPO_ROOT="$(git -C "$START_DIR" rev-parse --show-toplevel 2>/dev/null || echo "")"
if [ -z "$REPO_ROOT" ] || [ ! -f "$REPO_ROOT/package.json" ]; then
  exit 0
fi

cd "$REPO_ROOT" || exit 0

is_code_file() {
  local file="$1"
  case "$file" in
    web/*|server/*|shared/*|electron/*|cli/*|scripts/render-perf/*|scripts/benchmark-*.ts) return 0 ;;
    package.json|package-lock.json|pnpm-lock.yaml|vite.config.*|tsconfig*.json) return 0 ;;
    *.ts|*.tsx|*.js|*.jsx|*.mjs|*.cjs|*.css|*.scss|*.less|*.html) return 0 ;;
    *) return 1 ;;
  esac
}

changed_files() {
  {
    git diff --name-only --diff-filter=ACDMRTUXB HEAD -- 2>/dev/null || true
    git ls-files --others --exclude-standard 2>/dev/null || true
  } | sed '/^$/d' | sort -u
}

CODE_FILES=""
while IFS= read -r file; do
  if is_code_file "$file"; then
    CODE_FILES="${CODE_FILES}${file}"$'\n'
  fi
done <<EOF
$(changed_files)
EOF

CODE_FILES="$(printf "%s" "$CODE_FILES" | sed '/^$/d' | sort -u)"
if [ -z "$CODE_FILES" ]; then
  [ "$MODE" = "--pre-commit" ] && echo "[perf:auto] skipped: no code changes"
  exit 0
fi

STATE_ROOT="${HOME}/.teemai/perf-auto"
mkdir -p "$STATE_ROOT" 2>/dev/null || exit 0
REPO_KEY="$(printf "%s" "$REPO_ROOT" | LC_ALL=C shasum | awk '{print $1}')"
FP_FILE="${STATE_ROOT}/${REPO_KEY}.fingerprint"
LOCK_DIR="${STATE_ROOT}/${REPO_KEY}.lock"

fingerprint_changed_code() {
  while IFS= read -r file; do
    [ -z "$file" ] && continue
    if [ -f "$file" ]; then
      LC_ALL=C shasum "$file" 2>/dev/null | awk -v f="$file" '{print $1 "  " f}'
    else
      printf "deleted  %s\n" "$file"
    fi
  done <<EOF
$CODE_FILES
EOF
}

FINGERPRINT="$(fingerprint_changed_code | LC_ALL=C shasum | awk '{print $1}')"
LAST_PASSED="$(cat "$FP_FILE" 2>/dev/null || echo "")"

if [ -n "$FINGERPRINT" ] && [ "$FINGERPRINT" = "$LAST_PASSED" ]; then
  [ "$MODE" != "--hook" ] && echo "[perf:auto] changed code already verified; skipping"
  exit 0
fi

if [ "${TEEMAI_RENDER_PERF_AUTO_DRY_RUN:-0}" = "1" ]; then
  echo "[perf:auto] dry run: would verify changed code fingerprint $FINGERPRINT"
  printf "%s\n" "$CODE_FILES" | sed 's/^/[perf:auto]   /'
  exit 0
fi

if ! mkdir "$LOCK_DIR" 2>/dev/null; then
  echo "[perf:auto] another render performance verification is already running"
  [ "$MODE" = "--pre-commit" ] && exit 1
  exit 0
fi
trap 'rm -rf "$LOCK_DIR"' EXIT

LOG_DIR="$REPO_ROOT/.perf/auto"
mkdir -p "$LOG_DIR" 2>/dev/null || true
RUN_ID="$(date -u '+%Y-%m-%dT%H-%M-%SZ')"
LOG_PATH="$LOG_DIR/${RUN_ID}.log"
LATEST_LOG="$LOG_DIR/latest.log"

{
  echo "[perf:auto] repo=$REPO_ROOT"
  echo "[perf:auto] mode=$MODE"
  echo "[perf:auto] changed code files:"
  printf "%s\n" "$CODE_FILES" | sed 's/^/[perf:auto]   /'
  echo "[perf:auto] fingerprint=$FINGERPRINT"
  echo "[perf:auto] started=$(date -u '+%Y-%m-%dT%H:%M:%SZ')"
} > "$LOG_PATH"

echo "[perf:auto] running build:ui and perf:render:changed (log: $LOG_PATH)"

STATUS=0
{
  echo ""
  echo "== npm run build:ui =="
} >> "$LOG_PATH"
if ! npm run -s build:ui >> "$LOG_PATH" 2>&1; then
  STATUS=1
fi

if [ "$STATUS" -eq 0 ]; then
  {
    echo ""
    echo "== npm run perf:render:changed =="
  } >> "$LOG_PATH"
  if ! npm run -s perf:render:changed >> "$LOG_PATH" 2>&1; then
    STATUS=1
  fi
fi

cp "$LOG_PATH" "$LATEST_LOG" 2>/dev/null || true
REPORT_PATH="$(find "$REPO_ROOT/.perf/render" -path '*/report.md' -type f 2>/dev/null | sort | tail -n 1)"

write_war_room() {
  local type="$1"
  local summary="$2"
  local script="${HOME}/.teemai/skills/whiteboard/scripts/wb-write.sh"
  [ -f "$script" ] || return 0
  bash "$script" "$type" "$summary" perf,harness >/dev/null 2>&1 || true
}

if [ "$STATUS" -eq 0 ]; then
  printf "%s\n" "$FINGERPRINT" > "$FP_FILE" 2>/dev/null || true
  echo "[perf:auto] PASSED"
  [ -n "$REPORT_PATH" ] && echo "[perf:auto] report: $REPORT_PATH"
  write_war_room "progress" "Auto render perf passed for changed code"
  exit 0
fi

echo "[perf:auto] FAILED"
echo "[perf:auto] log: $LATEST_LOG"
[ -n "$REPORT_PATH" ] && echo "[perf:auto] report: $REPORT_PATH"
echo "[perf:auto] last log lines:"
tail -n 40 "$LOG_PATH" 2>/dev/null || true
write_war_room "open_question" "Auto render perf failed; inspect .perf/auto/latest.log"

if [ "$MODE" = "--pre-commit" ] || [ "$MODE" = "--manual" ]; then
  exit 1
fi
exit 0
