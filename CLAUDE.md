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
Caddy :443 (auto HTTPS via Let's Encrypt; :443/UDP for HTTP/3)
  |
  ├─ Static site (Eleventy) → /data/site/current (read-only, symlink to latest release)
  ├─ Uploads → /data/uploads (read-only)
  ├─ Content (media) → /data/content (read-only)
  ├─ Migration redirects → ./docker/caddy/migration-redirects (bind, read-only)
  └─ API endpoints → Indiekit :8080 (reverse proxy)
       |
       ├─ MongoDB (data store)
       ├─ Eleventy (watches /data/content, atomic release swap to /data/site/releases/)
       ├─ Cron sidecar (syndication every 2m, webmentions every 5m)
       ├─ Redis (Fedify KV store + plugin cache; mandatory for full profile)
       └─ Migrator (one-shot, profile-gated; Jekyll/Hugo/micro.blog → Indiekit)
```

### Services

| Service | Purpose | Image | Port | Volumes |
|---------|---------|-------|------|---------|
| **mongodb** | Data store | `mongo:7` | 27017 (internal) | `mongodb_data:/data/db` |
| **indiekit** | Micropub server, admin UI | Built from `docker/indiekit/Dockerfile` | 8080 (internal) | `content`, `uploads`, `indiekit_config` |
| **eleventy** | Static site builder (watch mode) | Built from `docker/eleventy/Dockerfile` | — | `content` (read), `site`, `cache`, `uploads` (read) |
| **caddy** | HTTPS reverse proxy | `caddy:2-alpine` | 80, 443, 443/UDP (HTTP/3) | `site` (read), `uploads` (read), `content` (read), `caddy_data`, `caddy_config`, `./docker/caddy/migration-redirects` (bind, read) |
| **cron** | Background jobs (syndication, webmentions) | Built from `docker/cron/Dockerfile` | — | `indiekit_config` (read) |
| **redis** | Fedify KV store + plugin cache | `redis:7-alpine` | 6379 (internal) | — — *Profile-gated `redis` in core (optional). Mandatory for Full profile (AP plugin requires it).* |
| **migrator** | One-shot static-site → Indiekit migration tool (Jekyll/Hugo/micro.blog) | Built from `docker/migrator/Dockerfile` | — | `./migration` (bind), `./docker/caddy` (bind), `content`, `uploads` — *Profile-gated `migrate`. Activated via `make migrate-*` commands.* |

### Data Flow

1. **Post Creation**: User creates post via Micropub → Indiekit writes Markdown to `/data/content/TYPE/YYYY-MM-DD-slug.md`
2. **Static Site Build**: Eleventy builds to `/data/site/releases/TIMESTAMP/`, atomically swaps `/data/site/current` symlink
3. **Web Serving**: Caddy serves static HTML from `/data/site/current/`, proxies `/micropub`, `/session`, etc. to Indiekit
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

### Patches Applied to Upstream Indiekit

Three files in `docker/indiekit/patches/` are copied over upstream Indiekit files during the Docker build. **Note:** these patches are scoped to *this* repo and differ from the patches in `indiekit-cloudron` despite sharing filenames.

| Patch | Target | Purpose |
|-------|--------|---------|
| `patches/routes.js` | `node_modules/@indiekit/indiekit/lib/routes.js` | **Two-tier rate limiting** — splits the single rate limiter into `sessionLimit` (50/15min, brute-force protection on auth routes) and `apiLimit` (1000/15min, public API endpoints). Removes rate limiting entirely from authenticated routes. Also adds **content-negotiation routes** for ActivityPub (so requests with `Accept: application/activity+json` reach Indiekit's AP handlers). |
| `patches/error.js` | `node_modules/@indiekit/indiekit/lib/middleware/error.js` | Suppresses stack traces in production error responses (HTML and JSON). Prevents leaking internal file paths and dependency versions when `NODE_ENV=production`. |
| `patches/indieauth.js` | `node_modules/@indiekit/indiekit/lib/indieauth.js` | Fixes overly restrictive redirect URI regex. Upstream `/^\/[\w&/=?]*$/` rejects hyphens, dots, and percent-encoded characters, breaking login when redirecting to URLs like `/auth/new-password` or `/files/upload-photos`. |

When upstream Indiekit updates, diff the new files against our patches and re-apply the same principles.

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

**URL handling (canonical Indiekit URLs):**
- Posts are served at their canonical Indiekit URLs: `/TYPE/YYYY/MM/DD/slug/` (e.g., `/notes/2026/02/22/abc123/`)
- Old `/content/TYPE/YYYY-MM-DD-slug/` URLs are 301-redirected to canonical format
- This matches the Cloudron deployment's URL handling (reversed Feb 2026)
- The Eleventy data cascade (`_data/eleventyComputed.js`) auto-converts stale `/content/` permalinks in frontmatter

**ActivityPub federation (full profile):**
- Caddy proxies `/activitypub*` and `/nodeinfo/*` to Indiekit with CORS headers
- AP content negotiation: requests with `Accept: application/activity+json` or `application/ld+json` are proxied to Indiekit for AS2 representations
- Configured via env vars: `AP_HANDLE`, `AP_LOG_LEVEL`, `AP_DEBUG`, `AP_DEBUG_PASSWORD`

**WebSub feed discovery:**
- Feed files (`/feed.xml`, `/feed.json`) include WebSub `Link` headers for hub discovery
- `/feed` redirects to `/feed.xml`

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

**Source of truth — do NOT inline plugin lists in this doc:**

- `docker/indiekit/package.core.json` — exact list of plugins installed in the **core** image
- `docker/indiekit/package.full.json` — exact list installed in the **full** image
- `config/indiekit.config.js` — runtime config used by the core image
- `config/indiekit.config.full.js` — runtime config used by the full image

Reading these files is the only reliable way to know which plugins ship in each profile. This doc previously inlined partial lists that drifted out of sync (e.g., listed a "Webmentions Proxy" plugin that was never installed).

**Profile shape (high level):**

- **Core** (`make up`): Minimal IndieWeb blog — base post types (article, bookmark, like, note, photo, reply, repost, page), Micropub, Syndicate, JSON Feed, Webmention Sender, Webmention.io, Conversations, the four syndicators (Mastodon, Bluesky, LinkedIn, IndieNews), and the LinkedIn OAuth endpoint. Conditional loading: syndicators only register when their respective env vars are set.
- **Full** (`make up-full`): Core *plus* extra post types (audio, event, jam, rsvp, video) and the rich plugin set: GitHub, Funkwhale, Last.fm, YouTube, RSS, Microsub, Podroll, Blogroll, Homepage builder, CV, Comments, Read-later, and **ActivityPub federation** (mandates Redis).

**CRITICAL: Profile selection**
- Set via `PROFILE` build arg in `docker/indiekit/Dockerfile` (`core` or `full`)
- `docker-compose.full.yml` overrides build arg to `PROFILE=full` and selects the `rmdes/indiekit-deploy-server-full` image
- `docker/indiekit/entrypoint.sh` reads `INDIEKIT_PROFILE` env var to select the right config file at runtime
- **Compose 2.39+ profile gate quirk:** `profiles: []` in an override file no longer clears a parent's profile gate. The `Makefile` activates the redis profile explicitly with `--profile redis` for `make up-full`. Removing this flag reproduces the error: *"service indiekit depends on undefined service redis"*. See `Makefile` `COMPOSE_FULL` definition.

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
| **Zero-downtime** | Atomic release swap (`mv -T`) | Atomic release swap (`mv -T`) |
| **Memory tuning** | `--expose-gc`, OG batch spawning, 2560MB watcher, heap diagnostics | `--expose-gc`, OG batch spawning, 2048MB watcher, heap diagnostics |
| **Patches** | routes.js, error.js, indieauth.js | routes.js, error.js, indieauth.js |

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

- **Cause:** Eleventy is still building (~3 min warm with caches, ~20 min cold on first deploy)
- **Fix:** Wait and refresh. If it persists, check `docker compose logs eleventy`
- **Fallback:** If build fails, Eleventy shows "Blog coming soon" page
- **Cold vs warm:** A cold build regenerates all OG images and fetches all unfurl/API data from scratch. Warm builds reuse caches in `/data/cache/` (persisted across restarts via Docker volume)

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

The Makefile is the source of truth — run `make help` or read the `.PHONY` line at the top to discover targets. Highlights:

```bash
# Lifecycle
make init            # Initialize the eleventy-site submodule
make up              # Start services (core profile)
make up-full         # Start services (full profile, activates redis profile)
make down            # Stop all services
make logs            # Follow all logs
make restart         # Restart all services
make status          # Show service status

# Build
make build           # Rebuild images (no cache, core profile)
make build-full      # Rebuild images (full profile)
make update-theme    # Pull latest theme (requires make build after)

# Shells
make shell-indiekit  # Shell into Indiekit container
make shell-eleventy  # Shell into Eleventy container
make shell-cron      # Shell into Cron container
make shell-caddy     # Shell into Caddy container

# Backup
make backup          # Backup all volumes to backups/
make restore FILE=backups/indiekit-*.tar.gz  # Restore from backup

# Migration (one-shot, profile-gated to `migrate`)
make migrate-build   # Build the migrator image
make migrate-detect  # Detect SSG layout in migration/input/
make migrate-convert FROM=hugo  # Convert SSG → migration/staged/
make migrate-preview # Diff staged tree vs live volumes
make migrate-apply   # Copy staged → live volumes (FORCE=1 to overwrite)
make migrate-shell   # Drop into the migrator container

# Release / CI (used by maintainer)
make build-release   # Build a multi-arch release image
make tag             # Tag the current commit with a version
make push            # Push images to registries
make release         # Full release workflow
make version         # Show current version
make ci              # Trigger CI build
make ci-status       # Show CI run status
```

## Security Notes

- **JWT secret:** Auto-generated on first run, stored in `/data/config/.secret`. If lost, cron jobs won't authenticate.
- **Password hashing:** `PASSWORD_SECRET` must escape `$` as `$$` in `.env` (Docker Compose syntax)
- **TLS certificates:** Stored in `caddy_data` volume. Back up if migrating servers.
- **Sensitive env vars:** Never commit `.env` to git. Use `.env.example` as a template.

## Memory Tuning

Each Docker Compose service runs in its own container, but memory discipline still matters for small VPS deployments.

### CRITICAL: Node.js Heap Caps

| Process | Heap Cap | Set In | Why |
|---------|----------|--------|-----|
| **Indiekit** | 1024MB | `docker/indiekit/entrypoint.sh` (`NODE_OPTIONS`) | Indiekit + AP plugin stabilize around 300-400MB; 1024MB gives generous headroom |
| **Eleventy initial build** | 2048MB | `docker/eleventy/entrypoint.sh` (`NODE_OPTIONS`) | Full build processes all posts, OG images, and assets |
| **Eleventy watcher** | 2048MB | `docker/eleventy/entrypoint.sh` (`--max-old-space-size=2048 --expose-gc --heapsnapshot-signal=SIGUSR2 --diagnostic-dir=/tmp`) | Watcher stabilizes around 1.2-1.4GB; needs headroom for OG batch spawning during rebuilds. SIGUSR2 triggers on-demand heap snapshots to `/tmp`. |
| **og-cli** | 512MB | `eleventy.config.js` (`--max-old-space-size=512 --expose-gc`) | V8 heap only uses ~22 MB; WASM native memory is the real consumer (not limited by this flag) |

**Lesson learned (Feb/Mar 2026):** The watcher heap cap was initially set to 1024MB to save memory, but this caused repeated OOM kills because the watcher genuinely needs ~1.2-1.4GB for incremental rebuilds with cached image data. 2048MB matches Cloudron's production setting. `--expose-gc` enables the post-build GC hook in `eleventy.config.js` and the OG batch spawning GC in `og-cli`.

### Zero-Downtime Build (Atomic Release Swap)

On container restart, the old site continues serving while a new release builds:

```
Eleventy starts → builds to /data/site/releases/NEW/
OG images synced from /data/cache/og/ to NEW/og/ (passthrough copy misses them with --output)
Build completes → atomic symlink swap: ln -s releases/NEW current_tmp && mv -T current_tmp current
Caddy serves from /data/site/current/ → sees new content immediately
Watcher starts with --watch --incremental → outputs to resolved current target
Cleanup: keep 2 most recent releases for rollback
```

**Visitors experience:** Old content during build (~3 min warm, ~20 min cold), then seamlessly new content. Zero 404s during container restarts.

**First-run migration:** If `/data/site` has old-style flat content (from before the atomic swap), the entrypoint automatically migrates it into a release directory.

**Rollback:** `ln -sfn releases/OLD_TIMESTAMP /data/site/current` inside the Eleventy container.

### CRITICAL: Eleventy-Fetch Cache Preservation

The eleventy-fetch cache (`/data/cache/`) is **NOT wiped on container restart**. Each cache entry has its own TTL (`"1d"` for build mode, `"4h"` for watch mode via `lib/data-fetch.js`) and expires naturally.

**Do NOT** add `rm -rf /data/cache/eleventy-fetch-*` to the entrypoint. Wiping forces ALL 13+ data files to re-fetch from external APIs simultaneously during the initial build, which can cause OOM. This was a hard-won lesson from Cloudron production.

If you need to force a fresh fetch for a specific data source, delete only that source's cache file manually:
```bash
docker compose exec eleventy rm -rf /data/cache/eleventy-fetch-*github*
docker compose restart eleventy
```

### OG Image Generator — Batch Spawning

The updated Eleventy theme includes OG image generation using Satori (WASM) + Resvg (WASM). These allocate native memory outside V8's heap. The theme uses **batch spawning** — each invocation generates up to 100 images, then exits. The spawner re-loops until all images are generated. This keeps peak RSS at ~460 MB per batch.

Requires `--expose-gc` on the watcher (set in entrypoint.sh) to enable GC hooks that reclaim WASM native memory between images.

### Redis for Fedify KV Store

As of AP plugin 2.2.0, the Fedify KV store and plugin cache use Redis instead of MongoDB's `ap_kv` collection. This prevents unbounded memory growth from the old `ap_kv` collection (~14K entries/day).

- **Core profile:** Redis is optional (gated by `profiles: [redis]` in `docker-compose.yml`)
- **Full profile:** Redis is **mandatory** — `docker-compose.full.yml` overrides the profile gate and sets `REDIS_URL=redis://redis:6379`

Redis provides native TTL support so idempotence keys and cache entries auto-expire. The Fedify KV store uses `fedify::` key prefix, the plugin cache uses `indiekit:` key prefix.

### Caddy Caching

Add `header Cache-Control` directives in Caddyfile for static assets (already configured for media files with 30-day immutable cache).

### On-Demand Heap Snapshots

The watcher runs with `--heapsnapshot-signal=SIGUSR2 --diagnostic-dir=/tmp`. To capture a heap snapshot for memory analysis:

```bash
# Find the watcher PID inside the container
docker compose exec eleventy pgrep -f "eleventy.*watch"
# Trigger snapshot
docker compose exec eleventy kill -USR2 <PID>
# Copy snapshot out
docker compose cp eleventy:/tmp/Heap.*.heapsnapshot ./
```

## Eleventy Performance Optimizations (Mar 2026)

The theme includes several performance optimizations that dramatically reduce incremental rebuild times:

### Data File Caching (`lib/data-fetch.js`)

A shared `cachedFetch` helper wraps `@11ty/eleventy-fetch` with:
- **Watch-mode cache extension:** During `ELEVENTY_RUN_MODE !== "build"`, cache duration extends to 4 hours (vs 5-15 min default). This prevents 13 network data files from re-fetching APIs on every incremental rebuild.
- **AbortController timeout:** 10-second hard timeout on all network requests to prevent slow APIs from hanging the build.

Result: Data File phase went from 12,169ms → 28ms on incremental rebuilds (99.8% reduction).

### Filter Memoization (`eleventy.config.js`)

Nunjucks filters called thousands of times per build are memoized with `Map` caches cleared on `eleventy.before`:
- `dateDisplay`, `date`, `isoDate` — date formatting
- `hash` — MD5 file hashing for cache busting
- `aiPosts`, `aiStats` — computed data

### html-transformer Pre-Check

The default `@11ty/eleventy/html-transformer` transform is overridden with a pre-check that skips the full PostHTML parse/serialize cycle (~3ms/page) for pages without `<img>` tags.

### Build Time Reference

| Build Type | Time | Pages | Notes |
|------------|------|-------|-------|
| Cold build (empty caches) | ~20 min | 3,400+ | First deploy or after wiping cache volume. Regenerates all OG images, fetches all unfurl URLs, all API data files |
| Warm build (caches populated) | ~3 min | 3,400+ | Normal container restart. OG manifest skips existing images, unfurl/data caches hit disk |
| Incremental rebuild (watcher) | ~25s | ~1,000 written, ~2,400 skipped | Triggered by content changes. Data files cached 4h in watch mode |

**What makes a build "cold":** The OG manifest (`.cache/og/manifest.json`), unfurl cache (`.cache/unfurl/`), and eleventy-fetch cache (`.cache/eleventy-fetch/`) are empty. This happens on first deploy or if the `cache` Docker volume is wiped.

**What makes a build "warm":** Caches are populated from a previous build in the persistent `cache` Docker volume. OG generation only processes new/changed posts (manifest-based diffing). Unfurl URLs and API data are served from disk cache. The dominant cost is template rendering + Pagefind indexing (~2-3 min).

## Migration System

The repo ships a one-shot migration toolkit that converts other static-site exports (Jekyll, Hugo, micro.blog) into Indiekit's content layout, plus a Caddy-snippet of 301 redirects so the migrated site keeps its old URLs alive.

### Architecture

- **Source code:** `migration/` (ESM Node, no host-side runtime — runs only in the migrator container)
  - `bin/{detect,convert,preview,apply}.mjs` — CLI entry points
  - `adapters/{jekyll,hugo,microblog}.mjs` — per-source-format converters
  - `lib/{post,frontmatter,classify,media,redirects,detect,...}.mjs` — shared helpers
- **Image:** `docker/migrator/Dockerfile` (built into `rmdes/indiekit-deploy-migrator:latest`)
- **Service:** `migrator` in `docker-compose.yml` (profile-gated to `migrate`)
- **Bind mounts:**
  - `./migration:/migration` — live source iteration without rebuilding the image
  - `./docker/caddy:/migration-caddy` — `migrate-apply` writes the redirects snippet here
  - `content` and `uploads` named volumes — apply step writes content + media into them
- **Caddy integration:** `docker/caddy/migration-redirects` is bind-mounted by the Caddy service. It starts as a comment-only no-op so Caddy boots cleanly even if migration was never run.

### Workflow

```
1. Drop the old site export → migration/input/
2. make migrate-detect              # what's in there?
3. make migrate-convert FROM=hugo   # transform → migration/staged/
4. (optional) eyeball migration/staged/
5. make migrate-preview             # diff staged tree vs live volumes
6. make migrate-apply               # write into content + uploads volumes + caddy redirects
7. docker compose restart caddy     # activate URL redirects
```

Each step is independent and idempotent. Re-running `migrate-convert` regenerates `staged/` from scratch — safe to iterate on `_classify.yaml` overrides.

### Status

See `TODO.md` for adapter status. As of May 2026: Hugo verified end-to-end on localhost; micro.blog adapter shipped with reference output at `indiekit-cloudron/migrated-content/` (canonical example of what micro.blog → Indiekit conversion should look like); Jekyll adapter shipped but **untested with real Jekyll content**; Ghost / WXR / Eleventy-to-Eleventy adapters not started.

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
