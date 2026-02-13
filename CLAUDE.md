# CLAUDE.md - indiekit-deploy

Docker Compose + Ansible deployment for Indiekit. Platform-agnostic alternative to Cloudron, using separate containers for each service with Caddy for HTTPS.

## Project Overview

This repository provides production-ready deployment of Indiekit using Docker Compose. It orchestrates MongoDB, Indiekit (Node.js), Eleventy (static site generator), Caddy (HTTPS reverse proxy), and a cron sidecar for background tasks (syndication, webmentions).

**Two plugin profiles:**
- **Core** (default): Minimal IndieWeb blog (article, note, photo, bookmark, like, reply, repost, page)
- **Full**: All `@rmdes/*` plugins (GitHub, Funkwhale, Last.fm, YouTube, RSS, Microsub, Webmentions proxy, Podroll, extra post types)

## Architecture

```
Internet
  |
Caddy :443 (auto HTTPS via Let's Encrypt)
  |
  ├─ Static site (Eleventy) → /data/site (read-only)
  ├─ Uploads → /data/uploads (read-only)
  └─ API endpoints → Indiekit :8080 (reverse proxy)
       |
       ├─ MongoDB (data store)
       ├─ Eleventy (watches /data/content, rebuilds to /data/site)
       └─ Cron sidecar (syndication every 2m, webmentions every 5m)
```

### Services

| Service | Purpose | Image | Port | Volumes |
|---------|---------|-------|------|---------|
| **mongodb** | Data store | `mongo:7` | 27017 (internal) | `mongodb_data:/data/db` |
| **indiekit** | Micropub server, admin UI | Built from `docker/indiekit/Dockerfile` | 8080 (internal) | `content`, `uploads`, `indiekit_config` |
| **eleventy** | Static site builder (watch mode) | Built from `docker/eleventy/Dockerfile` | — | `content` (read), `site`, `cache`, `uploads` (read) |
| **caddy** | HTTPS reverse proxy | `caddy:2-alpine` | 80, 443 (public) | `site` (read), `uploads` (read), `content` (read), `caddy_data`, `caddy_config` |
| **cron** | Background jobs | Built from `docker/cron/Dockerfile` | — | `indiekit_config` (read) |
| **redis** (optional) | Cache | `redis:7-alpine` | 6379 (internal) | — |

### Data Flow

1. **Post Creation**: User creates post via Micropub → Indiekit writes Markdown to `/data/content/TYPE/YYYY-MM-DD-slug.md`
2. **Static Site Build**: Eleventy watcher detects file change → rebuilds HTML to `/data/site/`
3. **Web Serving**: Caddy serves static HTML from `/data/site/`, proxies `/micropub`, `/session`, etc. to Indiekit
4. **Syndication**: Cron runs `syndicate.sh` every 2 minutes → POSTs to Indiekit `/syndicate` endpoint → syndicates to Mastodon/Bluesky/LinkedIn

### Volume Mounts

All data lives in named Docker volumes (persists across container restarts):

| Volume | Purpose | Used By |
|--------|---------|---------|
| `content` | Markdown posts, media | Indiekit (r/w), Eleventy (r), Caddy (r) |
| `uploads` | Uploaded files | Indiekit (r/w), Eleventy (r), Caddy (r) |
| `site` | Built static HTML | Eleventy (r/w), Caddy (r) |
| `cache` | Eleventy cache (fetch, assets) | Eleventy (r/w) |
| `mongodb_data` | Database | MongoDB (r/w) |
| `indiekit_config` | Config file + JWT secret | Indiekit (r/w), Cron (r) |
| `caddy_data` | TLS certificates | Caddy (r/w) |
| `caddy_config` | Caddy config | Caddy (r/w) |

## Key Files

### Docker Compose

| File | Purpose |
|------|---------|
| `docker-compose.yml` | Core services (MongoDB, Indiekit, Eleventy, Caddy, Cron) |
| `docker-compose.full.yml` | Override for full plugin profile (build arg `PROFILE=full`) |
| `docker-compose.override.example.yml` | Template for local overrides (e.g., HTTP-only Caddyfile) |

### Configuration

| File | Purpose |
|------|---------|
| `.env.example` | Template for environment variables (copy to `.env`) |
| `config/indiekit.config.js` | Core profile plugins |
| `config/indiekit.config.full.js` | Full profile plugins |

