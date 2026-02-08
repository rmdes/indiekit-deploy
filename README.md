# indiekit-deploy

Docker Compose + Ansible deployment for [Indiekit](https://getindiekit.com), an IndieWeb server with Micropub support, static site generation, and POSSE syndication.

## Architecture

```
                         Internet
                            |
                     ┌──────┴──────┐
                     │  Caddy :443 │  Automatic HTTPS (Let's Encrypt)
                     │  :80 → :443 │  Static site + reverse proxy
                     └──┬───────┬──┘
                        │       │
            ┌───────────┘       └──────────┐
            ▼                              ▼
   ┌────────────────┐            ┌─────────────────┐
   │  Indiekit:8080 │            │  Eleventy        │
   │  Micropub      │──content──▶│  Watch + rebuild │
   │  Auth, Admin   │  volume    │  Static HTML     │
   └───────┬────────┘            └─────────────────┘
           │                              │
   ┌───────┴────────┐            site volume → Caddy serves
   │  MongoDB       │
   │  Data store    │     ┌─────────────────┐
   └────────────────┘     │  Cron sidecar   │
                          │  Syndication 2m  │
                          │  Webmentions 5m  │
                          └─────────────────┘
```

**Services:** MongoDB, Indiekit (Node.js), Eleventy (static site builder), Caddy (HTTPS reverse proxy), Cron (background jobs). Optional Redis cache.

## Quick Start (Docker Compose)

**Prerequisites:** Docker and Docker Compose v2 on a server with ports 80 and 443 open.

```bash
# 1. Clone this repo
git clone https://github.com/rmdes/indiekit-deploy.git
cd indiekit-deploy

# 2. Initialize the Eleventy theme submodule
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

## Plugin Profiles

### Core (default)

Minimal plugin set for a functional IndieWeb blog:

| Category | Plugins |
|----------|---------|
| Post types | article, bookmark, like, note, photo, reply, repost |
| Preset | `@rmdes/indiekit-preset-eleventy` (permalink fix) |
| Store | `@indiekit/store-file-system` |
| Endpoints | Micropub, Syndicate, JSON Feed, Webmention.io, Webmention Sender |
| Syndicators | Mastodon, Bluesky, LinkedIn, IndieNews |

```bash
make up
```

### Full

All `@rmdes` plugins — adds GitHub activity, Funkwhale, Last.fm, YouTube, RSS reader, Microsub, Webmentions proxy, Podroll, extra post types (audio, event, jam, rsvp, video, page).

```bash
make up-full
```

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

The Indiekit configuration lives in `config/indiekit.config.js` (core) and `config/indiekit.config.full.js` (full). On first run, the config is copied to the persistent volume at `/data/config/indiekit.config.js`. To update the config after first run, either:

1. Edit the file in the volume: `make shell-indiekit` then `vi /data/config/indiekit.config.js`
2. Or delete the volume copy to re-copy from the image: remove `/data/config/indiekit.config.js` and restart

## Ansible Deployment

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

## Common Commands

```bash
make up              # Start services (core profile)
make up-full         # Start services (full profile)
make down            # Stop all services
make logs            # Follow all logs
make restart         # Restart all services
make status          # Show service status
make build           # Rebuild images (no cache)
make shell-indiekit  # Shell into Indiekit container
make shell-eleventy  # Shell into Eleventy container
make backup          # Backup all volumes to backups/
make restore FILE=backups/indiekit-*.tar.gz  # Restore from backup
make update-theme    # Pull latest Eleventy theme
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

```bash
# Pull latest changes
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

## Differences from Cloudron Deployment

| Aspect | Cloudron | Docker Compose |
|--------|----------|----------------|
| Services | 1 container, 3+ processes | 5-6 containers, 1 process each |
| MongoDB | Cloudron addon | Separate container |
| TLS | Cloudron handles it | Caddy (automatic Let's Encrypt) |
| Config | `start.sh` orchestration | Docker entrypoints + compose |
| Background jobs | Shell loops in start.sh | Cron sidecar container |
| File storage | Cloudron `/app/data` | Docker named volumes |
| Updates | `cloudron build && cloudron update` | `make build && make up` |
| Plugins | All pre-installed | Core by default, full via override |

## License

MIT
