#!/usr/bin/env bash
# Thin wrapper — launches the Node.js auto-backup implementation.
# Usage: ./auto-backup.sh /path/to/project [interval_seconds]
# Requires: Node.js >= 18

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

if ! command -v node &>/dev/null; then
  echo "[guard] ERROR: Node.js not found. Install Node.js >= 18 first."
  echo "  https://nodejs.org/"
  exit 1
fi

TARGET="${1:-.}"
INTERVAL="${2:-0}"

exec node "$SCRIPT_DIR/bin/cursor-guard-backup.js" --path "$TARGET" --interval "$INTERVAL"
