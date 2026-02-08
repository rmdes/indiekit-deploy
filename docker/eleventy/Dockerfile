FROM node:22-slim

# Install curl for health checks
RUN apt-get update && apt-get install -y --no-install-recommends curl && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy eleventy site (git submodule)
COPY eleventy-site/ /app/

# Overlay deployment-specific files (neutral homepage, empty CV)
# These replace the theme's personal content without modifying the submodule
COPY docker/eleventy/overrides/ /app/

# Install dependencies
RUN npm install

# Build Tailwind CSS
RUN ./node_modules/.bin/tailwindcss -i css/tailwind.css -o css/style.css --minify

# Create symlinks to volume mount paths (dangling during build, valid at runtime)
RUN rm -rf /app/content && ln -s /data/content /app/content && \
    rm -rf /app/_site && ln -s /data/site /app/_site && \
    rm -rf /app/.cache && ln -s /data/cache /app/.cache && \
    mkdir -p /app/images && rm -rf /app/images/user && ln -s /data/uploads /app/images/user && \
    ln -sf /data/uploads /app/uploads

ENV NODE_ENV=production

# Copy entrypoint
COPY docker/eleventy/entrypoint.sh /app/entrypoint.sh
RUN chmod +x /app/entrypoint.sh

CMD ["/app/entrypoint.sh"]
