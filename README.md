# indiekit-deploy

Docker Compose + Ansible deployment for [Indiekit](https://getindiekit.com), an IndieWeb server with Micropub support, static site generation, and POSSE syndication.

## Architecture

```
                         Internet
                            |
                     ┌──────┴──────┐
                     │  Caddy :443 │  Automatic HTTPS (Let's Encrypt)
                     │  :80 → :443 │  Static site + reverse proxy
                     │  :443/UDP   │  HTTP/3
                     └──┬───────┬──┘
                        │       │
            ┌───────────┘       └──────────┐
            ▼                              ▼
   ┌────────────────┐            ┌─────────────────┐
   │  Indiekit:8080 │            │  Eleventy        │
   │  Micropub      │──content──▶│  Watch + rebuild │
   │  Auth, Admin   │  volume    │  Atomic releases │
   └───┬─────────┬──┘            └─────────────────┘
       │         │                        │
       ▼         ▼                  site volume → Caddy serves
   ┌──────┐  ┌──────┐
   │Mongo │  │Redis │     ┌─────────────────┐
   │ Data │  │Fedify│     │  Cron sidecar   │
   │      │  │KV+   │     │  Syndication 2m  │
   │      │  │cache │     │  Webmentions 5m  │
   └──────┘  └──────┘     └─────────────────┘
                  ↑
                  └─ mandatory when the ActivityPub
                     plugin is enabled (Fedify KV store)

   ┌────────────────────────────────────────┐
   │  Migrator (one-shot, profile=migrate)  │
   │  Jekyll/Hugo/micro.blog → Indiekit     │
   │  Activated via `make migrate-*`        │
   └────────────────────────────────────────┘
```

**Services:** MongoDB, Indiekit (Node.js), Eleventy (static site builder), Caddy (HTTPS reverse proxy), Cron (background jobs), Redis (cache; mandatory when the ActivityPub plugin is enabled). Plus a one-shot Migrator service (profile-gated) for converting external static sites.

> **New to Indiekit?** Read the [full deployment guide](docs/deployment-guide.md) — a step-by-step walkthrough covering server setup, DNS, configuration, first-run password creation, syndication, and webmentions.

> **Upgrading from the old core/full profiles?** See **[MIGRATION.md](MIGRATION.md)** — plugin selection moved from a `PROFILE` build arg to a registry + `config/plugins.yaml` model.

## Quick Start (Docker Compose)

**Prerequisites:** Docker and Docker Compose v2 on a server with ports 80 and 443 open.

```bash
# 1. Clone this repo
git clone https://github.com/rmdes/indiekit-deploy.git
cd indiekit-deploy

# 2. Initialize submodules (Eleventy theme + plugin registry) and compose deps
make init

# 3. Configure your environment
cp .env.example .env
# Edit .env — set DOMAIN, SITE_URL, SITE_NAME, AUTHOR_NAME at minimum

# 4. Start all services
make up

# 5. Set your admin password
#    Visit https://your-domain.com/session/login
#    You'll see a "New password" page — create your password
#    Indiekit displays a PASSWORD_SECRET hash (starts with $2b$...)
#    Copy it into .env, escaping every $ as $$:
#      PASSWORD_SECRET=$$2b$$10$$your-hash-here...
#    Then restart: make restart

# 6. Log in at https://your-domain.com/session/login
```

Caddy automatically provisions a Let's Encrypt TLS certificate for your domain. Make sure your DNS A record points to your server before starting.

### Using Pre-built Images (skip the build)

Pre-built images are automatically built on every commit and published to both Docker Hub and GitHub Container Registry (GHCR):

| Image | Description |
|-------|-------------|
| [`rmdes/indiekit-deploy-server`](https://hub.docker.com/r/rmdes/indiekit-deploy-server) | Indiekit server (single image; plugin set composed from the registry) |
| [`rmdes/indiekit-deploy-site`](https://hub.docker.com/r/rmdes/indiekit-deploy-site) | Eleventy static site builder |
| [`rmdes/indiekit-deploy-cron`](https://hub.docker.com/r/rmdes/indiekit-deploy-cron) | Cron sidecar (syndication + webmentions) |
| [`rmdes/indiekit-deploy-migrator`](https://hub.docker.com/r/rmdes/indiekit-deploy-migrator) | Migration tool (Jekyll/Hugo/micro.blog → Indiekit) |

GHCR alternatives are available at `ghcr.io/rmdes/indiekit-deploy-*`.

> The published `indiekit-deploy-server` image bakes in whatever plugin set `config/plugins.yaml` selected at build time. If you enable non-default plugins (`make plugin-add …`), you need to rebuild the image locally — the pre-built image ships the repo's default plugin set.

```bash
git clone https://github.com/rmdes/indiekit-deploy.git
cd indiekit-deploy
make init
cp .env.example .env   # Edit with your values
docker compose pull    # Pull pre-built images
docker compose up -d   # Start — no build needed
```

Images are tagged `:latest`, `:VERSION` (e.g. `1.0.0-beta.27`), and `:sha-SHORT`. To pin a specific version:

```bash
# In docker-compose.override.yml
services:
  indiekit:
    image: rmdes/indiekit-deploy-server:1.0.0-beta.27
```

If you prefer to build locally instead, use `make build` (which runs `make compose` first).

### Setting Your Admin Password

On first visit to `/session/login`, Indiekit shows a "New password" page:

1. **Create your password** — choose something strong
2. **Copy the hash** — Indiekit displays a `PASSWORD_SECRET` value (e.g., `$2b$10$abc123...`)
3. **Escape the `$` signs** — Docker Compose uses `$` for variable substitution, so every `$` in the hash must be doubled to `$$`:
   ```
   Original:  $2b$10$Eujjehrmx.K.n92T3SFLJe/...
   Escaped:   $$2b$$10$$Eujjehrmx.K.n92T3SFLJe/...
   ```
4. **Save it in `.env`**:
   ```
   PASSWORD_SECRET=$$2b$$10$$Eujjehrmx.K.n92T3SFLJe/...
   ```
5. **Restart Indiekit** — `make restart` or `docker compose restart indiekit`
6. **Log in** — use your password at `/session/login`

## Plugin Selection (registry-driven)

There is a single Indiekit image. Its plugin set is composed at build time from two inputs:

- the **`plugin-registry/`** submodule — a shared catalog of every available plugin (keys, tiers, version pins), also used by `indiekit-cloudron`
- **`config/plugins.yaml`** — this deployment's *deltas*: which non-default plugins to enable or which registry defaults to turn off

`make compose` (run automatically by `make up` and `make build`) reads both and generates `.compiled/{package.json,indiekit.config.js,plugin-loadout.json}`, which the Docker build consumes. The `core` tier (auth, posts, micropub, site-config, preset-eleventy, store-file-system, json-feed, page, …) and the seven base post types (article, note, photo, bookmark, reply, repost, like) always load and are **not** listed in `plugins.yaml`.

```bash
make plugin-list            # show the effective composed plugin set
make plugin-add KEY=github  # enable a plugin (edits config/plugins.yaml)
make plugin-remove KEY=rss  # disable one
make compose                # regenerate .compiled/ after hand-editing plugins.yaml
make up                     # start (composes first)
```

The shipped `config/plugins.yaml` reproduces the old **core** profile (all four syndicators + webmention-sender/io + conversations + LinkedIn OAuth). To get the old **full** profile, enable the extras you want: github, funkwhale, lastfm, youtube, rss, microsub, podroll, blogroll, cv, comments, readlater, **activitypub**, and the extra post types (audio, event, jam, rsvp, video).

See `plugin-registry/plugin-registry.yaml` for every available key and its tier.

> **Redis:** enabling the `activitypub` plugin **requires Redis** (Fedify KV store). The `docker-compose.yml` `redis` service is `profiles: [redis]`-gated; start it with `docker compose --profile redis up -d` and set `REDIS_URL=redis://redis:6379` when running ActivityPub.

> **Upgrading from core/full?** See **[MIGRATION.md](MIGRATION.md)**.

## Configuration

All configuration is done through the `.env` file. See `.env.example` for the full reference with documentation.

### Required Variables

| Variable | Description | Example |
|----------|-------------|---------|
| `DOMAIN` | Your domain (used by Caddy for TLS) | `example.com` |
| `SITE_URL` | Full site URL | `https://example.com` |
| `SITE_NAME` | Site title | `My IndieWeb Blog` |
| `AUTHOR_NAME` | Your name | `Jane Doe` |

### Syndication (optional)

Set the relevant env vars to enable POSSE syndication:

- **Mastodon:** `MASTODON_INSTANCE`, `MASTODON_USER`, `MASTODON_ACCESS_TOKEN`
- **Bluesky:** `BLUESKY_HANDLE`, `BLUESKY_PASSWORD`
- **LinkedIn:** Use the OAuth flow at `/linkedin`, or set `LINKEDIN_ACCESS_TOKEN` manually

### Indiekit Config

The Indiekit configuration is a **build artifact**. `make compose` generates `.compiled/indiekit.config.js` from `config/indiekit.config.template.js` (which carries a `{{PLUGINS}}` placeholder filled from the registry). The entrypoint re-installs it to `/data/config/indiekit.config.js` on **every** container boot — so do **not** hand-edit the running config; your edits are overwritten. Customize instead via:

- **`config/plugins.yaml`** — which plugins load
- **`config/indiekit.config.template.js`** — config structure / per-plugin options (keep the `{{PLUGINS}}` placeholder)
- **`.env`** — values (site name, URLs, tokens, syndicator credentials)

Identity and branding come from the always-on `@rmdes/indiekit-endpoint-site-config` plugin, seeded from `.env` (`SITE_NAME`, `AUTHOR_NAME`, `SITE_DESCRIPTION`, `SITE_TIMEZONE`, `SITE_LOCALE`) on first boot, then editable in the site-config admin UI.

## Ansible Deployment

> ⚠️ Ansible provisioning is being updated for the registry model — use the Docker Compose flow above for now.

For automated provisioning on a fresh server.

### Prerequisites

- Ansible 2.12+ on your local machine
- A server running Ubuntu 22.04+ or Debian 12+
- SSH access with sudo privileges
- DNS A record pointing to the server

### Setup

```bash
cd ansible

# 1. Create inventory from template
cp inventory.example inventory
# Edit inventory with your server IP and SSH user

# 2. Configure variables
# Edit group_vars/all.yml with your site settings
# For secrets, use ansible-vault or host_vars/

# 3. Provision and deploy
ansible-playbook -i inventory playbook.yml
```

### Updating

```bash
ansible-playbook -i inventory playbook.yml --tags update
```

## Migrating from another static site generator

Already running Hugo, Jekyll, or micro.blog? The bundled migration
tool moves your existing posts, media, and old URLs into Indiekit
without losing them.

```bash
cp -r ~/old-blog/* migration/input/
make migrate-detect            # auto-detects the SSG layout
make migrate-convert FROM=hugo # transform → migration/staged/
make migrate-preview           # diff against live volumes
make migrate-apply             # copy into content + uploads volumes
docker compose restart caddy   # activate URL redirects
```

Migrated posts serve at canonical Indiekit URLs
(`/articles/2024/03/15/slug/`); old URLs from your previous site
301-redirect to the canonical ones; media files keep their original
web paths.

- **[migration/README.md](migration/README.md)** — overview, supported
  sources, classification rules
- **[docs/migration-from-hugo.md](docs/migration-from-hugo.md)** —
  step-by-step Hugo migration with edge cases and troubleshooting

## Common Commands

```bash
make up              # Compose plugin set + start services
make down            # Stop all services
make logs            # Follow all logs
make restart         # Restart all services
make status          # Show service status
make build           # Compose plugin set + rebuild images (no cache)
make compose         # Regenerate .compiled/ from plugins.yaml + registry
make plugin-list     # Show the effective composed plugin set
make plugin-add KEY=github     # Enable a plugin in config/plugins.yaml
make plugin-remove KEY=github  # Disable a plugin
make shell-indiekit  # Shell into Indiekit container
make shell-eleventy  # Shell into Eleventy container
make backup          # Backup all volumes to backups/
make restore FILE=backups/indiekit-*.tar.gz  # Restore from backup
make update-theme    # Pull latest Eleventy theme
make migrate-detect  # Detect SSG in migration/input/
make migrate-convert FROM=hugo  # Convert SSG → migration/staged/
make migrate-preview # Diff staged tree vs live volumes
make migrate-apply   # Copy staged → live volumes (FORCE=1 to overwrite)
```

## Eleventy Theme

The Eleventy theme is included as a Git submodule in `eleventy-site/`. It's built into the Eleventy Docker image at build time.

To use a different theme:
1. Remove the submodule: `git submodule deinit eleventy-site && git rm eleventy-site`
2. Add your theme: `git submodule add https://github.com/you/your-theme.git eleventy-site`
3. Rebuild: `make build`

To update the theme:
```bash
make update-theme
make build
make restart
```

## SSL/TLS

Caddy handles HTTPS automatically via Let's Encrypt. Requirements:

- Your `DOMAIN` env var must match your DNS A record
- Ports 80 and 443 must be open and reachable from the internet
- Caddy stores certificates in the `caddy_data` Docker volume

For local development or environments behind another reverse proxy, you can override the Caddyfile to use HTTP only or internal TLS.

## Backup & Restore

### Backup

```bash
make backup
# Creates backups/indiekit-YYYYMMDD-HHMMSS.tar.gz containing:
#   content/  — all your posts
#   uploads/  — media files
#   mongodb/  — database
#   config/   — config + JWT secret
```

### Restore

```bash
make restore FILE=backups/indiekit-20260207-120000.tar.gz
# Stops services, restores volumes, restarts
```

## Updating

### With pre-built images (recommended)

```bash
docker compose pull    # Pull latest images
docker compose up -d   # Restart with new images
```

### Building locally

```bash
git pull
make update-theme   # if theme has updates
make build          # rebuild images
make up             # restart with new images
```

## Troubleshooting

### Caddy won't start / TLS errors

- Ensure DNS A record points to your server IP
- Ensure ports 80 and 443 are open (check `ufw status`)
- Check Caddy logs: `docker compose logs caddy`
- Caddy needs port 80 for ACME HTTP challenge

### Eleventy shows "Building site..."

- Eleventy is still building. Wait a minute and refresh.
- Check logs: `docker compose logs eleventy`
- If build fails, it shows "Blog coming soon" — check for template errors in logs

### Posts don't appear on the site

- Eleventy watcher may need a moment to detect changes
- Check: `docker compose logs eleventy` for rebuild activity
- The watcher auto-restarts with exponential backoff on crashes

### Syndication not working

- Check cron logs: `docker compose logs cron`
- Ensure syndicator env vars are set in `.env`
- Syndication runs every 2 minutes — check the last run in logs
- Verify the JWT secret exists: `make shell-cron` then `cat /data/config/.secret`

### MongoDB connection errors

- Ensure MongoDB is running: `docker compose ps mongodb`
- The `MONGODB_URL` is set automatically in `docker-compose.yml`
- Check: `docker compose logs mongodb`

## URL Handling

Posts are served at their canonical Indiekit URLs: `/TYPE/YYYY/MM/DD/slug/` (e.g., `/notes/2026/02/22/abc123/`). Old `/content/TYPE/YYYY-MM-DD-slug/` URLs are 301-redirected to the canonical format. The Eleventy data cascade (`_data/eleventyComputed.js`) auto-converts stale `/content/` permalinks in frontmatter.

## ActivityPub Federation

Enabling the `activitypub` plugin (`make plugin-add KEY=activitypub`) makes your site a full AP actor. Other Mastodon/Fediverse users can follow, like, and reply to your posts. Caddy proxies `/activitypub*` and `/nodeinfo/*` with CORS headers, and handles AP content negotiation (requests with `Accept: application/activity+json` or `application/ld+json` are proxied to Indiekit for AS2 representations).

Configure via `.env`:
- `AP_HANDLE` — your ActivityPub handle (e.g., `@handle@your-domain.com`)
- `AP_LOG_LEVEL` — logging level (default: `info`)
- `AP_DEBUG` / `AP_DEBUG_PASSWORD` — enable debug dashboard

## Differences from Cloudron Deployment

Both deployments are at feature parity. They use the same Eleventy theme (Git submodule), the same `@rmdes/*` plugins, and the same environment-variable-driven configuration.

| Aspect | Cloudron | Docker Compose |
|--------|----------|----------------|
| Services | 1 container, 3+ processes | 5-6 containers, 1 process each |
| MongoDB | Cloudron addon | Separate container |
| TLS | Cloudron handles it | Caddy (automatic Let's Encrypt) |
| Config | `start.sh` orchestration | Docker entrypoints + compose |
| Background jobs | Shell loops in start.sh | Cron sidecar container |
| File storage | Cloudron `/app/data` | Docker named volumes |
| Updates | `cloudron build && cloudron update` | `docker compose pull && docker compose up -d` |
| Plugins | Registry + per-site `plugins.yaml` → composed image | Registry + `config/plugins.yaml` → composed image |
| Reverse proxy | nginx | Caddy |

## License

MIT
