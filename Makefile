.PHONY: up up-full down logs build restart shell-indiekit shell-eleventy shell-cron backup status

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
