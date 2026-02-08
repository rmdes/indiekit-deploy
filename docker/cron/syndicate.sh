#!/bin/sh
set -e

INDIEKIT_URL="${INDIEKIT_URL:-http://indiekit:8080}"

TOKEN=$(node /app/generate-token.js update 2>/dev/null)

if [ -n "$TOKEN" ]; then
    RESULT=$(curl -s -X POST "${INDIEKIT_URL}/syndicate?token=${TOKEN}" \
        -H "Content-Type: application/json" 2>&1)
    echo "[syndication] $(date '+%Y-%m-%d %H:%M:%S') - $RESULT"
fi
