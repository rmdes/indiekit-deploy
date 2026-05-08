FROM node:22-slim

WORKDIR /migrator

# Install dependencies first so the Docker layer cache survives source edits.
COPY migration/package.json ./package.json
RUN npm install --omit=dev --no-audit --no-fund

# Copy migrator source. The host's migration/ tree is bind-mounted at runtime
# under /migration, so this copy is mainly for self-contained image builds
# and CI smoke tests.
COPY migration/lib ./lib
COPY migration/adapters ./adapters
COPY migration/bin ./bin

ENTRYPOINT ["node"]
CMD ["bin/detect.mjs"]
