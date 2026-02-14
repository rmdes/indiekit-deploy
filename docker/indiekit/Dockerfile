FROM node:22-slim

# PROFILE controls which plugin set to install: "core" (default) or "full"
ARG PROFILE=core

WORKDIR /app

# Copy the appropriate package.json based on profile
COPY docker/indiekit/package.${PROFILE}.json /app/package.json

# Install plugins
RUN npm install --legacy-peer-deps

# Copy config files (core and full — entrypoint selects the right one)
COPY config/indiekit.config.js /app/config/indiekit.config.js
COPY config/indiekit.config.full.js /app/config/indiekit.config.full.js

# Copy entrypoint
COPY docker/indiekit/entrypoint.sh /app/entrypoint.sh
RUN chmod +x /app/entrypoint.sh

# Store the profile for the entrypoint to use
ENV INDIEKIT_PROFILE=${PROFILE}

# Patch routes.js: remove rate limiting from authenticated routes
# Upstream applies the same rate limiter to ALL routes. Authenticated routes (after
# indieauth.authenticate()) are already protected by auth — rate limiting them causes
# 429 errors during normal admin browsing, especially behind reverse proxies where
# all clients share a single IP. Rate limiting is kept on session routes (brute force)
# and public/well-known endpoints (abuse protection).
COPY docker/indiekit/patches/routes.js /app/node_modules/@indiekit/indiekit/lib/routes.js

EXPOSE 8080

CMD ["/app/entrypoint.sh"]