**CRITICAL: Config file selection**
- The `docker/indiekit/entrypoint.sh` copies the appropriate config to `/data/config/indiekit.config.js` on first run
- After first run, the persistent volume copy is used (allows user editing in-place)
- To reset config, delete `/data/config/indiekit.config.js` and restart

### Docker Images

#### indiekit (docker/indiekit/Dockerfile)

- Base: `node:22-slim`
- Build arg: `PROFILE` (core|full) → selects `package.${PROFILE}.json` for npm install
- Copies both config files (entrypoint selects the right one)
- Entrypoint: `docker/indiekit/entrypoint.sh` (generates JWT secret, selects config, starts Indiekit)

#### eleventy (docker/eleventy/Dockerfile)

- Base: `node:22-slim`
- Copies `eleventy-site/` submodule (Git submodule of `indiekit-eleventy-theme`)
- Overlays `docker/eleventy/overrides/` (neutral homepage, empty CV) to replace theme's personal content
- Pre-builds Tailwind CSS
- Creates symlinks to volume mount paths (content, site, cache, uploads)
- Entrypoint: `docker/eleventy/entrypoint.sh` (waits for Indiekit, initial build, watcher with exponential backoff)

**CRITICAL: Eleventy overrides**
- `docker/eleventy/overrides/` replaces theme files during image build
- Used to provide neutral starter content (homepage without personal data, empty CV)
- Any file in `overrides/` shadows the same path in `eleventy-site/`

#### cron (docker/cron/Dockerfile)

- Base: `node:22-alpine`
- Installs `jsonwebtoken` (for JWT generation)
- Copies `docker/cron/crontab`, `syndicate.sh`, `webmention.sh`, `generate-token.js`
- Runs crond with:
  - Syndication every 2 minutes
  - Webmentions every 5 minutes

**CRITICAL: JWT generation**
- `generate-token.js` reads `/data/config/.secret` and generates a JWT with scope `update`
- Required for authenticated cron jobs to Indiekit endpoints
- The secret is auto-generated by `docker/indiekit/entrypoint.sh` on first run

### Caddy

| File | Purpose |
|------|---------|
| `docker/caddy/Caddyfile` | Core profile routes |
| `docker/caddy/Caddyfile.full` | Full profile routes (adds `/githubapi`, `/funkwhaleapi`, etc.) |

**CRITICAL: Automatic HTTPS**
- Caddy automatically provisions Let's Encrypt TLS for `{$DOMAIN}`
- Requires: DNS A record pointing to server IP, ports 80/443 open, ACME HTTP challenge on port 80
- Certificates stored in `caddy_data` volume

**Legacy URL redirects:**
- Caddyfile includes rewrites for old Indiekit URL format: `/TYPE/YYYY/MM/DD/slug/` → `/content/TYPE/YYYY-MM-DD-slug/`
- Required because nginx rewrites in Cloudron deployment use this pattern

### Ansible

| File | Purpose |
|------|---------|
| `ansible/playbook.yml` | Main provisioning playbook |
| `ansible/inventory.example` | Inventory template (copy to `inventory`, set server IP) |
| `ansible/group_vars/all.yml` | Deployment variables (domain, plugins, env vars) |
| `ansible/roles/common/` | Install Docker, Docker Compose, firewall, etc. |
| `ansible/roles/deploy/` | Clone repo, init submodule, copy `.env`, start services |
| `ansible/roles/update/` | Pull latest changes, rebuild images, restart |

**Usage:**
```bash
cd ansible
cp inventory.example inventory  # Edit with server IP
# Edit group_vars/all.yml with your settings
ansible-playbook -i inventory playbook.yml           # Initial deploy
ansible-playbook -i inventory playbook.yml --tags update  # Update
```

## Configuration

All configuration is done via `.env` file. See `.env.example` for full reference.

### Required Variables

```bash
DOMAIN=example.com                    # Used by Caddy for TLS
SITE_URL=https://example.com          # Full site URL
SITE_NAME=My IndieWeb Blog            # Site title
AUTHOR_NAME=Jane Doe                  # Your name
```

### Optional Variables

**Site:**
- `SITE_DESCRIPTION`, `SITE_LOCALE`, `SITE_TIMEZONE`, `SITE_CATEGORIES`

