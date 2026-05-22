#!/bin/bash
# docker-entrypoint.sh - openteam Docker entrypoint

set -euo pipefail

echo "==> Starting openteam server..."
exec node dist/server/index.js
