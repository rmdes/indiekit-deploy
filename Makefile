.PHONY: up up-full down logs build restart shell-indiekit shell-eleventy shell-cron backup status \
       build-release tag push release version ci ci-status

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

up-full:
	docker compose -f docker-compose.yml -f docker-compose.full.yml up -d

build-full:
	docker compose -f docker-compose.yml -f docker-compose.full.yml build --no-cache

restart-full:
	docker compose -f docker-compose.yml -f docker-compose.full.yml restart

logs-full:
	docker compose -f docker-compose.yml -f docker-compose.full.yml logs -f

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

# Push all images to Docker Hub
push: tag
	docker push $(REGISTRY)/indiekit-deploy-server:latest
	docker push $(REGISTRY)/indiekit-deploy-server:$(VERSION)
	docker push $(REGISTRY)/indiekit-deploy-site:latest
	docker push $(REGISTRY)/indiekit-deploy-site:$(VERSION)
	docker push $(REGISTRY)/indiekit-deploy-cron:latest
	docker push $(REGISTRY)/indiekit-deploy-cron:$(VERSION)

# Full release: build + tag + push
release: build-release push
	@echo "==> Released $(VERSION) to Docker Hub"

# Show current version
version:
	@echo $(VERSION)

# ─── CI/CD ───

# Trigger GitHub Actions build from local machine
ci:
	gh workflow run build-images.yml

ci-status:
	gh run list --workflow=build-images.yml --limit=5