**Author:**
- `AUTHOR_BIO`, `AUTHOR_AVATAR`, `AUTHOR_TITLE`, `AUTHOR_LOCATION`, `AUTHOR_EMAIL`, etc.

**Social links:**
- `GITHUB_USERNAME`, `BLUESKY_HANDLE`, `MASTODON_INSTANCE`, `MASTODON_USER`, `LINKEDIN_USERNAME`
- Or set `SITE_SOCIAL` manually (format: `Name|URL|icon,Name|URL|icon`)

**Syndicators (conditionally loaded in config):**
- **Mastodon:** `MASTODON_INSTANCE`, `MASTODON_USER`, `MASTODON_ACCESS_TOKEN`
- **Bluesky:** `BLUESKY_HANDLE`, `BLUESKY_PASSWORD`
- **LinkedIn:** `LINKEDIN_ACCESS_TOKEN` or use OAuth at `/linkedin` (requires `LINKEDIN_CLIENT_ID`, `LINKEDIN_CLIENT_SECRET`)

**Full profile endpoints:**
- `GITHUB_TOKEN`, `FUNKWHALE_INSTANCE`, `FUNKWHALE_TOKEN`, `LASTFM_API_KEY`, `YOUTUBE_API_KEY`, etc.

### Plugin Profiles

**Core profile** (`make up`):
- Post types: article, bookmark, like, note, photo, reply, repost, page
- Endpoints: Micropub, Syndicate, JSON Feed, Webmention Sender, Webmention.io (if `WEBMENTION_IO_TOKEN` set)
- Syndicators: Mastodon, Bluesky, LinkedIn, IndieNews (conditionally loaded)

**Full profile** (`make up-full`):
- Core + additional post types: audio, event, jam, rsvp, video
- Core + additional endpoints: GitHub, Funkwhale, Last.fm, YouTube, RSS, Microsub, Webmentions Proxy, Podroll

**CRITICAL: Profile selection**
- Set via `PROFILE` build arg in Dockerfile (`core` or `full`)
- `docker-compose.full.yml` overrides build arg to `PROFILE=full`
- `docker/indiekit/entrypoint.sh` reads `INDIEKIT_PROFILE` env var to select config file

## Deployment Workflow

### Initial Deployment

```bash
# 1. Clone repo
git clone https://github.com/rmdes/indiekit-deploy.git
cd indiekit-deploy

# 2. Init submodule
make init

# 3. Configure
cp .env.example .env
# Edit .env with your settings

# 4. Start services
make up              # Core profile
# OR
make up-full         # Full profile

# 5. Set admin password
# Visit https://your-domain.com/session/login
# Create password, copy PASSWORD_SECRET hash
# Escape $ as $$ in .env:
#   PASSWORD_SECRET=$$2b$$10$$abc123...
# Restart: make restart
```

### Updating

```bash
git pull
make update-theme   # If theme has updates
make build          # Rebuild images
make up             # Restart with new images
```

### Backup & Restore

```bash
make backup
# Creates backups/indiekit-YYYYMMDD-HHMMSS.tar.gz

make restore FILE=backups/indiekit-*.tar.gz
# Stops services, restores volumes, restarts
```

## Relationship with indiekit-cloudron

