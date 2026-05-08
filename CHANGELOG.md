# Changelog

All notable changes to this project will be documented in this file.

## 2026-05-08 — Migration system + plugin updates

Adds a one-shot static-site migration toolkit (Jekyll/Hugo/micro.blog → Indiekit) and brings every plugin to current versions. Documentation reorganized so plugin lists point to source-of-truth files instead of inline copies that drift.

### Migration System (NEW)

A Docker-only migration tool — no host-side Node or Python required — that converts existing static sites into Indiekit content layout while preserving old URLs via Caddy 301 redirects.

- New `migrator` service in `docker-compose.yml` (profile-gated to `migrate`)
- New `docker/migrator/Dockerfile` and image: `rmdes/indiekit-deploy-migrator`
- New `migration/` source tree with adapters for Hugo, Jekyll, and micro.blog (`migration/adapters/{hugo,jekyll,microblog}.mjs`), CLI bins (`migration/bin/{detect,convert,preview,apply}.mjs`), shared helpers (`migration/lib/`)
- New Caddy bind mount `./docker/caddy/migration-redirects` populated by `make migrate-apply`
- New Makefile targets: `make migrate-{build,detect,convert,preview,apply,shell}`
- See `migration/README.md` and `docs/migration-from-hugo.md`

**Status:** Hugo verified end-to-end on localhost; micro.blog migration path proven in production at `indiekit-cloudron/migrated-content/`; Jekyll adapter shipped but untested with real Jekyll content; Ghost / WordPress (WXR) / Eleventy-to-Eleventy adapters not started.

### Plugin Updates

Versions current as of this entry — `docker/indiekit/package.{core,full}.json` is authoritative going forward.

- **`@rmdes/indiekit-endpoint-activitypub`** 2.0.9 → **3.13.6** — Major release including Fedify 2.2.0, security patches (hono auth bypass, lodash code injection, path-to-regexp ReDoS, postcss prototype pollution), tombstone support for deleted actors, FEP-044f quote post vocabulary, Pixelfed attachment fix, Mastodon Client API
- **`@rmdes/indiekit-endpoint-microsub`** 1.0.33 → **1.0.61** — 28 patch versions
- **`@rmdes/indiekit-endpoint-conversations`** 2.1.2 → **2.4.3**
- **`@rmdes/indiekit-syndicator-bluesky`** 1.0.14 → **1.0.21**
- **`@rmdes/indiekit-endpoint-syndicate`** beta.34 → **beta.38**
- **`@rmdes/indiekit-endpoint-webmention-io`** 1.0.7 → **1.0.8**
- **`@rmdes/indiekit-endpoint-homepage`** 1.0.16 → **1.0.24**
- **`@rmdes/indiekit-endpoint-cv`** 1.0.19 → **1.0.26**

### New Plugins (Both Profiles)

- **`@rmdes/indiekit-startup-gate@1.0.0`** — Defers plugin background tasks until after the first Eleventy build completes, preventing memory contention during cold starts

### New Plugins (Core)

- **`@rmdes/indiekit-post-type-page@1.0.4`** — Slash pages (`/about`, `/now`, `/uses`)
- **`@rmdes/indiekit-endpoint-files@1.0.3`** — Multi-file upload support
- **`@rmdes/indiekit-endpoint-share@1.0.4`** — Share endpoint with type selection
- **`@rmdes/indiekit-endpoint-linkedin@1.0.5`** — LinkedIn OAuth endpoint
- **`@rmdes/indiekit-syndicator-linkedin@1.0.2`** — LinkedIn syndication

### New Plugins (Full)

- **`@rmdes/indiekit-endpoint-comments@1.0.16`** — Visitor comments via IndieAuth/RelMeAuth (replaces 1.0.0 from previous release)
- **`@rmdes/indiekit-endpoint-readlater@1.0.6`** — Save URLs for later consumption
- **`@rmdes/indiekit-endpoint-blogroll@1.0.24`** — Blog aggregation from OPML/Microsub
- **`@rmdes/indiekit-endpoint-podroll@1.0.14`** — Podcast aggregation

### Documentation

