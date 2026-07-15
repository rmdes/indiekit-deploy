FROM node:22-slim

WORKDIR /app

# Composed plugin set (base package.json overrides + registry-selected plugins),
# generated on the host by scripts/compose-site.mjs → .compiled/. Single set —
# the core/full PROFILE split is retired. Build context is the repo root (see
# docker-compose.yml build.context: .), so .compiled/ is in scope.
COPY .compiled/package.json /app/package.json

# Install plugins
RUN npm install --legacy-peer-deps

# Composed Indiekit config (plugins array filled from the registry). The
# entrypoint installs this to /data/config on EVERY boot — the config is a build
# artifact (composed from plugins.yaml + the template), not hand-edited. See entrypoint.sh.
COPY .compiled/indiekit.config.js /app/config/indiekit.config.js

# Copy entrypoint
COPY docker/indiekit/entrypoint.sh /app/entrypoint.sh
RUN chmod +x /app/entrypoint.sh

# Patch routes.js: two-tier rate limiting + content negotiation
# Splits rate limiting into sessionLimit (50/15min for brute force protection)
# and apiLimit (1000/15min for public API endpoints). Removes rate limiting from
# authenticated routes. Adds content negotiation routes for ActivityPub.
COPY docker/indiekit/patches/routes.js /app/node_modules/@indiekit/indiekit/lib/routes.js

# Patch error.js: suppress stack traces in production
# Upstream exposes full stack traces in both HTML and JSON error responses,
# leaking internal file paths and dependency versions. This patch only includes
# stack traces when NODE_ENV !== "production".
COPY docker/indiekit/patches/error.js /app/node_modules/@indiekit/indiekit/lib/middleware/error.js

# Patch indieauth.js: fix overly restrictive redirect URI validation
# Upstream regex /^\/[\w&/=?]*$/ rejects hyphens, dots, and percent-encoded
# characters in redirect paths, breaking login when returning to URLs like
# /auth/new-password or /files/upload-photos.
COPY docker/indiekit/patches/indieauth.js /app/node_modules/@indiekit/indiekit/lib/indieauth.js

EXPOSE 8080

CMD ["/app/entrypoint.sh"]
