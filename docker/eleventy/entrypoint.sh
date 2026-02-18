#!/bin/bash
set -eu

INDIEKIT_URL="${INDIEKIT_URL:-http://indiekit:8080}"

echo "==> Eleventy entrypoint"

# Ensure output directories exist
mkdir -p /data/site /data/cache

# Ensure Eleventy directory data files exist (set default layouts for content)
# Same as production: content.json for all posts, pages/pages.json for pages
if [ ! -f /data/content/content.json ]; then
    echo '{"layout":"layouts/post.njk"}' > /data/content/content.json
    echo "  Created content.json (default layout for posts)"
fi
mkdir -p /data/content/pages
if [ ! -f /data/content/pages/pages.json ]; then
    echo '{"layout":"layouts/page.njk"}' > /data/content/pages/pages.json
    echo "  Created pages/pages.json (default layout for pages)"
fi

# Wait for Indiekit to be ready (max 60 seconds)
echo "==> Waiting for Indiekit at ${INDIEKIT_URL}..."
for i in $(seq 1 60); do
    if curl -s -o /dev/null -w '%{http_code}' "${INDIEKIT_URL}/" 2>/dev/null | grep -q "200\|302"; then
        echo "==> Indiekit is ready"
        break
    fi
    if [ "$i" -eq 60 ]; then
        echo "==> WARNING: Indiekit not ready after 60s, proceeding anyway"
    fi
    sleep 1
done

# Wait for API endpoints to initialize
sleep 3

# Clear stale site files
echo "==> Clearing stale site files"
rm -rf /data/site/*

# Clear Eleventy fetch cache (force fresh API data on restart)
rm -rf /data/cache/eleventy-fetch-*

# Create placeholder during build
echo '<html><head><meta http-equiv="refresh" content="5"></head><body><p>Building site...</p></body></html>' > /data/site/index.html

# Increase Node.js heap size for large sites
export NODE_OPTIONS="${NODE_OPTIONS:---max-old-space-size=2048}"

# Initial build
echo "==> Building Eleventy site"
cd /app
./node_modules/.bin/eleventy --output=/data/site || {
    echo "==> Eleventy build failed, keeping placeholder"
    mkdir -p /data/site
    echo '<html><body><h1>Blog coming soon</h1><p>Create your first post at <a href="/session/login">/admin</a></p></body></html>' > /data/site/index.html
}

# Start Eleventy watcher with exponential backoff supervisor
echo "==> Starting Eleventy watcher"

RESTART_COUNT=0
BACKOFF=5
MAX_BACKOFF=300
LAST_START=0

while true; do
    NOW=$(date +%s)

    # Reset backoff if watcher ran for at least 5 minutes (healthy run)
    if [ "$LAST_START" -gt 0 ] && [ $((NOW - LAST_START)) -ge 300 ]; then
        RESTART_COUNT=0
        BACKOFF=5
    fi

    LAST_START=$NOW
    RESTART_COUNT=$((RESTART_COUNT + 1))

    if [ "$RESTART_COUNT" -eq 1 ]; then
        echo "[eleventy-watcher] Starting watcher"
    else
        echo "[eleventy-watcher] Restarting (attempt $RESTART_COUNT, backoff ${BACKOFF}s)"
        sleep $BACKOFF
        # Exponential backoff: 5, 10, 20, 40, 80, 160, 300 (capped)
        BACKOFF=$((BACKOFF * 2))
        if [ "$BACKOFF" -gt "$MAX_BACKOFF" ]; then
            BACKOFF=$MAX_BACKOFF
        fi
    fi

    ./node_modules/.bin/eleventy --watch --incremental --output=/data/site || true
    EXIT_CODE=$?
    echo "[eleventy-watcher] Exited with code $EXIT_CODE at $(date '+%Y-%m-%d %H:%M:%S')"
done