| Aspect | indiekit-cloudron | indiekit-deploy |
|--------|------------------|-----------------|
| **Deployment** | Cloudron (PaaS) | Docker Compose (any server) |
| **Services** | Single container, 3+ processes | 5-6 containers, 1 process each |
| **Orchestration** | `start.sh` shell script | Docker Compose entrypoints |
| **MongoDB** | Cloudron addon (auto-managed) | Separate container |
| **TLS** | Cloudron auto-manages | Caddy (Let's Encrypt) |
| **Background jobs** | Shell loops in `start.sh` | Cron sidecar container |
| **File storage** | Cloudron `/app/data` | Named Docker volumes |
| **Config** | `indiekit.config.js.rmendes` → `indiekit.config.js` (copied by `make prepare`) | `.env` + `config/indiekit.config.js` (copied by entrypoint) |
| **Plugin profiles** | All plugins pre-installed, activated by config | Core by default, full via `docker-compose.full.yml` |
| **Updates** | `cloudron build && cloudron update` | `git pull && make build && make up` |
| **Eleventy theme** | Submodule + `overrides/eleventy-site/` (merged by `make prepare`) | Submodule + `docker/eleventy/overrides/` (merged by Dockerfile) |

**Common points:**
- Both use the same Eleventy theme (`indiekit-eleventy-theme`) as a Git submodule
- Both overlay neutral content to replace theme's personal data
- Both use the same `@rmdes/*` plugins
- Both use environment variables for configuration

## Known Gotchas

### Caddy won't start / TLS errors

- **Cause:** DNS not pointing to server, ports 80/443 blocked, or domain mismatch
- **Fix:** Verify DNS A record, `ufw status`, ensure `DOMAIN` in `.env` matches DNS
- **Debug:** `docker compose logs caddy`

### Eleventy shows "Building site..."

- **Cause:** Eleventy is still building (can take 30-60s for first build)
- **Fix:** Wait and refresh. If it persists, check `docker compose logs eleventy`
- **Fallback:** If build fails, Eleventy shows "Blog coming soon" page

### Posts don't appear on site

- **Cause:** Eleventy watcher may need a moment to detect changes
- **Fix:** Check `docker compose logs eleventy` for rebuild activity
- **Note:** Watcher auto-restarts with exponential backoff on crashes

### Syndication not working

- **Cause:** Missing env vars, JWT secret not generated, or cron not running
- **Fix:** Check `docker compose logs cron`, verify syndicator env vars in `.env`, ensure `/data/config/.secret` exists
- **Debug:** Syndication runs every 2 minutes. Check cron logs for errors.

### MongoDB connection errors

- **Cause:** MongoDB not running, wrong connection string
- **Fix:** Check `docker compose ps mongodb`, verify `MONGODB_URL` in docker-compose.yml
- **Debug:** `docker compose logs mongodb`

### Config changes not applying

- **Cause:** Config file is copied to `/data/config/indiekit.config.js` on first run only
- **Fix:** Either:
  1. `make shell-indiekit` → edit `/data/config/indiekit.config.js` → `make restart`
  2. Delete `/data/config/indiekit.config.js` and restart (re-copies from image)

### Stale Eleventy overrides

- **Cause:** If you modify a file in `docker/eleventy/overrides/`, the change only applies after rebuilding the image
- **Fix:** `make build && make restart`

## Commands

```bash
make up              # Start services (core profile)
make up-full         # Start services (full profile)
make down            # Stop all services
make logs            # Follow all logs
make restart         # Restart all services
make status          # Show service status
make build           # Rebuild images (no cache)
make build-full      # Rebuild images (full profile)
make shell-indiekit  # Shell into Indiekit container
make shell-eleventy  # Shell into Eleventy container
make shell-cron      # Shell into Cron container
make shell-caddy     # Shell into Caddy container
make backup          # Backup all volumes to backups/
make restore FILE=backups/indiekit-*.tar.gz  # Restore from backup
make init            # Initialize submodule
make update-theme    # Pull latest theme (requires make build after)
```

## Security Notes

- **JWT secret:** Auto-generated on first run, stored in `/data/config/.secret`. If lost, cron jobs won't authenticate.
- **Password hashing:** `PASSWORD_SECRET` must escape `$` as `$$` in `.env` (Docker Compose syntax)
- **TLS certificates:** Stored in `caddy_data` volume. Back up if migrating servers.
- **Sensitive env vars:** Never commit `.env` to git. Use `.env.example` as a template.

## Performance Tuning

- **Eleventy heap size:** Set `NODE_OPTIONS=--max-old-space-size=4096` in Eleventy service for large sites
- **Redis cache:** Uncomment Redis service in docker-compose.yml, set `REDIS_URL=redis://redis:6379` in `.env`
- **Caddy caching:** Add `header Cache-Control` directives in Caddyfile for static assets

## Development Mode

For local development without HTTPS:

1. Create `docker-compose.override.yml`:
   ```yaml
   services:
     caddy:
       volumes:
         - ./docker/caddy/Caddyfile.dev:/etc/caddy/Caddyfile:ro
   ```

2. Create `docker/caddy/Caddyfile.dev` with HTTP-only config:
   ```
   :80 {
     # Same handle blocks as Caddyfile, but no HTTPS
   }
   ```

3. `make up`
