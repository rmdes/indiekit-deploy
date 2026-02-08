#!/bin/bash
set -eu

echo "==> Indiekit entrypoint (profile: ${INDIEKIT_PROFILE:-core})"

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

# Select config file based on profile
if [[ "${INDIEKIT_PROFILE:-core}" == "full" ]]; then
    CONFIG_FILE="/app/config/indiekit.config.full.js"
else
    CONFIG_FILE="/app/config/indiekit.config.js"
fi

# Copy config to persistent volume on first run (allows user editing)
if [[ ! -f /data/config/indiekit.config.js ]]; then
    echo "==> Copying default config to /data/config/"
    cp "$CONFIG_FILE" /data/config/indiekit.config.js
fi

echo "==> Starting Indiekit on port ${PORT:-8080}"
exec node node_modules/@indiekit/indiekit/bin/cli.js serve \
    --port "${PORT:-8080}" \
    --config /data/config/indiekit.config.js
