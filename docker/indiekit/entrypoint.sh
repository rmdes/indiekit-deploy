#!/bin/bash
set -eu

echo "==> Indiekit entrypoint"

# Ensure data directories
mkdir -p /data/config /data/content /data/uploads

# Generate and persist SECRET if not exists (used for JWT signing)
if [[ ! -f /data/config/.secret ]]; then
    echo "==> Generating JWT secret"
    node -e "console.log(require('crypto').randomBytes(32).toString('hex'))" > /data/config/.secret
fi
export SECRET="${SECRET:-$(cat /data/config/.secret)}"

# Derive SITE_URL from DOMAIN if not explicitly set
export SITE_URL="${SITE_URL:-https://${DOMAIN}}"
export SITE_ME="${SITE_ME:-${SITE_URL}}"

# Install the composed config to the persistent volume on EVERY boot. In the
# registry model the config is a BUILD ARTIFACT — composed from config/plugins.yaml
# + config/indiekit.config.template.js at `make compose` time — NOT a hand-edited
# file. Operators customize via plugins.yaml (plugin selection), the template
# (config structure), and .env (values), then recompose + rebuild. Copying every
# boot (like indiekit-cloudron's start.sh) guarantees a rebuilt image's plugin set
# reaches the running app. A first-run-only copy would leave an UPGRADED deployment
# running a stale config that references plugins the new image no longer installs
# → ERR_MODULE_NOT_FOUND crash loop (exactly what a profile→registry upgrade hits).
echo "==> Installing composed config to /data/config/"
cp /app/config/indiekit.config.js /data/config/indiekit.config.js

# Pre-create the startup-gate readiness flag so background-task plugins start
# immediately. @rmdes/indiekit-startup-gate polls for /app/data/.indiekit-ready
# (its hardcoded SIGNAL_PATH) and defers plugin work until it appears. That gate
# exists for Cloudron, where Indiekit and the memory-heavy Eleventy build share
# ONE cgroup and must not contend. Here Indiekit and Eleventy are SEPARATE
# containers with separate memory limits, so there is no contention — plugins
# (rss/microsub/webmention-io sync/etc.) should start at once. Without this flag,
# waitForReady() would poll forever (nothing else creates it in this container)
# and background tasks would never run. Container-local; no shared volume needed.
mkdir -p /app/data && touch /app/data/.indiekit-ready

echo "==> Starting Indiekit on port ${PORT:-8080}"
export NODE_OPTIONS="${NODE_OPTIONS:---max-old-space-size=1024}"
exec node node_modules/@indiekit/indiekit/bin/cli.js serve \
    --port "${PORT:-8080}" \
    --config /data/config/indiekit.config.js
