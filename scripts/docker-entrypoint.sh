#!/bin/bash
# docker-entrypoint.sh - teemai Docker entrypoint

set -euo pipefail

echo "==> Starting teemai server..."
exec node dist/server/index.js