- Fact-checked `README.md` and `CLAUDE.md` against repo reality
- Replaced inline plugin lists with pointers to `docker/indiekit/package.{core,full}.json` (drift-resistant)
- Added dedicated **patches table** to `CLAUDE.md` with per-patch purpose (routes.js, error.js, indieauth.js)
- Added **migrator service** to architecture diagrams and Services table
- Documented the Compose 2.39+ profile gate quirk (`--profile redis` flag requirement)
- Removed lingering "Webmentions Proxy" plugin reference (deprecated, never installed in this repo)

## 2026-02-23 — Feature Parity with Cloudron Deployment

Brought the Docker Compose deployment up to feature parity with the Cloudron deployment (`indiekit-cloudron`), covering URL handling, webmention/conversation APIs, ActivityPub federation, and plugin versions.

### URL Handling (CRITICAL FIX)

- **Reversed Caddy URL redirect direction** — The redirect rules were backwards, sending canonical Indiekit URLs (`/notes/2026/02/22/slug/`) to the old `/content/` format. Now correctly redirects `/content/TYPE/YYYY-MM-DD-slug/` to `/TYPE/YYYY/MM/DD/slug/` (301), matching the Cloudron deployment. Applies to both `Caddyfile` and `Caddyfile.full`.

### Plugin Updates

- **`@rmdes/indiekit-endpoint-conversations`** 1.0.0 → **2.1.2** — Unified webmention/conversation API that aggregates webmention.io data with Bluesky/Mastodon/ActivityPub conversations
- **`@rmdes/indiekit-preset-eleventy`** beta.37 → **beta.38** — Improved permalink handling
- **`@rmdes/indiekit-syndicator-bluesky`** 1.0.12 → **1.0.14**
- **`@rmdes/indiekit-endpoint-syndicate`** beta.32 → **beta.34**
- **`@rmdes/indiekit-endpoint-microsub`** 1.0.31 → **1.0.33**
- **`@rmdes/indiekit-endpoint-webmention-io`** 1.0.5 → **1.0.7**
- **`@rmdes/indiekit-endpoint-homepage`** 1.0.15 → **1.0.16**
- **`@rmdes/indiekit-endpoint-cv`** 1.0.13 → **1.0.19**

### New Plugins (Full Profile)

- **`@rmdes/indiekit-endpoint-activitypub@2.0.9`** — Full ActivityPub federation, making the site an AP actor. Configured via env vars (`AP_HANDLE`, `AP_LOG_LEVEL`, etc.).
- **`@rmdes/indiekit-endpoint-comments@1.0.0`** — Comment system with admin dashboard and JF2 API.

### New Caddy Routes

- `/image/*` — Indiekit image resizing endpoint (thumbnails for `/files` and `/posts`)
- `/comments*` — Comments endpoint (full profile)
- `/activitypub*` — ActivityPub federation with CORS headers (full profile)
- `/nodeinfo/*` — Federation discovery with CORS (full profile)
- ActivityPub content negotiation — Requests with `Accept: application/activity+json` or `application/ld+json` are proxied to Indiekit for AS2 representations (full profile)

### Security Headers

- **CSP `connect-src`**: Added `https:` — allows the service worker to cache external avatars (Mastodon/Bluesky profile images). Without this, avatars fail on first load.
- **CSP `form-action`**: Added `https:` — allows form submissions to external OAuth providers.

### Feed Discovery

- Added **WebSub `Link` headers** on `/feed.xml` and `/feed.json` for hub discovery
- Added `/feed` → `/feed.xml` redirect (301)

### Eleventy Theme

- Updated `eleventy-site` submodule from `8d800e2` to `c7f2841` (50+ commits), including:
  - Auto-conversion of stale `/content/` permalinks in data cascade (`eleventyComputed.js`)
  - Webmention display fixes (deduplication, platform alignment, author-based dedup)
  - Conversations support (dual-fetch from conversations API)
  - Comment system components and recent-comments widget
  - ActivityPub badge and platform detection for interactions
  - Unfurl cards for rich link previews
  - Configurable CV page layout with builder support
  - No-JS graceful fallback

### Environment Template

- Added ActivityPub configuration section to `.env.example` (`AP_HANDLE`, `AP_LOG_LEVEL`, `AP_DEBUG`, `AP_DEBUG_PASSWORD`)
