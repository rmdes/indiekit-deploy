#!/bin/bash
set -eu

INDIEKIT_URL="${INDIEKIT_URL:-http://indiekit:8080}"
RELEASES_DIR="/data/site/releases"
CURRENT_LINK="/data/site/current"

echo "==> Eleventy entrypoint"

# Ensure output directories exist
mkdir -p /data/site /data/cache "$RELEASES_DIR"

# Expose the composed plugin loadout to the theme. The theme's
# _data/loadedPlugins.js reads the hardcoded RUNTIME_PATH
# /app/data/content/_data/loaded-plugins.json and converts the loadout's
# `selected[]` into a { <key>: true } map so templates can gate widgets/sections
# ({% if loadedPlugins.cv %}). Baked into the image at /app/loaded-plugins.json;
# copied to that path here (idempotent) BEFORE the build. Container-local — this
# is NOT the /data/content volume; the theme reads the absolute path directly.
if [ -f /app/loaded-plugins.json ]; then
    mkdir -p /app/data/content/_data
    cp -f /app/loaded-plugins.json /app/data/content/_data/loaded-plugins.json
    echo "  Exposed loaded-plugins.json to theme (_data/)"
fi

# Migrate from flat /data/site to releases structure (first run after upgrade)
# If /data/site/current doesn't exist but there are HTML files at the root,
# the volume has old-style flat content — move it into a release.
if [ ! -L "$CURRENT_LINK" ] && [ ! -d "$CURRENT_LINK" ]; then
    if ls /data/site/*.html >/dev/null 2>&1; then
        echo "==> Migrating flat /data/site to releases structure"
        MIGRATE_TS=$(date +%s)
        mkdir -p "${RELEASES_DIR}/${MIGRATE_TS}"
        # Move everything except releases/ into the migration release
        for item in /data/site/*; do
            case "$(basename "$item")" in
                releases) ;; # skip
                *) mv "$item" "${RELEASES_DIR}/${MIGRATE_TS}/" 2>/dev/null || true ;;
            esac
        done
        ln -s "releases/${MIGRATE_TS}" "$CURRENT_LINK"
        echo "==> Migrated existing site to release ${MIGRATE_TS}"
    fi
fi

# Ensure Eleventy directory data files exist (set default layouts for content)
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

# Eleventy-fetch cache is NOT wiped on restart. Each entry has its own TTL
# (duration: "1d" for build, "4h" for watch) and expires naturally.
# Wiping forces ALL _data files to re-fetch from APIs simultaneously,
# which can cause OOM during the initial build.
# If you need to force a fresh fetch, delete specific cache files manually.

# Create placeholder in current release while building
# (if no current release exists yet, create one with placeholder)
if [ ! -L "$CURRENT_LINK" ] && [ ! -d "$CURRENT_LINK" ]; then
    PLACEHOLDER_TS=$(date +%s)
    mkdir -p "${RELEASES_DIR}/${PLACEHOLDER_TS}"
    echo '<html><head><meta http-equiv="refresh" content="5"></head><body><p>Building site...</p></body></html>' > "${RELEASES_DIR}/${PLACEHOLDER_TS}/index.html"
    ln -s "releases/${PLACEHOLDER_TS}" "$CURRENT_LINK"
    echo "==> Created placeholder release ${PLACEHOLDER_TS}"
fi

# Increase Node.js heap size for large sites + enable GC for OG batch spawning
export NODE_OPTIONS="${NODE_OPTIONS:---max-old-space-size=2048 --expose-gc}"

# ─── Initial build DISABLED ───
# The initial build consistently OOMs on memory-constrained hosts because Eleventy
# peaks at ~3GB+ RSS (V8 heap + Sharp buffers + OG WASM). The watcher always succeeds
# because it starts fresh after any failed process exits. The old release (or placeholder)
# serves during the watcher's ~5 min full build — zero downtime.
# To re-enable: uncomment the block below and comment the INITIAL_BUILD_OK=false line.
INITIAL_BUILD_OK=false
cd /app

# # RELEASE_TS=$(date +%s)
# # NEW_RELEASE="${RELEASES_DIR}/${RELEASE_TS}"
# # mkdir -p "${NEW_RELEASE}"
# # echo "==> Building Eleventy site"
# # if ./node_modules/.bin/eleventy --output="${NEW_RELEASE}"; then
# #     if [ -d /data/cache/og ]; then
# #         mkdir -p "${NEW_RELEASE}/og"
# #         cp -f /data/cache/og/*.png "${NEW_RELEASE}/og/" 2>/dev/null || true
# #     fi
# #     ln -s "releases/${RELEASE_TS}" /data/site/current_tmp
# #     mv -T /data/site/current_tmp "$CURRENT_LINK"
# #     echo "==> Swapped to release ${RELEASE_TS}"
# #     cd "$RELEASES_DIR" && ls -1t | tail -n +3 | xargs -r rm -rf
# #     cd /app
# #     INITIAL_BUILD_OK=true
# # else
# #     echo "==> Eleventy build failed"
# #     rm -rf "${NEW_RELEASE}"
# # fi

if [ "$INITIAL_BUILD_OK" != true ]; then
    echo "==> Initial build skipped/failed, using previous release"
    # Clean up failed release directory if one was created
    if [ -n "${NEW_RELEASE:-}" ]; then rm -rf "${NEW_RELEASE}"; fi
    # If no current release exists at all, create a fallback
    if [ ! -L "$CURRENT_LINK" ] && [ ! -d "$CURRENT_LINK" ]; then
        FALLBACK_TS=$(date +%s)
        mkdir -p "${RELEASES_DIR}/${FALLBACK_TS}"
        echo '<html><body><h1>Blog coming soon</h1><p>Create your first post at <a href="/session/login">/admin</a></p></body></html>' > "${RELEASES_DIR}/${FALLBACK_TS}/index.html"
        ln -s "releases/${FALLBACK_TS}" "$CURRENT_LINK"
    fi
fi

# ─── Watcher with GC support and exponential backoff ───
# Watcher needs 2048 MB for incremental rebuilds + OG batch spawning.
# --expose-gc enables the post-build GC hook in eleventy.config.js.
export NODE_OPTIONS="--max-old-space-size=2048 --expose-gc --heapsnapshot-signal=SIGUSR2 --diagnostic-dir=/tmp"

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

    # Watcher outputs directly to current release (incremental updates are fine in-place)
    # Resolve the symlink target so Eleventy writes to the actual directory
    CURRENT_TARGET=$(readlink -f "$CURRENT_LINK" 2>/dev/null || echo "/data/site/current")
    ./node_modules/.bin/eleventy --watch --incremental --output="${CURRENT_TARGET}" || true
    EXIT_CODE=$?
    echo "[eleventy-watcher] Exited with code $EXIT_CODE at $(date '+%Y-%m-%d %H:%M:%S')"
done
