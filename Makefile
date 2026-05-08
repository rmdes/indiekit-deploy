.PHONY: up up-full down logs build restart shell-indiekit shell-eleventy shell-cron backup status \
       build-release tag push release version ci ci-status \
       migrate-build migrate-detect migrate-convert migrate-preview migrate-apply migrate-shell

# ─── Core profile ───

up:
	docker compose up -d

down:
	docker compose down

logs:
	docker compose logs -f

build:
	docker compose build --no-cache

restart:
	docker compose restart

status:
	docker compose ps

# ─── Full profile ───
#
# Compose 2.39+ no longer honors `profiles: []` overrides to clear a parent's
# profile gate, so we activate the redis profile explicitly here. Removing
# the `--profile redis` flag will reproduce the "service indiekit depends on
# undefined service redis" error.
#
# When -f flags are passed, Compose disables auto-loading of
# docker-compose.override.yml. We include it conditionally so dev settings
# (Caddyfile.dev, PASSWORD_SECRET, etc.) still apply.
COMPOSE_FULL := docker compose --profile redis \
	-f docker-compose.yml \
	-f docker-compose.full.yml \
	$(if $(wildcard docker-compose.override.yml),-f docker-compose.override.yml,)

up-full:
	$(COMPOSE_FULL) up -d

build-full:
	$(COMPOSE_FULL) build --no-cache

restart-full:
	$(COMPOSE_FULL) restart

logs-full:
	$(COMPOSE_FULL) logs -f

# ─── Shells ───

shell-indiekit:
	docker compose exec indiekit sh

shell-eleventy:
	docker compose exec eleventy sh

shell-cron:
	docker compose exec cron sh

shell-caddy:
	docker compose exec caddy sh

# ─── Maintenance ───

backup:
	@echo "==> Backing up volumes..."
	@mkdir -p backups
	@TIMESTAMP=$$(date +%Y%m%d-%H%M%S); \
	docker run --rm \
		-v indiekit-deploy_content:/data/content:ro \
		-v indiekit-deploy_uploads:/data/uploads:ro \
		-v indiekit-deploy_mongodb_data:/data/mongodb:ro \
		-v indiekit-deploy_indiekit_config:/data/config:ro \
		-v $$(pwd)/backups:/backup \
		alpine tar czf /backup/indiekit-$$TIMESTAMP.tar.gz -C /data .
	@echo "==> Backup saved to backups/"

restore:
	@echo "Usage: make restore FILE=backups/indiekit-YYYYMMDD-HHMMSS.tar.gz"
	@echo "WARNING: This will overwrite all current data!"
	@test -n "$(FILE)" || (echo "ERROR: FILE not set" && exit 1)
	@read -p "Are you sure? [y/N] " confirm && [ "$$confirm" = "y" ] || exit 1
	docker compose down
	docker run --rm \
		-v indiekit-deploy_content:/data/content \
		-v indiekit-deploy_uploads:/data/uploads \
		-v indiekit-deploy_mongodb_data:/data/mongodb \
		-v indiekit-deploy_indiekit_config:/data/config \
		-v $$(pwd)/backups:/backup:ro \
		alpine sh -c "cd /data && tar xzf /backup/$$(basename $(FILE))"
	docker compose up -d

# ─── Submodule ───

init:
	git submodule update --init --recursive

update-theme:
	git submodule update --remote eleventy-site
	@echo "==> Theme updated. Run 'make build' to rebuild."

# ─── Docker Hub ───

# Version from package.core.json (upstream Indiekit version)
VERSION := $(shell node -p "require('./docker/indiekit/package.core.json').dependencies['@indiekit/indiekit']")
REGISTRY := rmdes

# Build full-profile images with version tags
build-release:
	docker compose -f docker-compose.yml -f docker-compose.full.yml build --no-cache

# Tag images with version number (in addition to :latest)
tag:
	docker tag $(REGISTRY)/indiekit-deploy-server:latest $(REGISTRY)/indiekit-deploy-server:$(VERSION)
	docker tag $(REGISTRY)/indiekit-deploy-site:latest $(REGISTRY)/indiekit-deploy-site:$(VERSION)
	docker tag $(REGISTRY)/indiekit-deploy-cron:latest $(REGISTRY)/indiekit-deploy-cron:$(VERSION)
	docker tag $(REGISTRY)/indiekit-deploy-migrator:latest $(REGISTRY)/indiekit-deploy-migrator:$(VERSION)

# Push all images to Docker Hub
push: tag
	docker push $(REGISTRY)/indiekit-deploy-server:latest
	docker push $(REGISTRY)/indiekit-deploy-server:$(VERSION)
	docker push $(REGISTRY)/indiekit-deploy-site:latest
	docker push $(REGISTRY)/indiekit-deploy-site:$(VERSION)
	docker push $(REGISTRY)/indiekit-deploy-cron:latest
	docker push $(REGISTRY)/indiekit-deploy-cron:$(VERSION)
	docker push $(REGISTRY)/indiekit-deploy-migrator:latest
	docker push $(REGISTRY)/indiekit-deploy-migrator:$(VERSION)

# Full release: build + tag + push
release: build-release push
	@echo "==> Released $(VERSION) to Docker Hub"

# Show current version
version:
	@echo $(VERSION)

# ─── Migration (Jekyll, Hugo, micro.blog → Indiekit) ───
#
# Workflow:
#   1. Drop your old SSG export into migration/input/
#   2. make migrate-detect                # what's in there?
#   3. make migrate-convert FROM=hugo     # transform → migration/staged/
#   4. Inspect migration/staged/ in your editor
#   5. make migrate-preview               # what would land in your live volumes?
#   6. make migrate-apply                 # copy into the content + uploads volumes
#
# All steps run inside a one-shot `migrator` Docker service. No host-side
# Node or Python required.

# Build the migrator image (cached after first run).
migrate-build:
	docker compose --profile migrate build migrator

# Auto-detect which SSG the input directory looks like.
migrate-detect: migrate-build
	docker compose --profile migrate run --rm migrator bin/detect.mjs /migration/input

# Convert. Set FROM=jekyll | hugo | microblog to override auto-detection.
migrate-convert: migrate-build
	docker compose --profile migrate run --rm migrator bin/convert.mjs \
		$(if $(FROM),--from $(FROM),) \
		--input /migration/input --output /migration/staged

# Compare staged tree against live volumes. Read-only, never modifies anything.
migrate-preview: migrate-build
	docker compose --profile migrate run --rm migrator bin/preview.mjs \
		--staged /migration/staged --content /data/content --uploads /data/uploads

# Apply staged tree into the live volumes. Refuses on collisions unless FORCE=1.
# Also writes staged/Caddyfile.redirects → docker/caddy/migration-redirects so
# Caddy's `import migration-redirects` picks them up after a restart.
migrate-apply: migrate-build
	docker compose --profile migrate run --rm migrator bin/apply.mjs \
		--staged /migration/staged --content /data/content --uploads /data/uploads \
		--caddy /migration-caddy \
		$(if $(FORCE),--force,)

# Drop into a shell inside the migrator container for ad-hoc debugging.
migrate-shell: migrate-build
	docker compose --profile migrate run --rm --entrypoint sh migrator

# ─── CI/CD ───

# Trigger GitHub Actions build from local machine
ci:
	gh workflow run build-images.yml

ci-status:
	gh run list --workflow=build-images.yml --limit=5
