#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT_DIR"

SAMPLES="${1:-20}"

echo "[perf] local git query benchmark (samples=$SAMPLES)"
sum=0
min=999999
max=0
for _ in $(seq 1 "$SAMPLES"); do
  t=$(/usr/bin/time -p sh -c 'git status --porcelain >/dev/null; git diff HEAD --numstat >/dev/null' 2>&1 | awk '/^real /{print $2}')
  ms=$(awk -v v="$t" 'BEGIN{printf "%.2f", v*1000}')
  sum=$(awk -v a="$sum" -v b="$ms" 'BEGIN{printf "%.2f", a+b}')
  min=$(awk -v a="$min" -v b="$ms" 'BEGIN{print (b<a)?b:a}')
  max=$(awk -v a="$max" -v b="$ms" 'BEGIN{print (b>a)?b:a}')
done
avg=$(awk -v s="$sum" -v n="$SAMPLES" 'BEGIN{printf "%.2f", s/n}')
echo "git_local_query_ms_avg=$avg"
echo "git_local_query_ms_min=$min"
echo "git_local_query_ms_max=$max"

echo "[perf] ui build output summary"
npm run -s build:ui >/tmp/openteam-perf-build.log 2>&1 || {
  cat /tmp/openteam-perf-build.log
  exit 1
}
grep -E "dist/assets/.*\\.js|dist/assets/.*\\.css|gzip size|Some chunks are larger" /tmp/openteam-perf-build.log | head -n 120
