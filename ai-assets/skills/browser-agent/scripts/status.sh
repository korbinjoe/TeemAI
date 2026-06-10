#!/usr/bin/env bash
set -euo pipefail
source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/_lib.sh"
PORT="$(ensure_daemon)"
curl -sf "http://127.0.0.1:${PORT}/api/status"
